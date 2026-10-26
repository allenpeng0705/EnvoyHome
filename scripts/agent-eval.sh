#!/usr/bin/env bash
# V-AGENT-SCENARIO-2 — one-shot live LLM eval using your existing EnvoyHome settings.
#
# Uses the same state dir as the desktop app (~/.envoyhome by default), so
# providers / model mode / accounts you already configured are reused.
#
# Usage (from repo root):
#   ./scripts/agent-eval.sh
#   pnpm agent:eval
#
# If a daemon is already listening (e.g. desktop:dev), that process is used.
# Otherwise this script starts envoyhome-daemon against ENVOYHOME_STATE_DIR,
# runs the catalogue, then stops the daemon it started.
#
# Env (optional):
#   ENVOYHOME_STATE_DIR          default: ~/.envoyhome
#   ENVOYHOME_WS_URL             default: ws://127.0.0.1:4780/ws
#   ENVOYHOME_HTTP_PORT          default: 4781 (health probe)
#   ENVOYHOME_ACCOUNT            default: first household account from home.listAccounts
#   ENVOYHOME_AGENT_EVAL         forced to 1 by this wrapper
#   ENVOYHOME_AGENT_EVAL_FILTER  subset: case id / pack / substring (comma-separated)
#
# Not a CI gate.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

export ENVOYHOME_AGENT_EVAL=1
export ENVOYHOME_STATE_DIR="${ENVOYHOME_STATE_DIR:-$HOME/.envoyhome}"
WS_URL="${ENVOYHOME_WS_URL:-ws://127.0.0.1:4780/ws}"
HTTP_PORT="${ENVOYHOME_HTTP_PORT:-4781}"
# Derive health URL from WS host when possible.
WS_HOST="${WS_URL#ws://}"
WS_HOST="${WS_HOST#wss://}"
WS_HOST="${WS_HOST%%/*}"
WS_HOSTNAME="${WS_HOST%%:*}"
HEALTH_URL="${ENVOYHOME_HEALTH_URL:-http://${WS_HOSTNAME}:${HTTP_PORT}/health}"

DAEMON_JS="$REPO_ROOT/packages/daemon/dist/bin/envoyhome-daemon.js"
STARTED_PID=""

cleanup() {
  if [ -n "${STARTED_PID}" ] && kill -0 "$STARTED_PID" 2>/dev/null; then
    echo "agent-eval: stopping daemon we started (pid=$STARTED_PID)…"
    kill "$STARTED_PID" 2>/dev/null || true
    wait "$STARTED_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

daemon_up() {
  curl -sf --max-time 2 "$HEALTH_URL" >/dev/null 2>&1
}

echo "agent-eval: stateDir=$ENVOYHOME_STATE_DIR"
echo "agent-eval: ws=$WS_URL  health=$HEALTH_URL"

if daemon_up; then
  echo "agent-eval: daemon already up — reusing it (existing LLM settings)."
else
  if [ ! -f "$DAEMON_JS" ]; then
    echo "agent-eval: building @envoyhome/daemon…"
    pnpm --filter @envoyhome/daemon build
  fi
  if [ ! -d "$ENVOYHOME_STATE_DIR" ]; then
    echo "agent-eval: warning: $ENVOYHOME_STATE_DIR missing — daemon will create a fresh tree."
    echo "  Configure providers in the desktop app first, or set ENVOYHOME_STATE_DIR to your real home."
  fi
  echo "agent-eval: starting daemon with existing state…"
  # Avoid fighting a stale claim if ports are free but claim file lingers.
  node "$DAEMON_JS" &
  STARTED_PID=$!
  for _ in $(seq 1 40); do
    if daemon_up; then
      echo "agent-eval: daemon ready."
      break
    fi
    if ! kill -0 "$STARTED_PID" 2>/dev/null; then
      echo "agent-eval: daemon exited before becoming healthy." >&2
      exit 1
    fi
    sleep 0.25
  done
  if ! daemon_up; then
    echo "agent-eval: timed out waiting for $HEALTH_URL" >&2
    exit 1
  fi
fi

export ENVOYHOME_WS_URL="$WS_URL"
# Do not exec — trap must stop a daemon we started.
set +e
node "$REPO_ROOT/scripts/agent-eval-live.mjs"
status=$?
set -e
exit "$status"
