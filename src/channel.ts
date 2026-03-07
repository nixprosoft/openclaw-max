import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  setAccountEnabledInConfigSection,
  type ChannelPlugin,
} from "openclaw/plugin-sdk";
import { MaxConfigSchema } from "./config-schema.js";
import {
  listMaxAccountIds,
  resolveDefaultMaxAccountId,
  resolveMaxAccount,
  type ResolvedMaxAccount,
} from "./max/accounts.js";
import { monitorMaxProvider } from "./max/monitor.js";
import { probeMax } from "./max/probe.js";
import { sendTextMax } from "./max/send.js";
import { getMaxRuntime } from "./runtime.js";

function normalizeAllowEntry(entry: string): string {
  return entry
    .trim()
    .replace(/^(max|user):/i, "")
    .toLowerCase();
}

export const maxPlugin: ChannelPlugin<ResolvedMaxAccount> = {
  id: "max",
  meta: {
    id: "max",
    label: "MAX",
    selectionLabel: "MAX Messenger (plugin)",
    detailLabel: "MAX Bot",
    docsPath: "/channels/max",
    docsLabel: "max",
    blurb: "Russian messenger MAX (formerly VK Teams) via Bot API.",
    order: 70,
    quickstartAllowFrom: true,
  },
  capabilities: {
    chatTypes: ["direct", "group", "channel"],
    reactions: false,
    threads: false,
    media: true,
  },
  streaming: {
    blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
  },
  reload: { configPrefixes: ["channels.max"] },
  configSchema: buildChannelConfigSchema(MaxConfigSchema),
  config: {
    listAccountIds: (cfg) => listMaxAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveMaxAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultMaxAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "max",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "max",
        accountId,
        clearBaseFields: ["botToken", "apiBaseUrl", "name"],
      }),
    isConfigured: (account) => Boolean(account.botToken),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.botToken),
      botTokenSource: account.botTokenSource,
      apiBaseUrl: account.apiBaseUrl,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveMaxAccount({ cfg, accountId }).config.allowFrom ?? []).map((e) => String(e)),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((e) => String(e).trim()).filter(Boolean),
  },
  pairing: {
    idLabel: "maxUserId",
    normalizeAllowEntry: (entry) => normalizeAllowEntry(entry),
    notifyApproval: async ({ id }) => {
      console.log(`[max] User ${id} approved for pairing`);
    },
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(
        (cfg.channels as Record<string, unknown>)?.max as Record<string, unknown> | undefined
      ) && resolvedAccountId !== DEFAULT_ACCOUNT_ID;
      const basePath = useAccountPath
        ? `channels.max.accounts.${resolvedAccountId}.`
        : "channels.max.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: (account.config.allowFrom ?? []).map(String),
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("max"),
        normalizeEntry: (raw) => normalizeAllowEntry(raw),
      };
    },
    collectWarnings: ({ account, cfg }) => {
      const defaultGroupPolicy = resolveDefaultGroupPolicy(cfg);
      const { groupPolicy } = resolveAllowlistProviderRuntimeGroupPolicy({
        providerConfigPresent:
          (cfg.channels as Record<string, unknown>)?.max !== undefined,
        groupPolicy: account.config.groupPolicy,
        defaultGroupPolicy,
      });
      if (groupPolicy !== "open") {
        return [];
      }
      return [
        `- MAX groups: groupPolicy="open" allows any member to trigger (mention-gated). Set channels.max.groupPolicy="allowlist" + channels.max.groupAllowFrom to restrict senders.`,
      ];
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) =>
      getMaxRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 4000,
    resolveTarget: ({ to }) => {
      const trimmed = to?.trim();
      if (!trimmed) {
        return {
          ok: false,
          error: new Error("Delivering to MAX requires --to <chatId>"),
        };
      }
      return { ok: true, to: trimmed };
    },
    sendText: async ({ to, text, accountId, replyToId }) => {
      const chatId = parseInt(to, 10);
      if (isNaN(chatId)) {
        throw new Error(`MAX: invalid chatId "${to}" — must be a numeric chat ID`);
      }
      const result = await sendTextMax(chatId, text, {
        accountId: accountId ?? undefined,
        replyToId: replyToId ?? undefined,
      });
      return { channel: "max", messageId: result.messageId, chatId: String(result.chatId) };
    },
    sendMedia: async ({ to, text, accountId, replyToId }) => {
      // Phase 1: media not yet implemented, fall back to text with URL
      const chatId = parseInt(to, 10);
      if (isNaN(chatId)) {
        throw new Error(`MAX: invalid chatId "${to}" — must be a numeric chat ID`);
      }
      const result = await sendTextMax(chatId, text ?? "(media)", {
        accountId: accountId ?? undefined,
        replyToId: replyToId ?? undefined,
      });
      return { channel: "max", messageId: result.messageId, chatId: String(result.chatId) };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      lastConnectedAt: null,
      lastDisconnect: null,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      botTokenSource: snapshot.botTokenSource ?? "none",
      running: snapshot.running ?? false,
      connected: snapshot.connected ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      baseUrl: snapshot.baseUrl ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account, timeoutMs }) => {
      const token = account.botToken?.trim();
      if (!token) {
        return { ok: false, error: "bot token missing" };
      }
      return await probeMax(token, account.apiBaseUrl, timeoutMs);
    },
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.botToken),
      botTokenSource: account.botTokenSource,
      baseUrl: account.apiBaseUrl,
      running: runtime?.running ?? false,
      connected: runtime?.connected ?? false,
      lastConnectedAt: runtime?.lastConnectedAt ?? null,
      lastDisconnect: runtime?.lastDisconnect ?? null,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      probe,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
    }),
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "max",
        accountId,
        name,
      }),
    validateInput: ({ accountId, input }) => {
      const token = input.botToken ?? input.token;
      if (!input.useEnv && !token) {
        return "MAX requires --bot-token (or --use-env to read MAX_BOT_TOKEN from environment).";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const token = input.botToken ?? input.token;
      const apiBaseUrl = input.httpUrl?.trim();
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "max",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "max",
            })
          : namedConfig;

      if (accountId === DEFAULT_ACCOUNT_ID) {
        const currentMax = (next.channels as Record<string, unknown> | undefined)?.max as Record<string, unknown> | undefined ?? {};
        return {
          ...next,
          channels: {
            ...next.channels,
            max: {
              ...currentMax,
              enabled: true,
              ...(input.useEnv
                ? {}
                : {
                    ...(token ? { botToken: token } : {}),
                    ...(apiBaseUrl ? { apiBaseUrl } : {}),
                  }),
            },
          },
        };
      }
      const baseMaxCfg = (next.channels as Record<string, unknown> | undefined)?.max as Record<string, unknown> | undefined ?? {};
      const existingAccounts = baseMaxCfg.accounts as Record<string, unknown> | undefined ?? {};
      const existingAccount = existingAccounts[accountId] as Record<string, unknown> | undefined ?? {};
      return {
        ...next,
        channels: {
          ...next.channels,
          max: {
            ...baseMaxCfg,
            enabled: true,
            accounts: {
              ...existingAccounts,
              [accountId]: {
                ...existingAccount,
                enabled: true,
                ...(token ? { botToken: token } : {}),
                ...(apiBaseUrl ? { apiBaseUrl } : {}),
              },
            },
          },
        },
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.setStatus({
        accountId: account.accountId,
        baseUrl: account.apiBaseUrl,
        botTokenSource: account.botTokenSource,
        lastStartAt: Date.now(),
        running: true,
      });
      ctx.log?.info(`[${account.accountId}] MAX channel starting`);
      return monitorMaxProvider({
        botToken: account.botToken ?? undefined,
        apiBaseUrl: account.apiBaseUrl,
        accountId: account.accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
      });
    },
  },
};
