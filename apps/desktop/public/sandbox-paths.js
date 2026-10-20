/**
 * Sandbox / workspace paths thin clients open via home.getArtifactContent.
 * Design §9.5d — prefer backtick paths (Unicode OK).
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
    const p = String(raw || "")
      .replace(/\\/g, "/")
      .trim();
    if (!p || p.includes("..") || p.includes("\0") || seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };
  const tickRe = /`((?:output|documents|knowledge|uploads|workspace)\/[^`\n]+)`/g;
  let m;
  while ((m = tickRe.exec(src)) !== null) add(m[1]);
  const bareRe =
    /(?<![\w`])((?:output|documents|knowledge|uploads|workspace)\/[A-Za-z0-9_./\-]+\.[A-Za-z0-9]+)(?![\w`])/g;
  while ((m = bareRe.exec(src)) !== null) add(m[1]);
  return out;
}
