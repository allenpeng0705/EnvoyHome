// L4 session FTS index — trigram + retention purge (V-MEM-9, V-MEM-14).
// Pure-JS trigram (same engine as L2/L3 recall); no node:sqlite.

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { needsShortCjkScan, recallOverCorpus, type RecallHit } from "./recall-fts.js";

export const DEFAULT_SESSION_RETENTION_DAYS = 180;

export interface SessionDoc {
  sessionId: string;
  accountId: string;
  path: string;
  content: string;
  updatedAt: string;
}

interface IndexMeta {
  retentionDays: number;
  sessions: Array<{
    sessionId: string;
    path: string;
    updatedAt: string;
  }>;
}

/**
 * L4 FTS corpus lives under `session-fts/` so it never collides with chat
 * session dirs at `sessions/<sessionId>/` (daemon SessionStore).
 */
function indexDir(accountRoot: string): string {
  return join(accountRoot, "session-fts");
}

function metaPath(accountRoot: string): string {
  return join(indexDir(accountRoot), "index.json");
}

function sessionFile(accountRoot: string, sessionId: string): string {
  return join(indexDir(accountRoot), `${sessionId}.md`);
}

export class SessionIndex {
  constructor(private readonly accountRoot: (accountId: string) => string) {}

  async ensure(accountId: string): Promise<void> {
    await mkdir(indexDir(this.accountRoot(accountId)), { recursive: true });
  }

  async upsert(
    accountId: string,
    sessionId: string,
    content: string,
    opts?: { now?: Date; retentionDays?: number },
  ): Promise<void> {
    const root = this.accountRoot(accountId);
    await this.ensure(accountId);
    const now = opts?.now ?? new Date();
    const path = sessionFile(root, sessionId);
    await writeFile(path, content, "utf8");
    const meta = await this.loadMeta(accountId);
    meta.retentionDays = opts?.retentionDays ?? meta.retentionDays ?? DEFAULT_SESSION_RETENTION_DAYS;
    const rel = `session-fts/${sessionId}.md`;
    const existing = meta.sessions.find((s) => s.sessionId === sessionId);
    if (existing) {
      existing.updatedAt = now.toISOString();
      existing.path = rel;
    } else {
      meta.sessions.push({
        sessionId,
        path: rel,
        updatedAt: now.toISOString(),
      });
    }
    await this.saveMeta(accountId, meta);
    await this.purgeExpired(accountId, { now, retentionDays: meta.retentionDays });
  }

  async search(
    accountId: string,
    query: string,
    opts?: { limit?: number },
  ): Promise<{ hits: RecallHit[] }> {
    const docs = await this.collect(accountId);
    const hits = recallOverCorpus(
      docs.map((d) => ({ path: d.path, content: d.content })),
      query,
      { limit: opts?.limit ?? 20 },
    );
    // session_search never requires L5 (V-MEM-9).
    void needsShortCjkScan;
    return { hits };
  }

  async purgeExpired(
    accountId: string,
    opts?: { now?: Date; retentionDays?: number },
  ): Promise<string[]> {
    const root = this.accountRoot(accountId);
    const meta = await this.loadMeta(accountId);
    const retention = opts?.retentionDays ?? meta.retentionDays ?? DEFAULT_SESSION_RETENTION_DAYS;
    if (retention === 0) return []; // forever
    const now = opts?.now ?? new Date();
    const cutoff = now.getTime() - retention * 24 * 60 * 60 * 1000;
    const kept: IndexMeta["sessions"] = [];
    const purged: string[] = [];
    for (const s of meta.sessions) {
      if (Date.parse(s.updatedAt) < cutoff) {
        purged.push(s.sessionId);
        await rm(sessionFile(root, s.sessionId), { force: true });
      } else {
        kept.push(s);
      }
    }
    meta.sessions = kept;
    meta.retentionDays = retention;
    await this.saveMeta(accountId, meta);
    return purged;
  }

  /** Delete one session + its derived index row (V-MEM-20 session purge). */
  async deleteSession(accountId: string, sessionId: string): Promise<void> {
    const root = this.accountRoot(accountId);
    await rm(sessionFile(root, sessionId), { force: true });
    const meta = await this.loadMeta(accountId);
    meta.sessions = meta.sessions.filter((s) => s.sessionId !== sessionId);
    await this.saveMeta(accountId, meta);
  }

  private async collect(accountId: string): Promise<SessionDoc[]> {
    const root = this.accountRoot(accountId);
    const meta = await this.loadMeta(accountId);
    const docs: SessionDoc[] = [];
    for (const s of meta.sessions) {
      try {
        const content = await readFile(sessionFile(root, s.sessionId), "utf8");
        docs.push({
          sessionId: s.sessionId,
          accountId,
          path: s.path,
          content,
          updatedAt: s.updatedAt,
        });
      } catch {
        // orphan — skip
      }
    }
    return docs;
  }

  private async loadMeta(accountId: string): Promise<IndexMeta> {
    try {
      const raw = await readFile(metaPath(this.accountRoot(accountId)), "utf8");
      const parsed = JSON.parse(raw) as IndexMeta;
      return {
        retentionDays: parsed.retentionDays ?? DEFAULT_SESSION_RETENTION_DAYS,
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      };
    } catch {
      return { retentionDays: DEFAULT_SESSION_RETENTION_DAYS, sessions: [] };
    }
  }

  private async saveMeta(accountId: string, meta: IndexMeta): Promise<void> {
    await this.ensure(accountId);
    await writeFile(
      metaPath(this.accountRoot(accountId)),
      JSON.stringify(meta, null, 2) + "\n",
      "utf8",
    );
  }

  /** List session ids (tests / doctor). */
  async listSessionIds(accountId: string): Promise<string[]> {
    const meta = await this.loadMeta(accountId);
    return meta.sessions.map((s) => s.sessionId);
  }

  /** Orphan scan: files on disk not in meta (doctor). */
  async orphanFiles(accountId: string): Promise<string[]> {
    const root = this.accountRoot(accountId);
    const dir = indexDir(root);
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }
    const meta = await this.loadMeta(accountId);
    const known = new Set(meta.sessions.map((s) => `${s.sessionId}.md`));
    return names.filter((n) => n.endsWith(".md") && !known.has(n));
  }
}
