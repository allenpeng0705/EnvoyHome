#!/usr/bin/env bash
# test — runs the workspace test suite (B0: real, delegates to pnpm -r).
# Vitest configs and the first real suites land in B1.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

pnpm -r test
echo "test: OK"
