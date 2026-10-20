// Chat media upload + materialize — Design A.6 `media[]` on home.sendMessage.
// Design §9.5a: Office/PDF → GFM extract sidecar + capped inline for the model.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  DOCUMENT_TEXT_EXTRACTOR_ID,
  extractDocumentText,
  extractSidecarUri,
  isExtractableExtension,
} from "./document-extract.js";
import { safeJoin } from "./fs-jail.js";
import type { HomePaths } from "./home-paths.js";

export const CHAT_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
export const CHAT_MEDIA_MAX_FILES = 8;
export const CHAT_MEDIA_UPLOAD_DIR = "uploads";
/** Max GFM chars inlined into the turn (Design §9.5a). Full extract stays on disk. */
export const CHAT_MEDIA_EXTRACT_INLINE_CHARS = 24_000;

export type ChatMediaKind = "image" | "audio" | "video" | "file";

export interface ChatMediaItem {
  kind: ChatMediaKind;
  uri: string;
  fileName?: string;
  mimeType?: string;
  bytes?: number;
  /** Sandbox-relative GFM sidecar from §9.5a extract. */
  extractUri?: string;
  extractor?: string;
  extractChars?: number;
  /** In-process only — loaded for turn inject; not required on the wire. */
  extractText?: string;
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
 * Extractable Office/PDF/text also get a `*.extract.md` sidecar (§9.5a).
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

  const item: ChatMediaItem = {
    kind,
    uri: rel.replace(/\\/g, "/"),
    fileName,
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    bytes: buf.length,
  };

  const ext = extname(fileName);
  if (kind === "file" && isExtractableExtension(ext)) {
    const gfm = await extractDocumentText(ext, buf);
    if (gfm) {
      const extractUri = extractSidecarUri(item.uri);
      const extractAbs = safeJoin(input.paths.accountFiles(input.accountId), extractUri);
      await writeFile(extractAbs, gfm, "utf8");
      item.extractUri = extractUri;
      item.extractor = DOCUMENT_TEXT_EXTRACTOR_ID;
      item.extractChars = gfm.length;
      item.extractText = gfm;
    }
  }

  return item;
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
    const extractUri =
      typeof rec.extractUri === "string" && rec.extractUri.trim()
        ? rec.extractUri.trim().replace(/\\/g, "/")
        : undefined;
    if (extractUri) {
      if (
        extractUri.includes("..") ||
        extractUri.startsWith("/") ||
        /^[A-Za-z]:[\\/]/.test(extractUri) ||
        !extractUri.startsWith(`${CHAT_MEDIA_UPLOAD_DIR}/`)
      ) {
        throw new ChatMediaError(
          "bad_params",
          "envoyhome.bad_params: media.extractUri must be sandbox-relative under uploads/",
        );
      }
    }
    out.push({
      kind,
      uri: uri.replace(/\\/g, "/"),
      ...(typeof rec.fileName === "string" ? { fileName: sanitizeFileName(rec.fileName) } : {}),
      ...(typeof rec.mimeType === "string" ? { mimeType: rec.mimeType } : {}),
      ...(typeof rec.bytes === "number" && Number.isFinite(rec.bytes)
        ? { bytes: Math.floor(rec.bytes) }
        : {}),
      ...(extractUri ? { extractUri } : {}),
      ...(typeof rec.extractor === "string" ? { extractor: rec.extractor } : {}),
      ...(typeof rec.extractChars === "number" && Number.isFinite(rec.extractChars)
        ? { extractChars: Math.floor(rec.extractChars) }
        : {}),
    });
  }
  return out;
}

/**
 * Load `*.extract.md` sidecars for turn inject (clients may omit extractUri).
 */
export async function enrichMediaExtracts(
  paths: HomePaths,
  accountId: string,
  media: ChatMediaItem[],
): Promise<ChatMediaItem[]> {
  const out: ChatMediaItem[] = [];
  for (const m of media) {
    const next = { ...m };
    const candidate = m.extractUri || extractSidecarUri(m.uri);
    try {
      const abs = safeJoin(paths.accountFiles(accountId), candidate);
      const text = await readFile(abs, "utf8");
      if (text.trim()) {
        next.extractUri = candidate;
        next.extractText = text;
        next.extractor = m.extractor || DOCUMENT_TEXT_EXTRACTOR_ID;
        next.extractChars = text.length;
      }
    } catch {
      /* no sidecar — leave as-is */
    }
    out.push(next);
  }
  return out;
}

/** Append a readable attachment block so the model sees GFM extract (§9.5a). */
export function appendMediaToUserText(text: string, media: ChatMediaItem[]): string {
  if (media.length === 0) return text;
  const lines: string[] = [];
  const extracts: string[] = [];
  for (const m of media) {
    const name = m.fileName || basename(m.uri);
    const size =
      typeof m.bytes === "number" && m.bytes > 0
        ? `, ${m.bytes < 1024 ? `${m.bytes} B` : `${Math.round(m.bytes / 1024)} KB`}`
        : "";
    const extractNote = m.extractUri ? ` · extract \`${m.extractUri}\`` : "";
    lines.push(`- ${name} (${m.kind}${size}) · path \`${m.uri}\`${extractNote}`);
    if (m.extractText && m.extractText.trim()) {
      const full = m.extractText.trim();
      const truncated = full.length > CHAT_MEDIA_EXTRACT_INLINE_CHARS;
      const body = truncated
        ? `${full.slice(0, CHAT_MEDIA_EXTRACT_INLINE_CHARS).trimEnd()}\n\n…[truncated — use read_file on \`${m.extractUri || extractSidecarUri(m.uri)}\` for the remainder]`
        : full;
      extracts.push(`--- extract: ${name} ---\n${body}\n--- end extract ---`);
    } else if (m.kind === "file" && isExtractableExtension(extname(m.fileName || m.uri))) {
      extracts.push(
        `--- extract: ${name} ---\n(extract unavailable — original at \`${m.uri}\`; scanned PDFs need OCR which is not enabled)\n--- end extract ---`,
      );
    }
  }
  const block = [
    "[Attached files — paths are under the account sandbox `files/`; prefer the extract block below for Office/PDF; use read_file for originals or remainder]",
    ...lines,
    ...(extracts.length ? ["", ...extracts] : []),
  ].join("\n");
  const body = text.trim();
  return body ? `${body}\n\n${block}` : block;
}
