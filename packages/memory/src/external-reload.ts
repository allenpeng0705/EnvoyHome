// External / human edit detection — Memory Design §7.3, V-MEM-17.
// Before inject and before any standing write, compare mtime + content hash;
// if changed since last load → reload StandingStore (caller applies).

import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";

export interface FileSnapshot {
  path: string;
  /** mtime ms since epoch; 0 if missing */
  mtimeMs: number;
  /** sha256 hex of UTF-8 content; empty if missing */
  hash: string;
  /** Whether the file existed at snapshot time */
  exists: boolean;
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function snapshotFile(
  path: string,
  content: string | null,
): Promise<FileSnapshot> {
  if (content === null) {
    return { path, mtimeMs: 0, hash: "", exists: false };
  }
  let mtimeMs = 0;
  try {
    const st = await stat(path);
    mtimeMs = st.mtimeMs;
  } catch {
    mtimeMs = 0;
  }
  return {
    path,
    mtimeMs,
    hash: hashContent(content),
    exists: true,
  };
}

export function snapshotsEqual(a: FileSnapshot, b: FileSnapshot): boolean {
  if (a.exists !== b.exists) return false;
  if (!a.exists) return true;
  // Prefer content hash; mtime alone can race on coarse filesystems.
  return a.hash === b.hash;
}

export interface StandingSnapshots {
  profile: FileSnapshot;
  memory: FileSnapshot;
  /** Keyed by YYYY-MM-DD */
  dailies: Map<string, FileSnapshot>;
}

export function emptyStandingSnapshots(): StandingSnapshots {
  return {
    profile: { path: "", mtimeMs: 0, hash: "", exists: false },
    memory: { path: "", mtimeMs: 0, hash: "", exists: false },
    dailies: new Map(),
  };
}

/**
 * True when disk has diverged from the in-memory snapshot for any standing asset.
 */
export function standingChanged(
  previous: StandingSnapshots,
  next: StandingSnapshots,
): boolean {
  if (!snapshotsEqual(previous.profile, next.profile)) return true;
  if (!snapshotsEqual(previous.memory, next.memory)) return true;
  const keys = new Set([...previous.dailies.keys(), ...next.dailies.keys()]);
  for (const k of keys) {
    const a = previous.dailies.get(k) ?? {
      path: "",
      mtimeMs: 0,
      hash: "",
      exists: false,
    };
    const b = next.dailies.get(k) ?? {
      path: "",
      mtimeMs: 0,
      hash: "",
      exists: false,
    };
    if (!snapshotsEqual(a, b)) return true;
  }
  return false;
}

export class ExternalEditWarning extends Error {
  override readonly name = "ExternalEditWarning";
  readonly code = "memory.external_edit" as const;
  constructor(
    message: string,
    readonly paths: string[],
  ) {
    super(message);
  }
}
