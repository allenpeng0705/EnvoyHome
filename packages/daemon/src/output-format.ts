/**
 * Design §9.5 output tiers.
 *
 * Audience split (Normative):
 * - Thin clients (EnvoyHome desktop/mobile over paired `home.*`): may use `link`
 *   + `artifactPath` → open via `home.getArtifactContent` (no public IP needed).
 * - Chat channel plugins (Telegram / Discord / …): `plain` | `markdown` only —
 *   never `link` / never HTTPS to the home daemon (most homes have no public IP).
 */

export type ChatOutputFormat = "plain" | "markdown" | "link";

/** Formats a chat plugin may deliver on outbound. */
export type ChannelOutboundFormat = "plain" | "markdown";

const MD_CUE =
  /```|^\s{0,3}#{1,6}\s|^\s*([-*+]|\d+\.)\s|\[[^\]]+\]\([^)]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`/m;

/**
 * Classify assistant text into an output tier for thin-client deltas / transcript.
 * - `prefer` forces a tier (workflow → plain; long artifact replies → link).
 * - Otherwise: markdown cues or longer multi-line → markdown; short prose → plain.
 */
export function classifyOutputFormat(
  text: string,
  opts?: { prefer?: ChatOutputFormat },
): ChatOutputFormat {
  if (opts?.prefer === "plain" || opts?.prefer === "markdown" || opts?.prefer === "link") {
    return opts.prefer;
  }
  const s = String(text || "").trim();
  if (!s) return "plain";
  if (MD_CUE.test(s)) return "markdown";
  if (s.length <= 240 && !/\n\s*\n/.test(s)) return "plain";
  return "markdown";
}

/**
 * Map a thin-client tier to what a chat channel plugin may send.
 * `link` → `markdown` (full body in the IM message; no artifact HTTPS).
 */
export function formatForChannelOutbound(
  format: ChatOutputFormat | undefined,
): ChannelOutboundFormat {
  if (format === "plain") return "plain";
  return "markdown";
}

/** Thin-client long replies spill to an artifact + `link` bubble (Design §9.5). */
export const THIN_CLIENT_LINK_SPILL_CHARS = 2500;

/**
 * Whether a thin-client (EnvoyHome desktop/mobile) reply should become `link` + artifactPath.
 * Chat channel turns must not spill — they keep the full markdown body in outbound.
 */
export function shouldSpillThinClientLink(text: string): boolean {
  return String(text || "").trim().length >= THIN_CLIENT_LINK_SPILL_CHARS;
}

/** Preview for a `link` bubble — first paragraph / ~480 chars. */
export function summarizeForLinkBubble(text: string, maxChars = 480): string {
  const s = String(text || "").trim();
  if (!s) return "";
  const para = s.split(/\n\s*\n/)[0]?.trim() || s;
  if (para.length <= maxChars) {
    return para.length < s.length ? `${para}\n\n…` : para;
  }
  const cut = para.slice(0, maxChars);
  const at = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("\n"));
  const head = (at > maxChars * 0.5 ? cut.slice(0, at) : cut).trimEnd();
  return `${head}…`;
}
