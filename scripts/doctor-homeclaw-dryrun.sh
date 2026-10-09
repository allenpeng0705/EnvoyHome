#!/usr/bin/env bash
# Design §21 bar 6 — HomeClaw migrate dry-run plan.
# Set ENVOYHOME_HOMECLAW_ROOT to a real HomeClaw install (or tests/fixtures/homeclaw-sample).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -z "${ENVOYHOME_HOMECLAW_ROOT:-}" ]]; then
  echo "usage: ENVOYHOME_HOMECLAW_ROOT=/path/to/homeclaw ./scripts/doctor-homeclaw-dryrun.sh" >&2
  exit 2
fi

pnpm --filter @envoyhome/daemon build >/dev/null

# Pass root via env — do not interpolate into the JS source (bash ${} traps).
export ENVOYHOME_HOMECLAW_ROOT
node --input-type=module <<'EOF'
import { planHomeClawMigrate } from "./packages/daemon/dist/doctor/index.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const homeClawRoot = process.env.ENVOYHOME_HOMECLAW_ROOT;
const targetStateDir = await mkdtemp(join(tmpdir(), "eh-migrate-"));
const plan = await planHomeClawMigrate({
  homeClawRoot,
  targetStateDir,
  importChat: false,
});
if (!plan) {
  console.error("no plan produced");
  process.exit(1);
}
console.log(JSON.stringify(plan, null, 2));
if (!plan.copies?.length && !plan.absent?.length) {
  console.error("plan looks empty — unexpected");
  process.exit(1);
}
console.log("doctor-homeclaw-dryrun: OK (dry-run only; chat import opt-in remains false)");
EOF
