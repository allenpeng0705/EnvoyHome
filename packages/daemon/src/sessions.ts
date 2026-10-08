// Chat session store — Design §4.2 `accounts/<id>/sessions/`.

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HomePaths } from "./home-paths.js";

export interface SessionMeta {
  sessionId: string;
  accountId: string;
  agentId: string;
  title?: string;
  channel?: string;
  createdAt: string;
  updatedAt: string;
}

export class SessionStore {
  constructor(private readonly paths: HomePaths) {}

  private sessionsDir(accountId: string): string {
    return join(this.paths.accountRoot(accountId), "sessions");
  }

  private metaPath(accountId: string, sessionId: string): string {
    return join(this.sessionsDir(accountId), sessionId, "meta.json");
  }

  sessionDir(accountId: string, sessionId: string): string {
    return join(this.sessionsDir(accountId), sessionId);
  }

  async open(input: {
    accountId: string;
    agentId?: string;
    title?: string;
    channel?: string;
  }): Promise<SessionMeta> {
    const now = new Date().toISOString();
    const sessionId = randomUUID();
    const meta: SessionMeta = {
      sessionId,
      accountId: input.accountId,
      agentId: input.agentId ?? "default",
      createdAt: now,
      updatedAt: now,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
    };
    const dir = this.sessionDir(input.accountId, sessionId);
    await mkdir(dir, { recursive: true });
    await writeFile(this.metaPath(input.accountId, sessionId), JSON.stringify(meta, null, 2), "utf8");
    return meta;
  }

  async get(accountId: string, sessionId: string): Promise<SessionMeta | undefined> {
    try {
      return JSON.parse(await readFile(this.metaPath(accountId, sessionId), "utf8")) as SessionMeta;
    } catch {
      return undefined;
    }
  }

  async touch(accountId: string, sessionId: string): Promise<void> {
    const meta = await this.get(accountId, sessionId);
    if (!meta) return;
    meta.updatedAt = new Date().toISOString();
    await writeFile(this.metaPath(accountId, sessionId), JSON.stringify(meta, null, 2), "utf8");
  }

  async list(accountId: string): Promise<SessionMeta[]> {
    const dir = this.sessionsDir(accountId);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }
    const out: SessionMeta[] = [];
    for (const sessionId of names) {
      const meta = await this.get(accountId, sessionId);
      if (meta) out.push(meta);
    }
    return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }
}
