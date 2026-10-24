#!/usr/bin/env bash
# Build EnvoyHome desktop installers (macOS DMG / Linux .deb + AppImage).
#
# Pattern: EnvoyMesh `build-desktop.sh` (targets + publish) + EnvoyCoder
# `build-dmg.sh` / `build-linux.sh` (stage → tauri → copy to release/).
#
# Windows is NOT supported here — use scripts/build-desktop.ps1 on a Windows host.
#
# Usage (from the EnvoyHome checkout):
#   ./scripts/build-desktop.sh [macos|linux|all]
#
#   all  = native host only (darwin→macos, linux→linux). Not a cross-compile.
#
# Needs: Node.js >= 22, pnpm, Rust, and sibling ../EnvoyMesh (linked @envoymesh/*).
# envoy-harness: auto-cloned from scripts/envoy-harness.pin when ../envoy-harness
# is missing (EnvoyCoder pattern). Override: ENVOY_HARNESS_DIR / ENVOY_HARNESS_COMMIT.
# First-time EnvoyMesh (QuickStart §1):
#   export ENVOYHOME_PEERS_GIT_BASE='git@github.com:YOUR_ORG'
#   ./scripts/fetch-peers.sh && ./scripts/peers-check.sh
#   macOS: Xcode Command Line Tools
#   Linux: libwebkit2gtk-4.1-dev, libgtk-3-dev, librsvg2-dev, patchelf, …
#          (see https://v2.tauri.app/start/prerequisites/)
#
# Push (iOS APNs + Android FCM): stage-desktop-bundle.mjs copies repo-root (or
# ~/.envoyhome) push-config.json + AuthKey_*.p8 + serviceAccountKey.json into
# resources/push/. Default REQUIRE_PUSH_CREDENTIALS=1 — build fails if those
# secrets are missing. Set REQUIRE_PUSH_CREDENTIALS=0 to package without push.
#
# Optional Apple Developer ID + notarization (Gatekeeper-friendly DMG):
#   Copy scripts/sign-macos-release.env.example → scripts/sign-macos-release.env
#   (gitignored). Without credentials, this builds an unsigned DMG.
#
# Final installers are always copied to the **repo-root** release folder:
#   <EnvoyHome>/release/envoyhome-desktop-{version}-macos-{arch}.dmg
#   <EnvoyHome>/release/envoyhome-desktop-{version}-linux-{arch}.deb
#   <EnvoyHome>/release/envoyhome-desktop-{version}-linux-{arch}.AppImage
# Override with OUT_DIR (relative → under repo root; absolute path allowed).

set -euo pipefail

TARGET="${1:-all}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# Repo-root release/ by default (not apps/desktop/…/target).
if [ -n "${OUT_DIR:-}" ]; then
  case "$OUT_DIR" in
    /*) OUT="$OUT_DIR" ;;
    *) OUT="$ROOT/$OUT_DIR" ;;
  esac
else
  OUT="$ROOT/release"
fi
TAURI_TARGET="$ROOT/apps/desktop/src-tauri/target"
BUNDLE_CONF="src-tauri/tauri.conf.bundle.json"

# Desktop product version: one-line root VERSION (EnvoyCoder / EnvoyMesh pattern).
echo "Syncing desktop version from VERSION…"
node "$ROOT/scripts/sync-desktop-version.mjs"
if [ -f "$ROOT/VERSION" ]; then
  VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
else
  VERSION="$(node -p "require('${ROOT}/package.json').version" 2>/dev/null || echo 0.0.0)"
fi

file_mtime() {
  local f="$1"
  if stat -f '%m' "$f" >/dev/null 2>&1; then
    stat -f '%m' "$f"
  else
    stat -c '%Y' "$f"
  fi
}

# Newest matching artifact under the Cargo target tree (triple or host release).
newest_file() {
  local pattern="$1"
  local best="" best_m=0 f m
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    m="$(file_mtime "$f")"
    if [ "$m" -gt "$best_m" ]; then
      best_m="$m"
      best="$f"
    fi
  done < <(find "$TAURI_TARGET" -path "$pattern" -type f 2>/dev/null)
  [ -n "$best" ] && echo "$best"
}

desktop_arch() {
  case "$(uname -m)" in
    arm64|aarch64) echo "arm64" ;;
    x86_64|amd64) echo "x64" ;;
    *) echo "unknown" ;;
  esac
}

resolve_tauri() {
  local candidates=(
    "$ROOT/apps/desktop/node_modules/.bin/tauri"
    "$ROOT/node_modules/.bin/tauri"
  )
  local c
  for c in "${candidates[@]}"; do
    if [ -f "$c" ]; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

if [ "${TARGET}" = "all" ]; then
  case "$(uname -s)" in
    Darwin) TARGET="macos" ;;
    Linux) TARGET="linux" ;;
    *)
      echo "error: TARGET=all is only supported on macOS or Linux (got $(uname -s))." >&2
      echo "  For Windows use scripts/build-desktop.ps1 on a Windows host." >&2
      exit 1
      ;;
  esac
  echo "  TARGET=all → native ${TARGET}"
fi

case "${TARGET}" in
  macos)
    if [ "$(uname -s)" != "Darwin" ]; then
      echo "This target builds a Mac DMG. Run it on a Mac." >&2
      exit 1
    fi
    ;;
  linux)
    if [ "$(uname -s)" != "Linux" ]; then
      echo "This target builds Linux packages. Run it on Linux." >&2
      exit 1
    fi
    ;;
  *)
    echo "error: unknown target '$TARGET' (use macos|linux|all — Windows: scripts/build-desktop.ps1)" >&2
    exit 1
    ;;
esac

apply_apple_signing_env() {
  local sign_env="$ROOT/scripts/sign-macos-release.env"
  if [ -f "$sign_env" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$sign_env"
    set +a
  fi

  export APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: …}"
  export APPLE_ID="${APPLE_ID:-…}"
  export APPLE_PASSWORD="${APPLE_PASSWORD:-…}"
  export APPLE_TEAM_ID="${APPLE_TEAM_ID:-…}"

  if [ "$APPLE_SIGNING_IDENTITY" = "Developer ID Application: …" ] || \
     [ "$APPLE_ID" = "…" ] || [ "$APPLE_PASSWORD" = "…" ] || [ "$APPLE_TEAM_ID" = "…" ]; then
    unset APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID
    echo "  Apple signing: skipped (unsigned DMG — add scripts/sign-macos-release.env to sign)"
    return 0
  fi

  echo "  Apple signing: Developer ID + notarization enabled"
}

echo "============================================"
echo "  EnvoyHome Desktop Builder (Tauri)"
echo "  Version: ${VERSION}  Target: ${TARGET}"
echo "============================================"
echo ""

echo "[1/3] Staging Node runtime + packaged daemon…"
node "$ROOT/scripts/stage-desktop-bundle.mjs"

if [ ! -f "$ROOT/apps/desktop/src-tauri/resources/daemon/main.mjs" ]; then
  echo "error: staging did not produce resources/daemon/main.mjs" >&2
  exit 1
fi
if [ ! -d "$ROOT/apps/desktop/src-tauri/resources/daemon/node_modules" ]; then
  echo "error: staging did not produce resources/daemon/node_modules" >&2
  exit 1
fi
if [ ! -x "$ROOT/apps/desktop/src-tauri/resources/node-runtime/bin/node" ] && \
   [ ! -f "$ROOT/apps/desktop/src-tauri/resources/node-runtime/node.exe" ]; then
  echo "error: staging did not produce resources/node-runtime/(bin/node|node.exe)" >&2
  exit 1
fi
if [ ! -d "$ROOT/apps/desktop/src-tauri/resources/push" ]; then
  echo "error: staging did not produce resources/push/ (push-config or .keep)" >&2
  exit 1
fi
# When push-config was staged, secrets must be beside it (REQUIRE_PUSH_CREDENTIALS).
if [ -f "$ROOT/apps/desktop/src-tauri/resources/push/push-config.json" ]; then
  if ! ls "$ROOT/apps/desktop/src-tauri/resources/push"/AuthKey_*.p8 >/dev/null 2>&1 && \
     ! ls "$ROOT/apps/desktop/src-tauri/resources/push"/*.p8 >/dev/null 2>&1; then
    echo "warning: resources/push/push-config.json present but no AuthKey_*.p8 beside it" >&2
  fi
fi

if [ "${TARGET}" = "macos" ]; then
  apply_apple_signing_env
fi

echo "[2/3] Building the Tauri app…"
cd "$ROOT/apps/desktop"
TAURI="$(resolve_tauri)" || {
  echo "The Tauri CLI is not installed. From the repo root run: pnpm install" >&2
  exit 1
}

case "${TARGET}" in
  macos)
    # Host help lists app/dmg only; --bundles selects the installer flavor.
    "$TAURI" build --config "$BUNDLE_CONF" --bundles dmg,app
    ;;
  linux)
    "$TAURI" build --config "$BUNDLE_CONF" --bundles deb,appimage
    ;;
esac

echo "[3/3] Publishing installers to repo-root release folder…"
echo "  → $OUT"
mkdir -p "$OUT"
copied=0
arch="$(desktop_arch)"

# Prefer newest under Cargo target (triple or host), then copy with a stable name.
publish_one() {
  local kind="$1"   # dmg | deb | AppImage
  local dest_name="$2"
  local src=""
  case "$kind" in
    dmg)
      src="$(newest_file '*/release/bundle/dmg/*.dmg' || true)"
      [ -n "$src" ] || src="$(newest_file '*/bundle/dmg/*.dmg' || true)"
      ;;
    deb)
      src="$(newest_file '*/release/bundle/deb/*.deb' || true)"
      [ -n "$src" ] || src="$(newest_file '*/bundle/deb/*.deb' || true)"
      ;;
    AppImage)
      src="$(newest_file '*/release/bundle/appimage/*.AppImage' || true)"
      [ -n "$src" ] || src="$(newest_file '*/bundle/appimage/*.AppImage' || true)"
      ;;
  esac
  if [ -z "$src" ] || [ ! -f "$src" ]; then
    return 1
  fi
  cp -f "$src" "$OUT/$dest_name"
  echo "  $dest_name  ←  $src"
  copied=$((copied + 1))
  return 0
}

case "${TARGET}" in
  macos)
    publish_one dmg "envoyhome-desktop-${VERSION}-macos-${arch}.dmg" || true
    ;;
  linux)
    publish_one deb "envoyhome-desktop-${VERSION}-linux-${arch}.deb" || true
    publish_one AppImage "envoyhome-desktop-${VERSION}-linux-${arch}.AppImage" || true
    ;;
esac

if [ "$copied" -eq 0 ]; then
  echo "The build finished, but no installer was found under apps/desktop/src-tauri/target." >&2
  echo "  Expected a DMG/deb/AppImage there, then a copy into: $OUT" >&2
  exit 1
fi

echo ""
echo "Done. Release package(s) are in:"
echo "  $OUT"
ls -la "$OUT"/envoyhome-desktop-* 2>/dev/null || true
