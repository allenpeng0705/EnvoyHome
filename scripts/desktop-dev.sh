#!/usr/bin/env bash
# One-shot: ensure daemon build exists, then launch desktop Tauri (dev).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DAEMON_JS="packages/daemon/dist/bin/envoyhome-daemon.js"
if [[ ! -f "$DAEMON_JS" ]]; then
  echo "desktop-dev: building @envoyhome/daemon (missing $DAEMON_JS)…"
  pnpm --filter @envoyhome/daemon build
fi

echo "desktop-dev: starting Tauri…"
exec pnpm --filter @envoyhome/desktop tauri:dev
