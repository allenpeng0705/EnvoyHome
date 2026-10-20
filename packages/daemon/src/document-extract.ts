/**
 * Chat / sandbox document → GFM extract (Design §9.5a / §9.5c).
 * Adapt EnvoyMesh Phase 57: `@firecrawl/anydoc` primary; plain text UTF-8.
 * Peer: `../EnvoyMesh/packages/vault/src/document-text-extract.ts`.
 */

import { randomBytes } from "node:crypto";
import { basename, extname } from "node:path";

/** Max source bytes for `extract_document` (§9.5c) — same order as chat attach. */
export const DOCUMENT_EXTRACT_MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/** Sandbox-relative directory for tool extracts (under account files/). */
export const EXTRACT_DOCUMENT_DIR = "output/extracts";

/** Bump when extract behavior should invalidate cached sidecars / prompts. */
export const DOCUMENT_TEXT_EXTRACTOR_ID = "anydoc-v1";

/**
 * Full `@firecrawl/anydoc` @0.1.9 surface (README “Supported formats”).
 * Container variants (.docm, .ppsx, …) map onto the package’s Format enum.
 */
export const ANYDOC_EXTENSIONS = [
  // Word
  ".doc",
  ".docx",
  ".docm",
  // PowerPoint
  ".ppt",
  ".pps",
  ".pot",
  ".pptx",
  ".pptm",
  ".ppsx",
  ".ppsm",
  // Excel
  ".xls",
  ".xlsx",
  ".xlsm",
  ".xlsb",
  // OpenDocument
  ".odt",
  ".ods",
  ".odp",
  // Other anydoc formats
  ".rtf",
  ".epub",
  ".csv",
  ".pdf",
] as const;

/**
 * Already text — read as UTF-8 when not routed through anydoc.
 * `.csv` is also in {@link ANYDOC_EXTENSIONS}: anydoc preferred (table GFM), UTF-8 fallback.
 */
export const NATIVE_TEXT_EXTENSIONS = [".md", ".markdown", ".txt", ".csv", ".json", ".log"] as const;

export type AnydocExtension = (typeof ANYDOC_EXTENSIONS)[number];
export type NativeTextExtension = (typeof NATIVE_TEXT_EXTENSIONS)[number];

let anydocLoadFailedLogged = false;
let anydocConvertFallbackLogged = false;

export function normalizeExtension(extension: string): string {
  const e = extension.startsWith(".")
    ? extension.toLowerCase()
    : extname(extension).toLowerCase() || `.${extension.toLowerCase()}`;
  return e.startsWith(".") ? e : `.${e}`;
}

export function isAnydocExtension(extension: string): boolean {
  const e = normalizeExtension(extension);
  return (ANYDOC_EXTENSIONS as readonly string[]).includes(e);
}

export function isNativeTextExtension(extension: string): boolean {
  const e = normalizeExtension(extension);
  return (NATIVE_TEXT_EXTENSIONS as readonly string[]).includes(e);
}

export function isExtractableExtension(extension: string): boolean {
  return isAnydocExtension(extension) || isNativeTextExtension(extension);
}

/**
 * Convert document bytes to GFM (or plain text for native text types).
 * Returns null when the type is unsupported or conversion fails.
 */
export async function extractDocumentText(
  extension: string,
  raw: Buffer,
): Promise<string | null> {
  const ext = normalizeExtension(extension);
  // Anydoc first for every format it claims (including CSV → table GFM).
  if (isAnydocExtension(ext)) {
    const gfm = await tryAnydocExtract(ext, raw);
    if (gfm) return gfm;
  }
  // Native UTF-8 for markdown/plain text, and CSV fallback if anydoc fails.
  if (isNativeTextExtension(ext)) {
    return normalizeGfmMarkdown(raw.toString("utf8"));
  }
  return null;
}

async function tryAnydocExtract(ext: string, raw: Buffer): Promise<string | null> {
  let toMarkdownBytes: typeof import("@firecrawl/anydoc").toMarkdownBytes;
  let formatFromExtension: typeof import("@firecrawl/anydoc").formatFromExtension;
  try {
    const anydoc = await import("@firecrawl/anydoc");
    toMarkdownBytes = anydoc.toMarkdownBytes;
    formatFromExtension = anydoc.formatFromExtension;
  } catch (error) {
    if (!anydocLoadFailedLogged) {
      anydocLoadFailedLogged = true;
      console.warn(
        "[envoyhome] @firecrawl/anydoc failed to load; office/PDF extract unavailable",
        error,
      );
    }
    return null;
  }

  try {
    const format = formatFromExtension(ext);
    const markdown = await toMarkdownBytes(raw, format);
    return normalizeGfmMarkdown(markdown);
  } catch (error) {
    if (!anydocConvertFallbackLogged) {
      anydocConvertFallbackLogged = true;
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code ?? "error")
          : "error";
      console.warn(`[envoyhome] anydoc convert failed (${code}); extract unavailable for this file`);
    }
    return null;
  }
}

/** Preserve GFM structure; trim and collapse excessive blank lines. */
export function normalizeGfmMarkdown(text: string | undefined): string | null {
  const normalized = text
    ?.replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized ? normalized : null;
}

/** Sidecar path next to the original upload uri. */
export function extractSidecarUri(originalUri: string): string {
  return `${originalUri.replace(/\\/g, "/")}.extract.md`;
}

/** Default output path for the `extract_document` tool. */
export function defaultExtractUri(sourcePath: string): string {
  const base = basename(sourcePath.replace(/\\/g, "/"));
  const stem =
    base
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "extract";
  const id = randomBytes(3).toString("hex");
  return `${EXTRACT_DOCUMENT_DIR}/${stem}-${id}.md`;
}

/** Refuse paths outside output/extracts/. */
export function assertExtractOutputPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (
    !normalized.startsWith(`${EXTRACT_DOCUMENT_DIR}/`) ||
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(normalized) ||
    !normalized.toLowerCase().endsWith(".md")
  ) {
    throw new Error(
      `envoyhome.bad_params: extract path must be a .md under ${EXTRACT_DOCUMENT_DIR}/`,
    );
  }
  return normalized;
}
