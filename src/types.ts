import type { DmPolicy, GroupPolicy } from "openclaw/plugin-sdk";

export type MaxTokenSource = "env" | "config" | "none";

export type MaxGroupConfig = {
  requireMention?: boolean;
  groupPolicy?: GroupPolicy;
  allowFrom?: Array<string | number>;
  systemPrompt?: string;
  enabled?: boolean;
};

export type MaxAccountConfig = {
  /** Optional display name for this account. */
  name?: string;
  /** If false, do not start this MAX account. Default: true. */
  enabled?: boolean;
  /** MAX bot token (e.g., 001.0123456789.0123456789:ABCdef). */
  botToken?: string;
  /** MAX Bot API base URL. Default: https://api.max.ru */
  apiBaseUrl?: string;
  /** Connection mode: "polling" (default) or "webhook". */
  mode?: "polling" | "webhook";
  /** Webhook URL (required if mode=webhook). */
  webhookUrl?: string;
  /** Webhook secret for X-Max-Bot-Api-Secret verification. */
  webhookSecret?: string;
  /** Local webhook listen path. Default: /max-webhook */
  webhookPath?: string;
  /** Local webhook listen host. Default: 127.0.0.1 */
  webhookHost?: string;
  /** Local webhook listen port. Default: 8788 */
  webhookPort?: number;
  /** Direct message policy. Default: pairing */
  dmPolicy?: DmPolicy;
  /** Allowlist for DMs (user IDs). */
  allowFrom?: Array<string | number>;
  /** Group message policy. Default: allowlist */
  groupPolicy?: GroupPolicy;
  /** Allowlist for group messages (user IDs). */
  groupAllowFrom?: Array<string | number>;
  /** Per-group configuration keyed by chatId. */
  groups?: Record<string, MaxGroupConfig>;
  /** Max text chunk size in chars. Default: 4000 */
  textChunkLimit?: number;
  /** Message format: "markdown" | "html". Default: markdown */
  format?: "markdown" | "html";
  /** Whether to send typing indicator while generating. Default: true */
  typingIndicator?: boolean;
  /** Whether to send messages with notification. Default: true */
  notify?: boolean;
  /** Max media size in MB. Default: 50 */
  mediaMaxMb?: number;
  /** Action toggles. */
  actions?: {
    sendMessage?: boolean;
    editMessage?: boolean;
    deleteMessage?: boolean;
  };
  /** Bot commands to register via PATCH /me at startup. */
  commands?: Array<{ name: string; description: string }>;
  /** Optional per-account sub-configs (multi-account). */
  accounts?: Record<string, MaxAccountConfig>;
  /** Default account ID when multiple accounts are configured. */
  defaultAccount?: string;
};

export type MaxConfig = MaxAccountConfig;

export type ResolvedMaxAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  botToken?: string;
  botTokenSource: MaxTokenSource;
  apiBaseUrl: string;
  config: MaxAccountConfig;
};
