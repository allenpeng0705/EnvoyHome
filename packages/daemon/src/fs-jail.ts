// Path-jail chokepoint — Design §4.2 / Appendix C.3 / Plan B3.
// Tools and RPC handlers resolve sandbox paths ONLY through safeJoin.

import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, normalize, resolve, sep } from "node:path";

export class PathJailError extends Error {
  readonly code = "path_jail" as const;
  constructor(message: string) {
    super(message);
    this.name = "PathJailError";
  }
}

const WIN_ABS = /^[A-Za-z]:[\\/]/;
const WIN_UNC = /^\\\\/;

function isPosixRoot(root: string): boolean {
  // A POSIX absolute root starts with `/` and is not a Windows drive path.
  return root.startsWith("/") && !WIN_ABS.test(root);
}

function rootPrefix(root: string): string {
  const abs = resolve(root);
  return abs.endsWith(sep) ? abs : abs + sep;
}

function assertNoNullByte(path: string): void {
  if (path.includes("\0")) {
    throw new PathJailError("null byte in path");
  }
}

/**
 * Reject Windows absolute / UNC paths when the jail root is POSIX
 * (Appendix C.3: `C:\…` when root is POSIX).
 */
function assertNoCrossPlatformAbsolute(root: string, userPath: string): void {
  if (!isPosixRoot(root)) return;
  if (WIN_ABS.test(userPath) || WIN_UNC.test(userPath)) {
    throw new PathJailError("Windows absolute path refused under POSIX root");
  }
}

/**
 * Ensure `candidate` is exactly `root` or a path under it (string prefix after resolve).
 */
function assertUnderRoot(root: string, candidate: string): void {
  const absRoot = resolve(root);
  const absCand = resolve(candidate);
  if (absCand === absRoot) return;
  const prefix = rootPrefix(absRoot);
  if (!absCand.startsWith(prefix)) {
    throw new PathJailError(`path escapes jail root: ${userPathHint(candidate)}`);
  }
}

function userPathHint(p: string): string {
  return p.length > 120 ? `${p.slice(0, 117)}…` : p;
}

/**
 * Walk each existing component of `candidate` with lstat. If a symlink's
 * real target leaves the jail, refuse. v1: do not follow symlinks out of jail
 * (Appendix C.3).
 */
function assertNoSymlinkEscape(root: string, candidate: string): void {
  const absRoot = resolve(root);
  const absCand = resolve(candidate);
  const prefix = rootPrefix(absRoot);

  // Walk from root toward the candidate, checking each existing segment.
  const rel = absCand.startsWith(prefix)
    ? absCand.slice(prefix.length)
    : absCand === absRoot
      ? ""
      : null;
  if (rel === null) {
    throw new PathJailError(`path escapes jail root: ${userPathHint(candidate)}`);
  }

  let cursor = absRoot;
  if (rel.length === 0) return;

  const parts = rel.split(sep).filter((p) => p.length > 0);
  for (const part of parts) {
    cursor = resolve(cursor, part);
    let st;
    try {
      st = lstatSync(cursor);
    } catch {
      // Remainder does not exist yet — OK for create paths; no further links.
      return;
    }
    if (st.isSymbolicLink()) {
      let real: string;
      try {
        real = realpathSync(cursor);
      } catch {
        throw new PathJailError("symlink target unreadable");
      }
      assertUnderRoot(absRoot, real);
    }
  }
}

/**
 * Resolve `userPath` under `accountRoot`. THE filesystem chokepoint.
 *
 * Rejects: `..` escapes, absolute paths outside root, Windows `C:\` under a
 * POSIX root, null bytes, and symlink escapes (do not follow out of jail).
 */
export function safeJoin(accountRoot: string, userPath: string): string {
  if (typeof userPath !== "string" || userPath.length === 0) {
    throw new PathJailError("path must be a non-empty string");
  }
  assertNoNullByte(userPath);
  assertNoNullByte(accountRoot);
  assertNoCrossPlatformAbsolute(accountRoot, userPath);

  const absRoot = resolve(accountRoot);

  // Absolute user paths are only legal when they already sit under the root.
  if (isAbsolute(userPath) || WIN_ABS.test(userPath) || WIN_UNC.test(userPath)) {
    const absUser = resolve(userPath);
    assertUnderRoot(absRoot, absUser);
    assertNoSymlinkEscape(absRoot, absUser);
    return absUser;
  }

  // Normalize relative segments without resolving against cwd.
  const normalized = normalize(userPath);
  if (normalized === ".." || normalized.startsWith(`..${sep}`)) {
    // Fast reject for leading `..` (still double-checked via resolve below).
    // Examples: `../b/files/x`, `../../share/../a`
  }

  const joined = resolve(absRoot, normalized);
  assertUnderRoot(absRoot, joined);
  assertNoSymlinkEscape(absRoot, joined);
  return joined;
}

/**
 * V-SEC-4: resolve a tool path that may be account-private (`files/…`) or the
 * intentional cross-account `share/` tree. Writes outside `share/` into another
 * account are refused; share writes require `shareWrite: true`.
 */
export function resolveSandboxPath(input: {
  accountFilesRoot: string;
  shareRoot: string;
  /** Relative path as tools see it, e.g. `documents/a.txt` or `share/note.md`. */
  path: string;
  write: boolean;
  /** Explicit policy flag required for any write under share/ (V-SEC-4). */
  shareWrite?: boolean;
}): { absolute: string; area: "account" | "share" } {
  const { path: userPath, write } = input;
  assertNoNullByte(userPath);

  const trimmed = userPath.replace(/^\.\/+/, "");
  const sharePrefix = trimmed === "share" || trimmed.startsWith(`share${sep}`) || trimmed.startsWith("share/");

  if (sharePrefix) {
    if (write && input.shareWrite !== true) {
      throw new PathJailError("share/ write requires explicit policy (shareWrite)");
    }
    const under = trimmed === "share" ? "." : trimmed.slice("share/".length).replace(/^\/+/, "");
    const absolute = under === "." || under.length === 0
      ? resolve(input.shareRoot)
      : safeJoin(input.shareRoot, under);
    return { absolute, area: "share" };
  }

  const absolute = safeJoin(input.accountFilesRoot, trimmed);
  return { absolute, area: "account" };
}
