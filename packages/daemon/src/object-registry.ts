// Smart-home object registry — Design §5.7.3 (daemon-observed sources).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { SourceDescriptor } from "@envoyhome/channel-api";
import { PRESENCE_REVEALING_CLASSES, type ObjectClass } from "@envoyhome/protocol";
import { homePaths, type HomePaths } from "./home-paths.js";

export class ObjectRegistryError extends Error {
  override readonly name = "ObjectRegistryError";
  constructor(
    readonly code:
      | "object_unknown"
      | "object_not_shareable"
      | "class_demotion_refused"
      | "not_found",
    message: string,
  ) {
    super(message);
  }
}

const CLASS_RANK: Record<string, number> = {
  other: 0,
  sensor: 0,
  light: 1,
  switch: 1,
  climate: 1,
  camera: 2,
  presence: 2,
  garage: 3,
  gate: 3,
  valve: 3,
  lock: 4,
  alarm: 4,
};

function classRank(cls: string): number {
  return CLASS_RANK[cls] ?? 0;
}

export function wireSourceRecord(rec: ObjectRecord) {
  return {
    channel: rec.channel,
    channelAccount: rec.channelAccount,
    sourceId: rec.sourceId,
    displayName: rec.displayName,
    class: rec.class,
    accountId: rec.accountId,
    bound: rec.bound,
    shared: rec.shared,
    neverUnattended: rec.neverUnattended,
    actuationAllowList: [...rec.actuationAllowList],
    indirectionAllowList: [...rec.indirectionAllowList],
    firstSeen: rec.firstSeen,
    lastSeen: rec.lastSeen,
  };
}

export interface ObjectRecord {
  channel: string;
  channelAccount: string;
  sourceId: string;
  displayName: string;
  class: string;
  accountId: string | null;
  bound: boolean;
  shared: boolean;
  neverUnattended: boolean;
  actuationAllowList: string[];
  indirectionAllowList: string[];
  firstSeen: string;
  lastSeen: string;
}

interface ObjectsFile {
  version: 1;
  objects: ObjectRecord[];
}

export class ObjectRegistry {
  readonly paths: HomePaths;
  private cache: ObjectRecord[] | null = null;

  constructor(stateDir: string) {
    this.paths = homePaths(stateDir);
  }

  private async load(): Promise<ObjectRecord[]> {
    if (this.cache) return this.cache;
    await mkdir(this.paths.stateDir, { recursive: true });
    try {
      const raw = JSON.parse(await readFile(this.paths.objectsJson, "utf8")) as ObjectsFile;
      this.cache = Array.isArray(raw.objects) ? raw.objects : [];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private async save(objects: ObjectRecord[]): Promise<void> {
    const body: ObjectsFile = { version: 1, objects };
    await writeFile(this.paths.objectsJson, JSON.stringify(body, null, 2) + "\n", "utf8");
    this.cache = objects;
  }

  async list(filter: {
    channel?: string;
    channelAccount?: string;
    accountId?: string;
    bound?: boolean;
  } = {}): Promise<ObjectRecord[]> {
    const all = await this.load();
    return all.filter((o) => {
      if (filter.channel !== undefined && o.channel !== filter.channel) return false;
      if (filter.channelAccount !== undefined && o.channelAccount !== filter.channelAccount) {
        return false;
      }
      if (filter.accountId !== undefined && o.accountId !== filter.accountId) return false;
      if (filter.bound === true && !o.bound) return false;
      if (filter.bound === false && o.bound) return false;
      return true;
    });
  }

  /**
   * Upsert plugin-registered inventory for an authenticated instance.
   * Descriptor class may only escalate (B14 enforces fully; here we merge naïvely).
   */
  async registerSources(
    channel: string,
    channelAccount: string,
    descriptors: SourceDescriptor[],
  ): Promise<void> {
    const all = await this.load();
    const now = new Date().toISOString();
    for (const d of descriptors) {
      const idx = all.findIndex(
        (o) =>
          o.channel === channel &&
          o.channelAccount === channelAccount &&
          o.sourceId === d.sourceId,
      );
      if (idx >= 0) {
        const prev = all[idx]!;
        all[idx] = {
          ...prev,
          displayName: d.displayName || prev.displayName,
          class: d.class || prev.class,
          lastSeen: now,
        };
        continue;
      }
      all.push({
        channel,
        channelAccount,
        sourceId: d.sourceId,
        displayName: d.displayName,
        class: d.class,
        accountId: null,
        bound: false,
        shared: false,
        neverUnattended: false,
        actuationAllowList: [],
        indirectionAllowList: [],
        firstSeen: now,
        lastSeen: now,
      });
    }
    await this.save(all);
  }

  async touchUnbound(channel: string, channelAccount: string, sourceId: string): Promise<void> {
    const all = await this.load();
    const idx = all.findIndex(
      (o) =>
        o.channel === channel && o.channelAccount === channelAccount && o.sourceId === sourceId,
    );
    if (idx < 0) return;
    all[idx]!.lastSeen = new Date().toISOString();
    await this.save(all);
  }

  async get(
    channel: string,
    channelAccount: string,
    sourceId: string,
  ): Promise<ObjectRecord | undefined> {
    const all = await this.load();
    return all.find(
      (o) =>
        o.channel === channel && o.channelAccount === channelAccount && o.sourceId === sourceId,
    );
  }

  async setSourceBinding(input: {
    channel: string;
    channelAccount: string;
    sourceId: string;
    accountId: string | null;
    class?: string;
    shared?: boolean;
    neverUnattended?: boolean;
    actuationAllowList?: string[];
    indirectionAllowList?: string[];
    displayName?: string;
  }): Promise<ObjectRecord> {
    const all = await this.load();
    const idx = all.findIndex(
      (o) =>
        o.channel === input.channel &&
        o.channelAccount === input.channelAccount &&
        o.sourceId === input.sourceId,
    );
    if (idx < 0) {
      throw new ObjectRegistryError(
        "object_unknown",
        `envoyhome.object_unknown: ${input.sourceId}`,
      );
    }
    const prev = all[idx]!;
    const nextClass = input.class ?? prev.class;
    if (input.class !== undefined && classRank(nextClass) < classRank(prev.class)) {
      throw new ObjectRegistryError(
        "class_demotion_refused",
        `envoyhome.class_demotion_refused: ${prev.class} → ${nextClass}`,
      );
    }
    const shared = input.shared ?? prev.shared;
    if (
      shared &&
      (PRESENCE_REVEALING_CLASSES as readonly string[]).includes(nextClass as ObjectClass)
    ) {
      throw new ObjectRegistryError(
        "object_not_shareable",
        `envoyhome.object_not_shareable: ${nextClass}`,
      );
    }
    const accountId = input.accountId;
    const now = new Date().toISOString();
    const updated: ObjectRecord = {
      ...prev,
      class: nextClass,
      displayName: input.displayName ?? prev.displayName,
      accountId,
      bound: accountId !== null,
      shared,
      neverUnattended: input.neverUnattended ?? prev.neverUnattended,
      actuationAllowList: input.actuationAllowList ?? prev.actuationAllowList,
      indirectionAllowList: input.indirectionAllowList ?? prev.indirectionAllowList,
      lastSeen: now,
    };
    all[idx] = updated;
    await this.save(all);
    return updated;
  }

  async removeSourceBinding(
    channel: string,
    channelAccount: string,
    sourceId: string,
  ): Promise<void> {
    const all = await this.load();
    const idx = all.findIndex(
      (o) =>
        o.channel === channel && o.channelAccount === channelAccount && o.sourceId === sourceId,
    );
    if (idx < 0) {
      throw new ObjectRegistryError("not_found", `object not registered: ${sourceId}`);
    }
    const prev = all[idx]!;
    all[idx] = {
      ...prev,
      accountId: null,
      bound: false,
      shared: false,
      lastSeen: new Date().toISOString(),
    };
    await this.save(all);
  }
}
