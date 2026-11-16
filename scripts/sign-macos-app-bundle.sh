#!/usr/bin/env bash
# Deep-sign EnvoyHome.app with Developer ID + hardened runtime (timestamp retry/fallback).
#
# Pattern: ../EnvoyCoder (EnvoyDev) + ../EnvoyMesh sign-macos-app-bundle.sh.
# Used when Tauri bundling is run unsigned (TAURI_DEFER_APP_SIGN=1) so we can survive
# Apple timestamp.apple.com outages the same way as sign-macos-staged-resources.sh.
#
# Only walks likely Mach-O paths (not every file under daemon node_modules) — the
# full-tree `file` scan is prohibitively slow with a staged Node daemon tree.
#
# Usage: APPLE_SIGNING_IDENTITY="Developer ID …" bash scripts/sign-macos-app-bundle.sh /path/EnvoyHome.app
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=codesign-macos-lib.sh
source "${SCRIPT_DIR}/codesign-macos-lib.sh"

APP="${1:-}"
if [ -z "$APP" ] || [ ! -d "$APP" ]; then
  echo "usage: sign-macos-app-bundle.sh /path/to/EnvoyHome.app" >&2
  exit 1
fi

if [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
  echo "sign-macos-app-bundle: APPLE_SIGNING_IDENTITY not set — skip" >&2
  exit 1
fi

codesign_macos_init
codesign_macos_unlock_keychain

ENTITLEMENTS="${APP}/Contents/Entitlements.plist"
if [ -f "$ENTITLEMENTS" ]; then
  export CODESIGN_ENTITLEMENTS="$ENTITLEMENTS"
fi

echo "  Signing Mach-O inside $(basename "$APP") (inner → outer)…"

# Comment-free plist — codesign drops entitlements if the file has XML comments.
NODE_ENTITLEMENTS="${SCRIPT_DIR}/macos-node.entitlements"

candidate_paths() {
  find "$APP" -depth -type f \( \
    -name '*.node' -o -name '*.dylib' -o -name 'spawn-helper' \
    -o -name 'node' -o -name 'obscura' -o -name 'obscura-worker' \
    -o -name 'envoyhome' \
    -o -path '*/MacOS/*' -o -path '*/Helpers/*' -o -path '*/Frameworks/*' \
    -o -path '*/bin/fd' -o -path '*/bin/rg' \
  \) 2>/dev/null
}

# Inner binaries first (depth-first). Skip the bundle root until last.
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ "$f" = "$APP" ] && continue
  codesign_macos_is_macho "$f" || continue
  case "$(basename "$f")" in
    node)
      CODESIGN_FILE_ENTITLEMENTS="$NODE_ENTITLEMENTS" codesign_macos_sign_file "$f" || true
      ;;
    *)
      unset CODESIGN_FILE_ENTITLEMENTS
      codesign_macos_sign_file "$f" || true
      ;;
  esac
done < <(candidate_paths)

echo "  Signing app bundle container…"
codesign_macos_sign_bundle_container "$APP"

codesign_macos_print_summary "Mach-O + app bundle" || exit 1

echo "  Verifying signature…"
codesign --verify --deep --strict --verbose=2 "$APP" 2>&1 | tail -3
