#!/usr/bin/env bash
# Deploy sites/envoyhome/ to the family website (www.envoymesh.cn/envoyhome/).
#
# Pattern: copy into ../EnvoyMesh/sites/envoyhome (same as EnvoyDev), then
# publish with Cloudflare Wrangler Pages against the existing envoymesh site
# project — OR upload the Mesh `sites/` tree the way you usually publish
# www.envoymesh.cn.
#
# Usage:
#   npx wrangler login          # once, in an interactive terminal
#   ./scripts/deploy-envoyhome-site.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/sites/envoyhome"
MESH_SITES="$(cd "$ROOT/../EnvoyMesh/sites" && pwd)"
DEST="$MESH_SITES/envoyhome"

if [ ! -d "$SRC" ]; then
  echo "error: missing $SRC" >&2
  exit 1
fi
if [ ! -d "$MESH_SITES" ]; then
  echo "error: missing sibling EnvoyMesh/sites at $MESH_SITES" >&2
  exit 1
fi

echo "Syncing $SRC → $DEST"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
echo "  ✓ EnvoyMesh/sites/envoyhome ready"

# Prefer Wrangler Pages deploy when authenticated.
if npx --yes wrangler whoami >/dev/null 2>&1; then
  echo "Wrangler authenticated — deploying Pages project 'envoymesh' path /envoyhome…"
  # If the family site is a static Pages project rooted at Mesh/sites, deploy that tree.
  # Adjust --project-name if your Cloudflare project differs.
  PROJECT="${CLOUDFLARE_PAGES_PROJECT:-envoymesh}"
  npx --yes wrangler pages deploy "$MESH_SITES" --project-name="$PROJECT" --commit-dirty=true
  echo "Verify: https://www.envoymesh.cn/envoyhome/privacy.html"
else
  echo ""
  echo "Wrangler is not logged in. Site files are staged under:"
  echo "  $DEST"
  echo "Next:"
  echo "  1. npx wrangler login"
  echo "  2. re-run ./scripts/deploy-envoyhome-site.sh"
  echo "  Or upload EnvoyMesh/sites/ (including envoyhome/ + updated privacy.html) the way you publish www.envoymesh.cn."
  echo ""
  echo "Interim store privacy URL (HTML, public while GitHub has the file):"
  echo "  https://htmlpreview.github.io/?https://github.com/allenpeng0705/EnvoyHome/blob/main/sites/envoyhome/privacy.html"
fi
