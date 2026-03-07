import { getMaxRuntime } from "../runtime.js";
import { resolveMaxAccount } from "./accounts.js";
import { createMaxClient, editMaxMessage, type MaxSendMessageBody } from "./client.js";

export type MaxEditOpts = {
  botToken?: string;
  apiBaseUrl?: string;
  accountId?: string;
};

/**
 * Edit an existing MAX message (PUT /messages).
 * Note: MAX enforces a 24-hour edit window.
 */
export async function editTextMax(
  messageId: string,
  body: MaxSendMessageBody,
  opts: MaxEditOpts = {},
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

  return editMaxMessage(client, messageId, body);
}
