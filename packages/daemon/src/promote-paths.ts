/**
 * Shared predicate: which jail Markdown paths may offer Promote → knowledge/
 * (Design §9.5j). Keep thin-client chips / viewers aligned with this list.
 */

/** Sandbox-relative path using `/` separators. */
export function canPromoteKnowledgePath(path: string): boolean {
  const p = path.replace(/\\/g, "/").replace(/^\.\/+/, "").trim();
  if (!p || p.includes("..") || p.startsWith("/")) return false;
  if (!/\.(md|markdown)$/i.test(p)) return false;
  return (
    p.startsWith("output/extracts/") ||
    p.startsWith("uploads/") ||
    p.startsWith("documents/") ||
    p.startsWith("output/exports/") ||
    /\.extract\.md$/i.test(p)
  );
}
