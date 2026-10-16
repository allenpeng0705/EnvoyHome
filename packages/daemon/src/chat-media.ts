// Chat media upload + materialize — Design A.6 `media[]` on home.sendMessage.

import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { safeJoin } from "./fs-jail.js";
import type { HomePaths } from "./home-paths.js";

export const CHAT_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
export const CHAT_MEDIA_MAX_FILES = 8;
export const CHAT_MEDIA_UPLOAD_DIR = "uploads";

export type ChatMediaKind = "image" | "audio" | "video" | "file";

export interface ChatMediaItem {
  kind: ChatMediaKind;
  uri: string;
  fileName?: string;
  mimeType?: string;
  bytes?: number;
}

export class ChatMediaError extends Error {
  override readonly name = "ChatMediaError";
  constructor(
    readonly code: "bad_params" | "too_large" | "too_many",
    message: string,
  ) {
    super(message);
  }
}

export function kindFromMime(mimeType: string | undefined, fileName: string): ChatMediaKind {
  const mime = (mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  const lower = fileName.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|heic|svg)$/.test(lower)) return "image";
  if (/\.(mp3|wav|m4a|ogg|flac|aac)$/.test(lower)) return "audio";
  if (/\.(mp4|mov|webm|mkv)$/.test(lower)) return "video";
  return "file";
}

function sanitizeFileName(name: string): string {
  const base = basename(name || "file").replace(/[^\w.\-()+ ]+/g, "_").trim();
  const clipped = base.slice(0, 120) || "file";
  // Refuse path tricks after basename.
  if (clipped === "." || clipped === "..") return "file";
  return clipped;
}

/**
 * Write base64 content into `accounts/<id>/files/uploads/<uuid>-<name>` and
 * return a sandbox-relative uri for `home.sendMessage` media[].
 */
export async function storeChatMedia(input: {
  paths: HomePaths;
  accountId: string;
  fileName: string;
  mimeType?: string;
  contentBase64: string;
}): Promise<ChatMediaItem> {
  const fileName = sanitizeFileName(input.fileName);
  const raw = input.contentBase64.replace(/\s+/g, "");
  let buf: Buffer;
  try {
    buf = Buffer.from(raw, "base64");
  } catch {
    throw new ChatMediaError("bad_params", "envoyhome.bad_params: invalid contentBase64");
  }
  if (!raw || buf.length === 0) {
    throw new ChatMediaError("bad_params", "envoyhome.bad_params: empty media content");
  }
  if (buf.length > CHAT_MEDIA_MAX_BYTES) {
    throw new ChatMediaError(
      "too_large",
      `envoyhome.bad_params: media exceeds ${CHAT_MEDIA_MAX_BYTES} bytes`,
    );
  }
  const kind = kindFromMime(input.mimeType, fileName);
  const rel = `${CHAT_MEDIA_UPLOAD_DIR}/${randomUUID()}-${fileName}`;
  const abs = safeJoin(input.paths.accountFiles(input.accountId), rel);
  await mkdir(join(input.paths.accountFiles(input.accountId), CHAT_MEDIA_UPLOAD_DIR), {
    recursive: true,
  });
  await writeFile(abs, buf);
  return {
    kind,
    uri: rel.replace(/\\/g, "/"),
    fileName,
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    bytes: buf.length,
  };
}

/** Normalize wire media[]; reject oversized lists. */
export function normalizeMediaList(raw: unknown): ChatMediaItem[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new ChatMediaError("bad_params", "envoyhome.bad_params: media must be an array");
  }
  if (raw.length > CHAT_MEDIA_MAX_FILES) {
    throw new ChatMediaError(
      "too_many",
      `envoyhome.bad_params: at most ${CHAT_MEDIA_MAX_FILES} media items`,
    );
  }
  const out: ChatMediaItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ChatMediaError("bad_params", "envoyhome.bad_params: invalid media item");
    }
    const rec = item as Record<string, unknown>;
    const kind = rec.kind;
    const uri = typeof rec.uri === "string" ? rec.uri.trim() : "";
    if (kind !== "image" && kind !== "audio" && kind !== "video" && kind !== "file") {
      throw new ChatMediaError("bad_params", "envoyhome.bad_params: media.kind invalid");
    }
    if (!uri) {
      throw new ChatMediaError("bad_params", "envoyhome.bad_params: media.uri required");
    }
    // Only allow sandbox-relative uploads paths (no file:// or absolute escapes).
    if (uri.includes("..") || uri.startsWith("/") || /^[A-Za-z]:[\\/]/.test(uri)) {
      throw new ChatMediaError("bad_params", "envoyhome.bad_params: media.uri must be sandbox-relative");
    }
    if (!uri.startsWith(`${CHAT_MEDIA_UPLOAD_DIR}/`)) {
      throw new ChatMediaError(
        "bad_params",
        "envoyhome.bad_params: media.uri must be under uploads/",
      );
    }
    out.push({
      kind,
      uri: uri.replace(/\\/g, "/"),
      ...(typeof rec.fileName === "string" ? { fileName: sanitizeFileName(rec.fileName) } : {}),
      ...(typeof rec.mimeType === "string" ? { mimeType: rec.mimeType } : {}),
      ...(typeof rec.bytes === "number" && Number.isFinite(rec.bytes)
        ? { bytes: Math.floor(rec.bytes) }
        : {}),
    });
  }
  return out;
}

/** Append a readable attachment block so the model can call read_file on paths. */
export function appendMediaToUserText(text: string, media: ChatMediaItem[]): string {
  if (media.length === 0) return text;
  const lines = media.map((m) => {
    const name = m.fileName || basename(m.uri);
    const size =
      typeof m.bytes === "number" && m.bytes > 0
        ? `, ${m.bytes < 1024 ? `${m.bytes} B` : `${Math.round(m.bytes / 1024)} KB`}`
        : "";
    return `- ${name} (${m.kind}${size}) · path \`${m.uri}\``;
  });
  const block = [
    "[Attached files — paths are under the account sandbox `files/`; use read_file to inspect contents]",
    ...lines,
  ].join("\n");
  const body = text.trim();
  return body ? `${body}\n\n${block}` : block;
}
