// KnowYou L4′ episodic engine — Knowledge-RAG Design §4.
// ADD | SUPERSEDE | SKIP; summarize + TTL; episodic-index.sqlite (FTS5 + sqlite-vec / BLOB).

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { withAccountLock } from "./writer-lock.js";
import {
  blobToFloat32,
  cosineSimilarity,
  ensureParentDir,
  ensureVec0Table,
  float32ToBlob,
  fts5MatchQuery,
  metaGet,
  metaSet,
  needsShortCjkScan,
  openAccountIndexDb,
  renameJsonMigrated,
  vecToMatchLiteral,
  type OpenedIndexDb,
} from "./sqlite-index.js";

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

function indexSqlitePath(accountRoot: string): string {
  return join(indexDir(accountRoot), "episodic-index.sqlite");
}

function indexJsonPath(accountRoot: string): string {
  return join(indexDir(accountRoot), "index.json");
}

type CachedDb = OpenedIndexDb & { accountRoot: string };

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

export class EpisodicIndex {
  private readonly dbs = new Map<string, CachedDb>();

  constructor(private readonly accountRoot: (accountId: string) => string) {}

  async ensure(accountId: string): Promise<void> {
    await mkdir(indexDir(this.accountRoot(accountId)), { recursive: true });
    await this.openDb(accountId);
  }

  async deleteIndex(accountId: string): Promise<void> {
    const root = this.accountRoot(accountId);
    const cached = this.dbs.get(root);
    if (cached) {
      try {
        cached.db.close();
      } catch {
        /* ignore */
      }
      this.dbs.delete(root);
    }
    await rm(indexDir(root), { recursive: true, force: true });
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
    const opened = await this.openDb(accountId);
    const q = query.trim();
    const ftsHits = q ? this.searchFts(opened.db, q, limit * 2) : [];

    // V-EMB-6: while embedStale, never fuse old vectors with a new query space.
    const qv = data.meta.embedStale ? undefined : opts?.queryEmbedding;
    let hits = ftsHits;
    if (qv?.length) {
      const vecHits = this.searchVec(opened, qv, limit * 2);
      hits = rrfMergeEpisodic(ftsHits, vecHits, limit * 2);
    }

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

  private async openDb(accountId: string): Promise<CachedDb> {
    const root = this.accountRoot(accountId);
    const cached = this.dbs.get(root);
    if (cached) return cached;
    await mkdir(indexDir(root), { recursive: true });
    const dbPath = indexSqlitePath(root);
    await ensureParentDir(dbPath);
    const opened = openAccountIndexDb(dbPath);
    this.initSchema(opened.db);
    const cachedDb: CachedDb = { ...opened, accountRoot: root };
    this.dbs.set(root, cachedDb);
    await this.maybeMigrateJson(accountId, cachedDb);
    return cachedDb;
  }

  private initSchema(db: DatabaseSync): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rows (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL,
        status TEXT NOT NULL,
        replaces_id TEXT,
        is_summary INTEGER NOT NULL DEFAULT 0,
        covers_json TEXT,
        source_turn_ids_json TEXT,
        source_session_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        embedding BLOB
      );
      CREATE INDEX IF NOT EXISTS idx_rows_status ON rows(status);
      CREATE INDEX IF NOT EXISTS idx_rows_session ON rows(source_session_id);
    `);
    const ftsExists = db
      .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'rows_fts'`)
      .get() as { ok: number } | undefined;
    if (!ftsExists) {
      try {
        db.exec(`
          CREATE VIRTUAL TABLE rows_fts USING fts5(
            id UNINDEXED,
            key,
            body,
            tokenize = 'trigram'
          );
        `);
      } catch {
        db.exec(`
          CREATE VIRTUAL TABLE rows_fts USING fts5(
            id UNINDEXED,
            key,
            body
          );
        `);
      }
    }
  }

  private async maybeMigrateJson(accountId: string, opened: CachedDb): Promise<void> {
    const jsonPath = indexJsonPath(this.accountRoot(accountId));
    if (!existsSync(jsonPath)) return;
    const count = (opened.db.prepare(`SELECT COUNT(*) AS n FROM rows`).get() as { n: number }).n;
    if (count > 0) {
      renameJsonMigrated(jsonPath);
      return;
    }
    try {
      const raw = await readFile(jsonPath, "utf8");
      const parsed = JSON.parse(raw) as EpisodicFile;
      const data: EpisodicFile = {
        meta: { ...defaultMeta(), ...parsed.meta },
        rows: Array.isArray(parsed.rows) ? parsed.rows : [],
      };
      this.writeAll(opened, data);
      renameJsonMigrated(jsonPath);
    } catch {
      /* keep json */
    }
  }

  private async load(accountId: string): Promise<EpisodicFile> {
    const opened = await this.openDb(accountId);
    return this.readAll(opened.db);
  }

  private async save(accountId: string, data: EpisodicFile): Promise<void> {
    const opened = await this.openDb(accountId);
    this.writeAll(opened, data);
  }

  private readAll(db: DatabaseSync): EpisodicFile {
    const meta = defaultMeta();
    const keep = metaGet(db, "keepOriginalDays");
    if (keep) meta.keepOriginalDays = Number(keep);
    const minAge = metaGet(db, "minAgeDays");
    if (minAge) meta.minAgeDays = Number(minAge);
    const recent = metaGet(db, "recentPreferDays");
    if (recent) meta.recentPreferDays = Number(recent);
    meta.lastSummarizeAt = metaGet(db, "lastSummarizeAt") || null;
    meta.embedStale = metaGet(db, "embedStale") === "1";
    meta.embedModelId = metaGet(db, "embedModelId") || null;

    const rawRows = db.prepare(`SELECT * FROM rows`).all() as Array<{
      id: string;
      key: string;
      text: string;
      status: string;
      replaces_id: string | null;
      is_summary: number;
      covers_json: string | null;
      source_turn_ids_json: string | null;
      source_session_id: string | null;
      created_at: string;
      updated_at: string;
      content_hash: string;
      embedding: Buffer | null;
    }>;

    const rows: EpisodicRow[] = rawRows.map((r) => {
      const row: EpisodicRow = {
        id: r.id,
        key: r.key,
        text: r.text,
        status: r.status === "superseded" ? "superseded" : "active",
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        contentHash: r.content_hash,
      };
      if (r.replaces_id) row.replacesId = r.replaces_id;
      if (r.is_summary) row.isSummary = true;
      if (r.covers_json) {
        try {
          row.covers = JSON.parse(r.covers_json) as string[];
        } catch {
          /* ignore */
        }
      }
      if (r.source_turn_ids_json) {
        try {
          row.sourceTurnIds = JSON.parse(r.source_turn_ids_json) as string[];
        } catch {
          /* ignore */
        }
      }
      if (r.source_session_id) row.sourceSessionId = r.source_session_id;
      if (r.embedding) row.embedding = blobToFloat32(r.embedding);
      return row;
    });

    return { meta, rows };
  }

  private writeAll(opened: CachedDb, data: EpisodicFile): void {
    const { db, vecOk } = opened;
    metaSet(db, "keepOriginalDays", String(data.meta.keepOriginalDays));
    metaSet(db, "minAgeDays", String(data.meta.minAgeDays));
    metaSet(db, "recentPreferDays", String(data.meta.recentPreferDays));
    metaSet(db, "lastSummarizeAt", data.meta.lastSummarizeAt ?? "");
    metaSet(db, "embedStale", data.meta.embedStale ? "1" : "0");
    metaSet(db, "embedModelId", data.meta.embedModelId ?? "");

    db.exec(`DELETE FROM rows`);
    db.exec(`DELETE FROM rows_fts`);
    try {
      db.exec(`DELETE FROM rows_vec`);
    } catch {
      /* optional */
    }

    const ins = db.prepare(`
      INSERT INTO rows(
        id, key, text, status, replaces_id, is_summary, covers_json,
        source_turn_ids_json, source_session_id, created_at, updated_at, content_hash, embedding
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insFts = db.prepare(`INSERT INTO rows_fts(id, key, body) VALUES (?, ?, ?)`);

    let embedDim: number | null = null;
    for (const r of data.rows) {
      const blob =
        r.embedding && r.embedding.length > 0 ? float32ToBlob(r.embedding) : null;
      if (blob) embedDim = r.embedding!.length;
      ins.run(
        r.id,
        r.key,
        r.text,
        r.status,
        r.replacesId ?? null,
        r.isSummary ? 1 : 0,
        r.covers ? JSON.stringify(r.covers) : null,
        r.sourceTurnIds ? JSON.stringify(r.sourceTurnIds) : null,
        r.sourceSessionId ?? null,
        r.createdAt,
        r.updatedAt,
        r.contentHash,
        blob,
      );
      if (r.status === "active") {
        insFts.run(r.id, r.key, r.text);
      }
    }

    if (embedDim && embedDim > 0) {
      metaSet(db, "embedDim", String(embedDim));
      if (ensureVec0Table(db, vecOk, "rows_vec", embedDim, "vec0_dim")) {
        const insVec = db.prepare(`INSERT INTO rows_vec(id, embedding) VALUES (?, ?)`);
        for (const r of data.rows) {
          if (r.status !== "active" || !r.embedding || r.embedding.length !== embedDim) continue;
          try {
            insVec.run(r.id, vecToMatchLiteral(r.embedding));
          } catch {
            try {
              insVec.run(r.id, float32ToBlob(r.embedding));
            } catch {
              /* skip */
            }
          }
        }
      }
    }
  }

  private searchFts(db: DatabaseSync, query: string, limit: number): EpisodicHit[] {
    const hits: EpisodicHit[] = [];
    const seen = new Set<string>();
    try {
      const rows = db
        .prepare(
          `
          SELECT r.id, r.key, r.text, r.is_summary, bm25(rows_fts) AS rank
          FROM rows_fts
          JOIN rows r ON r.id = rows_fts.id
          WHERE rows_fts MATCH ? AND r.status = 'active'
          ORDER BY rank
          LIMIT ?
        `,
        )
        .all(fts5MatchQuery(query), limit) as Array<{
        id: string;
        key: string;
        text: string;
        is_summary: number;
        rank: number;
      }>;
      for (const r of rows) {
        seen.add(r.id);
        const hit: EpisodicHit = {
          id: r.id,
          key: r.key,
          text: r.text,
          score: 1 / (1 + Math.abs(Number(r.rank) || 0)),
          engine: "fts",
        };
        if (r.is_summary) hit.isSummary = true;
        hits.push(hit);
      }
    } catch {
      /* MATCH failed */
    }

    if (needsShortCjkScan(query) || hits.length === 0) {
      const needle = query.toLowerCase();
      const rows = db
        .prepare(
          `SELECT id, key, text, is_summary FROM rows WHERE status = 'active' LIMIT 5000`,
        )
        .all() as Array<{ id: string; key: string; text: string; is_summary: number }>;
      for (const r of rows) {
        if (seen.has(r.id)) continue;
        if (!`${r.key}\n${r.text}`.toLowerCase().includes(needle)) continue;
        seen.add(r.id);
        const hit: EpisodicHit = {
          id: r.id,
          key: r.key,
          text: r.text,
          score: 0.5,
          engine: "scan",
        };
        if (r.is_summary) hit.isSummary = true;
        hits.push(hit);
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }

  private searchVec(opened: CachedDb, qv: number[], limit: number): EpisodicHit[] {
    const { db, vecOk } = opened;
    const dim = Number(metaGet(db, "embedDim") ?? 0);
    if (dim > 0 && ensureVec0Table(db, vecOk, "rows_vec", dim, "vec0_dim")) {
      try {
        const rows = db
          .prepare(
            `
            SELECT v.id, v.distance, r.key, r.text, r.is_summary
            FROM rows_vec v
            JOIN rows r ON r.id = v.id
            WHERE v.embedding MATCH ? AND k = ? AND r.status = 'active'
            ORDER BY distance
          `,
          )
          .all(vecToMatchLiteral(qv), limit) as Array<{
          id: string;
          distance: number;
          key: string;
          text: string;
          is_summary: number;
        }>;
        if (rows.length > 0) {
          return rows.map((r) => {
            const hit: EpisodicHit = {
              id: r.id,
              key: r.key,
              text: r.text,
              score: 1 / (1 + Math.abs(Number(r.distance) || 0)),
              engine: "vec",
            };
            if (r.is_summary) hit.isSummary = true;
            return hit;
          });
        }
      } catch {
        /* blob fallback */
      }
    }

    const rows = db
      .prepare(
        `SELECT id, key, text, is_summary, embedding FROM rows WHERE status = 'active' AND embedding IS NOT NULL`,
      )
      .all() as Array<{
      id: string;
      key: string;
      text: string;
      is_summary: number;
      embedding: Buffer;
    }>;
    const scored: EpisodicHit[] = [];
    for (const r of rows) {
      const emb = blobToFloat32(r.embedding);
      if (emb.length !== qv.length) continue;
      const score = cosineSimilarity(qv, emb);
      if (score < 0.2) continue;
      const hit: EpisodicHit = {
        id: r.id,
        key: r.key,
        text: r.text,
        score,
        engine: "vec",
      };
      if (r.is_summary) hit.isSummary = true;
      scored.push(hit);
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
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
