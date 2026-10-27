// KnowYou L4′ episodic engine — Knowledge-RAG Design §4.
// ADD | SUPERSEDE | SKIP; summarize + TTL; pure-JS JSON persistence.

import { createHash } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "./atomic-write.js";
import { recallOverCorpus } from "./recall-fts.js";
import { withAccountLock } from "./writer-lock.js";

/** Soft cap on active KnowYou rows per account (Knowledge-RAG §7 Caps). */
export const DEFAULT_KNOWYOU_ACTIVE_CAP = 5000;

export type KnowYouAction = "ADD" | "SUPERSEDE" | "SKIP";

export interface EpisodicRow {
  id: string;
  /** Stable key e.g. pref.drink — empty for unkeyed chunks. */
  key: string;
  text: string;
  status: "active" | "superseded";
  replacesId?: string;
  isSummary?: boolean;
  covers?: string[];
  sourceTurnIds?: string[];
  sourceSessionId?: string;
  createdAt: string;
  updatedAt: string;
  embedding?: number[];
  contentHash: string;
}

export interface EpisodicHit {
  id: string;
  key: string;
  text: string;
  score: number;
  engine: "fts" | "scan" | "vec" | "hybrid";
  isSummary?: boolean;
}

interface EpisodicMeta {
  version: 1;
  keepOriginalDays: number;
  minAgeDays: number;
  recentPreferDays: number;
  lastSummarizeAt: string | null;
  /** True after embed model/space change until rows are re-embedded (V-EMB-6). */
  embedStale?: boolean;
  embedModelId?: string | null;
}

interface EpisodicFile {
  meta: EpisodicMeta;
  rows: EpisodicRow[];
}

export type IngestCandidate = {
  key?: string;
  text: string;
  sourceTurnId?: string;
  sourceSessionId?: string;
};

function indexDir(accountRoot: string): string {
  return join(accountRoot, "memory-backend", "episodic-index");
}

function indexPath(accountRoot: string): string {
  return join(indexDir(accountRoot), "index.json");
}

function hashText(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 32);
}

function newId(): string {
  return `ep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultMeta(): EpisodicMeta {
  return {
    version: 1,
    keepOriginalDays: 180,
    minAgeDays: 7,
    recentPreferDays: 7,
    lastSummarizeAt: null,
    embedStale: false,
    embedModelId: null,
  };
}

/** Exclusive preference tokens for standing contradiction (V-KB-6 / V-KY-7). */
const DRINK_ALT = ["tea", "coffee", "water", "milk", "juice", "soda", "beer", "wine", "latte"];
const FOOD_ALT = ["pizza", "sushi", "pasta", "salad", "burger", "rice", "noodles", "soup"];
const ALLERGEN_ALT = [
  "peanut",
  "peanuts",
  "tree nut",
  "shellfish",
  "shrimp",
  "dairy",
  "milk",
  "gluten",
  "egg",
  "eggs",
  "soy",
  "wheat",
];

function altSetForKey(key: string): string[] | undefined {
  if (/drink|beverage|coffee|tea/i.test(key)) return DRINK_ALT;
  if (/food|cuisine|meal|eat/i.test(key)) return FOOD_ALT;
  if (/allerg/i.test(key)) return ALLERGEN_ALT;
  return undefined;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTimeToken(raw: string): string {
  const t = raw.toLowerCase().replace(/\s+/g, "");
  const ampm = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(t);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = ampm[2] ?? "00";
    const ap = ampm[3];
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  const hm = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (hm) return `${hm[1]!.padStart(2, "0")}:${hm[2]}`;
  return t;
}

/**
 * True when text asserts an exclusive alternate of standing (or negates it).
 * Do NOT short-circuit on mere co-mention of the standing token — "I prefer
 * coffee not tea" and "tea for owners, coffee for guests" must still conflict
 * (V-KY-7 / V-KB-6).
 */
export function textContradictsStandingValue(
  text: string,
  standing: string,
  keyHint?: string,
): boolean {
  const t = text.toLowerCase();
  const stand = standing.toLowerCase().trim();
  if (!stand || stand.length < 2) return false;

  // Explicit negation of the standing value (check before any "includes(stand)" gate)
  if (
    new RegExp(
      `\\b(?:not|no longer|don't|doesn’t|does not|never)\\s+(?:like |prefer |use |want )?${escapeRe(stand)}\\b`,
      "i",
    ).test(text)
  ) {
    return true;
  }
  // Trailing "… not <standing>" / "… instead of <standing>"
  if (
    new RegExp(
      `\\b(?:not|instead of|rather than)\\s+${escapeRe(stand)}\\b`,
      "i",
    ).test(text)
  ) {
    return true;
  }

  // Allergy: "not allergic to <standing>" or exclusive other allergen
  if (/allerg/i.test(keyHint ?? "") || /allerg/i.test(text)) {
    if (
      new RegExp(
        `\\b(?:not allergic to|no allergy to|not allergic)\\s+${escapeRe(stand)}\\b`,
        "i",
      ).test(text)
    ) {
      return true;
    }
    for (const a of ALLERGEN_ALT) {
      if (stand.includes(a)) continue;
      // Other allergen asserted ⇒ conflict (even if standing allergen is also named).
      if (new RegExp(`\\ballerg(?:y|ic)(?:\\s+to)?\\s+${escapeRe(a)}\\b`, "i").test(t)) {
        return true;
      }
    }
  }

  // Quiet hours / bedtime: different clock times in the same snippet family
  if (
    /quiet|hours|bedtime|curfew|sleep/i.test(keyHint ?? "") ||
    /quiet\s*hours|bedtime|curfew/i.test(text)
  ) {
    const timeRe = /\b(\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm))\b/gi;
    const standTimes = [...stand.matchAll(/\b(\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm))\b/gi)].map((m) =>
      normalizeTimeToken(m[0]!),
    );
    const textTimes = [...t.matchAll(timeRe)].map((m) => normalizeTimeToken(m[0]!));
    if (
      standTimes.length > 0 &&
      textTimes.some((tt) => tt.length > 0 && !standTimes.includes(tt))
    ) {
      return true;
    }
  }

  const alts =
    (keyHint ? altSetForKey(keyHint) : undefined) ??
    (DRINK_ALT.some((a) => stand.includes(a))
      ? DRINK_ALT
      : FOOD_ALT.some((a) => stand.includes(a))
        ? FOOD_ALT
        : ALLERGEN_ALT.some((a) => stand.includes(a))
          ? ALLERGEN_ALT
          : undefined);
  if (!alts) return false;
  const standTok = alts.find((a) => stand === a || stand.includes(a));
  for (const a of alts) {
    if (standTok && a === standTok) continue;
    if (stand.includes(a)) continue;
    // Exclusive alt present ⇒ conflict even if standing token also appears.
    if (new RegExp(`\\b${escapeRe(a)}\\b`, "i").test(t)) return true;
  }
  return false;
}

/** Normalize a preference phrase into a short L1 fact value for PendingLearn. */
export function extractStandingPatchValue(text: string, _profileKey?: string): string {
  const raw = text.trim();
  const m =
    /(?:i\s+(?:prefer|like|love|hate|always|never)|my\s+(?:favorite|favourite))\s+(.+)/i.exec(
      raw,
    );
  let v = (m?.[1] ?? raw).trim();
  v = v
    .replace(/\s+in the (?:morning|evening|afternoon).*$/i, "")
    .replace(/\s+at night.*$/i, "")
    .replace(/[.!?].*$/, "")
    .trim();
  // Prefer a known alt token if present
  const lower = v.toLowerCase();
  for (const a of [...DRINK_ALT, ...FOOD_ALT]) {
    if (new RegExp(`\\b${a}\\b`, "i").test(lower)) return a;
  }
  // First 1–3 words, capped
  const words = v.split(/\s+/).slice(0, 3).join(" ");
  return words.slice(0, 80) || raw.slice(0, 80);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class EpisodicIndex {
  constructor(private readonly accountRoot: (accountId: string) => string) {}

  async ensure(accountId: string): Promise<void> {
    await mkdir(indexDir(this.accountRoot(accountId)), { recursive: true });
  }

  async deleteIndex(accountId: string): Promise<void> {
    await rm(indexDir(this.accountRoot(accountId)), { recursive: true, force: true });
  }

  async purgeSession(accountId: string, sessionId: string): Promise<number> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
      const data = await this.load(accountId);
      const before = data.rows.length;
      data.rows = data.rows.filter((r) => r.sourceSessionId !== sessionId);
      await this.save(accountId, data);
      return before - data.rows.length;
    });
  }

  /**
   * Ingest candidates with ADD | SUPERSEDE | SKIP.
   * When allowWrites is false (untrusted), returns all SKIP.
   */
  async ingest(
    accountId: string,
    candidates: IngestCandidate[],
    opts?: {
      allowWrites?: boolean;
      queryEmbeddingFor?: (text: string) => Promise<number[] | undefined>;
      embedModelId?: string;
      /** Soft active-row cap (default DEFAULT_KNOWYOU_ACTIVE_CAP). */
      activeCap?: number;
    },
  ): Promise<Array<{ action: KnowYouAction; id?: string; key?: string }>> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
    const allow = opts?.allowWrites !== false;
    const data = await this.load(accountId);
    const results: Array<{ action: KnowYouAction; id?: string; key?: string }> = [];
    const now = new Date().toISOString();
    const pendingEmbed: EpisodicRow[] = [];
    const activeCap = opts?.activeCap ?? DEFAULT_KNOWYOU_ACTIVE_CAP;

    for (const c of candidates) {
      const text = c.text.trim();
      if (!text || text.length < 3) {
        results.push({ action: "SKIP" });
        continue;
      }
      if (!allow) {
        results.push(c.key !== undefined ? { action: "SKIP", key: c.key } : { action: "SKIP" });
        continue;
      }

      const contentHash = hashText(text);
      // Exact dup
      if (data.rows.some((r) => r.status === "active" && r.contentHash === contentHash)) {
        results.push(c.key !== undefined ? { action: "SKIP", key: c.key } : { action: "SKIP" });
        continue;
      }

      const key = (c.key ?? "").trim();
      if (key) {
        const existing = data.rows.find((r) => r.status === "active" && r.key === key);
        if (existing) {
          // Near-dup text → SKIP
          if (existing.contentHash === contentHash || similarText(existing.text, text)) {
            results.push({ action: "SKIP", id: existing.id, key });
            continue;
          }
          existing.status = "superseded";
          existing.updatedAt = now;
          const id = newId();
          const row: EpisodicRow = {
            id,
            key,
            text,
            status: "active",
            replacesId: existing.id,
            sourceTurnIds: c.sourceTurnId ? [c.sourceTurnId] : [],
            createdAt: now,
            updatedAt: now,
            contentHash,
          };
          if (c.sourceSessionId !== undefined) row.sourceSessionId = c.sourceSessionId;
          data.rows.push(row);
          pendingEmbed.push(row);
          results.push({ action: "SUPERSEDE", id, key });
          continue;
        }
      } else {
        // Unkeyed: paraphrase skip against active chunks
        const near = data.rows.find(
          (r) => r.status === "active" && !r.key && similarText(r.text, text),
        );
        if (near) {
          if (c.sourceTurnId) {
            near.sourceTurnIds = [...new Set([...(near.sourceTurnIds ?? []), c.sourceTurnId])];
            near.updatedAt = now;
          }
          results.push({ action: "SKIP", id: near.id });
          continue;
        }
      }

      const id = newId();
      const row: EpisodicRow = {
        id,
        key,
        text,
        status: "active",
        sourceTurnIds: c.sourceTurnId ? [c.sourceTurnId] : [],
        createdAt: now,
        updatedAt: now,
        contentHash,
      };
      if (c.sourceSessionId !== undefined) row.sourceSessionId = c.sourceSessionId;
      data.rows.push(row);
      pendingEmbed.push(row);
      results.push(key ? { action: "ADD", id, key } : { action: "ADD", id });
    }

    if (opts?.queryEmbeddingFor && pendingEmbed.length > 0) {
      try {
        for (const row of pendingEmbed) {
          const v = await opts.queryEmbeddingFor(row.text);
          if (v && v.length > 0) row.embedding = v;
        }
        if (opts.embedModelId) data.meta.embedModelId = opts.embedModelId;
      } catch {
        /* FTS-only rows OK */
      }
    }

    // Soft cap: drop oldest unkeyed active rows until under cap (keyed SUPERSEDE already net-zero).
    let active = data.rows.filter((r) => r.status === "active");
    if (active.length > activeCap) {
      const unkeyed = active
        .filter((r) => !r.key && !r.isSummary)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      let overflow = active.length - activeCap;
      for (const r of unkeyed) {
        if (overflow <= 0) break;
        r.status = "superseded";
        r.updatedAt = now;
        overflow--;
      }
      active = data.rows.filter((r) => r.status === "active");
      // Still over: SKIP was preferred for new ADDs — drop oldest remaining non-summary
      if (active.length > activeCap) {
        const rest = active
          .filter((r) => !r.isSummary)
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        overflow = active.length - activeCap;
        for (const r of rest) {
          if (overflow <= 0) break;
          r.status = "superseded";
          r.updatedAt = now;
          overflow--;
        }
      }
    }

    await this.save(accountId, data);
    return results;
    });
  }

  async status(accountId: string): Promise<{
    rowCount: number;
    activeCount: number;
    embedStale: boolean;
    lastSummarizeAt: string | null;
  }> {
    const data = await this.load(accountId);
    return {
      rowCount: data.rows.length,
      activeCount: data.rows.filter((r) => r.status === "active").length,
      embedStale: data.meta.embedStale === true,
      lastSummarizeAt: data.meta.lastSummarizeAt,
    };
  }

  async markEmbedStale(accountId: string): Promise<void> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
      const data = await this.load(accountId);
      data.meta.embedStale = true;
      await this.save(accountId, data);
    });
  }

  /**
   * Re-embed active rows missing vectors or after model change (V-EMB-6 backfill).
   */
  async backfillEmbeddings(
    accountId: string,
    embed: (texts: string[]) => Promise<number[][]>,
    opts?: { embedModelId?: string; force?: boolean },
  ): Promise<{ updated: number }> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
    const data = await this.load(accountId);
    const targets = data.rows.filter(
      (r) =>
        r.status === "active" &&
        (opts?.force || data.meta.embedStale || !r.embedding || r.embedding.length === 0),
    );
    if (targets.length === 0) {
      data.meta.embedStale = false;
      if (opts?.embedModelId) data.meta.embedModelId = opts.embedModelId;
      await this.save(accountId, data);
      return { updated: 0 };
    }
    const batch = 32;
    let updated = 0;
    for (let i = 0; i < targets.length; i += batch) {
      const slice = targets.slice(i, i + batch);
      const vectors = await embed(slice.map((r) => r.text.slice(0, 4000)));
      for (let j = 0; j < slice.length; j++) {
        const v = vectors[j];
        if (v && v.length > 0) {
          slice[j]!.embedding = v;
          updated++;
        }
      }
    }
    data.meta.embedStale = false;
    if (opts?.embedModelId) data.meta.embedModelId = opts.embedModelId;
    await this.save(accountId, data);
    return { updated };
    });
  }

  /**
   * Operator correction — Knowledge-RAG §4.3 `home.updateKnowYou`.
   * action=forget removes/supersedes; action=supersede replaces text.
   */
  async updateKnowYou(
    accountId: string,
    input: {
      action: "forget" | "supersede";
      id?: string;
      key?: string;
      text?: string;
    },
  ): Promise<{ ok: true; id?: string; removed: number }> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
    const data = await this.load(accountId);
    const now = new Date().toISOString();
    let removed = 0;
    let idOut: string | undefined;

    const match = (r: EpisodicRow) => {
      if (input.id && r.id === input.id) return true;
      if (input.key && r.key === input.key && r.status === "active") return true;
      return false;
    };

    if (input.action === "forget") {
      for (const r of data.rows) {
        if (!match(r) || r.status !== "active") continue;
        r.status = "superseded";
        r.updatedAt = now;
        removed++;
        idOut = r.id;
      }
      if (removed === 0) {
        throw Object.assign(new Error("envoyhome.knowyou_not_found"), {
          code: "knowyou_not_found",
        });
      }
    } else {
      const text = (input.text ?? "").trim();
      if (!text) {
        throw Object.assign(new Error("envoyhome.bad_params: text required for supersede"), {
          code: "bad_params",
        });
      }
      const existing = data.rows.find((r) => match(r) && r.status === "active");
      if (!existing && !input.key) {
        throw Object.assign(new Error("envoyhome.knowyou_not_found"), {
          code: "knowyou_not_found",
        });
      }
      if (existing) {
        existing.status = "superseded";
        existing.updatedAt = now;
      }
      const id = newId();
      const key = (input.key ?? existing?.key ?? "").trim();
      data.rows.push({
        id,
        key,
        text,
        status: "active",
        ...(existing ? { replacesId: existing.id } : {}),
        createdAt: now,
        updatedAt: now,
        contentHash: hashText(text),
      });
      idOut = id;
      removed = existing ? 1 : 0;
    }

    await this.save(accountId, data);
    return { ok: true as const, removed, ...(idOut ? { id: idOut } : {}) };
    });
  }

  async search(
    accountId: string,
    query: string,
    opts?: { limit?: number; queryEmbedding?: number[] },
  ): Promise<{ hits: EpisodicHit[] }> {
    const limit = opts?.limit ?? 8;
    const data = await this.load(accountId);
    const active = data.rows.filter((r) => r.status === "active");
    const recentCut =
      Date.now() - data.meta.recentPreferDays * 24 * 60 * 60 * 1000;

    const fts = recallOverCorpus(
      active.map((r) => ({ path: r.id, content: `${r.key}\n${r.text}` })),
      query,
      { limit: limit * 2 },
    );

    const ftsHits: EpisodicHit[] = fts.map((h) => {
      const row = active.find((r) => r.id === h.path);
      const hit: EpisodicHit = {
        id: h.path,
        key: row?.key ?? "",
        text: row?.text ?? h.snippet,
        score: h.score,
        engine: h.engine === "scan" ? "scan" : "fts",
      };
      if (row?.isSummary !== undefined) hit.isSummary = row.isSummary;
      return hit;
    });

    // V-EMB-6: while embedStale, never fuse old vectors with a new query space.
    const qv = data.meta.embedStale ? undefined : opts?.queryEmbedding;
    let hits = ftsHits;
    if (qv?.length) {
      const vecHits: EpisodicHit[] = [];
      for (const r of active) {
        if (!r.embedding || r.embedding.length !== qv.length) continue;
        const score = cosine(qv, r.embedding);
        if (score < 0.2) continue;
        const hit: EpisodicHit = {
          id: r.id,
          key: r.key,
          text: r.text,
          score,
          engine: "vec",
        };
        if (r.isSummary !== undefined) hit.isSummary = r.isSummary;
        vecHits.push(hit);
      }
      vecHits.sort((a, b) => b.score - a.score);
      hits = rrfMergeEpisodic(ftsHits, vecHits.slice(0, limit * 2), limit * 2);
    }

    // Prefer recent raw over summary
    hits.sort((a, b) => {
      const ra = active.find((r) => r.id === a.id);
      const rb = active.find((r) => r.id === b.id);
      const aRecent = ra && !ra.isSummary && Date.parse(ra.updatedAt) >= recentCut ? 1 : 0;
      const bRecent = rb && !rb.isSummary && Date.parse(rb.updatedAt) >= recentCut ? 1 : 0;
      if (aRecent !== bRecent) return bRecent - aRecent;
      return b.score - a.score;
    });

    return { hits: hits.slice(0, limit) };
  }

  /**
   * Summarize oldest non-summary chunks older than minAgeDays.
   * summarizeFn returns summary text; covers those ids.
   */
  async summarizeBatch(
    accountId: string,
    summarizeFn: (texts: string[]) => Promise<string>,
    opts?: { maxPerBatch?: number; now?: Date },
  ): Promise<{ summaryId: string | null; covered: string[] }> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
    const data = await this.load(accountId);
    const now = opts?.now ?? new Date();
    const minAge = data.meta.minAgeDays * 24 * 60 * 60 * 1000;
    const max = opts?.maxPerBatch ?? 50;
    const candidates = data.rows
      .filter(
        (r) =>
          r.status === "active" &&
          !r.isSummary &&
          now.getTime() - Date.parse(r.createdAt) >= minAge,
      )
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .slice(0, max);

    if (candidates.length === 0) {
      return { summaryId: null, covered: [] };
    }

    const summaryText = await summarizeFn(candidates.map((c) => c.text));
    const id = newId();
    const iso = now.toISOString();
    const covers = candidates.map((c) => c.id);
    data.rows.push({
      id,
      key: "",
      text: summaryText,
      status: "active",
      isSummary: true,
      covers,
      createdAt: iso,
      updatedAt: iso,
      contentHash: hashText(summaryText),
    });
    data.meta.lastSummarizeAt = iso;
    await this.save(accountId, data);
    return { summaryId: id, covered: covers };
    });
  }

  /** TTL-delete raw rows covered by summaries older than keepOriginalDays. */
  async purgeExpiredOriginals(accountId: string, opts?: { now?: Date }): Promise<string[]> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
    const data = await this.load(accountId);
    const now = opts?.now ?? new Date();
    const ttl = data.meta.keepOriginalDays * 24 * 60 * 60 * 1000;
    const covered = new Set<string>();
    for (const r of data.rows) {
      if (r.isSummary && r.covers) {
        for (const id of r.covers) covered.add(id);
      }
    }
    const purged: string[] = [];
    data.rows = data.rows.filter((r) => {
      if (r.isSummary || r.status === "superseded") {
        // Drop superseded after short audit (7d)
        if (r.status === "superseded" && now.getTime() - Date.parse(r.updatedAt) > 7 * 86400000) {
          purged.push(r.id);
          return false;
        }
        return true;
      }
      if (covered.has(r.id) && now.getTime() - Date.parse(r.createdAt) > ttl) {
        purged.push(r.id);
        return false;
      }
      return true;
    });
    await this.save(accountId, data);
    return purged;
    });
  }

  async listActive(accountId: string): Promise<EpisodicRow[]> {
    const data = await this.load(accountId);
    return data.rows.filter((r) => r.status === "active");
  }

  /**
   * Heuristic extract from the **user** turn only (P4 — no LLM required).
   * Assistant text is ignored to prevent model echo from poisoning KnowYou.
   */
  static extractCandidates(userText: string, _assistantText?: string): IngestCandidate[] {
    const out: IngestCandidate[] = [];
    const blob = userText;
    const pref = /(?:i (?:prefer|like|love|hate|always|never)|my (?:favorite|favourite))\s+([^.!?\n]{3,80})/gi;
    for (const m of blob.matchAll(pref)) {
      const phrase = m[0]!.trim();
      const key = guessKey(phrase);
      out.push({ key, text: phrase });
    }
    const allergy = /(?:allerg(?:y|ic)(?: to)?)\s+([^.!?\n]{2,60})/gi;
    for (const m of blob.matchAll(allergy)) {
      out.push({ key: `allergy.${slug(m[1]!)}`, text: m[0]!.trim() });
    }
    // Remember cue (user only)
    if (/\b(?:please )?remember\b/i.test(userText)) {
      const line = userText.replace(/\bplease remember\b/i, "").trim().slice(0, 200);
      if (line.length >= 8) out.push({ key: "", text: line });
    }
    return dedupeCandidates(out);
  }

  private async load(accountId: string): Promise<EpisodicFile> {
    try {
      const raw = await readFile(indexPath(this.accountRoot(accountId)), "utf8");
      const parsed = JSON.parse(raw) as EpisodicFile;
      return {
        meta: { ...defaultMeta(), ...parsed.meta },
        rows: Array.isArray(parsed.rows) ? parsed.rows : [],
      };
    } catch {
      return { meta: defaultMeta(), rows: [] };
    }
  }

  private async save(accountId: string, data: EpisodicFile): Promise<void> {
    await this.ensure(accountId);
    await atomicWriteFile(
      indexPath(this.accountRoot(accountId)),
      JSON.stringify(data) + "\n",
    );
  }
}

function similarText(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/\s+/g, " ").trim();
  const nb = b.toLowerCase().replace(/\s+/g, " ").trim();
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Jaccard on words
  const wa = new Set(na.split(" ").filter((w) => w.length > 2));
  const wb = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return false;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.max(wa.size, wb.size) >= 0.85;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/gi, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

function guessKey(phrase: string): string {
  const m = /favorite|favourite|prefer|like|love|hate|always|never\s+(\w+)/i.exec(phrase);
  if (/drink|coffee|tea|milk|water/i.test(phrase)) return "pref.drink";
  if (/food|eat|cuisine/i.test(phrase)) return "pref.food";
  if (m) return `pref.${slug(m[1]!)}`;
  return `pref.${slug(phrase.slice(0, 24))}`;
}

function dedupeCandidates(c: IngestCandidate[]): IngestCandidate[] {
  const seen = new Set<string>();
  const out: IngestCandidate[] = [];
  for (const x of c) {
    const k = `${x.key ?? ""}\0${x.text}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

/** Resolve a standing string for a KnowYou key (pref.drink → drink / pref.drink). */
export function standingValueForKey(
  key: string,
  profileFacts: Record<string, string>,
  memoryMd: string,
): string | undefined {
  if (!key) return undefined;
  const pref = /^pref\.(.+)$/.exec(key);
  const factKey = pref ? pref[1]! : key;
  const fromProfile = profileFacts[factKey] ?? profileFacts[`pref.${factKey}`] ?? profileFacts[key];
  if (fromProfile) return fromProfile;
  // MEMORY.md line mention of "drink: tea" style — soft
  const re = new RegExp(`${factKey}\\s*[:=]\\s*([^\\n,;.]+)`, "i");
  const m = re.exec(memoryMd);
  return m?.[1]?.trim() || undefined;
}

/**
 * True when a candidate would contradict active L1/L2 (V-KY-7).
 * Caller MUST enqueue PendingLearn and SKIP episodic ADD.
 * Unkeyed chunks: exclusive-alt heuristic against drink/food standing values.
 */
export function candidateConflictsWithStanding(
  candidate: { key?: string; text: string },
  profileFacts: Record<string, string>,
  memoryMd: string,
): { conflicts: boolean; standing?: string; profileKey?: string } {
  const key = (candidate.key ?? "").trim();
  const text = candidate.text;

  if (key) {
    const standing = standingValueForKey(key, profileFacts, memoryMd);
    if (!standing) return { conflicts: false };
    const pref = /^pref\.(.+)$/.exec(key);
    const profileKey = pref ? pref[1]! : key;
    // Negation / exclusive-alt / dual-mention (must run even when standing token appears).
    if (textContradictsStandingValue(text, standing, key)) {
      return { conflicts: true, standing, profileKey };
    }
    // Prefer-key family: keyed text that never affirms standing → PendingLearn
    if (!text.toLowerCase().includes(standing.toLowerCase())) {
      return { conflicts: true, standing, profileKey };
    }
    return { conflicts: false };
  }

  // Unkeyed: drop / PendingLearn when exclusive alt of a standing pref appears
  for (const [factKey, val] of Object.entries(profileFacts)) {
    const standing = String(val).trim();
    if (standing.length < 2) continue;
    if (!altSetForKey(factKey) && !altSetForKey(`pref.${factKey}`)) continue;
    if (textContradictsStandingValue(text, standing, factKey)) {
      return { conflicts: true, standing, profileKey: factKey.replace(/^pref\./, "") };
    }
  }
  // MEMORY.md drink/food lines
  for (const m of memoryMd.matchAll(/(drink|food|prefer(?:ence)?)\s*[:=]\s*([^\n,;.]+)/gi)) {
    const standing = m[2]!.trim();
    const hint = m[1]!;
    if (textContradictsStandingValue(text, standing, hint)) {
      return { conflicts: true, standing, profileKey: hint.toLowerCase() };
    }
  }
  return { conflicts: false };
}

/** Drop episodic hits that contradict simple L1/L2 key facts (P5). */
export function filterEpisodicAgainstStanding(
  hits: EpisodicHit[],
  profileFacts: Record<string, string>,
  memoryMd: string,
): EpisodicHit[] {
  return hits.filter((h) => {
    const gate = candidateConflictsWithStanding(h, profileFacts, memoryMd);
    return !gate.conflicts;
  });
}

/**
 * Drop Doc KB hits whose snippet contradicts standing L1/L2 (Knowledge-RAG §6 / V-KB-6).
 * Single-pref profiles: snippet asserting an exclusive alt (coffee vs tea) is dropped.
 */
export function filterKnowledgeAgainstStanding<T extends { snippet: string; path: string }>(
  hits: T[],
  profileFacts: Record<string, string>,
  memoryMd: string,
): T[] {
  const prefs: Array<{ key: string; value: string }> = [];
  for (const [key, val] of Object.entries(profileFacts)) {
    const v = String(val).trim();
    if (v.length < 2) continue;
    if (altSetForKey(key) || /drink|food|prefer/i.test(key)) {
      prefs.push({ key, value: v });
    }
  }
  for (const m of memoryMd.matchAll(/(drink|food)\s*[:=]\s*([^\n,;.]+)/gi)) {
    prefs.push({ key: m[1]!.toLowerCase(), value: m[2]!.trim() });
  }
  if (prefs.length === 0) return hits;

  return hits.filter((h) => {
    const snip = h.snippet;
    for (const p of prefs) {
      // Co-mention of standing + exclusive alt must still drop (V-KB-6).
      if (textContradictsStandingValue(snip, p.value, p.key)) return false;
    }
    return true;
  });
}

function rrfMergeEpisodic(
  fts: EpisodicHit[],
  vec: EpisodicHit[],
  limit: number,
): EpisodicHit[] {
  const k = 60;
  const scores = new Map<string, { hit: EpisodicHit; score: number }>();
  fts.forEach((h, i) => {
    const prev = scores.get(h.id);
    const add = 1 / (k + i + 1);
    if (prev) {
      prev.score += add;
      prev.hit = { ...prev.hit, engine: "hybrid", score: prev.score };
    } else {
      scores.set(h.id, { hit: { ...h, engine: "hybrid", score: add }, score: add });
    }
  });
  vec.forEach((h, i) => {
    const prev = scores.get(h.id);
    const add = 1 / (k + i + 1);
    if (prev) {
      prev.score += add;
      prev.hit = { ...prev.hit, engine: "hybrid", score: prev.score };
    } else {
      scores.set(h.id, { hit: { ...h, engine: "hybrid", score: add }, score: add });
    }
  });
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.hit);
}
