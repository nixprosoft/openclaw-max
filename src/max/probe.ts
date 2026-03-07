import type { BaseProbeResult } from "openclaw/plugin-sdk";
import { createMaxClient, fetchMaxMe, type MaxBotInfo } from "./client.js";

export type MaxProbeResult = BaseProbeResult & {
  status?: number | null;
  elapsedMs?: number | null;
  bot?: MaxBotInfo;
};

export async function probeMax(
  botToken: string,
  apiBaseUrl: string,
  timeoutMs = 2500,
): Promise<MaxProbeResult> {
  if (!botToken?.trim()) {
    return { ok: false, error: "bot token missing" };
  }
  if (!apiBaseUrl?.trim()) {
    return { ok: false, error: "apiBaseUrl missing" };
  }

  const start = Date.now();
  const controller = timeoutMs > 0 ? new AbortController() : undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (controller) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const client = createMaxClient({ botToken, apiBaseUrl });
    const bot = await fetchMaxMe(client);
    const elapsedMs = Date.now() - start;
    return {
      ok: true,
      status: 200,
      elapsedMs,
      bot,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: null,
      error: message,
      elapsedMs: Date.now() - start,
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
