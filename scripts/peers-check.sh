#!/usr/bin/env bash
# peers:check — the sibling-repo gate (Plan §3 B0, §5.7).
#
# Verifies, for every sibling package EnvoyHome links against:
#   1. the sibling repo directory exists;
#   2. the linked package directory inside it exists (pnpm `link:` target);
#   3. the sibling is a git checkout on the expected branch.
#
# FAIL-CLOSED BY DEFAULT: any problem exits 1. This is the point of the gate —
# `scripts/ci.sh` and `.github/workflows/ci.yml` call it without masking, so a
# missing/mis-branched sibling blocks the run (Plan §5.7: "PR-blocks merge").
#
# `--warn-only` downgrades problems to warnings. It exists for local
# exploration only and MUST NOT be used in CI or in a merge gate.
#
# Env:
#   ENVOYHOME_PEER_BRANCH   expected branch for all siblings (default: main)
set -euo pipefail

WARN_ONLY=0
case "${1:-}" in
  --warn-only) WARN_ONLY=1 ;;
  "") ;;
  *) echo "usage: $0 [--warn-only]" >&2; exit 2 ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

EXPECTED_BRANCH="${ENVOYHOME_PEER_BRANCH:-main}"

# "<repo dir>:<linked package path relative to repo dir>"
# Must stay in sync with `overrides:` in pnpm-workspace.yaml.
PEER_PACKAGES=(
  "../EnvoyMesh:packages/protocol"
  "../EnvoyMesh:packages/host-connect"
  "../EnvoyMesh:packages/reuse-host"
  "../EnvoyMesh:packages/network"
  "../EnvoyMesh:packages/identity"
  "../envoy-harness:packages/envoy-harness"
)

# Reference-only sibling: adapted for patterns, not linked as a dependency.
PEER_REPOS=(
  "../EnvoyCoder"
)

problems=()
seen_repos=()

for entry in "${PEER_PACKAGES[@]}"; do
  dir="${entry%%:*}"
  pkg="${entry##*:}"

  if [ ! -d "$dir" ]; then
    problems+=("$dir — sibling repo missing (blocks pnpm install: link: dependency)")
    continue
  fi
  if [ ! -d "$dir/$pkg" ]; then
    problems+=("$dir/$pkg — linked package missing (blocks pnpm install)")
  fi
  seen_repos+=("$dir")
done

for dir in "${PEER_REPOS[@]}"; do
  if [ ! -d "$dir" ]; then
    problems+=("$dir — sibling repo missing (reference checkout, not a pnpm dep)")
  fi
  seen_repos+=("$dir")
done

# Branch check, once per repo.
for dir in $(printf '%s\n' "${seen_repos[@]}" | sort -u); do
  [ -d "$dir" ] || continue
  if [ ! -d "$dir/.git" ]; then
    problems+=("$dir — not a git checkout; cannot verify branch '$EXPECTED_BRANCH'")
    continue
  fi
  branch="$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  if [ "$branch" != "$EXPECTED_BRANCH" ]; then
    problems+=("$dir — on branch '$branch', expected '$EXPECTED_BRANCH' (override with ENVOYHOME_PEER_BRANCH)")
  fi
done

if [ ${#problems[@]} -gt 0 ]; then
  if [ "$WARN_ONLY" -eq 1 ]; then
    echo "peers:check WARN (--warn-only) — ${#problems[@]} problem(s); NOT a merge gate:"
    for p in "${problems[@]}"; do echo "  - $p"; done
    echo ""
    echo "EnvoyHome links these siblings with pnpm \`link:\` + \`overrides\` (pnpm-workspace.yaml)."
    exit 0
  fi
  echo "peers:check FAIL — ${#problems[@]} problem(s):"
  for p in "${problems[@]}"; do echo "  - $p"; done
  echo ""
  echo "EnvoyHome links these siblings with pnpm \`link:\` + \`overrides\` (pnpm-workspace.yaml),"
  echo "so a missing or mis-branched sibling makes \`pnpm install\` fail as well."
  echo "Clone them as siblings of EnvoyHome, or run \`./scripts/fetch-peers.sh\` when"
  echo "ENVOYHOME_PEERS_GIT_BASE is configured."
  exit 1
fi

echo "peers:check OK — ${#seen_repos[@]} sibling paths present, all on '$EXPECTED_BRANCH'."
