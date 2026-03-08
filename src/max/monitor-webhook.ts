import type { IncomingMessage, ServerResponse } from "node:http";
import type { ChannelAccountSnapshot, OpenClawConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import {
  createScopedPairingAccess,
  readJsonWebhookBodyOrReject,
  registerPluginHttpRoute,
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
  waitUntilAbort,
  warnMissingProviderGroupPolicyFallbackOnce,
} from "openclaw/plugin-sdk";
import { getMaxRuntime } from "../runtime.js";
import { resolveMaxAccount, type ResolvedMaxAccount } from "./accounts.js";
import {
  createMaxClient,
  fetchMaxMe,
  subscribeMaxWebhook,
  unsubscribeMaxWebhook,
  type MaxBotInfo,
  type MaxUpdateEvent,
} from "./client.js";
import { handleUpdate, registerCommands, type HandleUpdateCtx } from "./monitor.js";

export type MonitorMaxWebhookOpts = {
  botToken?: string;
  apiBaseUrl?: string;
  accountId?: string;
  config?: OpenClawConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  statusSink?: (patch: Partial<ChannelAccountSnapshot>) => void;
};

/** Track registered route unregisters keyed by accountId:path. */
const activeRouteUnregisters = new Map<string, () => void>();

export async function monitorMaxWebhook(opts: MonitorMaxWebhookOpts): Promise<void> {
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

  const webhookUrl = account.config.webhookUrl?.trim();
  if (!webhookUrl) {
    const err = `MAX webhook mode requires channels.max.webhookUrl to be set.`;
    opts.statusSink?.({ running: false, connected: false, lastError: err });
    log(err);
    return;
  }

  const webhookPath = account.config.webhookPath?.trim() || "/max-webhook";
  const webhookSecret = account.config.webhookSecret?.trim() || undefined;

  const apiBaseUrl = opts.apiBaseUrl?.trim() || account.apiBaseUrl;
  const client = createMaxClient({ botToken: token, apiBaseUrl });

  // ── Probe ────────────────────────────────────────────────────────────────

  let botInfo: MaxBotInfo;
  try {
    botInfo = await fetchMaxMe(client);
    const displayName = botInfo.username ? `@${botInfo.username}` : String(botInfo.user_id);
    log(`[max/webhook] Connected as ${displayName}`);
  } catch (err) {
    const errMsg = `MAX probe failed: ${String(err)}`;
    opts.statusSink?.({ running: false, connected: false, lastError: errMsg });
    log(`[max/webhook] ${errMsg}`);
    return;
  }

  opts.statusSink?.({
    running: true,
    connected: true,
    lastConnectedAt: Date.now(),
    lastError: null,
  });

  // ── Register bot commands ─────────────────────────────────────────────────

  const commands = account.config.commands ?? [];
  await registerCommands(client, commands, log);

  // ── Set up update handler context ─────────────────────────────────────────

  const pairing = createScopedPairingAccess({
    core,
    channel: "chatmax",
    accountId: account.accountId,
  });

  const defaultGroupPolicy = resolveDefaultGroupPolicy(cfg);
  const { groupPolicy, providerMissingFallbackApplied } = resolveAllowlistProviderRuntimeGroupPolicy({
    providerConfigPresent: (cfg.channels as Record<string, unknown>)?.chatmax !== undefined,
    groupPolicy: account.config.groupPolicy,
    defaultGroupPolicy,
  });
  warnMissingProviderGroupPolicyFallbackOnce({
    providerMissingFallbackApplied,
    providerKey: "chatmax",
    accountId: account.accountId,
    log: (message) => log(message),
  });

  // We build a pseudo opts object so handleUpdate (which expects MonitorMaxOpts) works.
  const handlerOpts = {
    botToken: token,
    apiBaseUrl,
    accountId: account.accountId,
    config: cfg,
    runtime,
    abortSignal: opts.abortSignal,
    statusSink: opts.statusSink,
  };

  const ctx: HandleUpdateCtx = {
    client,
    botInfo,
    account,
    cfg,
    log,
    opts: handlerOpts,
    groupPolicy,
    pairing,
  };

  // ── Subscribe webhook with MAX ────────────────────────────────────────────

  try {
    await subscribeMaxWebhook(client, {
      url: webhookUrl,
      ...(webhookSecret ? { secret: webhookSecret } : {}),
    });
    log(`[max/webhook] Subscribed webhook → ${webhookUrl}`);
  } catch (err) {
    const errMsg = `MAX webhook subscribe failed: ${String(err)}`;
    opts.statusSink?.({ running: false, connected: false, lastError: errMsg });
    log(`[max/webhook] ${errMsg}`);
    return;
  }

  // ── Register HTTP route ───────────────────────────────────────────────────

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // Only accept POST
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "text/plain" });
      res.end("Method Not Allowed");
      return;
    }

    // Verify secret header if configured
    if (webhookSecret) {
      const incoming = req.headers["x-max-bot-api-secret"];
      const incomingStr = Array.isArray(incoming) ? incoming[0] : incoming;
      if (incomingStr !== webhookSecret) {
        res.writeHead(401, { "Content-Type": "text/plain" });
        res.end("Unauthorized");
        return;
      }
    }

    // Read JSON body
    const bodyResult = await readJsonWebhookBodyOrReject({ req, res });
    if (!bodyResult.ok) return;

    // Acknowledge immediately — MAX retries if we respond slowly
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{}");

    // Process update asynchronously
    const update = bodyResult.value as MaxUpdateEvent;
    try {
      // Reload cfg in case it changed since startup
      const currentCfg = core.config.loadConfig();
      const currentCtx: HandleUpdateCtx = { ...ctx, cfg: currentCfg };
      await handleUpdate(update, currentCtx);
    } catch (err) {
      log(`[max/webhook] Error handling ${update?.update_type ?? "unknown"}: ${String(err)}`);
    }
  };

  // Deregister any stale route from a previous start
  const routeKey = `${account.accountId}:${webhookPath}`;
  const prevUnregister = activeRouteUnregisters.get(routeKey);
  if (prevUnregister) {
    log(`[max/webhook] Deregistering stale route before re-registering: ${webhookPath}`);
    prevUnregister();
    activeRouteUnregisters.delete(routeKey);
  }

  const unregister = registerPluginHttpRoute({
    path: webhookPath,
    auth: "plugin",
    replaceExisting: true,
    pluginId: "chatmax",
    accountId: account.accountId,
    log: (msg: string) => log(msg),
    handler,
  });

  activeRouteUnregisters.set(routeKey, unregister);
  log(`[max/webhook] Registered HTTP route: ${webhookPath}`);

  // ── Keep alive until abort ────────────────────────────────────────────────

  await waitUntilAbort(opts.abortSignal);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  log(`[max/webhook] Stopping for account "${account.accountId}"`);

  if (typeof unregister === "function") {
    unregister();
  }
  activeRouteUnregisters.delete(routeKey);

  try {
    await unsubscribeMaxWebhook(client);
    log(`[max/webhook] Unsubscribed webhook`);
  } catch (err) {
    log(`[max/webhook] Warning: failed to unsubscribe webhook: ${String(err)}`);
  }

  opts.statusSink?.({ running: false, connected: false, lastStopAt: Date.now() });
}
