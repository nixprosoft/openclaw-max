import { getMaxRuntime } from "../runtime.js";
import { resolveMaxAccount } from "./accounts.js";
import {
  createMaxClient,
  sendMaxMessage,
  type MaxAttachment,
  type MaxInlineKeyboardButton,
} from "./client.js";

export type MaxSendOpts = {
  botToken?: string;
  apiBaseUrl?: string;
  accountId?: string;
  replyToId?: string;
  notify?: boolean;
  disableLinkPreview?: boolean;
  format?: "markdown" | "html";
  buttons?: MaxInlineKeyboardButton[][];
};

export type MaxSendResult = {
  messageId: string;
  chatId: number;
};

export async function sendTextMax(
  chatId: number,
  text: string,
  opts: MaxSendOpts = {},
): Promise<MaxSendResult> {
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

  const format = opts.format ?? account.config.format ?? "markdown";
  const notify = opts.notify ?? account.config.notify ?? true;
  const disableLinkPreview = opts.disableLinkPreview ?? false;

  const attachments: MaxAttachment[] = [];
  if (opts.buttons && opts.buttons.length > 0) {
    attachments.push({
      type: "inline_keyboard",
      payload: { buttons: opts.buttons },
    });
  }

  const body = {
    text,
    format,
    notify,
    disable_link_preview: disableLinkPreview,
    ...(opts.replyToId ? { link: { type: "reply" as const, mid: opts.replyToId } } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
  };

  const res = await sendMaxMessage(client, chatId, body);

  runtime.channel.activity.record({
    channel: "chatmax",
    accountId: account.accountId,
    direction: "outbound",
  });

  return {
    messageId: res.message_id,
    chatId: res.chat_id ?? chatId,
  };
}
