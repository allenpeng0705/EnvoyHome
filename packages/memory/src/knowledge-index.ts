// Doc KB (L6) derived index — Knowledge-RAG Design §3.
// Persistence: knowledge-index.sqlite (FTS5 trigram + sqlite-vec / BLOB cosine).

import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import {
  buildKnowledgeIndexMd,
  splitKnowledgeMarkdown,
  type KnowledgeSection,
} from "./knowledge-sections.js";
import { withAccountLock } from "./writer-lock.js";
import type { RecallEngine } from "./recall-fts.js";
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

/**
 * Resolve `rel` under `root`; refuse `..` / absolute escapes (Knowledge-RAG §3.1).
 */
function resolveUnderRoot(root: string, rel: string): string {
  if (!rel || rel.includes("\0") || /(^|[\\/])\.\.([\\/]|$)/.test(rel)) {
    throw new Error("envoyhome.path_jail: knowledge upsert path escape");
  }
  const absRoot = resolve(root);
  const abs = resolve(absRoot, rel);
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) {
    throw new Error("envoyhome.path_jail: knowledge upsert path escape");
  }
  return abs;
}

/** Canonical `knowledge/…` virtual path or null if unsafe / out of tree. */
export function normalizeKnowledgeVirtualPath(virtualPath: string): string | null {
  const norm = virtualPath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "");
  if (!norm.startsWith("knowledge/") || !norm.endsWith(".md")) return null;
  if (norm.includes("\0") || norm.split("/").includes("..")) return null;
  if (norm.includes("/raw/")) return null;
  return norm;
}

/** Soft cap on indexed Doc KB sections per account (Knowledge-RAG §7 Caps). */
export const DEFAULT_KNOWLEDGE_SECTION_CAP = 2000;

export type KnowledgeEngine = RecallEngine | "vec" | "hybrid";

export interface KnowledgeHit {
  path: string;
  heading: string;
  startLine: number;
  endLine: number;
  snippet: string;
  score: number;
  engine: KnowledgeEngine;
  sectionId: string;
}

interface IndexMeta {
  version: 1;
  sectionCount: number;
  lastReindexAt: string | null;
  embedModelId: string | null;
  embedDim: number | null;
  embedStale: boolean;
}

export type EmbedFn = (texts: string[]) => Promise<number[][]>;

function indexDir(accountRoot: string): string {
  return join(accountRoot, "memory-backend", "knowledge-index");
}

function indexSqlitePath(accountRoot: string): string {
  return join(indexDir(accountRoot), "knowledge-index.sqlite");
}

function indexJsonPath(accountRoot: string): string {
  return join(indexDir(accountRoot), "index.json");
}

function emptyMeta(): IndexMeta {
  return {
    version: 1,
    sectionCount: 0,
    lastReindexAt: null,
    embedModelId: null,
    embedDim: null,
    embedStale: false,
  };
}

type CachedDb = OpenedIndexDb & { accountRoot: string };

export class KnowledgeIndex {
  private readonly dbs = new Map<string, CachedDb>();

  constructor(private readonly accountRoot: (accountId: string) => string) {}

  async ensure(accountId: string): Promise<void> {
    await mkdir(indexDir(this.accountRoot(accountId)), { recursive: true });
    await this.openDb(accountId);
  }

  async status(accountId: string): Promise<{
    sectionCount: number;
    lastReindexAt: string | null;
    embedModelId: string | null;
    embedDim: number | null;
    embedStale: boolean;
    indexPath: string;
  }> {
    const { db } = await this.openDb(accountId);
    const meta = this.readMeta(db);
    return {
      sectionCount: meta.sectionCount,
      lastReindexAt: meta.lastReindexAt,
      embedModelId: meta.embedModelId,
      embedDim: meta.embedDim,
      embedStale: meta.embedStale,
      indexPath: `memory-backend/knowledge-index/knowledge-index.sqlite`,
    };
  }

  async reindex(
    accountId: string,
    knowledgeFilesRoot: string,
    opts?: { embed?: EmbedFn; embedModelId?: string; sectionCap?: number },
  ): Promise<{ sectionCount: number; paths: number }> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
      const opened = await this.openDb(accountId);
      const mdFiles = await listMarkdownFiles(knowledgeFilesRoot);
      let sections: KnowledgeSection[] = [];
      for (const abs of mdFiles) {
        const relFromKnowledge = relative(knowledgeFilesRoot, abs).split(sep).join("/");
        if (relFromKnowledge.split("/").includes("raw")) continue;
        const virtualPath = `knowledge/${relFromKnowledge}`;
        let text: string;
        try {
          text = await readFile(abs, "utf8");
        } catch {
          continue;
        }
        sections.push(...splitKnowledgeMarkdown(virtualPath, text));
      }

      const sectionCap = opts?.sectionCap ?? DEFAULT_KNOWLEDGE_SECTION_CAP;
      if (sections.length > sectionCap) {
        sections = [
          ...sections.filter((s) => !s.path.includes("/archive/")),
          ...sections.filter((s) => s.path.includes("/archive/")),
        ].slice(0, sectionCap);
      }

      let embedModelId: string | null = null;
      let embedDim: number | null = null;
      if (opts?.embed && sections.length > 0) {
        try {
          const vectors = await opts.embed(sections.map((s) => s.text.slice(0, 4000)));
          for (let i = 0; i < sections.length; i++) {
            const v = vectors[i];
            if (v && v.length > 0) {
              sections[i]!.embedding = v;
              embedDim = v.length;
            }
          }
          embedModelId = opts.embedModelId ?? "local";
        } catch {
          /* FTS-only */
        }
      }

      this.replaceAllSections(opened, sections, {
        embedModelId,
        embedDim,
        embedStale: false,
        lastReindexAt: new Date().toISOString(),
      });

      try {
        const indexPath = join(knowledgeFilesRoot, "_index.md");
        let exists = false;
        try {
          await access(indexPath);
          exists = true;
        } catch {
          exists = false;
        }
        if (!exists) {
          const indexMd = buildKnowledgeIndexMd(sections);
          await mkdir(knowledgeFilesRoot, { recursive: true });
          await writeFile(indexPath, indexMd, "utf8");
        }
      } catch {
        /* non-fatal */
      }

      return { sectionCount: sections.length, paths: mdFiles.length };
    });
  }

  async upsertPath(
    accountId: string,
    knowledgeFilesRoot: string,
    virtualPath: string,
    opts?: { embed?: EmbedFn; embedModelId?: string; sectionCap?: number },
  ): Promise<void> {
    const norm = normalizeKnowledgeVirtualPath(virtualPath);
    if (!norm) return;
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
      const rel = norm.slice("knowledge/".length);
      let abs: string;
      try {
        abs = resolveUnderRoot(knowledgeFilesRoot, rel);
      } catch {
        return;
      }
      const opened = await this.openDb(accountId);
      const { db } = opened;
      const oldIds = db
        .prepare(`SELECT section_id FROM sections WHERE path = ?`)
        .all(norm) as Array<{ section_id: string }>;
      this.deleteVecIds(
        opened,
        oldIds.map((r) => r.section_id),
      );
      db.prepare(`DELETE FROM sections WHERE path = ?`).run(norm);
      db.prepare(`DELETE FROM sections_fts WHERE path = ?`).run(norm);
      try {
        const text = await readFile(abs, "utf8");
        const fresh = splitKnowledgeMarkdown(norm, text);
        if (opts?.embed && fresh.length > 0) {
          try {
            const vectors = await opts.embed(fresh.map((s) => s.text.slice(0, 4000)));
            for (let i = 0; i < fresh.length; i++) {
              const v = vectors[i];
              if (v && v.length > 0) fresh[i]!.embedding = v;
            }
            if (vectors[0]?.length) {
              metaSet(db, "embedDim", String(vectors[0].length));
              if (opts.embedModelId) metaSet(db, "embedModelId", opts.embedModelId);
            }
          } catch {
            /* FTS only */
          }
        }
        this.insertSections(opened, fresh);
        this.upsertVecRows(opened, fresh);
        const sectionCap = opts?.sectionCap ?? DEFAULT_KNOWLEDGE_SECTION_CAP;
        this.enforceSectionCap(opened, sectionCap);
      } catch {
        // deleted file — rows already removed
      }
      const count = (
        db.prepare(`SELECT COUNT(*) AS n FROM sections`).get() as { n: number }
      ).n;
      metaSet(db, "sectionCount", String(count));
      metaSet(db, "lastReindexAt", new Date().toISOString());
    });
  }

  markEmbedStale(accountId: string): Promise<void> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
      const { db } = await this.openDb(accountId);
      metaSet(db, "embedStale", "1");
    });
  }

  async search(
    accountId: string,
    query: string,
    opts?: { limit?: number },
  ): Promise<{ hits: KnowledgeHit[] }> {
    const limit = opts?.limit ?? 8;
    const q = query.trim();
    if (!q) return { hits: [] };
    const { db } = await this.openDb(accountId);
    const hits = this.searchFts(db, q, limit);
    return { hits };
  }

  async searchHybrid(
    accountId: string,
    query: string,
    opts?: { limit?: number; queryEmbedding?: number[] },
  ): Promise<{ hits: KnowledgeHit[] }> {
    const limit = opts?.limit ?? 8;
    const { db, vecOk } = await this.openDb(accountId);
    const { hits: ftsHits } = await this.search(accountId, query, { limit: limit * 2 });
    const stale = metaGet(db, "embedStale") === "1";
    const qv = stale ? undefined : opts?.queryEmbedding;
    if (!qv || qv.length === 0) {
      return { hits: ftsHits.slice(0, limit) };
    }

    const vecScored = this.searchVec(db, vecOk, qv, limit * 2);
    return { hits: rrfMerge(ftsHits, vecScored, limit) };
  }

  async deleteIndex(accountId: string): Promise<void> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
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
    });
  }

  private async openDb(accountId: string): Promise<CachedDb> {
    const root = this.accountRoot(accountId);
    const cached = this.dbs.get(root);
    if (cached) return cached;
    const dir = indexDir(root);
    await mkdir(dir, { recursive: true });
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
      CREATE TABLE IF NOT EXISTS sections (
        section_id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        heading TEXT NOT NULL DEFAULT '',
        level INTEGER NOT NULL DEFAULT 0,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        text TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        is_summary INTEGER NOT NULL DEFAULT 0,
        embedding BLOB
      );
      CREATE INDEX IF NOT EXISTS idx_sections_path ON sections(path);
    `);
    // FTS5 content-sync table (external content)
    const ftsExists = db
      .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'sections_fts'`)
      .get() as { ok: number } | undefined;
    if (!ftsExists) {
      try {
        db.exec(`
          CREATE VIRTUAL TABLE sections_fts USING fts5(
            section_id UNINDEXED,
            path UNINDEXED,
            heading,
            body,
            tokenize = 'trigram'
          );
        `);
      } catch {
        // Older SQLite without trigram — fall back to unicode61
        db.exec(`
          CREATE VIRTUAL TABLE sections_fts USING fts5(
            section_id UNINDEXED,
            path UNINDEXED,
            heading,
            body
          );
        `);
      }
    }
  }

  private async maybeMigrateJson(accountId: string, opened: CachedDb): Promise<void> {
    const root = this.accountRoot(accountId);
    const jsonPath = indexJsonPath(root);
    if (!existsSync(jsonPath)) return;
    const count = (
      opened.db.prepare(`SELECT COUNT(*) AS n FROM sections`).get() as { n: number }
    ).n;
    if (count > 0) {
      renameJsonMigrated(jsonPath);
      return;
    }
    try {
      const raw = await readFile(jsonPath, "utf8");
      const parsed = JSON.parse(raw) as {
        meta?: Partial<IndexMeta>;
        sections?: KnowledgeSection[];
      };
      const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
      this.replaceAllSections(opened, sections, {
        embedModelId: parsed.meta?.embedModelId ?? null,
        embedDim: parsed.meta?.embedDim ?? null,
        embedStale: parsed.meta?.embedStale === true,
        lastReindexAt: parsed.meta?.lastReindexAt ?? null,
      });
      renameJsonMigrated(jsonPath);
    } catch {
      /* keep json; SQLite stays empty until reindex */
    }
  }

  private readMeta(db: DatabaseSync): IndexMeta {
    const m = emptyMeta();
    m.sectionCount = Number(metaGet(db, "sectionCount") ?? 0);
    m.lastReindexAt = metaGet(db, "lastReindexAt") ?? null;
    m.embedModelId = metaGet(db, "embedModelId") ?? null;
    const dim = metaGet(db, "embedDim");
    m.embedDim = dim ? Number(dim) : null;
    m.embedStale = metaGet(db, "embedStale") === "1";
    return m;
  }

  private replaceAllSections(
    opened: CachedDb,
    sections: KnowledgeSection[],
    meta: {
      embedModelId: string | null;
      embedDim: number | null;
      embedStale: boolean;
      lastReindexAt: string | null;
    },
  ): void {
    const { db, vecOk } = opened;
    db.exec(`DELETE FROM sections`);
    db.exec(`DELETE FROM sections_fts`);
    try {
      db.exec(`DELETE FROM sections_vec`);
    } catch {
      /* vec table may not exist */
    }
    this.insertSections(opened, sections);
    metaSet(db, "sectionCount", String(sections.length));
    metaSet(db, "lastReindexAt", meta.lastReindexAt ?? "");
    metaSet(db, "embedModelId", meta.embedModelId ?? "");
    metaSet(db, "embedDim", meta.embedDim != null ? String(meta.embedDim) : "");
    metaSet(db, "embedStale", meta.embedStale ? "1" : "0");
    if (meta.embedDim && meta.embedDim > 0) {
      ensureVec0Table(db, vecOk, "sections_vec", meta.embedDim, "vec0_dim");
      this.syncVecTable(opened, sections);
    }
  }

  private insertSections(opened: CachedDb, sections: KnowledgeSection[]): void {
    const { db } = opened;
    const ins = db.prepare(`
      INSERT INTO sections(
        section_id, path, heading, level, start_line, end_line, text, content_hash, is_summary, embedding
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insFts = db.prepare(`
      INSERT INTO sections_fts(section_id, path, heading, body) VALUES (?, ?, ?, ?)
    `);
    for (const s of sections) {
      const blob =
        s.embedding && s.embedding.length > 0 ? float32ToBlob(s.embedding) : null;
      ins.run(
        s.sectionId,
        s.path,
        s.heading ?? "",
        s.level ?? 0,
        s.startLine,
        s.endLine,
        s.text,
        s.contentHash ?? knowledgeContentHash(s.path, s.text),
        s.isSummary ? 1 : 0,
        blob,
      );
      insFts.run(s.sectionId, s.path, s.heading ?? "", s.text);
    }
  }

  private syncVecTable(opened: CachedDb, sections: KnowledgeSection[]): void {
    const { db, vecOk } = opened;
    const dim = Number(metaGet(db, "embedDim") ?? 0);
    if (!ensureVec0Table(db, vecOk, "sections_vec", dim, "vec0_dim")) return;
    try {
      db.exec(`DELETE FROM sections_vec`);
    } catch {
      return;
    }
    this.upsertVecRows(opened, sections);
  }

  private deleteVecIds(opened: CachedDb, ids: string[]): void {
    if (ids.length === 0) return;
    const { db } = opened;
    try {
      const del = db.prepare(`DELETE FROM sections_vec WHERE id = ?`);
      for (const id of ids) del.run(id);
    } catch {
      /* vec table may not exist */
    }
  }

  private upsertVecRows(opened: CachedDb, sections: KnowledgeSection[]): void {
    const { db, vecOk } = opened;
    const dim = Number(metaGet(db, "embedDim") ?? 0);
    if (!dim || !ensureVec0Table(db, vecOk, "sections_vec", dim, "vec0_dim")) return;
    const insJson = db.prepare(`INSERT INTO sections_vec(id, embedding) VALUES (?, ?)`);
    for (const s of sections) {
      if (!s.embedding || s.embedding.length !== dim) continue;
      try {
        db.prepare(`DELETE FROM sections_vec WHERE id = ?`).run(s.sectionId);
      } catch {
        /* ignore */
      }
      try {
        insJson.run(s.sectionId, vecToMatchLiteral(s.embedding));
      } catch {
        try {
          insJson.run(s.sectionId, float32ToBlob(s.embedding));
        } catch {
          /* skip */
        }
      }
    }
  }

  private enforceSectionCap(opened: CachedDb, sectionCap: number): void {
    const { db } = opened;
    const count = (db.prepare(`SELECT COUNT(*) AS n FROM sections`).get() as { n: number }).n;
    if (count <= sectionCap) return;
    let need = count - sectionCap;
    const ids: string[] = [];
    const archive = db
      .prepare(
        `
      SELECT section_id FROM sections
      WHERE path LIKE '%/archive/%'
      ORDER BY rowid ASC
      LIMIT ?
    `,
      )
      .all(need) as Array<{ section_id: string }>;
    for (const r of archive) ids.push(r.section_id);
    need = count - ids.length - sectionCap;
    if (need > 0) {
      const exclude = new Set(ids);
      const oldest = db
        .prepare(`SELECT section_id FROM sections ORDER BY rowid ASC`)
        .all() as Array<{ section_id: string }>;
      for (const r of oldest) {
        if (need <= 0) break;
        if (exclude.has(r.section_id)) continue;
        ids.push(r.section_id);
        need--;
      }
    }
    if (ids.length === 0) return;
    this.deleteVecIds(opened, ids);
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`DELETE FROM sections WHERE section_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM sections_fts WHERE section_id IN (${placeholders})`).run(...ids);
  }

  private searchFts(db: DatabaseSync, query: string, limit: number): KnowledgeHit[] {
    const hits: KnowledgeHit[] = [];
    const seen = new Set<string>();
    try {
      const match = fts5MatchQuery(query);
      const rows = db
        .prepare(
          `
          SELECT s.section_id, s.path, s.heading, s.start_line, s.end_line, s.text,
                 bm25(sections_fts) AS rank
          FROM sections_fts
          JOIN sections s ON s.section_id = sections_fts.section_id
          WHERE sections_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `,
        )
        .all(match, limit * 2) as Array<{
        section_id: string;
        path: string;
        heading: string;
        start_line: number;
        end_line: number;
        text: string;
        rank: number;
      }>;
      for (const r of rows) {
        if (seen.has(r.section_id)) continue;
        seen.add(r.section_id);
        const score = 1 / (1 + Math.abs(Number(r.rank) || 0));
        hits.push({
          path: r.path,
          heading: r.heading,
          startLine: r.start_line,
          endLine: r.end_line,
          snippet: r.text.slice(0, 400),
          score,
          engine: "fts",
          sectionId: r.section_id,
        });
      }
    } catch {
      /* MATCH failed — scan only */
    }

    if (needsShortCjkScan(query) || hits.length === 0) {
      const needle = query.toLowerCase();
      const rows = db
        .prepare(
          `SELECT section_id, path, heading, start_line, end_line, text FROM sections LIMIT 5000`,
        )
        .all() as Array<{
        section_id: string;
        path: string;
        heading: string;
        start_line: number;
        end_line: number;
        text: string;
      }>;
      for (const r of rows) {
        const body = `${r.heading}\n${r.text}`.toLowerCase();
        if (!body.includes(needle)) continue;
        if (seen.has(r.section_id)) continue;
        seen.add(r.section_id);
        hits.push({
          path: r.path,
          heading: r.heading,
          startLine: r.start_line,
          endLine: r.end_line,
          snippet: r.text.slice(0, 400),
          score: 0.5,
          engine: "scan",
          sectionId: r.section_id,
        });
      }
    }

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }

  private searchVec(
    db: DatabaseSync,
    vecOk: boolean,
    qv: number[],
    limit: number,
  ): KnowledgeHit[] {
    const dim = Number(metaGet(db, "embedDim") ?? 0);
    if (dim > 0 && ensureVec0Table(db, vecOk, "sections_vec", dim, "vec0_dim")) {
      try {
        const rows = db
          .prepare(
            `
            SELECT v.id AS section_id, v.distance AS distance,
                   s.path, s.heading, s.start_line, s.end_line, s.text
            FROM sections_vec v
            JOIN sections s ON s.section_id = v.id
            WHERE v.embedding MATCH ?
              AND k = ?
            ORDER BY distance
          `,
          )
          .all(vecToMatchLiteral(qv), limit) as Array<{
          section_id: string;
          distance: number;
          path: string;
          heading: string;
          start_line: number;
          end_line: number;
          text: string;
        }>;
        // Empty vec0 (out of sync) → fall through to BLOB cosine.
        if (rows.length > 0) {
          return rows.map((r) => ({
            path: r.path,
            heading: r.heading,
            startLine: r.start_line,
            endLine: r.end_line,
            snippet: r.text.slice(0, 400),
            score: 1 / (1 + Math.abs(Number(r.distance) || 0)),
            engine: "vec" as const,
            sectionId: r.section_id,
          }));
        }
      } catch {
        /* fall through to blob cosine */
      }
    }

    const rows = db
      .prepare(
        `SELECT section_id, path, heading, start_line, end_line, text, embedding FROM sections WHERE embedding IS NOT NULL`,
      )
      .all() as Array<{
      section_id: string;
      path: string;
      heading: string;
      start_line: number;
      end_line: number;
      text: string;
      embedding: Buffer;
    }>;
    const scored: KnowledgeHit[] = [];
    for (const r of rows) {
      const emb = blobToFloat32(r.embedding);
      if (emb.length !== qv.length) continue;
      const score = cosineSimilarity(qv, emb);
      if (score < 0.15) continue;
      scored.push({
        path: r.path,
        heading: r.heading,
        startLine: r.start_line,
        endLine: r.end_line,
        snippet: r.text.slice(0, 400),
        score,
        engine: "vec",
        sectionId: r.section_id,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "raw") continue;
        await walk(abs);
      } else if (e.isFile() && e.name.endsWith(".md")) {
        out.push(abs);
      }
    }
  }
  try {
    const st = await stat(root);
    if (!st.isDirectory()) return out;
  } catch {
    return out;
  }
  await walk(root);
  return out;
}

function rrfMerge(fts: KnowledgeHit[], vec: KnowledgeHit[], limit: number): KnowledgeHit[] {
  const k = 60;
  const scores = new Map<string, { hit: KnowledgeHit; score: number }>();
  fts.forEach((h, i) => {
    const key = h.sectionId || `${h.path}:${h.startLine}`;
    const prev = scores.get(key);
    const add = 1 / (k + i + 1);
    if (prev) {
      prev.score += add;
      prev.hit = { ...prev.hit, engine: "hybrid", score: prev.score };
    } else {
      scores.set(key, { hit: { ...h, engine: "hybrid", score: add }, score: add });
    }
  });
  vec.forEach((h, i) => {
    const key = h.sectionId || `${h.path}:${h.startLine}`;
    const prev = scores.get(key);
    const add = 1 / (k + i + 1);
    if (prev) {
      prev.score += add;
      prev.hit = {
        ...h,
        ...prev.hit,
        engine: "hybrid",
        score: prev.score,
        snippet: prev.hit.snippet || h.snippet,
      };
    } else {
      scores.set(key, { hit: { ...h, engine: "hybrid", score: add }, score: add });
    }
  });
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({ ...x.hit, score: x.score }));
}

export function knowledgeContentHash(path: string, text: string): string {
  return createHash("sha256").update(`${path}\0${text}`, "utf8").digest("hex").slice(0, 32);
}
