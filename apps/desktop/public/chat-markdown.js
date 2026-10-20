/**
 * Safe markdown for Chat bubbles (Design §9.5).
 * marked → HTML, DOMPurify → allow-list only.
 */
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

marked.setOptions({
  gfm: true,
  breaks: true,
});

const PURIFY = {
  USE_PROFILES: { html: true },
  ALLOWED_TAGS: [
    "a",
    "b",
    "blockquote",
    "br",
    "code",
    "del",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "hr",
    "i",
    "li",
    "ol",
    "p",
    "pre",
    "strong",
    "ul",
    "span",
  ],
  ALLOWED_ATTR: ["href", "title", "class", "target", "rel"],
  ALLOW_DATA_ATTR: false,
};

/**
 * Design §7.4 — turn schedule propose/confirm/list JSON into a plain line (no raw dump).
 * @param {unknown} j
 * @returns {string | undefined}
 */
export function formatScheduleToolJson(j) {
  if (!j || typeof j !== "object" || Array.isArray(j)) return undefined;
  /** @type {Record<string, unknown>} */
  const o = /** @type {Record<string, unknown>} */ (j);
  if (typeof o.resolvedLocal === "string" && o.resolvedLocal.trim()) {
    const msg =
      typeof o.message === "string" && o.message.trim()
        ? ` — ${o.message.trim().slice(0, 80)}`
        : "";
    return `Proposed for ${o.resolvedLocal.trim()}${msg} — not armed yet. Confirm after you agree.`;
  }
  if (o.armed === true) {
    const job =
      o.job && typeof o.job === "object" && !Array.isArray(o.job)
        ? /** @type {Record<string, unknown>} */ (o.job)
        : undefined;
    const next =
      typeof job?.nextRunAt === "string" && job.nextRunAt ? ` · next ${job.nextRunAt}` : "";
    return `Schedule armed${next}.`;
  }
  if (Array.isArray(o.jobs)) {
    return `${o.jobs.length} schedule${o.jobs.length === 1 ? "" : "s"} listed.`;
  }
  return undefined;
}

/**
 * Replace whole-message or fenced schedule JSON with a human line (Design 2026-10-19j).
 * @param {string} text
 * @returns {string}
 */
export function humanizeScheduleChatText(text) {
  const raw = String(text || "");
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  try {
    const line = formatScheduleToolJson(JSON.parse(trimmed));
    if (line) return line;
  } catch {
    /* not a bare JSON message */
  }
  return raw.replace(/```(?:json)?\s*([\s\S]*?)```/gi, (full, body) => {
    try {
      const line = formatScheduleToolJson(JSON.parse(String(body).trim()));
      return line || full;
    } catch {
      return full;
    }
  });
}

/**
 * @param {string} md
 * @returns {string} sanitized HTML
 */
export function renderChatMarkdown(md) {
  const raw = humanizeScheduleChatText(String(md || ""));
  if (!raw.trim()) return "";
  const html = marked.parse(raw, { async: false });
  const clean = DOMPurify.sanitize(typeof html === "string" ? html : String(html), PURIFY);
  // Force external links to open safely.
  return clean.replace(
    /<a\s+([^>]*href=)/gi,
    '<a target="_blank" rel="noopener noreferrer" $1',
  );
}

const MD_CUE =
  /```|^\s{0,3}#{1,6}\s|^\s*([-*+]|\d+\.)\s|\[[^\]]+\]\([^)]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`/m;

/**
 * Client-side mirror of daemon classifyOutputFormat (legacy rows without format).
 * @param {string} text
 * @returns {"plain"|"markdown"|"link"}
 */
export function classifyChatFormat(text) {
  const s = String(text || "").trim();
  if (!s) return "plain";
  if (MD_CUE.test(s)) return "markdown";
  if (s.length <= 240 && !/\n\s*\n/.test(s)) return "plain";
  return "markdown";
}
