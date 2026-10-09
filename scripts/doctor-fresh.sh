#!/usr/bin/env bash
# Design §21 bar 5 — home.doctor clean on a fresh install.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
STATE="${ENVOYHOME_STATE_DIR:-$(mktemp -d /tmp/eh-doctor-XXXXXX)}"
export ENVOYHOME_STATE_DIR="$STATE"
export ENVOYHOME_WS_PORT="${ENVOYHOME_WS_PORT:-0}"
export ENVOYHOME_HTTP_PORT="${ENVOYHOME_HTTP_PORT:-0}"
export ENVOYHOME_HATCH_API_KEY="${ENVOYHOME_HATCH_API_KEY:-doctor-fresh}"

pnpm --filter @envoyhome/daemon build >/dev/null

node --input-type=module <<'EOF'
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon, collectDoctorIssues } from "./packages/daemon/dist/index.js";

const stateDir = process.env.ENVOYHOME_STATE_DIR;
const daemon = await startDaemon({
  config: {
    stateDir,
    wsPort: 0,
    httpPort: 0,
    hatchApiKey: process.env.ENVOYHOME_HATCH_API_KEY ?? "k",
  },
  packageVersion: "0.0.0",
});
try {
  const issues = await collectDoctorIssues({
    config: daemon.config,
    accounts: daemon.accounts,
    bindings: daemon.bindings,
    channels: daemon.channels,
  });
  const errors = issues.filter((i) => i.severity === "error");
  console.log(JSON.stringify({ stateDir, issues, errors: errors.length }, null, 2));
  if (errors.length) process.exit(1);
  console.log("doctor-fresh: OK");
} finally {
  await daemon.stop();
}
EOF
