// Per-account writer lock — Memory Design §9 rule 7, V-MEM-11.
// Covers flush, consolidate, acceptLearn, and standing tool writes.
// In-process mutex is the authority for async interleaving; an optional
// lock-file marker documents ownership on disk (Plan B5).

import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

type QueueEntry = {
  resolve: () => void;
};

const queues = new Map<string, QueueEntry[]>();
const holders = new Map<string, boolean>();

export class WriterLockError extends Error {
  override readonly name = "WriterLockError";
  constructor(message: string) {
    super(message);
  }
}

/** Absolute path of the per-account lock marker (Design layout: memory/.lock). */
export function lockFilePath(accountRoot: string): string {
  return join(accountRoot, "memory", ".lock");
}

async function markLockFile(accountRoot: string, held: boolean): Promise<void> {
  const path = lockFilePath(accountRoot);
  if (held) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${process.pid}\n${new Date().toISOString()}\n`, "utf8");
  } else {
    await rm(path, { force: true });
  }
}

/**
 * Run `fn` under the per-account mutex. Nested acquires on the same account
 * from the same async chain are not supported — callers must not re-enter.
 */
export async function withAccountLock<T>(
  accountId: string,
  accountRoot: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!accountId) {
    throw new WriterLockError("accountId is required for writer lock");
  }
  // Key by accountRoot so parallel test daemons with the same accountId
  // (e.g. "alice") do not serialize / corrupt each other's state dirs.
  const lockKey = accountRoot || accountId;

  await acquire(lockKey);
  try {
    await markLockFile(accountRoot, true);
    return await fn();
  } finally {
    await markLockFile(accountRoot, false).catch(() => undefined);
    release(lockKey);
  }
}

function acquire(lockKey: string): Promise<void> {
  if (!holders.get(lockKey)) {
    holders.set(lockKey, true);
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const q = queues.get(lockKey) ?? [];
    q.push({ resolve });
    queues.set(lockKey, q);
  });
}

function release(lockKey: string): void {
  const q = queues.get(lockKey);
  if (q && q.length > 0) {
    const next = q.shift()!;
    if (q.length === 0) queues.delete(lockKey);
    else queues.set(lockKey, q);
    next.resolve();
    return;
  }
  holders.delete(lockKey);
}

/** Test helper — clear module-level lock state between suites. */
export function __resetWriterLocksForTests(): void {
  queues.clear();
  holders.clear();
}
