#!/usr/bin/env bash
# Thin wrapper — implementation is scripts/peers-check.mjs (cross-platform).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$ROOT/scripts/peers-check.mjs" "$@"
