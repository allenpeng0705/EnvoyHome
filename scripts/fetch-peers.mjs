#!/usr/bin/env node
/**
 * fetch-peers — make sibling repos available next to EnvoyHome.
 *
 * Order (fail-closed):
 *   1. Prefer an existing local sibling (directory + expected packages).
 *   2. Else shallow-clone from ENVOYHOME_PEERS_GIT_BASE, or the public default
 *      https://github.com/allenpeng0705 when that env is unset.
 *
 * Required: EnvoyMesh, envoy-harness.
 * Optional: EnvoyCoder (clone when missing if git works; never fail the script
 *           solely because EnvoyCoder is absent — same as peers:check).
 *
 * Env:
 *   ENVOYHOME_PEERS_GIT_BASE  clone base (default: https://github.com/allenpeng0705)
 *   ENVOYHOME_PEER_BRANCH     branch (default: main)
 *   ENVOYHOME_PEERS_DEPTH     clone depth (default: 1)
 *   ENVOYHOME_PEERS_NO_GIT=1  never clone — local-only (fail if a required peer is missing)
 */
import {
  PARENT_DIR,
  REQUIRED_PEERS,
  OPTIONAL_PEERS,
  localPeerReady,
  peerBranch,
  peersGitBase,
  peersCloneDepth,
  clonePeer,
} from "./lib/peers.mjs";

const branch = peerBranch();
const depth = peersCloneDepth();
const base = peersGitBase();
const noGit = process.env.ENVOYHOME_PEERS_NO_GIT === "1";
const configuredBase = (process.env.ENVOYHOME_PEERS_GIT_BASE ?? "").trim();

function ensurePeer(peer, { required }) {
  if (localPeerReady(peer)) {
    console.log(`fetch-peers: using local ../${peer.name}`);
    return { name: peer.name, status: "local" };
  }

  if (noGit) {
    if (required) {
      console.error(`fetch-peers FAIL — missing required sibling ../${peer.name}`);
      console.error("  ENVOYHOME_PEERS_NO_GIT=1 — place a checkout beside EnvoyHome, then re-run.");
      process.exit(1);
    }
    console.log(`fetch-peers: optional ../${peer.name} missing (skipped; NO_GIT).`);
    return { name: peer.name, status: "skipped" };
  }

  console.log(
    `fetch-peers: local ../${peer.name} missing — cloning from ${base} (${branch}, depth ${depth})` +
      (configuredBase ? "" : " [default public base]"),
  );
  try {
    clonePeer(peer.name, { base, branch, depth });
  } catch (error) {
    if (required) {
      console.error(`fetch-peers FAIL — could not clone ${peer.name}:`);
      console.error(error instanceof Error ? error.message : String(error));
      console.error("");
      console.error("Place a local checkout beside EnvoyHome, or set ENVOYHOME_PEERS_GIT_BASE, e.g.");
      console.error('  $env:ENVOYHOME_PEERS_GIT_BASE = "git@github.com:YOUR_ORG"   # PowerShell');
      console.error("  export ENVOYHOME_PEERS_GIT_BASE='git@github.com:YOUR_ORG'  # bash");
      console.error(`  then: node ./scripts/fetch-peers.mjs`);
      process.exit(1);
    }
    console.log(
      `fetch-peers: optional ../${peer.name} not cloned (${error instanceof Error ? error.message : String(error)}).`,
    );
    return { name: peer.name, status: "skipped" };
  }

  if (!localPeerReady(peer) && required) {
    console.error(
      `fetch-peers FAIL — cloned ../${peer.name} but expected packages are missing.`,
    );
    process.exit(1);
  }
  return { name: peer.name, status: "cloned" };
}

const results = [];
for (const peer of REQUIRED_PEERS) {
  results.push(ensurePeer(peer, { required: true }));
}
for (const peer of OPTIONAL_PEERS) {
  results.push(ensurePeer(peer, { required: false }));
}

const summary = results.map((r) => `${r.name}=${r.status}`).join(", ");
console.log(`fetch-peers OK — ${summary}`);
console.log(`  (siblings under ${PARENT_DIR})`);
