// Shared node:sqlite + sqlite-vec helpers for Doc KB / KnowYou indexes.
// Peer load pattern: EnvoyMesh openclaw memory-host-sdk host/sqlite-vec.ts

import { createRequire } from "node:module";
import { existsSync, renameSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { needsShortCjkScan } from "./recall-fts.js";

const requireFromHere = createRequire(import.meta.url);

export type OpenedIndexDb = {
  db: DatabaseSync;
  /** True when sqlite-vec extension loaded successfully. */
  vecOk: boolean;
  extensionPath?: string;
  vecError?: string;
};

type SqliteVecModule = {
  getLoadablePath: () => string;
  load: (db: DatabaseSync) => void;
};

export function float32ToBlob(vec: number[]): Buffer {
  const buf = Buffer.allocUnsafe(vec.length * 4);
  for (let i = 0; i < vec.length; i++) buf.writeFloatLE(vec[i]!, i * 4);
  return buf;
}

export function blobToFloat32(blob: Buffer | Uint8Array): number[] {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const n = Math.floor(buf.length / 4);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

/** JSON array string for sqlite-vec MATCH (float32). */
export function vecToMatchLiteral(vec: number[]): string {
  return `[${vec.map((x) => (Number.isFinite(x) ? x : 0)).join(",")}]`;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Escape a user query for FTS5 MATCH (double quotes + wrap). */
export function fts5MatchQuery(query: string): string {
  const cleaned = query.trim().replace(/"/g, '""');
  if (!cleaned) return '""';
  return `"${cleaned}"`;
}

export { needsShortCjkScan };

export async function ensureParentDir(dbPath: string): Promise<void> {
  await mkdir(dirname(dbPath), { recursive: true });
}

/**
 * Open (or create) a per-account index DB with WAL + optional sqlite-vec.
 */
export function openAccountIndexDb(dbPath: string): OpenedIndexDb {
  const db = new DatabaseSync(dbPath, { allowExtension: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  const loaded = tryLoadSqliteVec(db);
  return {
    db,
    vecOk: loaded.ok,
    ...(loaded.extensionPath !== undefined ? { extensionPath: loaded.extensionPath } : {}),
    ...(loaded.error !== undefined ? { vecError: loaded.error } : {}),
  };
}

function tryLoadSqliteVec(db: DatabaseSync): {
  ok: boolean;
  extensionPath?: string;
  error?: string;
} {
  try {
    db.enableLoadExtension(true);
    const override = process.env.ENVOYHOME_SQLITE_VEC_PATH?.trim();
    if (override) {
      db.loadExtension(override);
      return { ok: true, extensionPath: override };
    }
    try {
      const sqliteVec = requireFromHere("sqlite-vec") as SqliteVecModule;
      const extensionPath = sqliteVec.getLoadablePath();
      sqliteVec.load(db);
      return { ok: true, extensionPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Ensure a vec0 table exists for the given dimension. Drops/recreates on dim change.
 * Returns false if vec extension unavailable.
 */
export function ensureVec0Table(
  db: DatabaseSync,
  vecOk: boolean,
  tableName: string,
  dim: number,
  metaKey: string,
): boolean {
  if (!vecOk || !Number.isFinite(dim) || dim < 1) return false;
  const prev = metaGet(db, metaKey);
  const prevDim = prev ? Number(prev) : NaN;
  if (prevDim === dim) {
    const exists = db
      .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(tableName) as { ok: number } | undefined;
    if (exists) return true;
  }
  try {
    db.exec(`DROP TABLE IF EXISTS ${quoteIdent(tableName)}`);
    db.exec(
      `CREATE VIRTUAL TABLE ${quoteIdent(tableName)} USING vec0(
        id TEXT PRIMARY KEY,
        embedding float[${Math.floor(dim)}]
      )`,
    );
    metaSet(db, metaKey, String(Math.floor(dim)));
    return true;
  } catch {
    return false;
  }
}

function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`invalid sql ident: ${name}`);
  }
  return name;
}

export function metaGet(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function metaSet(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    `INSERT INTO meta(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function renameJsonMigrated(jsonPath: string): void {
  if (!existsSync(jsonPath)) return;
  try {
    renameSync(jsonPath, `${jsonPath}.migrated`);
  } catch {
    /* leave json if rename fails */
  }
}
