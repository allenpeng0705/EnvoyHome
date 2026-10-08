// Artifact URL HMAC helper — Design §4.1b / §4.4 canonical form.
// Handler (serve / verify on GET) lands in B11; this module is the signer only.

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Canonical JSON per Design §4.4:
 * - object keys sorted by UTF-16 code unit ascending at every level
 * - no insignificant whitespace
 * - `,` and `:` separators with no trailing space
 * - strings JSON-escaped per RFC 8259
 * - numbers as integers or finite decimals without exponent / trailing zeros
 * - `null` for absent optional values; every field always present
 * - arrays in caller-supplied order
 */
export function canonicalJson(value: unknown): string {
  return canonicalize(value);
}

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonicalJson: non-finite number");
    }
    // Integers and decimals without exponent / trailing zeros.
    if (Number.isInteger(value)) return String(value);
    let s = String(value);
    if (/[eE]/.test(s)) {
      // Force non-exponent form for finite decimals the runtime emitted in sci-notation.
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

export interface ArtifactTokenPayload {
  accountId: string;
  expUnix: number;
  path: string;
}

function b64url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

/**
 * Mint an artifact token: `base64url(payload) + "." + base64url(HMAC-SHA256(secret, payload))`
 * where `payload` is the UTF-8 canonical JSON of `{accountId, expUnix, path}` (Design §4.1b).
 */
export function signArtifactToken(
  secret: string | Buffer,
  payload: ArtifactTokenPayload,
): string {
  const body = canonicalJson({
    accountId: payload.accountId,
    expUnix: payload.expUnix,
    path: payload.path,
  });
  const payloadBytes = Buffer.from(body, "utf8");
  const sig = createHmac("sha256", secret).update(payloadBytes).digest();
  return `${b64url(payloadBytes)}.${b64url(sig)}`;
}

export type VerifyArtifactTokenResult =
  | { ok: true; payload: ArtifactTokenPayload }
  | { ok: false; reason: "malformed" | "bad_sig" | "expired" | "bad_payload" };

/**
 * Verify a framed artifact token. Parses the decoded payload as JSON — never
 * re-derives by string-splitting (Design §4.1b).
 */
export function verifyArtifactToken(
  secret: string | Buffer,
  token: string,
  nowUnix: number = Math.floor(Date.now() / 1000),
): VerifyArtifactTokenResult {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: "malformed" };
  const payloadPart = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  let payloadBytes: Buffer;
  let sigBytes: Buffer;
  try {
    payloadBytes = b64urlDecode(payloadPart);
    sigBytes = b64urlDecode(sigPart);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const expected = createHmac("sha256", secret).update(payloadBytes).digest();
  if (expected.length !== sigBytes.length || !timingSafeEqual(expected, sigBytes)) {
    return { ok: false, reason: "bad_sig" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    return { ok: false, reason: "bad_payload" };
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as ArtifactTokenPayload).accountId !== "string" ||
    typeof (parsed as ArtifactTokenPayload).path !== "string" ||
    typeof (parsed as ArtifactTokenPayload).expUnix !== "number"
  ) {
    return { ok: false, reason: "bad_payload" };
  }
  const payload: ArtifactTokenPayload = {
    accountId: (parsed as ArtifactTokenPayload).accountId,
    expUnix: (parsed as ArtifactTokenPayload).expUnix,
    path: (parsed as ArtifactTokenPayload).path,
  };
  if (payload.accountId.length === 0 || payload.path.length === 0) {
    return { ok: false, reason: "bad_payload" };
  }
  if (payload.expUnix < nowUnix) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

/** Default / max TTL (Design §4.1b). */
export const ARTIFACT_DEFAULT_TTL_SEC = 3600;
export const ARTIFACT_MAX_TTL_SEC = 86400;

export function clampArtifactTtl(ttlSec: number | undefined): number {
  if (ttlSec === undefined || !Number.isFinite(ttlSec)) return ARTIFACT_DEFAULT_TTL_SEC;
  return Math.max(1, Math.min(ARTIFACT_MAX_TTL_SEC, Math.floor(ttlSec)));
}
