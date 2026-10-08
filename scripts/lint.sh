#!/usr/bin/env bash
# lint — type-checks every workspace package (B0: real, delegates to pnpm -r).
# Package `lint` scripts are `tsc -p tsconfig.json --noEmit`; ESLint and the
# conventions R1–R3 restricted-syntax rules land with B1.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

pnpm -r lint
echo "lint: OK"
