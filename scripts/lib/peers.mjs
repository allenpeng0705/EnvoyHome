/**
 * Shared peer-sibling layout for fetch-peers / peers-check.
 *
 * Linked deps (pnpm-workspace.yaml overrides) must exist as siblings of EnvoyHome.
 * EnvoyCoder is reference-only — never a merge-gate failure when missing.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../..");
export const PARENT_DIR = path.dirname(REPO_ROOT);

/** Default clone base when ENVOYHOME_PEERS_GIT_BASE is unset (public GitHub). */
export const DEFAULT_PEERS_GIT_BASE = "https://github.com/allenpeng0705";

/** Required for pnpm link: + packagers. */
export const REQUIRED_PEERS = [
  {
    name: "EnvoyMesh",
    markers: [
      "packages/protocol",
      "packages/host-connect",
      "packages/reuse-host",
      "packages/network",
      "packages/identity",
    ],
  },
  {
    name: "envoy-harness",
    markers: ["packages/envoy-harness"],
  },
];

/** Optional reference sibling (patterns only — not linked). */
export const OPTIONAL_PEERS = [{ name: "EnvoyCoder", markers: [] }];

export function peerBranch(env = process.env) {
  return (env.ENVOYHOME_PEER_BRANCH ?? "main").trim() || "main";
}

export function peersGitBase(env = process.env) {
  const configured = (env.ENVOYHOME_PEERS_GIT_BASE ?? "").trim();
  return configured || DEFAULT_PEERS_GIT_BASE;
}

export function peersCloneDepth(env = process.env) {
  const raw = (env.ENVOYHOME_PEERS_DEPTH ?? "1").trim();
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function siblingPath(name) {
  return path.join(PARENT_DIR, name);
}

/** True when the sibling directory exists and required package folders are present. */
export function localPeerReady(peer) {
  const root = siblingPath(peer.name);
  if (!existsSync(root)) return false;
  for (const marker of peer.markers) {
    if (!existsSync(path.join(root, marker))) return false;
  }
  return true;
}

export function isGitCheckout(dir) {
  return existsSync(path.join(dir, ".git"));
}

export function gitBranch(dir) {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "?";
  }
}

export function clonePeer(name, { base, branch, depth }) {
  const dest = siblingPath(name);
  const url = `${base.replace(/\/$/, "")}/${name}.git`;
  execFileSync(
    "git",
    ["clone", "--depth", String(depth), "--branch", branch, url, dest],
    { stdio: "inherit" },
  );
}
