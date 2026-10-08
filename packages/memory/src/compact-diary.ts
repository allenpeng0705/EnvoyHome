// COMPACT.md diary + rotate into memory/compact/ (Memory Design §9).
// Rotated archives are excluded from L3 recall corpus (V-MEM-13 / B8 acceptance).

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const COMPACT_MAX_ENTRIES = 20;
export const COMPACT_MAX_CHARS = 20_000;

const ENTRY_SEP = "\n---\n";

export interface CompactEntry {
  at: string;
  summary: string;
  pendingLearnIds: string[];
}

export class CompactDiary {
  constructor(
    private readonly paths: (accountId: string) => {
      compactMd: string;
      compactDir: string;
    },
  ) {}

  async append(
    accountId: string,
    entry: CompactEntry,
  ): Promise<{ compactSummaryPath: string; rotated: boolean }> {
    const p = this.paths(accountId);
    await mkdir(p.compactDir, { recursive: true });
    let existing = "";
    try {
      existing = await readFile(p.compactMd, "utf8");
    } catch {
      existing = "";
    }

    const block = formatEntry(entry);
    const next = existing.trim() ? `${existing.trimEnd()}${ENTRY_SEP}${block}` : block;
    const { text, rotated } = await this.rotateIfNeeded(accountId, next);
    await writeFile(p.compactMd, text.endsWith("\n") ? text : text + "\n", "utf8");
    return { compactSummaryPath: "COMPACT.md", rotated };
  }

  async read(accountId: string): Promise<string> {
    try {
      return await readFile(this.paths(accountId).compactMd, "utf8");
    } catch {
      return "";
    }
  }

  private async rotateIfNeeded(
    accountId: string,
    text: string,
  ): Promise<{ text: string; rotated: boolean }> {
    const entries = splitEntries(text);
    const chars = text.length;
    if (entries.length <= COMPACT_MAX_ENTRIES && chars <= COMPACT_MAX_CHARS) {
      return { text, rotated: false };
    }

    // Keep newest N entries / under char budget; archive the rest.
    const keep: string[] = [];
    let budget = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i]!;
      if (keep.length >= COMPACT_MAX_ENTRIES) break;
      if (budget + e.length > COMPACT_MAX_CHARS && keep.length > 0) break;
      keep.unshift(e);
      budget += e.length;
    }
    const archived = entries.slice(0, entries.length - keep.length);
    if (archived.length > 0) {
      const p = this.paths(accountId);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const dest = join(p.compactDir, `compact-${stamp}.md`);
      await writeFile(dest, archived.join(ENTRY_SEP) + "\n", "utf8");
    }
    return { text: keep.join(ENTRY_SEP), rotated: archived.length > 0 };
  }
}

function formatEntry(entry: CompactEntry): string {
  const ids =
    entry.pendingLearnIds.length > 0
      ? `pendingLearnIds: ${entry.pendingLearnIds.join(", ")}`
      : "pendingLearnIds: (none)";
  return `## ${entry.at}\n\n${entry.summary}\n\n${ids}`;
}

function splitEntries(text: string): string[] {
  if (!text.trim()) return [];
  return text.split(ENTRY_SEP).map((s) => s.trim()).filter(Boolean);
}

/** Path helpers for StandingStore layout. */
export function compactPaths(accountRoot: string): {
  compactMd: string;
  compactDir: string;
} {
  return {
    compactMd: join(accountRoot, "COMPACT.md"),
    compactDir: join(accountRoot, "memory", "compact"),
  };
}

/** Test helper: force-rotate by renaming current COMPACT into archive. */
export async function forceArchiveCompact(
  accountRoot: string,
  stamp: string,
): Promise<void> {
  const p = compactPaths(accountRoot);
  await mkdir(p.compactDir, { recursive: true });
  try {
    await rename(p.compactMd, join(p.compactDir, `compact-${stamp}.md`));
  } catch {
    // no current file
  }
}
