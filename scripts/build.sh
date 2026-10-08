#!/usr/bin/env bash
# build — builds every workspace package (B0: real, delegates to pnpm -r).
# Per Plan §3 B0.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

pnpm -r build
echo "build: OK"
