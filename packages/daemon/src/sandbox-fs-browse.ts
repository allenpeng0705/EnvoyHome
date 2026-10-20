// Agent list_dir / search_files — Design §9.5e. Same path jail as read/write.

import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  PathJailError,
  resolveSandboxPath,
  type WorkspaceMode,
  type WorkspaceMountRef,
} from "./fs-jail.js";

/** One-level list cap (aligned with File Explore / V-OUT-4). */
export const LIST_DIR_MAX_ENTRIES = 500;
/** search_files hit cap (Design §9.5e). */
export const SEARCH_FILES_MAX_HITS = 100;
/** Bound walk so whole-machine workspace/ cannot hang the daemon. */
export const SEARCH_FILES_MAX_VISIT = 2000;
export const SEARCH_FILES_DEFAULT_DEPTH = 4;
export const SEARCH_FILES_MAX_DEPTH = 8;

const SANDBOX_SEARCH_ROOTS = ["documents", "output", "knowledge", "uploads"] as const;

const SKIP_DIR_NAMES = new Set(["node_modules", ".git", ".hg", ".svn", "__pycache__"]);

export type BrowseWorkspaceOpts = {
  accountFilesRoot: string;
  shareRoot: string;
  workspaceMounts?: WorkspaceMountRef[] | null;
  workspaceRoot?: string | null;
  workspaceMode?: WorkspaceMode | null;
};

export type BrowseEntry = {
  name: string;
  kind: "dir" | "file";
  path: string;
  size?: number;
};

export type ListDirResult = {
  path: string;
  roots: string[];
  entries: BrowseEntry[];
  truncated?: boolean;
};

export type SearchHit = {
  name: string;
  kind: "dir" | "file";
  path: string;
};

export type SearchFilesResult = {
  pattern: string;
  path: string;
  hits: SearchHit[];
  truncated?: boolean;
  visited?: number;
};

function normalizeRel(relPath: string): string {
  return relPath
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");
}

function refuseShare(rel: string): void {
  const t = normalizeRel(rel);
  if (t === "share" || t.startsWith("share/")) {
    throw new PathJailError("share/ browse deferred (Design §4.2 / §9.5e)");
  }
}

function effectiveMounts(ws: BrowseWorkspaceOpts): WorkspaceMountRef[] {
  if (Array.isArray(ws.workspaceMounts) && ws.workspaceMounts.length > 0) {
    return ws.workspaceMounts.filter((m) => m && typeof m.id === "string" && m.hostPath);
  }
  if (ws.workspaceRoot?.trim()) {
    return [
      {
        id: "default",
        hostPath: ws.workspaceRoot.trim(),
        mode: ws.workspaceMode === "rw" ? "rw" : "ro",
      },
    ];
  }
  return [];
}

function syntheticRoots(mounts: WorkspaceMountRef[]): string[] {
  const roots: string[] = [...SANDBOX_SEARCH_ROOTS];
  if (mounts.length > 0) roots.push("workspace");
  return roots;
}

function resolveOpts(ws: BrowseWorkspaceOpts, path: string, write = false) {
  const mounts = effectiveMounts(ws);
  const primary = mounts[0];
  return resolveSandboxPath({
    accountFilesRoot: ws.accountFilesRoot,
    shareRoot: ws.shareRoot,
    path,
    write,
    workspaceMounts: mounts,
    workspaceRoot: primary?.hostPath ?? null,
    workspaceMode: primary?.mode ?? null,
  });
}

/** Basename glob (`*` / `?`) or case-insensitive substring when no meta chars. */
export function compileBasenameMatcher(pattern: string): (name: string) => boolean {
  const p = pattern.trim();
  if (!p) {
    throw Object.assign(new Error("envoyhome.bad_params: pattern required"), {
      code: "bad_params",
    });
  }
  if (/[*?]/.test(p)) {
    const esc = p
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    const re = new RegExp(`^${esc}$`, "i");
    return (name) => re.test(name);
  }
  const needle = p.toLowerCase();
  return (name) => name.toLowerCase().includes(needle);
}

function shouldSkipDirName(name: string): boolean {
  if (name === "." || name === "..") return true;
  if (name.startsWith(".")) return true;
  return SKIP_DIR_NAMES.has(name);
}

/**
 * One-level directory list through the path jail (Design §9.5e).
 * Empty `path` → synthetic roots (same tops as File Explore).
 */
export async function listSandboxDir(
  ws: BrowseWorkspaceOpts,
  relPath?: string,
): Promise<ListDirResult> {
  const mounts = effectiveMounts(ws);
  const roots = syntheticRoots(mounts);
  const trimmed = normalizeRel(relPath ?? "");

  if (!trimmed) {
    const entries: BrowseEntry[] = roots.map((name) => ({
      name,
      kind: "dir",
      path: name,
    }));
    return { path: "", roots, entries };
  }

  refuseShare(trimmed);

  // Multi-mount: list mount ids under virtual workspace/ before host readdir.
  if (trimmed === "workspace" && mounts.length > 1) {
    const entries: BrowseEntry[] = mounts.map((m) => ({
      name: m.id,
      kind: "dir",
      path: `workspace/${m.id}`,
    }));
    return { path: trimmed, roots, entries };
  }

  const { absolute } = resolveOpts(ws, trimmed, false);
  let st;
  try {
    st = await stat(absolute);
  } catch (err) {
    throw Object.assign(
      new Error(
        `envoyhome.not_found: directory not found: ${trimmed}${
          err instanceof Error && err.message ? ` (${err.message})` : ""
        }`,
      ),
      { code: "not_found" },
    );
  }
  if (!st.isDirectory()) {
    throw Object.assign(new Error(`envoyhome.bad_params: not a directory: ${trimmed}`), {
      code: "bad_params",
    });
  }

  let names: string[];
  try {
    names = await readdir(absolute);
  } catch (err) {
    throw Object.assign(
      new Error(
        `envoyhome.bad_params: cannot list: ${trimmed}${
          err instanceof Error && err.message ? ` (${err.message})` : ""
        }`,
      ),
      { code: "bad_params" },
    );
  }

  const entries: BrowseEntry[] = [];
  let truncated = false;
  for (const name of names) {
    if (entries.length >= LIST_DIR_MAX_ENTRIES) {
      truncated = true;
      break;
    }
    if (name === "." || name === ".." || name.startsWith(".")) continue;
    const childAbs = join(absolute, name);
    let childSt;
    try {
      childSt = await stat(childAbs);
    } catch {
      continue;
    }
    const childRel = `${trimmed}/${name}`.replace(/\/{2,}/g, "/");
    if (childSt.isDirectory()) {
      entries.push({ name, kind: "dir", path: childRel });
    } else if (childSt.isFile()) {
      entries.push({ name, kind: "file", path: childRel, size: childSt.size });
    }
  }

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const out: ListDirResult = { path: trimmed, roots, entries };
  if (truncated) out.truncated = true;
  return out;
}

type WalkFrame = { rel: string; abs: string; depth: number };

async function searchUnderRoot(
  ws: BrowseWorkspaceOpts,
  rootRel: string,
  match: (name: string) => boolean,
  maxDepth: number,
  state: { hits: SearchHit[]; visited: number; truncated: boolean },
): Promise<void> {
  refuseShare(rootRel);
  let abs: string;
  try {
    abs = resolveOpts(ws, rootRel, false).absolute;
  } catch {
    return;
  }
  let rootSt;
  try {
    rootSt = await stat(abs);
  } catch {
    return;
  }
  if (!rootSt.isDirectory()) {
    // Allow searching a single file path as a degenerate case.
    if (rootSt.isFile() && match(basename(rootRel))) {
      if (state.hits.length < SEARCH_FILES_MAX_HITS) {
        state.hits.push({ name: basename(rootRel), kind: "file", path: rootRel });
      } else {
        state.truncated = true;
      }
    }
    return;
  }

  const queue: WalkFrame[] = [{ rel: rootRel, abs, depth: 0 }];
  while (queue.length > 0) {
    if (state.hits.length >= SEARCH_FILES_MAX_HITS || state.visited >= SEARCH_FILES_MAX_VISIT) {
      state.truncated = true;
      return;
    }
    const frame = queue.shift()!;
    state.visited += 1;
    let names: string[];
    try {
      names = await readdir(frame.abs);
    } catch {
      continue;
    }
    for (const name of names) {
      if (state.hits.length >= SEARCH_FILES_MAX_HITS || state.visited >= SEARCH_FILES_MAX_VISIT) {
        state.truncated = true;
        return;
      }
      if (name === "." || name === "..") continue;
      const childRel =
        frame.rel === "" ? name : `${frame.rel}/${name}`.replace(/\/{2,}/g, "/");
      const childAbs = join(frame.abs, name);
      let childSt;
      try {
        childSt = await stat(childAbs);
      } catch {
        continue;
      }
      if (childSt.isDirectory()) {
        if (shouldSkipDirName(name)) continue;
        if (match(name) && state.hits.length < SEARCH_FILES_MAX_HITS) {
          state.hits.push({ name, kind: "dir", path: childRel });
        }
        if (frame.depth + 1 <= maxDepth) {
          queue.push({ rel: childRel, abs: childAbs, depth: frame.depth + 1 });
        }
        continue;
      }
      if (childSt.isFile()) {
        if (name.startsWith(".")) continue;
        if (match(name)) {
          if (state.hits.length < SEARCH_FILES_MAX_HITS) {
            state.hits.push({ name, kind: "file", path: childRel });
          } else {
            state.truncated = true;
            return;
          }
        }
      }
    }
  }
}

/**
 * Basename search under a virtual path (or default sandbox tops + workspace).
 * Caps prevent whole-machine hangs (Design §9.5e / V-OUT-5).
 */
export async function searchSandboxFiles(
  ws: BrowseWorkspaceOpts,
  input: { pattern: string; path?: string; maxDepth?: number },
): Promise<SearchFilesResult> {
  const match = compileBasenameMatcher(input.pattern);
  const mounts = effectiveMounts(ws);
  let maxDepth =
    typeof input.maxDepth === "number" && Number.isFinite(input.maxDepth)
      ? Math.floor(input.maxDepth)
      : SEARCH_FILES_DEFAULT_DEPTH;
  if (maxDepth < 0) maxDepth = 0;
  if (maxDepth > SEARCH_FILES_MAX_DEPTH) maxDepth = SEARCH_FILES_MAX_DEPTH;

  const trimmed = normalizeRel(input.path ?? "");
  refuseShare(trimmed);

  const state = {
    hits: [] as SearchHit[],
    visited: 0,
    truncated: false,
  };

  if (!trimmed) {
    const roots: string[] = [...SANDBOX_SEARCH_ROOTS];
    if (mounts.length > 1) {
      for (const m of mounts) roots.push(`workspace/${m.id}`);
    } else if (mounts.length === 1) {
      roots.push("workspace");
    }
    for (const root of roots) {
      if (state.truncated) break;
      await searchUnderRoot(ws, root, match, maxDepth, state);
    }
  } else if (trimmed === "workspace" && mounts.length > 1) {
    for (const m of mounts) {
      if (state.truncated) break;
      await searchUnderRoot(ws, `workspace/${m.id}`, match, maxDepth, state);
    }
  } else {
    await searchUnderRoot(ws, trimmed, match, maxDepth, state);
  }

  const out: SearchFilesResult = {
    pattern: input.pattern.trim(),
    path: trimmed,
    hits: state.hits,
    visited: state.visited,
  };
  if (state.truncated) out.truncated = true;
  return out;
}
