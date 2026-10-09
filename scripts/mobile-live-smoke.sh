#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pnpm --filter @envoyhome/daemon build
# ws is a daemon devDependency — resolve from that package
cd "$ROOT/packages/daemon"
node "$ROOT/scripts/mobile-live-smoke.mjs"
