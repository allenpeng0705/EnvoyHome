// Artifact catalogue + signed URLs — Design §4.1b / §9.6 / Plan B11.

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { clampArtifactTtlSec } from "@envoyhome/protocol";
import {
  clampArtifactTtl,
  signArtifactToken,
  type ArtifactTokenPayload,
} from "./artifact-signer.js";
import { safeJoin } from "./fs-jail.js";
import type { HomePaths } from "./home-paths.js";

export interface ArtifactRow {
  id: string;
  path: string;
  createdAt: string;
}

const ARTIFACT_SECRET_FILE = "artifact-secret";

export class ArtifactService {
  private secret: Buffer | null = null;

  constructor(
    private readonly paths: HomePaths,
    private readonly publicBaseUrl: () => string,
  ) {}

  async ensureSecret(): Promise<Buffer> {
    if (this.secret) return this.secret;
    await mkdir(this.paths.secretsDir, { recursive: true });
    const secretPath = join(this.paths.secretsDir, ARTIFACT_SECRET_FILE);
    try {
      const existing = await readFile(secretPath);
      this.secret = existing;
      return existing;
    } catch {
      const generated = randomBytes(32);
      await writeFile(secretPath, generated, { mode: 0o600 });
      this.secret = generated;
      return generated;
    }
  }

  /** Resolve a relative path under `accounts/<id>/files/` (serve-time jail). */
  resolveArtifactPath(accountId: string, relPath: string): string {
    const filesRoot = this.paths.accountFiles(accountId);
    const trimmed = relPath.replace(/^\.\/+/, "").replace(/^\/+/, "");
    return safeJoin(filesRoot, trimmed);
  }

  private artifactIdForPath(relPath: string): string {
    return createHash("sha256").update(relPath).digest("hex").slice(0, 16);
  }

  async listArtifacts(accountId: string, sessionId?: string): Promise<ArtifactRow[]> {
    const filesRoot = this.paths.accountFiles(accountId);
    await mkdir(filesRoot, { recursive: true });
    const scanRoots = ["output", "documents", "knowledge"].map((d) => join(filesRoot, d));
    const rows: ArtifactRow[] = [];
    for (const root of scanRoots) {
      let names: string[];
      try {
        names = await readdir(root);
      } catch {
        continue;
      }
      for (const name of names) {
        const abs = join(root, name);
        const st = await stat(abs);
        if (!st.isFile()) continue;
        const rel = abs.slice(filesRoot.length + 1);
        if (sessionId) {
          const sessionDir = join(this.paths.accountRoot(accountId), "sessions", sessionId);
          if (!abs.startsWith(sessionDir) && !rel.includes(sessionId)) {
            continue;
          }
        }
        rows.push({
          id: this.artifactIdForPath(rel),
          path: rel,
          createdAt: st.mtime.toISOString(),
        });
      }
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async mintUrl(input: {
    accountId: string;
    path: string;
    ttlSec?: number;
  }): Promise<{ url: string; expiresAt: string }> {
    this.resolveArtifactPath(input.accountId, input.path);
    const secret = await this.ensureSecret();
    const ttl = clampArtifactTtlSec(input.ttlSec ?? clampArtifactTtl(undefined));
    const expUnix = Math.floor(Date.now() / 1000) + ttl;
    const payload: ArtifactTokenPayload = {
      accountId: input.accountId,
      expUnix,
      path: input.path.replace(/^\.\/+/, "").replace(/^\/+/, ""),
    };
    const token = signArtifactToken(secret, payload);
    const base = this.publicBaseUrl().replace(/\/+$/, "");
    const url = `${base}/artifacts/${encodeURIComponent(input.accountId)}/${token}`;
    return { url, expiresAt: new Date(expUnix * 1000).toISOString() };
  }
}
