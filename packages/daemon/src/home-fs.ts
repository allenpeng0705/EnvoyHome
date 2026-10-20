// Home-node filesystem browse for workspace folder picker (Design §4.2.1).
// Peer: EnvoyMesh packages/node-core/src/home-fs.ts — Owner-scope only.

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir, platform as nodePlatform } from "node:os";
import path from "node:path";

export type HomeFsPlatform = "darwin" | "linux" | "win32" | "other";

export interface HomeFsEntry {
  name: string;
  kind: "dir" | "file";
  path: string;
}

export interface HomeFsInfo {
  platform: HomeFsPlatform;
  pathSep: string;
  homeDir: string;
  roots: string[];
}

export interface ListHomeFsEntriesResult {
  path: string;
  parent?: string;
  entries: HomeFsEntry[];
}

const MAX_HOME_FS_LIST_ENTRIES = 500;

function detectPlatform(): HomeFsPlatform {
  const p = nodePlatform();
  if (p === "darwin" || p === "linux" || p === "win32") return p;
  return "other";
}

export function listWindowsDriveRoots(): string[] {
  const roots: string[] = [];
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i);
    const root = `${letter}:\\`;
    try {
      if (existsSync(root)) roots.push(root);
    } catch {
      /* ignore */
    }
  }
  return roots;
}

export function getHomeFsInfo(): HomeFsInfo {
  const platform = detectPlatform();
  const homeDir = path.resolve(homedir());
  const roots: string[] =
    platform === "win32" ? listWindowsDriveRoots() : ["/"];
  return {
    platform,
    pathSep: path.sep,
    homeDir,
    roots: roots.length > 0 ? roots : platform === "win32" ? ["C:\\"] : ["/"],
  };
}

/**
 * Default “whole computer” workspace root for Owner (Design §4.2.1 R3).
 * Windows: prefer `C:\` when present, else first enumerated drive.
 * POSIX: `/`.
 */
export function defaultComputerRoot(info?: HomeFsInfo): string {
  const i = info ?? getHomeFsInfo();
  if (i.platform === "win32") {
    const c = i.roots.find((r) => /^C:[\\/]?$/i.test(r.trim()));
    return c ?? i.roots[0] ?? "C:\\";
  }
  return i.roots[0] ?? "/";
}

export function resolveHomeFsDirectory(
  projectPath: string | undefined | null,
): string | null {
  const raw = projectPath?.trim();
  if (!raw || raw.includes("\0")) return null;
  if (!path.isAbsolute(raw) && !/^[A-Za-z]:[\\/]/.test(raw)) return null;
  let abs: string;
  try {
    abs = path.resolve(raw);
  } catch {
    return null;
  }
  if (!existsSync(abs)) return null;
  try {
    if (!statSync(abs).isDirectory()) return null;
  } catch {
    return null;
  }
  return abs;
}

function parentOf(absPath: string): string | undefined {
  const parent = path.dirname(absPath);
  if (parent === absPath) return undefined;
  if (detectPlatform() === "win32") {
    const normalized = path.resolve(absPath);
    if (/^[A-Za-z]:\\$/i.test(normalized)) return undefined;
  }
  return parent;
}

/**
 * List one directory on the home machine. Empty/omit path → homeDir.
 * dirsOnly=true for workspace folder pickers.
 */
export function listHomeFsEntries(params: {
  path?: string;
  dirsOnly?: boolean;
} = {}): ListHomeFsEntriesResult {
  const info = getHomeFsInfo();
  const raw = params.path?.trim();
  const target = raw
    ? resolveHomeFsDirectory(raw)
    : resolveHomeFsDirectory(info.homeDir);

  if (!target) {
    throw Object.assign(
      new Error(
        raw
          ? `envoyhome.bad_params: path is missing or is not a directory: ${raw}`
          : "envoyhome.bad_params: home directory is not available",
      ),
      { code: "bad_params" },
    );
  }

  let names: string[];
  try {
    names = readdirSync(target);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw Object.assign(new Error(`envoyhome.bad_params: cannot list directory: ${msg}`), {
      code: "bad_params",
    });
  }

  const entries: HomeFsEntry[] = [];
  for (const name of names) {
    if (entries.length >= MAX_HOME_FS_LIST_ENTRIES) break;
    if (name === "." || name === "..") continue;
    if (name.startsWith(".")) continue;
    const full = path.join(target, name);
    let kind: "dir" | "file";
    try {
      const st = statSync(full);
      kind = st.isDirectory() ? "dir" : "file";
    } catch {
      continue;
    }
    if (params.dirsOnly && kind !== "dir") continue;
    entries.push({ name, kind, path: full });
  }

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  const parent = parentOf(target);
  return {
    path: target,
    ...(parent ? { parent } : {}),
    entries,
  };
}

export { MAX_HOME_FS_LIST_ENTRIES };
