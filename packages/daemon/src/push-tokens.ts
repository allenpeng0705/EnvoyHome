// Durable APNs/FCM device tokens for paired thin clients (V-P2-MOB-1 push).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { HomePaths } from "./home-paths.js";

export type PushPlatform = "ios" | "android";
export type PushTokenType = "alert";

export interface PushTokenRecord {
  deviceId: string;
  platform: PushPlatform;
  token: string;
  tokenType: PushTokenType;
  accountIds: string[];
  updatedAt: string;
}

export class PushTokenStore {
  private cache: Map<string, PushTokenRecord> | null = null;

  constructor(private readonly paths: HomePaths) {}

  private filePath(): string {
    return join(this.paths.pairedDevicesDir, "push-tokens.json");
  }

  private async load(): Promise<Map<string, PushTokenRecord>> {
    if (this.cache) return this.cache;
    const map = new Map<string, PushTokenRecord>();
    try {
      const raw = JSON.parse(await readFile(this.filePath(), "utf8")) as {
        tokens?: PushTokenRecord[];
      };
      for (const row of raw.tokens ?? []) {
        if (row?.deviceId && row.token) map.set(row.deviceId, row);
      }
    } catch {
      // missing / corrupt → empty
    }
    this.cache = map;
    return map;
  }

  private async persist(map: Map<string, PushTokenRecord>): Promise<void> {
    const path = this.filePath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({ tokens: [...map.values()] }, null, 2),
      "utf8",
    );
    this.cache = map;
  }

  async register(input: {
    deviceId: string;
    platform: PushPlatform;
    token: string;
    tokenType?: PushTokenType;
    accountIds?: string[];
  }): Promise<PushTokenRecord> {
    const map = await this.load();
    const next: PushTokenRecord = {
      deviceId: input.deviceId,
      platform: input.platform,
      token: input.token,
      tokenType: input.tokenType ?? "alert",
      accountIds: input.accountIds ?? [],
      updatedAt: new Date().toISOString(),
    };
    map.set(input.deviceId, next);
    await this.persist(map);
    return next;
  }

  async unregister(deviceId: string): Promise<boolean> {
    const map = await this.load();
    const had = map.delete(deviceId);
    if (had) await this.persist(map);
    return had;
  }

  async list(): Promise<PushTokenRecord[]> {
    return [...(await this.load()).values()];
  }

  async get(deviceId: string): Promise<PushTokenRecord | undefined> {
    return (await this.load()).get(deviceId);
  }
}
