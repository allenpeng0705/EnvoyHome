// Daemon claim file — EnvoyCoder precedent apps/desktop/src/daemon/lock.ts.
// Publishes {pid, port, instanceId, startedAt} so the Tauri supervisor can tell
// "our daemon on 4780" from "something else holds 4780".

import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { PRODUCT_NAME } from "@envoyhome/protocol";

export interface DaemonClaim {
  product: string;
  instanceId: string;
  pid: number;
  host: string;
  port: number;
  path: string;
  stateDir: string;
  startedAt: string;
  version: string;
  managedBy?: "app" | "service";
}

export function claimPath(stateDir: string): string {
  return join(stateDir, "daemon.claim.json");
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EPERM" && code !== "EACCES") return false;
  }
  if (process.platform === "win32") return true;
  try {
    const state = execFileSync("ps", ["-o", "stat=", "-p", String(pid)], {
      encoding: "utf8",
    }).trim();
    return !state.startsWith("Z");
  } catch {
    return true;
  }
}

export async function readClaim(stateDir: string): Promise<DaemonClaim | null> {
  try {
    const raw = JSON.parse(await readFile(claimPath(stateDir), "utf8")) as DaemonClaim;
    return raw;
  } catch {
    return null;
  }
}

export async function writeClaim(claim: DaemonClaim): Promise<void> {
  const path = claimPath(claim.stateDir);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(claim, null, 2), "utf8");
  await rename(tmp, path);
}

export async function clearClaim(stateDir: string): Promise<void> {
  try {
    await unlink(claimPath(stateDir));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export function makeClaim(input: {
  instanceId: string;
  port: number;
  stateDir: string;
  version?: string;
  host?: string;
  path?: string;
  managedBy?: "app" | "service";
}): DaemonClaim {
  const claim: DaemonClaim = {
    product: PRODUCT_NAME,
    instanceId: input.instanceId,
    pid: process.pid,
    host: input.host ?? "127.0.0.1",
    port: input.port,
    path: input.path ?? "/ws",
    stateDir: input.stateDir,
    startedAt: new Date().toISOString(),
    version: input.version ?? "0.0.0",
  };
  if (input.managedBy !== undefined) claim.managedBy = input.managedBy;
  return claim;
}
