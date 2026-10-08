// Digests for LearnQueue baseDigest / diffKey (Memory Design §7.2).
// Canonical form matches Design §4.4 (same as artifact grants).

import { createHash } from "node:crypto";

/** Canonical JSON (Design §4.4) — keys sorted, no insignificant whitespace. */
export function canonicalJson(value: unknown): string {
  return canonicalize(value);
}

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonicalJson: non-finite number");
    if (Number.isInteger(value)) return String(value);
    let s = String(value);
    if (/[eE]/.test(s)) {
      s = value.toFixed(20).replace(/\.?0+$/, "");
    } else {
      s = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    }
    return s;
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(
        `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`,
      );
    }
    return `{${parts.join(",")}}`;
  }
  throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
}

export function sha256Digest(canonical: string): string {
  const hex = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `sha256:${hex}`;
}

/** baseDigest of a standing file at propose time (Memory Design §7.2). */
export function baseDigest(path: string, content: string): string {
  const byteLength = Buffer.byteLength(content, "utf8");
  return sha256Digest(canonicalJson({ path, byteLength, content }));
}

/**
 * diffKey = sha256(kind + "\\0" + normalizedTargetPath + "\\0" + normalizedAddedText)
 * Coalesce iff byte-equal (V-MEM-19).
 */
export function computeDiffKey(
  kind: string,
  normalizedTargetPath: string,
  addedText: string,
): string {
  const normalized = normalizeAddedText(addedText);
  const raw = `${kind}\u0000${normalizedTargetPath}\u0000${normalized}`;
  return sha256Digest(raw);
}

export function normalizeAddedText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:!?…]+$/g, "");
}
