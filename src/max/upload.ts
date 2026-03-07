import { loadOutboundMediaFromUrl } from "openclaw/plugin-sdk";
import {
  getMaxUploadUrl,
  uploadMaxFile,
  type MaxAttachment,
  type MaxClient,
} from "./client.js";

const DEFAULT_MAX_MEDIA_BYTES = 50 * 1024 * 1024; // 50 MB

function guessMaxFileType(
  contentType?: string | null,
  fileName?: string | null,
): "image" | "video" | "audio" | "file" {
  const ct = contentType?.toLowerCase() ?? "";
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  if (ct.startsWith("audio/")) return "audio";
  const fn = fileName?.toLowerCase() ?? "";
  if (/\.(jpg|jpeg|png|gif|webp|bmp|tiff?)$/.test(fn)) return "image";
  if (/\.(mp4|mov|avi|mkv|webm)$/.test(fn)) return "video";
  if (/\.(mp3|wav|ogg|flac|m4a|aac)$/.test(fn)) return "audio";
  return "file";
}

export type MaxUploadResult = {
  attachment: MaxAttachment;
  fileType: "image" | "video" | "audio" | "file";
};

/**
 * Full two-step MAX media upload flow:
 * 1. POST /uploads?type=<type>  → get upload URL
 * 2. PUT <uploadUrl> with file buffer → get token
 * Returns the attachment object ready for use in POST /messages.
 */
export async function uploadMaxMedia(
  client: MaxClient,
  params: {
    mediaUrl: string;
    mediaLocalRoots?: readonly string[];
    maxBytes?: number;
  },
): Promise<MaxUploadResult> {
  const maxBytes = params.maxBytes ?? DEFAULT_MAX_MEDIA_BYTES;

  const media = await loadOutboundMediaFromUrl(params.mediaUrl, {
    maxBytes,
    mediaLocalRoots: params.mediaLocalRoots,
  });

  const fileType = guessMaxFileType(media.contentType, media.fileName);

  const { url: uploadUrl } = await getMaxUploadUrl(client, fileType);

  const tokenResp = await uploadMaxFile(
    uploadUrl,
    media.buffer,
    media.contentType ?? undefined,
  );

  const attachment: MaxAttachment = {
    type: fileType,
    payload: { token: tokenResp.token },
  };

  return { attachment, fileType };
}
