#!/usr/bin/env node
/**
 * peers:check — sibling-repo gate (Plan §3 B0, §5.7).
 *
 * For every linked package: sibling repo exists, package dir exists, git checkout
 * on ENVOYHOME_PEER_BRANCH (default main). Fail-closed unless --warn-only.
 *
 * EnvoyCoder is reference-only: missing → note, never a gate failure.
 *
 * Cross-platform (Node). Prefer: pnpm peers:check
 * Wrappers: ./scripts/peers-check.sh · .\scripts\peers-check.ps1
 */
import { existsSync } from "node:fs";
import path from "node:path";
import {
  REPO_ROOT,
  REQUIRED_PEERS,
  OPTIONAL_PEERS,
  siblingPath,
  localPeerReady,
  isGitCheckout,
  gitBranch,
  peerBranch,
} from "./lib/peers.mjs";

const warnOnly = process.argv.includes("--warn-only");
const args = process.argv.slice(2).filter((a) => a !== "--warn-only");
if (args.includes("-h") || args.includes("--help")) {
  console.log("usage: node scripts/peers-check.mjs [--warn-only]");
  process.exit(0);
}
if (args.length > 0) {
  console.error("usage: node scripts/peers-check.mjs [--warn-only]");
  process.exit(2);
}

const expectedBranch = peerBranch();
const problems = [];
const refWarnings = [];
const seen = new Set();

for (const peer of REQUIRED_PEERS) {
  const dir = siblingPath(peer.name);
  seen.add(dir);
  if (!existsSync(dir)) {
    problems.push(
      `${display(dir)} — sibling repo missing (blocks pnpm install: link: dependency)`,
    );
    continue;
  }
  if (!localPeerReady(peer)) {
    for (const marker of peer.markers) {
      const pkg = path.join(dir, marker);
      if (!existsSync(pkg)) {
        problems.push(`${display(pkg)} — linked package missing (blocks pnpm install)`);
      }
    }
  }
}

for (const peer of OPTIONAL_PEERS) {
  const dir = siblingPath(peer.name);
  if (!existsSync(dir)) {
    refWarnings.push(
      `${display(dir)} — reference checkout missing (optional; not a pnpm dep)`,
    );
  } else {
    seen.add(dir);
  }
}

for (const dir of [...seen].sort()) {
  if (!existsSync(dir)) continue;
  if (!isGitCheckout(dir)) {
    problems.push(
      `${display(dir)} — not a git checkout; cannot verify branch '${expectedBranch}'`,
    );
    continue;
  }
  const branch = gitBranch(dir);
  if (branch !== expectedBranch) {
    problems.push(
      `${display(dir)} — on branch '${branch}', expected '${expectedBranch}' (override with ENVOYHOME_PEER_BRANCH)`,
    );
  }
}

if (refWarnings.length > 0) {
  console.log("peers:check note — optional reference sibling(s):");
  for (const p of refWarnings) console.log(`  - ${p}`);
}

if (problems.length > 0) {
  if (warnOnly) {
    console.log(
      `peers:check WARN (--warn-only) — ${problems.length} problem(s); NOT a merge gate:`,
    );
    for (const p of problems) console.log(`  - ${p}`);
    console.log("");
    console.log(
      "EnvoyHome links these siblings with pnpm `link:` + `overrides` (pnpm-workspace.yaml).",
    );
    process.exit(0);
  }
  console.log(`peers:check FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.log(`  - ${p}`);
  console.log("");
  console.log(
    "EnvoyHome links these siblings with pnpm `link:` + `overrides` (pnpm-workspace.yaml),",
  );
  console.log(
    "so a missing or mis-branched sibling makes `pnpm install` fail as well.",
  );
  console.log(
    "Place them as siblings of EnvoyHome (preferred), or run `node ./scripts/fetch-peers.mjs`",
  );
  console.log(
    "(local first; clones from ENVOYHOME_PEERS_GIT_BASE or the public default when missing).",
  );
  process.exit(1);
}

console.log(
  `peers:check OK — ${seen.size} sibling path(s) present, all on '${expectedBranch}'.`,
);

function display(absPath) {
  const rel = path.relative(REPO_ROOT, absPath);
  if (rel && !path.isAbsolute(rel)) return rel.startsWith("..") ? rel : `./${rel}`;
  return absPath;
}
