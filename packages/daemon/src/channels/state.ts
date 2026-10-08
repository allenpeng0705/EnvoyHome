import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { homePaths, type HomePaths } from "../home-paths.js";

export interface ChannelStateRow {
  id: string;
  channelAccount: string;
  enabled: boolean;
  config: Record<string, unknown>;
  /** Names of secret fields stored under secretsDir — never plaintext here. */
  secretKeys: string[];
}

interface ChannelsFile {
  version: 1;
  channels: ChannelStateRow[];
}

export class ChannelStateStore {
  readonly paths: HomePaths;
  private cache: ChannelStateRow[] | null = null;

  constructor(stateDir: string) {
    this.paths = homePaths(stateDir);
  }

  private async load(): Promise<ChannelStateRow[]> {
    if (this.cache) return this.cache;
    await mkdir(this.paths.stateDir, { recursive: true });
    try {
      const raw = JSON.parse(await readFile(this.paths.channelsJson, "utf8")) as ChannelsFile;
      this.cache = Array.isArray(raw.channels) ? raw.channels : [];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private async save(channels: ChannelStateRow[]): Promise<void> {
    const body: ChannelsFile = { version: 1, channels };
    await writeFile(this.paths.channelsJson, JSON.stringify(body, null, 2) + "\n", "utf8");
    this.cache = channels;
  }

  async get(id: string): Promise<ChannelStateRow | undefined> {
    const all = await this.load();
    return all.find((c) => c.id === id);
  }

  async upsert(row: ChannelStateRow): Promise<void> {
    const all = await this.load();
    const idx = all.findIndex((c) => c.id === row.id);
    if (idx >= 0) all[idx] = row;
    else all.push(row);
    await this.save(all);
  }

  async list(): Promise<ChannelStateRow[]> {
    return await this.load();
  }

  secretPath(channelId: string, field: string): string {
    const h = createHash("sha256").update(`${channelId}\0${field}`).digest("hex").slice(0, 16);
    return join(this.paths.secretsDir, `channel_${channelId}_${field}_${h}.secret`);
  }
}
