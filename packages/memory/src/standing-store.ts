// StandingStore — sole writer of L1 profile / L2 MEMORY.md / L3 daily
// (Memory Design §5.3). B5 only; flush/LearnQueue land in B8.

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  emptyStandingSnapshots,
  snapshotFile,
  standingChanged,
  type StandingSnapshots,
} from "./external-reload.js";
import {
  appendDailyLine,
  appendToMemoryMd,
  forgetMatchingLines,
  todayIsoDate,
  yesterdayIsoDate,
} from "./notes.js";
import {
  applyProfileUpdate,
  emptyProfile,
  parseProfile,
  stringifyProfile,
  toWireProfile,
  type ProfileDocument,
  type ProfileFactSource,
  type ProfileFactValue,
  type ProfileTrust,
} from "./profile.js";
import { isDailyNoteFilename } from "./recall-fts.js";
import { withAccountLock } from "./writer-lock.js";

export interface StandingPaths {
  accountRoot: string;
  profile: string;
  memory: string;
  memoryDir: string;
  daily(date: string): string;
  compactDir: string;
}

export function standingPaths(accountRoot: string): StandingPaths {
  const memoryDir = join(accountRoot, "memory");
  return {
    accountRoot,
    profile: join(accountRoot, "profile.json"),
    memory: join(accountRoot, "MEMORY.md"),
    memoryDir,
    daily: (date: string) => join(memoryDir, `${date}.md`),
    compactDir: join(memoryDir, "compact"),
  };
}

export interface LoadedStanding {
  profile: ProfileDocument;
  memoryMd: string;
  dailies: Map<string, string>;
  snapshots: StandingSnapshots;
  generation: number;
  /** Set when an external edit was detected during a write (V-MEM-17). */
  externalEditWarning?: string;
}

export class StandingStore {
  private cache = new Map<string, LoadedStanding>();

  constructor(readonly stateDir: string) {}

  accountRoot(accountId: string): string {
    return join(this.stateDir, "accounts", accountId);
  }

  paths(accountId: string): StandingPaths {
    return standingPaths(this.accountRoot(accountId));
  }

  /** Force drop cache (Settings "Reload standing"). */
  invalidate(accountId: string): void {
    this.cache.delete(accountId);
  }

  generation(accountId: string): number {
    return this.cache.get(accountId)?.generation ?? 0;
  }

  async ensureAccountLayout(accountId: string): Promise<void> {
    const p = this.paths(accountId);
    await mkdir(p.accountRoot, { recursive: true });
    await mkdir(p.memoryDir, { recursive: true });
    await mkdir(p.compactDir, { recursive: true });
  }

  /**
   * Load standing files, reloading when mtime/hash diverges (V-MEM-17).
   * Always safe to call outside the lock for read paths; writers call
   * `loadInsideLock` after acquiring the writer lock.
   */
  async load(accountId: string, opts?: { force?: boolean }): Promise<LoadedStanding> {
    return withAccountLock(accountId, this.accountRoot(accountId), () =>
      this.loadInsideLock(accountId, opts),
    );
  }

  async loadInsideLock(
    accountId: string,
    opts?: { force?: boolean },
  ): Promise<LoadedStanding> {
    await this.ensureAccountLayout(accountId);
    const cached = this.cache.get(accountId);
    if (cached && !opts?.force) {
      const fresh = await this.readSnapshots(accountId, cached);
      if (!standingChanged(cached.snapshots, fresh.snapshots)) {
        return cached;
      }
      // External edit detected — reload.
    }
    return this.readAll(accountId, cached?.generation ?? 0);
  }

  private async readAll(accountId: string, generation: number): Promise<LoadedStanding> {
    const p = this.paths(accountId);
    const profileRaw = await readTextOrNull(p.profile);
    const memoryRaw = await readTextOrNull(p.memory);
    const profile = profileRaw ? parseProfile(profileRaw) : emptyProfile();
    const memoryMd = memoryRaw ?? "# MEMORY\n";

    const dailies = new Map<string, string>();
    let names: string[] = [];
    try {
      names = await readdir(p.memoryDir);
    } catch {
      names = [];
    }
    for (const name of names) {
      if (!isDailyNoteFilename(name)) continue;
      const date = name.replace(/\.md$/, "");
      const content = await readTextOrNull(p.daily(date));
      if (content !== null) dailies.set(date, content);
    }

    const snapshots = await this.buildSnapshots(p, profileRaw, memoryRaw, dailies);
    const loaded: LoadedStanding = {
      profile,
      memoryMd,
      dailies,
      snapshots,
      generation,
    };
    this.cache.set(accountId, loaded);
    return loaded;
  }

  private async readSnapshots(
    accountId: string,
    cached: LoadedStanding,
  ): Promise<LoadedStanding> {
    const p = this.paths(accountId);
    const profileRaw = await readTextOrNull(p.profile);
    const memoryRaw = await readTextOrNull(p.memory);
    const dailies = new Map<string, string>();
    for (const [date] of cached.dailies) {
      const content = await readTextOrNull(p.daily(date));
      if (content !== null) dailies.set(date, content);
    }
    // Also pick up newly created daily files.
    try {
      for (const name of await readdir(p.memoryDir)) {
        if (!isDailyNoteFilename(name)) continue;
        const date = name.replace(/\.md$/, "");
        if (dailies.has(date)) continue;
        const content = await readTextOrNull(p.daily(date));
        if (content !== null) dailies.set(date, content);
      }
    } catch {
      /* empty */
    }
    const snapshots = await this.buildSnapshots(p, profileRaw, memoryRaw, dailies);
    return {
      profile: profileRaw ? parseProfile(profileRaw) : emptyProfile(),
      memoryMd: memoryRaw ?? "# MEMORY\n",
      dailies,
      snapshots,
      generation: cached.generation,
    };
  }

  private async buildSnapshots(
    p: StandingPaths,
    profileRaw: string | null,
    memoryRaw: string | null,
    dailies: Map<string, string>,
  ): Promise<StandingSnapshots> {
    const snaps = emptyStandingSnapshots();
    snaps.profile = await snapshotFile(p.profile, profileRaw);
    snaps.memory = await snapshotFile(p.memory, memoryRaw);
    for (const [date, content] of dailies) {
      snaps.dailies.set(date, await snapshotFile(p.daily(date), content));
    }
    return snaps;
  }

  async getProfile(accountId: string, keys?: string[]) {
    const loaded = await this.load(accountId);
    const wire = toWireProfile(loaded.profile);
    if (keys && keys.length > 0) {
      const filtered: typeof wire.facts = {};
      for (const k of keys) {
        if (k in wire.facts) filtered[k] = wire.facts[k]!;
      }
      return { ...wire, facts: filtered };
    }
    return wire;
  }

  async updateProfile(
    accountId: string,
    opts: {
      set?: Record<string, ProfileFactValue>;
      removeKeys?: string[];
      source?: ProfileFactSource;
      trust?: ProfileTrust;
    },
  ) {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
      const before = await this.loadInsideLock(accountId);
      // Re-check disk inside the lock (V-MEM-17).
      const loaded = await this.loadInsideLock(accountId, { force: false });
      let warning: string | undefined;
      if (standingChanged(before.snapshots, loaded.snapshots)) {
        warning = "external standing edit detected; reloaded before profile write";
      }
      // Second force reload if hash moved under us between the two loads.
      const current = await this.loadInsideLock(accountId, { force: true });
      if (
        current.snapshots.memory.hash !== loaded.snapshots.memory.hash ||
        current.snapshots.profile.hash !== loaded.snapshots.profile.hash
      ) {
        warning =
          "external standing edit detected during profile write (last-writer-wins)";
      }

      const next = applyProfileUpdate(current.profile, opts);
      await writeFile(this.paths(accountId).profile, stringifyProfile(next), "utf8");
      const refreshed = await this.readAll(accountId, current.generation + 1);
      if (warning) refreshed.externalEditWarning = warning;
      this.cache.set(accountId, refreshed);
      return toWireProfile(refreshed.profile);
    });
  }

  async appendMemory(
    accountId: string,
    text: string,
    sectionHeading = "## Standing",
  ): Promise<LoadedStanding> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
      const current = await this.loadInsideLock(accountId, { force: true });
      let warning: string | undefined;
      const prior = this.cache.get(accountId);
      if (prior && standingChanged(prior.snapshots, current.snapshots)) {
        warning =
          "external MEMORY.md edit detected; reloaded before append (last-writer-wins)";
      }
      const nextMd = appendToMemoryMd(current.memoryMd, text, sectionHeading);
      await writeFile(this.paths(accountId).memory, nextMd.endsWith("\n") ? nextMd : nextMd + "\n", "utf8");
      const refreshed = await this.readAll(accountId, current.generation + 1);
      if (warning) refreshed.externalEditWarning = warning;
      this.cache.set(accountId, refreshed);
      return refreshed;
    });
  }

  async appendDaily(accountId: string, text: string, now = new Date()): Promise<LoadedStanding> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
      const current = await this.loadInsideLock(accountId, { force: true });
      const date = todayIsoDate(now);
      const p = this.paths(accountId);
      const existing = current.dailies.get(date) ?? "";
      const next = appendDailyLine(existing, text);
      await writeFile(p.daily(date), next, "utf8");
      const refreshed = await this.readAll(accountId, current.generation + 1);
      this.cache.set(accountId, refreshed);
      return refreshed;
    });
  }

  async forgetProfileKey(accountId: string, key: string): Promise<string[]> {
    await this.updateProfile(accountId, { removeKeys: [key] });
    return [key];
  }

  async forgetNote(
    accountId: string,
    opts: { path?: string; query?: string },
  ): Promise<string[]> {
    return withAccountLock(accountId, this.accountRoot(accountId), async () => {
      const current = await this.loadInsideLock(accountId, { force: true });
      const removed: string[] = [];
      const p = this.paths(accountId);
      const query = opts.query ?? "";

      const targets: Array<{ rel: string; abs: string; content: string }> = [];
      if (opts.path) {
        const rel = opts.path.replace(/\\/g, "/");
        if (rel === "MEMORY.md") {
          targets.push({ rel, abs: p.memory, content: current.memoryMd });
        } else if (rel.startsWith("memory/") && isDailyNoteFilename(rel.slice("memory/".length))) {
          const date = rel.slice("memory/".length).replace(/\.md$/, "");
          targets.push({
            rel,
            abs: p.daily(date),
            content: current.dailies.get(date) ?? "",
          });
        }
      } else {
        targets.push({ rel: "MEMORY.md", abs: p.memory, content: current.memoryMd });
        for (const [date, content] of current.dailies) {
          targets.push({
            rel: `memory/${date}.md`,
            abs: p.daily(date),
            content,
          });
        }
      }

      for (const t of targets) {
        const result = forgetMatchingLines(t.content, query || (opts.path ? "" : query));
        // When only path is set with no query, clear the file contents (keep heading for MEMORY).
        if (!query && opts.path) {
          const cleared = t.rel === "MEMORY.md" ? "# MEMORY\n" : "";
          await writeFile(t.abs, cleared, "utf8");
          removed.push(t.rel);
          continue;
        }
        if (result.removed.length > 0) {
          await writeFile(t.abs, result.next.endsWith("\n") ? result.next : result.next + "\n", "utf8");
          removed.push(...result.removed);
        }
      }

      const refreshed = await this.readAll(accountId, current.generation + 1);
      this.cache.set(accountId, refreshed);
      return removed;
    });
  }

  dailyContent(loaded: LoadedStanding, date: string): string {
    return loaded.dailies.get(date) ?? "";
  }

  todayYesterday(loaded: LoadedStanding, now = new Date()): {
    today: string;
    yesterday: string;
    todayContent: string;
    yesterdayContent: string;
  } {
    const today = todayIsoDate(now);
    const yesterday = yesterdayIsoDate(now);
    return {
      today,
      yesterday,
      todayContent: loaded.dailies.get(today) ?? "",
      yesterdayContent: loaded.dailies.get(yesterday) ?? "",
    };
  }
}

async function readTextOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}
