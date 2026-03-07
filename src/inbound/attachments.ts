import type { MaxAttachment } from "../max/client.js";

export type MaxAttachmentInfo = {
  /** Human-readable text description for the agent. */
  text: string;
  /** Remote URL of the media (if available). */
  mediaUrl?: string;
  /** Attachment category. */
  kind: "image" | "video" | "audio" | "file" | "sticker" | "location" | "contact" | "share" | "keyboard";
};

/**
 * Convert MAX attachment objects to structured info for the agent envelope.
 * Downloads are NOT performed here — URLs are passed as text so the agent can access them.
 */
export function processMaxAttachments(attachments: MaxAttachment[]): MaxAttachmentInfo[] {
  const result: MaxAttachmentInfo[] = [];

  for (const att of attachments) {
    switch (att.type) {
      case "image": {
        const url = att.payload.url?.trim() || undefined;
        result.push({
          kind: "image",
          text: url ? `<media:image> ${url}` : "<media:image>",
          mediaUrl: url,
        });
        break;
      }
      case "video": {
        const url = att.payload.url?.trim() || undefined;
        result.push({
          kind: "video",
          text: url ? `<media:video> ${url}` : "<media:video>",
          mediaUrl: url,
        });
        break;
      }
      case "audio": {
        const url = att.payload.url?.trim() || undefined;
        result.push({
          kind: "audio",
          text: url ? `<media:audio> ${url}` : "<media:audio>",
          mediaUrl: url,
        });
        break;
      }
      case "file": {
        const url = att.payload.url?.trim() || undefined;
        const fname = att.payload.filename?.trim() || undefined;
        const label = fname ? `<media:file name="${fname}">` : "<media:file>";
        result.push({
          kind: "file",
          text: url ? `${label} ${url}` : label,
          mediaUrl: url,
        });
        break;
      }
      case "sticker": {
        const url = att.payload.url?.trim() || undefined;
        result.push({
          kind: "sticker",
          text: url ? `<sticker> ${url}` : "<sticker>",
          mediaUrl: url,
        });
        break;
      }
      case "location": {
        const { latitude, longitude } = att.payload;
        const coords =
          latitude != null && longitude != null ? `${latitude},${longitude}` : "";
        result.push({
          kind: "location",
          text: coords ? `<location: ${coords}>` : "<location>",
        });
        break;
      }
      case "contact": {
        const name = att.payload.name?.trim() || att.payload.vcf_info?.trim() || "";
        result.push({
          kind: "contact",
          text: name ? `<contact: ${name}>` : "<contact>",
        });
        break;
      }
      case "share": {
        const url = att.payload.url?.trim() || undefined;
        const title = att.payload.title?.trim() || undefined;
        const label = title ? `<link: ${title}>` : "<link>";
        result.push({
          kind: "share",
          text: url ? `${label} ${url}` : label,
          mediaUrl: url,
        });
        break;
      }
      case "inline_keyboard":
        result.push({ kind: "keyboard", text: "" });
        break;
    }
  }

  return result;
}

/**
 * Build a text snippet from attachment infos to append to the agent message body.
 */
export function buildAttachmentBodyText(infos: MaxAttachmentInfo[]): string {
  return infos
    .map((i) => i.text)
    .filter(Boolean)
    .join("\n");
}
