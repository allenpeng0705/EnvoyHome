#!/usr/bin/env bash
# Thin wrapper — implementation is scripts/fetch-peers.mjs (local first, then git).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$ROOT/scripts/fetch-peers.mjs" "$@"
