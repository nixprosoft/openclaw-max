import type { ChannelAccountSnapshot, ChatType, OpenClawConfig, ReplyPayload, RuntimeEnv } from "openclaw/plugin-sdk";
import {
  buildAgentMediaPayload,
  createReplyPrefixOptions,
  createScopedPairingAccess,
  createTypingCallbacks,
  DM_GROUP_ACCESS_REASON,
  logTypingFailure,
  readStoreAllowFromForDmPolicy,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  resolveDmGroupAccessWithLists,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "openclaw/plugin-sdk";
import { getMaxRuntime } from "../runtime.js";
import { resolveMaxAccount, type ResolvedMaxAccount } from "./accounts.js";
import {
  createMaxClient,
  fetchMaxMe,
  getMaxUpdates,
  patchMaxMe,
  sendMaxMessage,
  sendMaxTyping,
  type MaxBotInfo,
  type MaxClient,
  type MaxUpdateEvent,
  type MaxUser,
} from "./client.js";

export type MonitorMaxOpts = {
  botToken?: string;
  apiBaseUrl?: string;
  accountId?: string;
  config?: OpenClawConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  statusSink?: (patch: Partial<ChannelAccountSnapshot>) => void;
};

const POLL_TIMEOUT_SECS = 30;
const POLL_LIMIT = 100;
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 60_000;

function mapMaxChatType(maxChatType: string | undefined): ChatType {
  if (maxChatType === "dialog") return "direct";
  if (maxChatType === "channel") return "channel";
  return "group";
}

function toChatKind(kind: ChatType): "direct" | "group" | "channel" {
  if (kind === "direct") return "direct";
  if (kind === "group") return "group";
  return "channel";
}

function formatSenderId(userId: number | undefined | null): string {
  return `max:${userId ?? "unknown"}`;
}

function formatUserLabel(user: MaxUser | null | undefined): string {
  if (!user) return "unknown";
  const name = user.name?.trim();
  const username = user.username?.trim();
  return name || (username ? `@${username}` : `user:${user.user_id}`);
}

function isBotMentioned(text: string | null | undefined, botInfo: MaxBotInfo): boolean {
  if (!text) return false;
  const username = botInfo.username?.trim();
  if (!username) return false;
  return text.toLowerCase().includes(`@${username.toLowerCase()}`);
}

function stripBotMention(text: string, botInfo: MaxBotInfo): string {
  const username = botInfo.username?.trim();
  if (!username) return text.trim();
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`@${escaped}\\b`, "gi"), "").replace(/\s+/g, " ").trim();
}

function normalizeMaxAllowList(list: Array<string | number>): string[] {
  return list.map((e) => String(e).trim().toLowerCase()).filter(Boolean);
}

function isMaxSenderAllowed(senderId: string, allowFrom: string[]): boolean {
  if (allowFrom.includes("*")) return true;
  const normalized = senderId.replace(/^max:/i, "").toLowerCase();
  return allowFrom.some((e) => e === normalized || e === senderId.toLowerCase());
}

async function registerCommands(
  client: MaxClient,
  commands: Array<{ name: string; description: string }>,
  log: (msg: string) => void,
): Promise<void> {
  if (!commands || commands.length === 0) return;
  try {
    await patchMaxMe(client, { commands });
    log(`[max] Registered ${commands.length} bot command(s)`);
  } catch (err) {
    log(`[max] Warning: failed to register commands: ${String(err)}`);
  }
}

export async function monitorMaxProvider(opts: MonitorMaxOpts): Promise<void> {
  const core = getMaxRuntime();
  const runtime = opts.runtime;
  const log = (msg: string) => runtime?.log?.(msg);
  const cfg = opts.config ?? core.config.loadConfig();
  const account = resolveMaxAccount({ cfg, accountId: opts.accountId });

  const token = opts.botToken?.trim() || account.botToken?.trim();
  if (!token) {
    const err = `MAX bot token missing for account "${account.accountId}" (set channels.max.botToken or MAX_BOT_TOKEN env var).`;
    opts.statusSink?.({ running: false, connected: false, lastError: err });
    log(err);
    return;
  }

  const apiBaseUrl = opts.apiBaseUrl?.trim() || account.apiBaseUrl;
  const client = createMaxClient({ botToken: token, apiBaseUrl });

  let botInfo: MaxBotInfo;
  try {
    botInfo = await fetchMaxMe(client);
    const displayName = botInfo.username ? `@${botInfo.username}` : String(botInfo.user_id);
    log(`[max] Connected as ${displayName}`);
  } catch (err) {
    const errMsg = `MAX probe failed: ${String(err)}`;
    opts.statusSink?.({ running: false, connected: false, lastError: errMsg });
    log(`[max] ${errMsg}`);
    return;
  }

  opts.statusSink?.({
    running: true,
    connected: true,
    lastConnectedAt: Date.now(),
    lastError: null,
  });

  const commands = account.config.commands ?? [];
  await registerCommands(client, commands, log);

  const pairing = createScopedPairingAccess({
    core,
    channel: "max",
    accountId: account.accountId,
  });

  const defaultGroupPolicy = resolveDefaultGroupPolicy(cfg);
  const { groupPolicy, providerMissingFallbackApplied } = resolveAllowlistProviderRuntimeGroupPolicy({
    providerConfigPresent: (cfg.channels as Record<string, unknown>)?.max !== undefined,
    groupPolicy: account.config.groupPolicy,
    defaultGroupPolicy,
  });
  warnMissingProviderGroupPolicyFallbackOnce({
    providerMissingFallbackApplied,
    providerKey: "max",
    accountId: account.accountId,
    log: (message) => log(message),
  });

  let marker: number | null = null;
  let reconnectDelay = RECONNECT_DELAY_MS;
  const signal = opts.abortSignal;

  while (!signal?.aborted) {
    try {
      const response = await getMaxUpdates(client, {
        marker: marker ?? undefined,
        limit: POLL_LIMIT,
        timeout: POLL_TIMEOUT_SECS,
      });

      if (signal?.aborted) break;

      const updates = response.updates ?? [];
      if (response.marker != null) {
        marker = response.marker;
      }

      reconnectDelay = RECONNECT_DELAY_MS;

      for (const update of updates) {
        try {
          await handleUpdate(update, {
            client,
            botInfo,
            account,
            cfg,
            log,
            opts,
            groupPolicy,
            pairing,
          });
        } catch (err) {
          log(`[max] Error handling ${update.update_type}: ${String(err)}`);
        }
      }
    } catch (err) {
      if (signal?.aborted) break;
      const errMsg = String(err);
      log(`[max] Poll error: ${errMsg} — retrying in ${reconnectDelay}ms`);
      opts.statusSink?.({ connected: false, lastError: errMsg });
      await sleep(reconnectDelay, signal);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
      if (!signal?.aborted) {
        opts.statusSink?.({ connected: true, lastError: null });
      }
    }
  }

  opts.statusSink?.({ running: false, connected: false, lastStopAt: Date.now() });
  log(`[max] Monitor stopped for account "${account.accountId}"`);
}

type HandleUpdateCtx = {
  client: MaxClient;
  botInfo: MaxBotInfo;
  account: ResolvedMaxAccount;
  cfg: OpenClawConfig;
  log: (msg: string) => void;
  opts: MonitorMaxOpts;
  groupPolicy: string;
  pairing: ReturnType<typeof createScopedPairingAccess>;
};

async function handleUpdate(update: MaxUpdateEvent, ctx: HandleUpdateCtx): Promise<void> {
  if (update.update_type === "message_created" || update.update_type === "bot_started") {
    await handleMessageCreated(update, ctx);
  } else if (update.update_type === "message_callback") {
    await handleCallback(update, ctx);
  } else if (update.update_type === "bot_added") {
    ctx.log(`[max] Bot added to chat ${update.chat_id ?? "?"}`);
  } else if (update.update_type === "bot_removed") {
    ctx.log(`[max] Bot removed from chat ${update.chat_id ?? "?"}`);
  }
}

async function handleMessageCreated(update: MaxUpdateEvent, ctx: HandleUpdateCtx): Promise<void> {
  const { client, botInfo, account, cfg, log, opts, groupPolicy, pairing } = ctx;
  const core = getMaxRuntime();
  const logger = core.logging.getChildLogger({ module: "max" });

  const message = update.message;
  if (!message) return;

  const sender = message.sender;
  const chatId = message.recipient?.chat_id;
  const rawChatType = message.recipient?.chat_type as string | undefined;
  const messageId = message.body?.mid;
  const rawText = message.body?.text ?? "";

  if (!chatId || !messageId) return;
  if (sender?.user_id === botInfo.user_id) return;

  const kind = mapMaxChatType(rawChatType);
  const chatType = toChatKind(kind);
  const senderId = formatSenderId(sender?.user_id);
  const senderName = formatUserLabel(sender);

  const dmPolicy = account.config.dmPolicy ?? "pairing";
  const normalizedAllowFrom = normalizeMaxAllowList(account.config.allowFrom ?? []);
  const normalizedGroupAllowFrom = normalizeMaxAllowList(account.config.groupAllowFrom ?? []);

  const storeAllowFrom = normalizeMaxAllowList(
    await readStoreAllowFromForDmPolicy({
      provider: "max",
      accountId: account.accountId,
      dmPolicy,
      readStore: pairing.readStoreForDmPolicy,
    }),
  );

  const accessDecision = resolveDmGroupAccessWithLists({
    isGroup: kind !== "direct",
    dmPolicy,
    groupPolicy,
    allowFrom: normalizedAllowFrom,
    groupAllowFrom: normalizedGroupAllowFrom,
    storeAllowFrom,
    isSenderAllowed: (allowFrom) => isMaxSenderAllowed(senderId, allowFrom),
  });

  if (accessDecision.decision !== "allow") {
    if (kind === "direct") {
      if (accessDecision.reasonCode === DM_GROUP_ACCESS_REASON.DM_POLICY_DISABLED) {
        log(`[max] drop dm (dmPolicy=disabled sender=${senderId})`);
        return;
      }
      if (accessDecision.decision === "pairing") {
        const { code, created } = await pairing.upsertPairingRequest({
          id: senderId,
          meta: { name: senderName },
        });
        if (created) {
          try {
            await sendMaxMessage(client, chatId, {
              text: core.channel.pairing.buildPairingReply({
                channel: "max",
                idLine: `Your MAX user id: ${sender?.user_id ?? "unknown"}`,
                code,
              }),
            });
            opts.statusSink?.({ lastOutboundAt: Date.now() });
          } catch (err) {
            logger.debug?.(`[max] pairing reply failed for ${senderId}: ${String(err)}`);
          }
        }
        return;
      }
      log(`[max] drop dm sender=${senderId} (dmPolicy=${dmPolicy})`);
      return;
    }
    if (accessDecision.reasonCode === DM_GROUP_ACCESS_REASON.GROUP_POLICY_DISABLED) {
      log(`[max] drop group message (groupPolicy=disabled)`);
      return;
    }
    log(`[max] drop group sender=${senderId} (reason=${accessDecision.reason})`);
    return;
  }

  // Mention check for non-DM chats
  const requireMention = account.config.groups?.[String(chatId)]?.requireMention ?? true;
  const wasMentioned = kind !== "direct" && isBotMentioned(rawText, botInfo);
  if (kind !== "direct" && requireMention && !wasMentioned && update.update_type !== "bot_started") {
    return;
  }

  const bodySource = kind !== "direct" ? stripBotMention(rawText, botInfo) : rawText.trim();
  const bodyText = update.update_type === "bot_started" && !bodySource ? "/start" : bodySource;

  if (!bodyText && update.update_type !== "bot_started") return;

  // ── Routing ──────────────────────────────────────────────────────────────

  const to =
    kind === "direct"
      ? `max:${sender?.user_id ?? chatId}`
      : kind === "group"
        ? `max:group:${chatId}`
        : `max:channel:${chatId}`;

  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: "max",
    accountId: account.accountId,
    peer: {
      kind,
      id: kind === "direct" ? senderId : String(chatId),
    },
  });

  // ── Build inbound context ────────────────────────────────────────────────

  const fromLabel =
    kind === "direct" ? senderName : `chat:${chatId} (${senderName})`;

  const body = core.channel.reply.formatInboundEnvelope({
    channel: "MAX",
    from: fromLabel,
    timestamp: message.timestamp ?? undefined,
    body: `${bodyText}\n[max message id: ${messageId} chat: ${chatId}]`,
    chatType,
    sender: { name: senderName, id: senderId },
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: bodyText,
    RawBody: bodyText,
    CommandBody: rawText.trim(),
    BodyForCommands: rawText.trim(),
    From:
      kind === "direct"
        ? `max:${sender?.user_id ?? chatId}`
        : kind === "group"
          ? `max:group:${chatId}`
          : `max:channel:${chatId}`,
    To: to,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: chatType,
    ConversationLabel: fromLabel,
    SenderName: senderName,
    SenderId: senderId,
    Provider: "max" as const,
    Surface: "max" as const,
    MessageSid: messageId,
    WasMentioned: kind !== "direct" ? wasMentioned : undefined,
    OriginatingChannel: "max" as const,
    OriginatingTo: to,
    ...buildAgentMediaPayload([]),
  });

  // Update session route for DMs
  if (kind === "direct") {
    const storePath = core.channel.session.resolveStorePath(cfg.session?.store, {
      agentId: route.agentId,
    });
    await core.channel.session.updateLastRoute({
      storePath,
      sessionKey: route.mainSessionKey,
      deliveryContext: {
        channel: "max",
        to,
        accountId: route.accountId,
      },
    });
  }

  core.channel.activity.record({
    channel: "max",
    accountId: account.accountId,
    direction: "inbound",
  });

  // ── Reply dispatch ────────────────────────────────────────────────────────

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg,
    agentId: route.agentId,
    channel: "max",
    accountId: account.accountId,
  });

  const textLimit = core.channel.text.resolveTextChunkLimit(cfg, "max", account.accountId, {
    fallbackLimit: account.config.textChunkLimit ?? 4000,
  });

  const typingCallbacks = createTypingCallbacks({
    start: async () => {
      await sendMaxTyping(client, chatId);
    },
    onStartError: (err) => {
      logTypingFailure({
        log: (message) => logger.debug?.(message),
        channel: "max",
        target: String(chatId),
        error: err,
      });
    },
  });

  const { dispatcher, replyOptions, markDispatchIdle } =
    core.channel.reply.createReplyDispatcherWithTyping({
      ...prefixOptions,
      humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, route.agentId),
      typingCallbacks,
      deliver: async (payload: ReplyPayload) => {
        const mediaUrls = payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []);
        const text = payload.text ?? "";
        if (mediaUrls.length === 0) {
          const chunks = core.channel.text.chunkMarkdownText(text, textLimit);
          for (const chunk of chunks.length > 0 ? chunks : [text]) {
            if (!chunk) continue;
            await sendMaxMessage(client, chatId, {
              text: chunk,
              format: account.config.format ?? "markdown",
              notify: account.config.notify ?? true,
              link: { type: "reply", mid: messageId },
            });
          }
        } else {
          let first = true;
          for (const mediaUrl of mediaUrls) {
            const caption = first ? text : "";
            first = false;
            await sendMaxMessage(client, chatId, {
              text: caption || mediaUrl,
              format: account.config.format ?? "markdown",
            });
          }
        }
        opts.statusSink?.({ lastOutboundAt: Date.now() });
      },
      onError: (err, info) => {
        logger.debug?.(`[max] ${info.kind} reply failed: ${String(err)}`);
      },
    });

  await core.channel.reply.withReplyDispatcher({
    dispatcher,
    onSettled: () => { markDispatchIdle(); },
    run: () =>
      core.channel.reply.dispatchReplyFromConfig({
        ctx: ctxPayload,
        cfg,
        dispatcher,
        replyOptions: { ...replyOptions, onModelSelected },
      }),
  });
}

async function handleCallback(update: MaxUpdateEvent, ctx: HandleUpdateCtx): Promise<void> {
  const { client, botInfo, account, cfg, log, opts } = ctx;
  const core = getMaxRuntime();
  const logger = core.logging.getChildLogger({ module: "max" });

  const cb = update.callback;
  if (!cb) return;

  const callbackId = cb.callback_id;
  const payload = cb.payload ?? "";
  const user = cb.user;
  const chatId = cb.message?.recipient?.chat_id;

  if (!chatId) return;

  // Answer callback to dismiss spinner
  try {
    await client.request<void>("/answers", {
      method: "POST",
      body: JSON.stringify({ callback_id: callbackId }),
    });
  } catch (err) {
    logger.debug?.(`[max] failed to answer callback: ${String(err)}`);
  }

  const senderId = formatSenderId(user?.user_id);
  const senderName = formatUserLabel(user);
  const messageId = cb.message?.body?.mid ?? callbackId;

  const to = `max:${user?.user_id ?? chatId}`;

  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: "max",
    accountId: account.accountId,
    peer: { kind: "direct", id: senderId },
  });

  const body = core.channel.reply.formatInboundEnvelope({
    channel: "MAX",
    from: senderName,
    body: `${payload}\n[max callback id: ${callbackId}]`,
    chatType: "direct",
    sender: { name: senderName, id: senderId },
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: payload,
    RawBody: payload,
    CommandBody: payload,
    BodyForCommands: payload,
    From: `max:${user?.user_id ?? chatId}`,
    To: to,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: senderName,
    SenderName: senderName,
    SenderId: senderId,
    Provider: "max" as const,
    Surface: "max" as const,
    MessageSid: messageId,
    OriginatingChannel: "max" as const,
    OriginatingTo: to,
    ...buildAgentMediaPayload([]),
  });

  core.channel.activity.record({
    channel: "max",
    accountId: account.accountId,
    direction: "inbound",
  });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg,
    agentId: route.agentId,
    channel: "max",
    accountId: account.accountId,
  });

  const textLimit = core.channel.text.resolveTextChunkLimit(cfg, "max", account.accountId, {
    fallbackLimit: account.config.textChunkLimit ?? 4000,
  });

  const { dispatcher, replyOptions, markDispatchIdle } =
    core.channel.reply.createReplyDispatcherWithTyping({
      ...prefixOptions,
      humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, route.agentId),
      deliver: async (reply: ReplyPayload) => {
        const text = reply.text ?? "";
        const chunks = core.channel.text.chunkMarkdownText(text, textLimit);
        for (const chunk of chunks.length > 0 ? chunks : [text]) {
          if (!chunk) continue;
          await sendMaxMessage(client, chatId, {
            text: chunk,
            format: account.config.format ?? "markdown",
          });
        }
        opts.statusSink?.({ lastOutboundAt: Date.now() });
      },
      onError: (err, info) => {
        logger.debug?.(`[max] callback ${info.kind} reply failed: ${String(err)}`);
      },
    });

  await core.channel.reply.withReplyDispatcher({
    dispatcher,
    onSettled: () => { markDispatchIdle(); },
    run: () =>
      core.channel.reply.dispatchReplyFromConfig({
        ctx: ctxPayload,
        cfg,
        dispatcher,
        replyOptions: { ...replyOptions, onModelSelected },
      }),
  });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
