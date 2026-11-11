/**
 * Sandbox / workspace paths thin clients open via home.getArtifactContent.
 * Design §9.5d — prefer backtick paths (Unicode OK).
 */

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeArtifactPath(raw) {
  let p = String(raw || "")
    .replace(/\\/g, "/")
    .trim();
  while (p.startsWith("./")) p = p.slice(2);
  while (p.startsWith("/")) p = p.slice(1);
  p = p.replace(/\/{2,}/g, "/");
  return p;
}

/**
 * @param {string} p
 * @returns {boolean}
 */
function isSafeArtifactPath(p) {
  if (!p || p.includes("..") || p.includes("\0")) return false;
  return /^(?:output|documents|knowledge|uploads|workspace)\//.test(p);
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function extractSandboxFilePaths(text) {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  const src = String(text || "");
  /** @param {string} raw */
  const add = (raw) => {
    const p = normalizeArtifactPath(raw);
    if (!isSafeArtifactPath(p) || seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };
  const tickRe = /`((?:\.\/)*(?:output|documents|knowledge|uploads|workspace)\/[^`\n]+)`/g;
  let m;
  while ((m = tickRe.exec(src)) !== null) add(m[1]);
  const bareRe =
    /(?<![\w`])((?:\.\/)*(?:output|documents|knowledge|uploads|workspace)\/[A-Za-z0-9_./\-]+\.[A-Za-z0-9]+)(?![\w`])/g;
  while ((m = bareRe.exec(src)) !== null) add(m[1]);
  return out;
}

/**
 * Parse a markdown href into a jail path for home.getArtifactContent.
 * Rejects http(s) / mailto / tel and traversal.
 * @param {string|null|undefined} href
 * @returns {string|null}
 */
export function parseSandboxArtifactHref(href) {
  if (href == null) return null;
  let raw = String(href).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:")
  ) {
    return null;
  }
  const schemes = ["envoyhome://artifact/", "artifact://"];
  for (const s of schemes) {
    if (lower.startsWith(s)) {
      raw = raw.slice(s.length);
      break;
    }
  }
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  const p = normalizeArtifactPath(raw);
  return isSafeArtifactPath(p) ? p : null;
}
