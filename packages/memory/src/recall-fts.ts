// L2+L3 recall — Memory Design §4.5, V-MEM-13.
//
// Pure-JS trigram index (no native deps). Production may later swap to
// better-sqlite3 FTS5 tokenize='trigram'; Hit shape stays stable.
// Short CJK runs (<3 chars) fall back to substring scan with engine: "scan".

export type RecallEngine = "fts" | "scan";

export interface RecallHit {
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  score: number;
  engine: RecallEngine;
}

export interface CorpusDoc {
  /** Account-relative path, e.g. `MEMORY.md` or `memory/2026-10-08.md` */
  path: string;
  content: string;
}

const CJK_RUN = /[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]+/gu;

/** True when any CJK run in the query is shorter than 3 characters. */
export function needsShortCjkScan(query: string): boolean {
  for (const m of query.matchAll(CJK_RUN)) {
    if (m[0]!.length < 3) return true;
  }
  return false;
}

/**
 * Build an in-memory trigram index over L2+L3 docs and search.
 * Excludes any path under `memory/compact/` (caller should already filter).
 */
export function recallOverCorpus(
  docs: CorpusDoc[],
  query: string,
  opts: { limit?: number; paths?: string[] } = {},
): RecallHit[] {
  const limit = opts.limit ?? 8;
  const q = query.trim();
  if (!q || docs.length === 0) return [];

  let corpus = docs.filter((d) => !isCompactPath(d.path));
  if (opts.paths && opts.paths.length > 0) {
    const allow = new Set(opts.paths.map(normalizeRel));
    corpus = corpus.filter((d) => allow.has(normalizeRel(d.path)));
  }
  if (corpus.length === 0) return [];

  const ftsHits = searchTrigram(corpus, q);
  const useScan = needsShortCjkScan(q);
  const scanHits = useScan ? searchScan(corpus, q) : [];

  return mergeHits(ftsHits, scanHits, limit);
}

function isCompactPath(p: string): boolean {
  const n = p.replace(/\\/g, "/");
  return (
    n.includes("memory/compact/") ||
    n.startsWith("memory/compact") ||
    /(^|\/)compact\//.test(n)
  );
}

function normalizeRel(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** L3 daily filenames only (`YYYY-MM-DD.md`); excludes compact diaries. */
export function isDailyNoteFilename(name: string): boolean {
  const base =
    name.includes("/") || name.includes("\\")
      ? name.replace(/\\/g, "/").split("/").pop()!
      : name;
  return /^\d{4}-\d{2}-\d{2}\.md$/.test(base);
}

function trigrams(text: string): Set<string> {
  const s = text.toLowerCase();
  const out = new Set<string>();
  if (s.length < 3) {
    if (s.length > 0) out.add(s);
    return out;
  }
  for (let i = 0; i <= s.length - 3; i++) out.add(s.slice(i, i + 3));
  return out;
}

function searchTrigram(docs: CorpusDoc[], query: string): RecallHit[] {
  const qGrams = trigrams(query);
  if (qGrams.size === 0) return [];
  const hits: RecallHit[] = [];
  for (const doc of docs) {
    const bodyGrams = trigrams(doc.content);
    let overlap = 0;
    for (const g of qGrams) {
      if (bodyGrams.has(g)) overlap++;
    }
    if (overlap === 0) continue;
    const score = overlap / qGrams.size;
    if (score < 0.2 && !doc.content.toLowerCase().includes(query.toLowerCase())) continue;
    const loc = locateSnippet(doc.content, query);
    hits.push({
      path: doc.path,
      startLine: loc.startLine,
      endLine: loc.endLine,
      snippet: loc.snippet,
      score,
      engine: "fts",
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits;
}

function searchScan(docs: CorpusDoc[], query: string): RecallHit[] {
  const terms = expandScanTerms(query);
  const hits: RecallHit[] = [];
  for (const doc of docs) {
    const lower = doc.content.toLowerCase();
    let overlap = 0;
    for (const t of terms) {
      if (t && lower.includes(t.toLowerCase())) overlap++;
    }
    const cjkRuns = [...query.matchAll(CJK_RUN)].map((m) => m[0]!);
    const matched =
      lower.includes(query.toLowerCase()) ||
      cjkRuns.some((r) => doc.content.includes(r)) ||
      overlap > 0;
    if (!matched) continue;

    const needle = cjkRuns.find((r) => doc.content.includes(r)) ?? query;
    const loc = locateSnippet(doc.content, needle);
    hits.push({
      path: doc.path,
      startLine: loc.startLine,
      endLine: loc.endLine,
      snippet: loc.snippet,
      score: overlap + (cjkRuns.some((r) => doc.content.includes(r)) ? 2 : 0),
      engine: "scan",
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits;
}

function expandScanTerms(query: string): string[] {
  const terms = new Set<string>();
  terms.add(query);
  for (const part of query.split(/\s+/)) {
    if (part) terms.add(part);
  }
  for (const m of query.matchAll(CJK_RUN)) {
    terms.add(m[0]!);
  }
  return [...terms];
}

/**
 * Merge FTS then scan by (engineRank, score) — Memory Design §4.5.
 * Dedupes by path+startLine preferring FTS.
 */
function mergeHits(fts: RecallHit[], scan: RecallHit[], limit: number): RecallHit[] {
  const engineRank = (e: RecallEngine) => (e === "fts" ? 0 : 1);
  const key = (h: RecallHit) => `${h.path}:${h.startLine}`;
  const seen = new Set<string>();
  const merged = [...fts, ...scan].sort((a, b) => {
    const er = engineRank(a.engine) - engineRank(b.engine);
    if (er !== 0) return er;
    return b.score - a.score;
  });
  const out: RecallHit[] = [];
  for (const h of merged) {
    const k = key(h);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}

function locateSnippet(
  body: string,
  needle: string,
): { startLine: number; endLine: number; snippet: string } {
  const lines = body.split(/\r?\n/);
  const lowerNeedle = needle.toLowerCase();
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.toLowerCase().includes(lowerNeedle) || lines[i]!.includes(needle)) {
      idx = i;
      break;
    }
  }
  const start = Math.max(0, idx - 1);
  const end = Math.min(lines.length - 1, idx + 1);
  return {
    startLine: start + 1,
    endLine: end + 1,
    snippet: lines.slice(start, end + 1).join("\n").slice(0, 400),
  };
}

/** Bound a caller-supplied paths filter to the L2+L3 corpus (no traversal). */
export function filterRecallPaths(
  accountRoot: string,
  paths: string[] | undefined,
): string[] | undefined {
  if (!paths || paths.length === 0) return undefined;
  const out: string[] = [];
  for (const p of paths) {
    const n = p.replace(/\\/g, "/").replace(/^\.\//, "");
    if (n.includes("..") || n.startsWith("/") || n.includes("\0")) continue;
    if (/^[A-Za-z]:/.test(n)) continue;
    if (isCompactPath(n)) continue;
    // Only standing corpus relatives: MEMORY.md or memory/*.md
    if (n !== "MEMORY.md" && !n.startsWith("memory/")) continue;
    out.push(n);
  }
  void accountRoot;
  return out;
}
