/** Raw HTTP client for MAX Bot API. */

const DEFAULT_MAX_API_BASE = "https://api.max.ru";

export type MaxClient = {
  apiBaseUrl: string;
  token: string;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
};

// ─── MAX API types ────────────────────────────────────────────────────────────

export type MaxBotInfo = {
  user_id: number;
  name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  full_avatar_url?: string | null;
  commands?: MaxBotCommand[] | null;
  description?: string | null;
};

export type MaxBotCommand = {
  name: string;
  description: string;
};

export type MaxChat = {
  chat_id: number;
  type: "dialog" | "chat" | "channel";
  status?: string | null;
  title?: string | null;
  icon?: { url?: string } | null;
  last_event_time?: number | null;
  participants_count?: number | null;
  owner_id?: number | null;
  is_public?: boolean | null;
  link?: string | null;
  description?: string | null;
};

export type MaxUser = {
  user_id: number;
  name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  full_avatar_url?: string | null;
  is_bot?: boolean | null;
};

export type MaxInlineKeyboardButton = {
  type: "callback" | "link" | "request_geo_location" | "request_contact" | "chat";
  text: string;
  payload?: string;
  url?: string;
  intent?: "positive" | "negative" | "default";
};

export type MaxInlineKeyboard = {
  type: "inline_keyboard";
  payload: {
    buttons: MaxInlineKeyboardButton[][];
  };
};

export type MaxAttachment =
  | { type: "image"; payload: { token?: string; url?: string; photo_id?: string } }
  | { type: "video"; payload: { token?: string; url?: string; id?: string } }
  | { type: "audio"; payload: { token?: string; url?: string; id?: string } }
  | { type: "file"; payload: { token?: string; url?: string; filename?: string; id?: string } }
  | { type: "sticker"; payload: { code?: string; url?: string; width?: number; height?: number } }
  | { type: "contact"; payload: { vcf_info?: string; name?: string; contact_id?: number } }
  | { type: "location"; payload: { latitude?: number; longitude?: number } }
  | { type: "share"; payload: { url?: string; token?: string; title?: string } }
  | MaxInlineKeyboard;

export type MaxLink = {
  type: "reply" | "forward";
  message?: MaxMessage | null;
  sender?: MaxUser | null;
  chat_id?: number | null;
  message_id?: string | null;
};

export type MaxMessage = {
  sender?: MaxUser | null;
  recipient?: { chat_id?: number | null; chat_type?: string | null; user_id?: number | null } | null;
  timestamp?: number | null;
  link?: MaxLink | null;
  body?: {
    mid?: string | null;
    seq?: number | null;
    text?: string | null;
    attachments?: MaxAttachment[] | null;
  } | null;
  stat?: { views?: number | null } | null;
  url?: string | null;
};

export type MaxSendMessageBody = {
  text?: string;
  format?: "markdown" | "html";
  attachments?: MaxAttachment[];
  link?: {
    type: "reply" | "forward";
    mid: string;
  };
  notify?: boolean;
  disable_link_preview?: boolean;
};

export type MaxSendMessageResponse = {
  message_id: string;
  chat_id?: number | null;
};

export type MaxUpdateEvent = {
  update_type: string;
  timestamp: number;
  message?: MaxMessage | null;
  callback?: {
    callback_id: string;
    payload?: string | null;
    timestamp?: number | null;
    message?: MaxMessage | null;
    user?: MaxUser | null;
  } | null;
  user?: MaxUser | null;
  chat_id?: number | null;
  user_id?: number | null;
  invite_link?: string | null;
  chat?: MaxChat | null;
};

export type MaxUpdatesResponse = {
  updates?: MaxUpdateEvent[];
  marker?: number | null;
};

export type MaxUploadUrlResponse = {
  url: string;
};

export type MaxUploadedFileToken = {
  token: string;
};

// ─── Client factory ───────────────────────────────────────────────────────────

export function normalizeMaxApiBase(raw?: string | null): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return DEFAULT_MAX_API_BASE;
  }
  return trimmed.replace(/\/+$/, "");
}

async function readMaxError(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const data = (await res.json()) as { message?: string; code?: string } | undefined;
      if (data?.message) {
        return data.message;
      }
      return JSON.stringify(data);
    } catch {
      // fall through
    }
  }
  return await res.text();
}

export function createMaxClient(params: {
  botToken: string;
  apiBaseUrl?: string | null;
}): MaxClient {
  const apiBaseUrl = normalizeMaxApiBase(params.apiBaseUrl);
  const token = params.botToken.trim();

  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const suffix = path.startsWith("/") ? path : `/${path}`;
    const url = `${apiBaseUrl}${suffix}`;
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (typeof init?.body === "string" && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      const detail = await readMaxError(res);
      throw new Error(`MAX API ${res.status} ${res.statusText}: ${detail || "unknown error"}`);
    }
    if (res.status === 204) {
      return undefined as T;
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return (await res.json()) as T;
    }
    return (await res.text()) as T;
  };

  return { apiBaseUrl, token, request };
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function fetchMaxMe(client: MaxClient): Promise<MaxBotInfo> {
  return client.request<MaxBotInfo>("/me");
}

export async function patchMaxMe(
  client: MaxClient,
  patch: { commands?: MaxBotCommand[]; name?: string; description?: string },
): Promise<MaxBotInfo> {
  return client.request<MaxBotInfo>("/me", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function sendMaxMessage(
  client: MaxClient,
  chatId: number,
  body: MaxSendMessageBody,
): Promise<MaxSendMessageResponse> {
  return client.request<MaxSendMessageResponse>(
    `/messages?chat_id=${encodeURIComponent(chatId)}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function editMaxMessage(
  client: MaxClient,
  messageId: string,
  body: MaxSendMessageBody,
): Promise<void> {
  return client.request<void>(`/messages?message_id=${encodeURIComponent(messageId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteMaxMessage(client: MaxClient, messageId: string): Promise<void> {
  return client.request<void>(`/messages?message_id=${encodeURIComponent(messageId)}`, {
    method: "DELETE",
  });
}

export async function sendMaxTyping(client: MaxClient, chatId: number): Promise<void> {
  return client.request<void>(`/chats/${encodeURIComponent(chatId)}/actions`, {
    method: "POST",
    body: JSON.stringify({ action: "typing_on" }),
  });
}

export async function answerMaxCallback(
  client: MaxClient,
  params: { callback_id: string; text?: string; notification?: boolean },
): Promise<void> {
  return client.request<void>("/answers", {
    method: "POST",
    body: JSON.stringify({
      callback_id: params.callback_id,
      ...(params.text !== undefined ? { message: { text: params.text } } : {}),
      notification: params.notification ?? false,
    }),
  });
}

export async function getMaxUpdates(
  client: MaxClient,
  params: { marker?: number | null; limit?: number; timeout?: number },
): Promise<MaxUpdatesResponse> {
  const qs = new URLSearchParams();
  if (params.marker != null) {
    qs.set("marker", String(params.marker));
  }
  if (params.limit != null) {
    qs.set("limit", String(params.limit));
  }
  if (params.timeout != null) {
    qs.set("timeout", String(params.timeout));
  }
  const path = `/updates${qs.toString() ? "?" + qs.toString() : ""}`;
  return client.request<MaxUpdatesResponse>(path);
}

export async function getMaxUploadUrl(
  client: MaxClient,
  fileType: "image" | "video" | "audio" | "file",
): Promise<MaxUploadUrlResponse> {
  return client.request<MaxUploadUrlResponse>(
    `/uploads?type=${encodeURIComponent(fileType)}`,
    { method: "POST" },
  );
}

/**
 * Step 2 of the upload flow: PUT the file buffer to the pre-signed upload URL.
 * Returns the token that can be used in an attachment payload.
 */
export async function uploadMaxFile(
  uploadUrl: string,
  buffer: Buffer,
  contentType?: string,
): Promise<MaxUploadedFileToken> {
  const headers: Record<string, string> = {};
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  const res = await fetch(uploadUrl, {
    method: "POST",
    body: buffer,
    headers,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`MAX file upload failed ${res.status} ${res.statusText}: ${detail || "unknown"}`);
  }
  return (await res.json()) as MaxUploadedFileToken;
}

// ─── Webhook subscriptions ─────────────────────────────────────────────────

export type MaxSubscription = {
  subscription_id?: number | null;
  url?: string | null;
  time?: number | null;
};

export async function subscribeMaxWebhook(
  client: MaxClient,
  params: { url: string; updateTypes?: string[]; secret?: string },
): Promise<MaxSubscription> {
  const body: Record<string, unknown> = { url: params.url };
  if (params.updateTypes && params.updateTypes.length > 0) {
    body.update_types = params.updateTypes;
  }
  if (params.secret) {
    body.secret = params.secret;
  }
  return client.request<MaxSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function unsubscribeMaxWebhook(client: MaxClient): Promise<void> {
  return client.request<void>("/subscriptions", { method: "DELETE" });
}
