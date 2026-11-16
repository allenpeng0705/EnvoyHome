#!/usr/bin/env bash
# Package a signed EnvoyHome.app into a DMG, notarize, and staple.
#
# Why not `tauri bundle --bundles dmg` after deferred codesign?
# Tauri re-bundles EnvoyHome.app (unsigned / adhoc) before create-dmg, wiping
# Developer ID. We build the DMG ourselves from the already-signed .app, then
# notarize with notarytool.
#
# Usage:
#   APPLE_SIGNING_IDENTITY=… APPLE_ID=… APPLE_PASSWORD=… APPLE_TEAM_ID=…
#   bash scripts/package-macos-dmg.sh /path/to/EnvoyHome.app [out.dmg]
set -euo pipefail

APP="${1:-}"
OUT_DMG="${2:-}"
if [ -z "$APP" ] || [ ! -d "$APP" ]; then
  echo "usage: package-macos-dmg.sh /path/to/EnvoyHome.app [out.dmg]" >&2
  exit 1
fi
APP="$(cd "$APP" && pwd)"

if [ -z "${APPLE_ID:-}" ] || [ -z "${APPLE_PASSWORD:-}" ] || [ -z "${APPLE_TEAM_ID:-}" ]; then
  echo "error: APPLE_ID, APPLE_PASSWORD, and APPLE_TEAM_ID are required for notarization" >&2
  exit 1
fi

# Refuse to package an unsigned / adhoc app.
# codesign -dv often exits non-zero; don't let pipefail treat that as "unsigned".
codesign_info="$(codesign -dv --verbose=2 "$APP" 2>&1 || true)"
if ! printf '%s\n' "$codesign_info" | grep -q 'Authority=Developer ID Application'; then
  echo "error: $APP is not Developer ID–signed (refusing to package)" >&2
  printf '%s\n' "$codesign_info" | head -15 >&2 || true
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION" 2>/dev/null || echo 0.0.0)"
case "$(uname -m)" in
  arm64|aarch64) arch="aarch64"; pub_arch="arm64" ;;
  x86_64|amd64) arch="x64"; pub_arch="x64" ;;
  *) arch="unknown"; pub_arch="unknown" ;;
esac

if [ -z "$OUT_DMG" ]; then
  OUT_DMG="$ROOT/apps/desktop/src-tauri/target/release/bundle/dmg/EnvoyHome_${VERSION}_${arch}.dmg"
fi
mkdir -p "$(dirname "$OUT_DMG")"

# Prefer the repo volume over /tmp (APFS purgeable free can confuse -srcfolder sizing).
STAGE="$(mktemp -d "$ROOT/apps/desktop/src-tauri/target/release/bundle/dmg/.stage-XXXX")"
RW="$STAGE/rw.dmg"
MNT="$STAGE/mnt"
cleanup() {
  if [ -d "$MNT" ]; then
    hdiutil detach "$MNT" -force >/dev/null 2>&1 || true
  fi
  rm -rf "$STAGE"
}
trap cleanup EXIT

echo "  Staging signed app for DMG…"
mkdir -p "$MNT"
# App is ~560 MiB with tens of thousands of resource files — oversize the RW image.
APP_BYTES="$(du -sk "$APP" | awk '{print $1}')"
# du -sk is KiB; add 40% headroom + 100 MiB for Applications link / HFS metadata.
SIZE_MB=$(( (APP_BYTES * 14 / 10 / 1024) + 100 ))
if [ "$SIZE_MB" -lt 800 ]; then SIZE_MB=800; fi

echo "  Creating ${SIZE_MB} MiB RW image…"
rm -f "$OUT_DMG" "$RW"
hdiutil create -size "${SIZE_MB}m" -fs HFS+ -volname "EnvoyHome" -ov "$RW" >/dev/null
hdiutil attach "$RW" -mountpoint "$MNT" -nobrowse >/dev/null
# ditto preserves code signatures better than cp -R
ditto "$APP" "$MNT/EnvoyHome.app"
ln -s /Applications "$MNT/Applications"
sync
hdiutil detach "$MNT" >/dev/null

echo "  Converting → $OUT_DMG"
hdiutil convert "$RW" -format UDZO -imagekey zlib-level=9 -o "$OUT_DMG" >/dev/null
rm -f "$RW"

echo "  Submitting DMG for notarization (notarytool)…"
xcrun notarytool submit "$OUT_DMG" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

echo "  Stapling notarization ticket…"
xcrun stapler staple "$OUT_DMG"
xcrun stapler validate "$OUT_DMG"

echo "  ✓ Packaged + notarized: $OUT_DMG"
echo "PACKAGE_DMG=$OUT_DMG"
echo "PACKAGE_PUB_ARCH=$pub_arch"
echo "PACKAGE_VERSION=$VERSION"
