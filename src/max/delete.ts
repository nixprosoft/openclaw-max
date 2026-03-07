import { getMaxRuntime } from "../runtime.js";
import { resolveMaxAccount } from "./accounts.js";
import { createMaxClient, deleteMaxMessage } from "./client.js";

export type MaxDeleteOpts = {
  botToken?: string;
  apiBaseUrl?: string;
  accountId?: string;
};

/**
 * Delete a MAX message (DELETE /messages).
 */
export async function deleteTextMax(
  messageId: string,
  opts: MaxDeleteOpts = {},
): Promise<void> {
  const runtime = getMaxRuntime();
  const cfg = runtime.config.loadConfig();
  const account = resolveMaxAccount({ cfg, accountId: opts.accountId });

  const token = opts.botToken?.trim() || account.botToken?.trim();
  if (!token) {
    throw new Error(
      `MAX bot token missing for account "${account.accountId}" (set channels.max.botToken or MAX_BOT_TOKEN env var).`,
    );
  }

  const apiBaseUrl = opts.apiBaseUrl?.trim() || account.apiBaseUrl;
  const client = createMaxClient({ botToken: token, apiBaseUrl });

  return deleteMaxMessage(client, messageId);
}
