#!/usr/bin/env bash
# fetch-peers — make the sibling repos available as siblings of EnvoyHome.
#
# Why this exists: EnvoyHome links `@envoymesh/*` and `@envoymesh/envoy-harness`
# with pnpm `link:` + `overrides` (pnpm-workspace.yaml), because those packages
# are neither workspace members nor on the public npm registry. A fresh checkout
# therefore cannot `pnpm install` until the siblings exist on disk.
#
# Behaviour:
#   1. If every required sibling is already present -> exit 0 (no-op).
#   2. Else if ENVOYHOME_PEERS_GIT_BASE is set -> shallow-clone the missing ones
#      into the parent directory of EnvoyHome.
#   3. Else -> exit 1 with an actionable message. FAIL-CLOSED on purpose; the CI
#      peers gate must not silently pass.
#
# Env:
#   ENVOYHOME_PEERS_GIT_BASE  e.g. "https://x-access-token:$TOKEN@github.com/acme"
#                             or  "git@github.com:acme"
#   ENVOYHOME_PEER_BRANCH     branch to clone/fetch (default: main)
#   ENVOYHOME_PEERS_DEPTH     clone depth (default: 1)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARENT="$(cd "$REPO_ROOT/.." && pwd)"
cd "$PARENT"

BRANCH="${ENVOYHOME_PEER_BRANCH:-main}"
DEPTH="${ENVOYHOME_PEERS_DEPTH:-1}"
BASE="${ENVOYHOME_PEERS_GIT_BASE:-}"

# Repos that must exist as siblings. EnvoyHome/ is at $PARENT/EnvoyHome.
PEER_REPOS=(EnvoyMesh envoy-harness EnvoyCoder)

missing=()
for name in "${PEER_REPOS[@]}"; do
  [ -d "$PARENT/$name/.git" ] || missing+=("$name")
done

if [ ${#missing[@]} -eq 0 ]; then
  echo "fetch-peers: all ${#PEER_REPOS[@]} siblings already present."
  exit 0
fi

if [ -z "$BASE" ]; then
  echo "fetch-peers FAIL — missing siblings: ${missing[*]}"
  echo ""
  echo "Set ENVOYHOME_PEERS_GIT_BASE to clone them, e.g."
  echo "  ENVOYHOME_PEERS_GIT_BASE=\"https://x-access-token:\$TOKEN@github.com/<owner>\" \\"
  echo "    ./scripts/fetch-peers.sh"
  echo ""
  echo "Or clone them manually as siblings of $(basename "$REPO_ROOT"):"
  for name in "${missing[@]}"; do echo "  git clone <url> ../$name"; done
  exit 1
fi

for name in "${missing[@]}"; do
  echo "fetch-peers: cloning $name ($BRANCH, depth $DEPTH)"
  git clone --depth "$DEPTH" --branch "$BRANCH" "$BASE/$name.git" "$PARENT/$name"
done

echo "fetch-peers OK — cloned: ${missing[*]}"
