#!/usr/bin/env bash
# ci — the full local/CI sequence (Plan §3 B0 + §5.7, conventions R9).
#
# Three rules this script exists to enforce:
#   0. the design docs' cross-references resolve (docs-lint.mjs) — cheap and
#      dependency-free, so it runs before anything that needs an install.
#   1. peers:check runs FIRST and is NOT masked. A missing or mis-branched
#      sibling fails the run (Plan §5.7: "PR-blocks merge").
#   2. CI=true is set only AFTER pnpm install. pnpm reads it as strict mode
#      (frozen-lockfile, postinstall failures, peer-dep warnings) — R9.
#      GitHub Actions exports CI=true for every step, so the install step must
#      `unset CI` explicitly; `pnpm install` below does that.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# 1. Design-doc cross-reference lint. No dependencies, no siblings, fast — run it
#    first so a dangling §-target or an unowned verification ID fails before a
#    multi-minute install. (This exists because three review rounds found the same
#    class of defect by hand; see scripts/docs-lint.mjs.)
node scripts/docs-lint.mjs

# 2. Siblings present, on the expected branch, with the linked packages. Fail closed.
./scripts/peers-check.sh

# 3. Install with CI explicitly unset (R9 strict-mode trap). Note: GitHub Actions
#    sets CI=true in the environment, so `env -u CI` is required here, not just
#    "don't export it".
env -u CI pnpm install

# 4. Build and test (still no CI=true).
pnpm -r build
pnpm -r test

# 5. NOW CI is safe.
export CI=true
pnpm -r lint

echo "ci: OK"
