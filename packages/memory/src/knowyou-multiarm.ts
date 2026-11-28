/**
 * KnowYou multi-arm ranker (KB-P6 / Knowledge-RAG §4.7).
 * Adapt EnvoyMesh context-memory / Nebula *ideas* — Home-owned; do not import Mesh.
 * Peer: ../EnvoyMesh/packages/local-store/src/context-memory-recall.ts
 */

export const KNOWYOU_PIN_IMPORTANCE = 1;
export const KNOWYOU_DEFAULT_IMPORTANCE = 0.6;
export const KNOWYOU_KEYED_IMPORTANCE = 0.7;
/** Soft cap on persisted hebbian edges per account (KB-P6). */
export const KNOWYOU_MAX_HEBBIAN_EDGES = 2048;

const DAY_MS = 86_400_000;

export type KnowYouHebEdge = { a: string; b: string; w: number };

/**
 * Keep only edges whose endpoints are both in `activeIds`, drop self-loops,
 * clamp weights, and soft-cap by highest weight (V-KY-9 / dangling-edge fix).
 */
export function pruneKnowYouHebbianEdges(
  edges: readonly KnowYouHebEdge[] | undefined,
  activeIds: ReadonlySet<string>,
  maxEdges = KNOWYOU_MAX_HEBBIAN_EDGES,
): KnowYouHebEdge[] {
  if (!edges?.length || activeIds.size === 0) return [];
  const seen = new Map<string, KnowYouHebEdge>();
  const keyOf = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const e of edges) {
    const a = String(e.a ?? "");
    const b = String(e.b ?? "");
    if (!a || !b || a === b) continue;
    if (!activeIds.has(a) || !activeIds.has(b)) continue;
    const w = Number(e.w);
    if (!Number.isFinite(w) || w <= 0) continue;
    const k = keyOf(a, b);
    const prev = seen.get(k);
    const clamped = Math.min(1, w);
    if (!prev || clamped > prev.w) seen.set(k, { a, b, w: clamped });
  }
  const out = [...seen.values()].sort((x, y) => y.w - x.w);
  return out.slice(0, Math.max(0, maxEdges));
}

export interface KnowYouLexicon {
  typoMap: Record<string, string>;
  synonymIndex: Map<string, string[]>;
}

const BUILTIN_TYPO: Record<string, string> = {
  prefered: "preferred",
  remeber: "remember",
  allergie: "allergy",
  allergies: "allergy",
};

const BUILTIN_GROUPS: readonly (readonly string[])[] = [
  ["prefer", "preferred", "preference", "likes", "like", "favor", "favourite", "favorite"],
  ["drink", "beverage", "tea", "coffee", "water"],
  ["allergy", "allergic", "allergies"],
  ["quiet", "noise", "hours"],
  ["name", "called", "call"],
  ["timezone", "tz", "time", "zone"],
  ["language", "locale", "lang"],
];

function buildSynonymIndex(groups: readonly (readonly string[])[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const group of groups) {
    const cleaned = group
      .map((t) => String(t ?? "").trim().toLowerCase())
      .filter((t) => t.length >= 2);
    for (const t of cleaned) {
      const others = cleaned.filter((x) => x !== t);
      const prev = map.get(t) ?? [];
      map.set(t, [...new Set([...prev, ...others])]);
    }
  }
  return map;
}

export function createKnowYouLexicon(): KnowYouLexicon {
  return {
    typoMap: { ...BUILTIN_TYPO },
    synonymIndex: buildSynonymIndex(BUILTIN_GROUPS),
  };
}

/** Unicode-aware tokens length ≥ 2 (CJK characters count). */
export function tokenizeKnowYou(text: string): string[] {
  const matches = String(text ?? "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]{2,}/gu);
  return matches ?? [];
}

function normalizeToken(raw: string, lexicon: KnowYouLexicon): string {
  const t = raw.toLowerCase();
  return lexicon.typoMap[t] ?? t;
}

export function expandKnowYouTokens(
  tokens: readonly string[],
  lexicon: KnowYouLexicon = createKnowYouLexicon(),
  maxExtra = 12,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let extra = 0;
  for (const raw of tokens) {
    const t = normalizeToken(raw, lexicon);
    if (t.length < 2 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (extra >= maxExtra) continue;
    const peers = lexicon.synonymIndex.get(t);
    if (!peers) continue;
    for (const p of peers) {
      if (seen.has(p) || extra >= maxExtra) continue;
      seen.add(p);
      out.push(p);
      extra++;
    }
  }
  return out;
}

export function tokenSetKnowYou(
  text: string,
  lexicon: KnowYouLexicon = createKnowYouLexicon(),
): Set<string> {
  return new Set(expandKnowYouTokens(tokenizeKnowYou(text), lexicon));
}

export function jaccardKnowYou(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter++;
  }
  const union = a.size + b.size - inter;
  return union <= 0 ? 0 : inter / union;
}

function buildDocFreq(
  docs: readonly string[],
  lexicon: KnowYouLexicon,
): { df: Map<string, number>; n: number } {
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const t of tokenSetKnowYou(doc, lexicon)) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  return { df, n: docs.length };
}

function idf(term: string, df: Map<string, number>, n: number): number {
  const d = df.get(term) ?? 0;
  return Math.log(1 + n / (1 + d));
}

function tfidfCosine(
  queryTokens: readonly string[],
  docText: string,
  df: Map<string, number>,
  n: number,
  lexicon: KnowYouLexicon,
): number {
  if (queryTokens.length === 0 || n <= 0) return 0;
  const docTokens = expandKnowYouTokens(tokenizeKnowYou(docText), lexicon);
  if (docTokens.length === 0) return 0;

  const qTf = new Map<string, number>();
  for (const t of queryTokens) qTf.set(t, (qTf.get(t) ?? 0) + 1);
  const dTf = new Map<string, number>();
  for (const t of docTokens) dTf.set(t, (dTf.get(t) ?? 0) + 1);

  let dot = 0;
  let qNorm = 0;
  let dNorm = 0;
  for (const [t, tf] of qTf) {
    const w = (tf / queryTokens.length) * idf(t, df, n);
    qNorm += w * w;
    const dtf = dTf.get(t);
    if (dtf) {
      const dw = (dtf / docTokens.length) * idf(t, df, n);
      dot += w * dw;
    }
  }
  for (const [t, tf] of dTf) {
    const w = (tf / docTokens.length) * idf(t, df, n);
    dNorm += w * w;
  }
  if (qNorm <= 0 || dNorm <= 0) return 0;
  return dot / (Math.sqrt(qNorm) * Math.sqrt(dNorm));
}

/** FSRS-lite retention R = exp(-Δt / S). Pin → 1. */
export function knowYouRetention(input: {
  importance: number;
  stability?: number;
  lastAccessAt?: string;
  createdAt: string;
  nowMs?: number;
}): number {
  if (input.importance >= KNOWYOU_PIN_IMPORTANCE) return 1;
  const S = Math.max(0.05, Math.min(3650, Number(input.stability ?? 1) || 1));
  const lastAccess = Date.parse(input.lastAccessAt || "");
  const created = Date.parse(input.createdAt);
  const last = Number.isFinite(lastAccess)
    ? lastAccess
    : Number.isFinite(created)
      ? created
      : NaN;
  if (!Number.isFinite(last)) return 0.2;
  const now = input.nowMs ?? Date.now();
  const ageDays = Math.max(0, (now - last) / DAY_MS);
  return Math.max(0, Math.min(1, Math.exp(-ageDays / S)));
}

export function nextKnowYouStability(input: {
  stability?: number;
  retention: number;
  firstTouch?: boolean;
}): number {
  const S = Math.max(0.05, Math.min(3650, Number(input.stability ?? 1) || 1));
  const R = Math.max(0, Math.min(1, input.retention));
  const boost = input.firstTouch ? Math.max(1.15, 1 + 1.5 * (1 - R)) : 1 + 1.5 * (1 - R);
  return Math.max(0.05, Math.min(3650, S * boost));
}

export type KnowYouAdjacency = Map<string, Map<string, number>>;

function ensureAdj(adj: KnowYouAdjacency, id: string): Map<string, number> {
  let m = adj.get(id);
  if (!m) {
    m = new Map();
    adj.set(id, m);
  }
  return m;
}

export function capKnowYouDegree(adj: KnowYouAdjacency, maxDeg: number): KnowYouAdjacency {
  const capped: KnowYouAdjacency = new Map();
  for (const [id, neighbors] of adj) {
    if (neighbors.size <= maxDeg) {
      capped.set(id, new Map(neighbors));
      continue;
    }
    const top = [...neighbors.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, maxDeg);
    capped.set(id, new Map(top));
  }
  for (const [a, neighbors] of capped) {
    for (const [b] of [...neighbors]) {
      const back = capped.get(b)?.get(a);
      if (back == null) neighbors.delete(b);
    }
  }
  return capped;
}

export function buildSemanticKnowYouAdjacency(
  facts: readonly { id: string; text: string }[],
  lexicon: KnowYouLexicon,
  opts?: { minWeight?: number; maxDegree?: number },
): KnowYouAdjacency {
  const minW = opts?.minWeight ?? 0.18;
  const maxDeg = opts?.maxDegree ?? 16;
  const tokenSets = facts.map((f) => ({
    id: f.id,
    tokens: tokenSetKnowYou(f.text, lexicon),
  }));
  const adj: KnowYouAdjacency = new Map();
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const a = tokenSets[i]!;
      const b = tokenSets[j]!;
      const w = jaccardKnowYou(a.tokens, b.tokens);
      if (w < minW) continue;
      ensureAdj(adj, a.id).set(b.id, w);
      ensureAdj(adj, b.id).set(a.id, w);
    }
  }
  return capKnowYouDegree(adj, maxDeg);
}

/** Structural edges from key co-presence among *active* facts only (no dangling replacesId). */
export function buildStructuralKnowYouEdges(
  facts: readonly { id: string; key?: string; replacesId?: string }[],
): Array<{ a: string; b: string; w: number }> {
  const edges: Array<{ a: string; b: string; w: number }> = [];
  const known = new Set(facts.map((f) => f.id));
  const byKey = new Map<string, string[]>();
  for (const f of facts) {
    const k = (f.key ?? "").trim();
    if (k) {
      const list = byKey.get(k) ?? [];
      list.push(f.id);
      byKey.set(k, list);
    }
    // Only link replacesId when that row is still in the ranked set (active).
    if (f.replacesId && known.has(f.replacesId)) {
      edges.push({ a: f.id, b: f.replacesId, w: 0.55 });
    }
  }
  for (const ids of byKey.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        edges.push({ a: ids[i]!, b: ids[j]!, w: 0.4 });
      }
    }
  }
  return edges;
}

export function mergeKnowYouEdges(
  adj: KnowYouAdjacency,
  edges: readonly { a: string; b: string; w: number }[],
  opts?: { maxDegree?: number },
): KnowYouAdjacency {
  const out: KnowYouAdjacency = new Map();
  for (const [id, neighbors] of adj) {
    out.set(id, new Map(neighbors));
  }
  const bump = (from: string, to: string, w: number) => {
    if (!(w > 0) || from === to) return;
    const m = ensureAdj(out, from);
    m.set(to, Math.max(m.get(to) ?? 0, Math.min(1, w)));
  };
  for (const e of edges) {
    const w = Number(e.w);
    if (!Number.isFinite(w) || w <= 0) continue;
    bump(e.a, e.b, w);
    bump(e.b, e.a, w);
  }
  return capKnowYouDegree(out, opts?.maxDegree ?? 16);
}

export function diffuseKnowYouGraph(
  seeds: Map<string, number>,
  adj: KnowYouAdjacency,
  opts?: { hops?: number; gamma?: number },
): Map<string, number> {
  const hops = Math.max(1, Math.min(2, opts?.hops ?? 2));
  const gamma = opts?.gamma ?? 0.55;
  const out = new Map<string, number>();
  let frontier = new Map<string, number>();
  for (const [id, s] of seeds) {
    const score = Math.max(0, Math.min(1, s));
    if (score <= 0) continue;
    out.set(id, score);
    frontier.set(id, score);
  }
  for (let hop = 1; hop <= hops; hop++) {
    if (frontier.size === 0) break;
    const next = new Map<string, number>();
    for (const [fromId, act] of frontier) {
      const neighbors = adj.get(fromId);
      if (!neighbors) continue;
      for (const [toId, w] of neighbors) {
        if (!(w > 0.001)) continue;
        const cand = act * w * Math.pow(gamma, hop);
        if (!(cand > 0)) continue;
        const prev = next.get(toId) ?? 0;
        if (cand > prev) next.set(toId, cand);
      }
    }
    for (const [id, act] of next) {
      const prev = out.get(id) ?? 0;
      if (act > prev) out.set(id, act);
    }
    frontier = next;
  }
  return out;
}

function normalizeScores(raw: Map<string, number>): Map<string, number> {
  let max = 0;
  for (const v of raw.values()) {
    if (v > max) max = v;
  }
  const out = new Map<string, number>();
  if (max <= 0) return out;
  for (const [k, v] of raw) out.set(k, v / max);
  return out;
}

export interface RankableKnowYouFact {
  id: string;
  text: string;
  key?: string;
  replacesId?: string;
  importance: number;
  stability?: number;
  lastAccessAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RankedKnowYouHit {
  id: string;
  score: number;
  lexical: number;
  activation: number;
  graph: number;
}

/** Hebbian bump for co-activated pair (η=0.02, saturating). */
export function nextKnowYouHebbianWeight(prev: number, strength = 1): number {
  const w = Math.max(0, Math.min(1, prev));
  const eta = 0.02;
  const a = Math.max(0, Math.min(1, strength));
  return Math.max(0, Math.min(1, w + eta * a * a * (1 - w)));
}

/**
 * Multi-arm recall: 0.5 lexical + 0.3 FSRS activation + 0.2 graph.
 * Does not mutate facts (touch is caller's job). Never returns unbounded inject-all.
 */
export function rankKnowYouFacts(input: {
  query: string;
  facts: readonly RankableKnowYouFact[];
  lexicon?: KnowYouLexicon;
  hebbianEdges?: readonly { a: string; b: string; w: number }[];
  nowMs?: number;
  limit?: number;
}): RankedKnowYouHit[] {
  const lexicon = input.lexicon ?? createKnowYouLexicon();
  const facts = input.facts;
  const limit = Math.max(1, Math.min(64, input.limit ?? 8));
  const nowMs = input.nowMs ?? Date.now();
  if (facts.length === 0) return [];

  const q = String(input.query ?? "").trim();
  if (!q) return [];

  const qTokens = expandKnowYouTokens(tokenizeKnowYou(q), lexicon);
  const qSet = new Set(qTokens);
  const { df, n } = buildDocFreq(
    facts.map((f) => f.text),
    lexicon,
  );

  const lexRaw = new Map<string, number>();
  const actRaw = new Map<string, number>();
  for (const fact of facts) {
    const jac = jaccardKnowYou(qSet, tokenSetKnowYou(fact.text, lexicon));
    const tfidf = tfidfCosine(qTokens, fact.text, df, n, lexicon);
    const lexical = 0.65 * tfidf + 0.35 * jac;
    if (lexical > 0.02) lexRaw.set(fact.id, lexical);

    const R = knowYouRetention({
      importance: fact.importance,
      createdAt: fact.createdAt,
      nowMs,
      ...(fact.stability != null ? { stability: fact.stability } : {}),
      ...(fact.lastAccessAt ? { lastAccessAt: fact.lastAccessAt } : {}),
    });
    if (lexical > 0.01) {
      actRaw.set(fact.id, fact.importance * R);
    }
  }

  const lexNorm = normalizeScores(lexRaw);
  const actNorm = normalizeScores(actRaw);

  const seedEntries = [...lexNorm.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const seeds = new Map(seedEntries);
  let adj = buildSemanticKnowYouAdjacency(
    facts.map((f) => ({ id: f.id, text: f.text })),
    lexicon,
  );
  const structural = buildStructuralKnowYouEdges(facts);
  const knownIds = new Set(facts.map((f) => f.id));
  // Never diffuse through inactive / dangling hebbian endpoints.
  const hebbian = pruneKnowYouHebbianEdges(input.hebbianEdges, knownIds);
  const mergedEdges = [...structural, ...hebbian];
  if (mergedEdges.length) {
    adj = mergeKnowYouEdges(adj, mergedEdges, { maxDegree: 16 });
  }
  const graphNorm = normalizeScores(diffuseKnowYouGraph(seeds, adj, { hops: 2, gamma: 0.55 }));

  const ids = new Set<string>([...lexNorm.keys(), ...actNorm.keys(), ...graphNorm.keys()]);
  const hits: RankedKnowYouHit[] = [];
  for (const id of ids) {
    if (!knownIds.has(id)) continue;
    const lexical = lexNorm.get(id) ?? 0;
    const activation = actNorm.get(id) ?? 0;
    const graph = graphNorm.get(id) ?? 0;
    if (lexical <= 0 && activation <= 0 && graph <= 0) continue;
    const score = 0.5 * lexical + 0.3 * activation + 0.2 * graph;
    if (score <= 0.015) continue;
    hits.push({ id, score, lexical, activation, graph });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
