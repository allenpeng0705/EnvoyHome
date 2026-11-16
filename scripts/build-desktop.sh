#!/usr/bin/env bash
# Build EnvoyHome desktop installers (macOS DMG / Linux .deb + AppImage).
#
# Pattern: EnvoyMesh `build-desktop.sh` (targets + publish) + EnvoyCoder
# `build-dmg.sh` / `build-linux.sh` (stage → tauri → copy to release/).
#
# Windows is NOT supported here — use scripts/build-desktop.ps1 on a Windows host.
#
# Single entry point for macOS/Linux installers — calls the other scripts:
#   sync-desktop-version → fetch-peers (local first, then git) → peers-check →
#   stage-desktop-bundle → tauri build → (macOS) sign + package-macos-dmg → release/
#
# Usage (from the EnvoyHome checkout):
#   ./scripts/build-desktop.sh [macos|linux|all]
#
#   all  = native host only (darwin→macos, linux→linux). Not a cross-compile.
#
# Needs: Node.js >= 22, pnpm, Rust. Prefer sibling ../EnvoyMesh + ../envoy-harness
# beside EnvoyHome (this script fetches missing peers). Override harness with
# ENVOY_HARNESS_DIR / ENVOY_HARNESS_COMMIT. Optional: ENVOYHOME_PEERS_GIT_BASE.
#   macOS: Xcode Command Line Tools
#   Linux: libwebkit2gtk-4.1-dev, libgtk-3-dev, librsvg2-dev, patchelf, …
#          (see https://v2.tauri.app/start/prerequisites/)
# Windows EXE: .\scripts\build-desktop.ps1 (same peer + stage flow).
#
# Push (iOS APNs + Android FCM): stage-desktop-bundle.mjs copies repo-root (or
# ~/.envoyhome) push-config.json + AuthKey_*.p8 + serviceAccountKey.json into
# resources/push/. Default REQUIRE_PUSH_CREDENTIALS=1 — build fails if those
# secrets are missing. Set REQUIRE_PUSH_CREDENTIALS=0 to package without push.
#
# Obscura (Design §9.5f Stage D): stage fetches the pinned host binary into
# resources/obscura/ (scripts/fetch-obscura.mjs). Release builds fail if the
# CLI is missing. Set ENVOYHOME_SKIP_OBSCURA=1 only for local debug packaging.
# Force re-download: ENVOYHOME_OBSCURA_FORCE=1. All platforms: pnpm obscura:fetch:all
#
# Apple Developer ID + notarization is **required** for macOS DMG (Gatekeeper):
#   Copy scripts/sign-macos-release.env.example → scripts/sign-macos-release.env
#   (gitignored) — same values as ../EnvoyMesh and ../EnvoyCoder (EnvoyDev).
#   Missing credentials abort the build; unsigned release DMGs are not supported.
#   Flow (EnvoyDev pattern): deep-sign staged resources → unsigned .app →
#   sign-macos-app-bundle.sh → DMG + notarize. Guide: ../EnvoyMesh/docs/macos-mirror-signing.md
#   Set TAURI_DEFER_APP_SIGN=0 to let Tauri codesign the .app inline instead.
#
# Final installers are always copied to the **repo-root** release folder
# (same convention as ../EnvoyMesh + ../EnvoyCoder EnvoyDev):
#   release/envoyhome-desktop-{version}-macos-{arch}.dmg
#   release/envoyhome-desktop.dmg                          (stable mirror)
#   release/envoyhome-desktop-{version}-linux-{arch}.deb
#   release/envoyhome-desktop-{version}-linux-{arch}.AppImage
# Windows (build-desktop.ps1 on a Windows host):
#   release/envoyhome-desktop-{version}-windows-{arch}-setup.exe
#   release/envoyhome-desktop.exe                          (stable mirror)
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
UNSIGNED_CONF="src-tauri/tauri.conf.unsigned-build.json"

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

# Developer ID + notarization for a Gatekeeper-friendly DMG (not Mac App Store).
# Signing is mandatory on macOS — refuse to produce an unsigned package.
# Pattern: ../EnvoyCoder/scripts/build-dmg.sh require_apple_signing_env.
require_apple_signing_env() {
  local sign_env="$ROOT/scripts/sign-macos-release.env"
  if [ ! -f "$sign_env" ]; then
    echo "error: missing $sign_env" >&2
    echo "  Copy scripts/sign-macos-release.env.example → scripts/sign-macos-release.env" >&2
    echo "  and fill APPLE_SIGNING_IDENTITY, APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID." >&2
    echo "  Same values as ../EnvoyMesh / ../EnvoyCoder (EnvoyDev)." >&2
    echo "  Release DMGs are always signed; unsigned builds are not supported." >&2
    exit 1
  fi

  set -a
  # shellcheck source=/dev/null
  source "$sign_env"
  set +a

  export APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-}"
  export APPLE_ID="${APPLE_ID:-}"
  export APPLE_PASSWORD="${APPLE_PASSWORD:-}"
  export APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"

  if [ -z "$APPLE_SIGNING_IDENTITY" ] || [ "$APPLE_SIGNING_IDENTITY" = "Developer ID Application: …" ] || \
     [[ "$APPLE_SIGNING_IDENTITY" == *"Your Name"* ]] || \
     [ -z "$APPLE_ID" ] || [ "$APPLE_ID" = "…" ] || [[ "$APPLE_ID" == *"example.com"* ]] || \
     [ -z "$APPLE_PASSWORD" ] || [ "$APPLE_PASSWORD" = "…" ] || [[ "$APPLE_PASSWORD" == *"xxxx"* ]] || \
     [ -z "$APPLE_TEAM_ID" ] || [ "$APPLE_TEAM_ID" = "…" ] || [[ "$APPLE_TEAM_ID" == *"XXXXXXXXXX"* ]]; then
    echo "error: $sign_env still has placeholders or empty Apple credentials." >&2
    echo "  Fill all four exports before building a release DMG." >&2
    echo "  Release DMGs are always signed; unsigned builds are not supported." >&2
    exit 1
  fi

  echo "  Apple signing: Developer ID + notarization required (enabled)"
}

# Newest EnvoyHome.app under the Cargo target tree (triple or host release).
newest_envoyhome_app() {
  local best="" best_m=0 d probe m
  while IFS= read -r d; do
    [ -d "$d" ] || continue
    probe="$d"
    [ -f "$d/Contents/Info.plist" ] && probe="$d/Contents/Info.plist"
    m="$(file_mtime "$probe")"
    if [ "$m" -gt "$best_m" ]; then
      best_m="$m"
      best="$d"
    fi
  done < <(find "$TAURI_TARGET" -path '*/release/bundle/macos/EnvoyHome.app' -type d 2>/dev/null)
  [ -n "$best" ] && echo "$best"
}

# create-dmg leaves rw.<pid>.….dmg mounted under /Volumes/dmg.* when a prior
# bundle dies mid-flight (EnvoyCoder / EnvoyMesh).
cleanup_stale_bundle_dmg_mounts() {
  local vol img
  echo "  Clearing stale create-dmg mounts (if any)…"
  for vol in /Volumes/dmg.* /Volumes/EnvoyHome*; do
    [ -e "$vol" ] || continue
    hdiutil detach "$vol" -force >/dev/null 2>&1 || true
  done
  while IFS= read -r img; do
    [ -n "$img" ] || continue
    hdiutil detach "$img" -force >/dev/null 2>&1 || true
    rm -f "$img"
  done < <(find "$TAURI_TARGET" -path '*/release/bundle/macos/rw.*.dmg' -type f 2>/dev/null)
}

echo "============================================"
echo "  EnvoyHome Desktop Builder (Tauri)"
echo "  Version: ${VERSION}  Target: ${TARGET}"
echo "============================================"
echo ""

echo "[1/4] Peers (local siblings first, then git)…"
if ! node "$ROOT/scripts/fetch-peers.mjs"; then
  echo "error: fetch-peers failed. Put EnvoyMesh (+ envoy-harness) beside EnvoyHome, or set ENVOYHOME_PEERS_GIT_BASE." >&2
  exit 1
fi
if ! node "$ROOT/scripts/peers-check.mjs"; then
  echo "error: peers:check failed (wrong branch or incomplete sibling). See messages above." >&2
  exit 1
fi

echo "[2/4] Staging Node runtime + packaged daemon + Obscura…"
if ! node "$ROOT/scripts/stage-desktop-bundle.mjs"; then
  echo "error: stage-desktop-bundle.mjs failed (see messages above)." >&2
  echo "  Obscura retry: pnpm obscura:fetch" >&2
  echo "  Obscura skip (debug only): ENVOYHOME_SKIP_OBSCURA=1" >&2
  exit 1
fi

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
# Obscura CLI (Stage D) — required for release unless explicitly skipped.
# Tauri bundles resources/obscura/** via tauri.conf.bundle.json.
OBSCURA_BIN=""
if [ -f "$ROOT/apps/desktop/src-tauri/resources/obscura/obscura" ]; then
  OBSCURA_BIN="$ROOT/apps/desktop/src-tauri/resources/obscura/obscura"
elif [ -f "$ROOT/apps/desktop/src-tauri/resources/obscura/obscura.exe" ]; then
  OBSCURA_BIN="$ROOT/apps/desktop/src-tauri/resources/obscura/obscura.exe"
fi
if [ "${ENVOYHOME_SKIP_OBSCURA:-}" = "1" ]; then
  echo "warning: ENVOYHOME_SKIP_OBSCURA=1 — installer will not embed Obscura" >&2
elif [ -z "$OBSCURA_BIN" ]; then
  echo "error: staging did not produce resources/obscura/obscura (or obscura.exe)" >&2
  echo "  Obscura is required in the desktop package (Design §9.5f Stage D)." >&2
  echo "  Fix: pnpm obscura:fetch && re-run ./scripts/build-desktop.sh" >&2
  echo "  Force: ENVOYHOME_OBSCURA_FORCE=1 pnpm obscura:fetch" >&2
  echo "  Skip (debug only): ENVOYHOME_SKIP_OBSCURA=1" >&2
  exit 1
elif [ ! -x "$OBSCURA_BIN" ] && [[ "$OBSCURA_BIN" != *.exe ]]; then
  echo "error: Obscura binary exists but is not executable: $OBSCURA_BIN" >&2
  echo "  Fix: chmod +x \"$OBSCURA_BIN\"" >&2
  exit 1
else
  echo "  ✓ Obscura bundled: ${OBSCURA_BIN#"$ROOT/"}"
  if [ -f "$ROOT/apps/desktop/src-tauri/resources/obscura/OBSCURA_VERSION" ]; then
    echo "    pin: $(head -n1 "$ROOT/apps/desktop/src-tauri/resources/obscura/OBSCURA_VERSION" | tr -d '[:space:]')"
  fi
fi

if [ "${TARGET}" = "macos" ]; then
  require_apple_signing_env
  echo "[2.5/4] Signing nested Mach-O in staged resources…"
  bash "$ROOT/scripts/sign-macos-staged-resources.sh"
fi

echo "[3/4] Building the Tauri app…"
cd "$ROOT/apps/desktop"
TAURI="$(resolve_tauri)" || {
  echo "The Tauri CLI is not installed. From the repo root run: pnpm install" >&2
  exit 1
}

case "${TARGET}" in
  macos)
    # When Apple timestamp.apple.com flakes, Tauri's inline codesign fails the
    # whole bundle. Build an unsigned .app, deep-sign with retry/fallback, then
    # package DMG (EnvoyCoder / EnvoyMesh TAURI_DEFER_APP_SIGN pattern).
    defer_sign=0
    saved_identity=""
    if [ "${TAURI_DEFER_APP_SIGN:-1}" = "1" ]; then
      defer_sign=1
      saved_identity="$APPLE_SIGNING_IDENTITY"
      unset APPLE_SIGNING_IDENTITY
      echo "  Tauri: deferring app codesign (sign-macos-app-bundle.sh handles timestamp fallback)"
      if [ ! -f "$ROOT/apps/desktop/$UNSIGNED_CONF" ]; then
        echo "error: missing $UNSIGNED_CONF (required for TAURI_DEFER_APP_SIGN)" >&2
        exit 1
      fi
    fi

    if [ "$defer_sign" = "1" ]; then
      "$TAURI" build --config "$BUNDLE_CONF" --config "$UNSIGNED_CONF" --bundles app
      export APPLE_SIGNING_IDENTITY="$saved_identity"
      app="$(newest_envoyhome_app || true)"
      if [ -z "$app" ]; then
        echo "error: deferred codesign enabled but EnvoyHome.app not found under target/" >&2
        exit 1
      fi
      echo ""
      echo "[3.5/4] Signing EnvoyHome.app (deferred from Tauri)…"
      bash "$ROOT/scripts/sign-macos-app-bundle.sh" "$app"
      echo ""
      echo "Packaging DMG from signed .app (not tauri bundle — preserves Developer ID)…"
      cleanup_stale_bundle_dmg_mounts
      # Keep APPLE_* for notarytool. Do NOT run `tauri bundle --bundles dmg` —
      # it re-bundles an adhoc .app and wipes the signature (same trap as Mesh/Dev).
      bash "$ROOT/scripts/package-macos-dmg.sh" "$app"
      export APPLE_SIGNING_IDENTITY="$saved_identity"
    else
      cleanup_stale_bundle_dmg_mounts
      "$TAURI" build --config "$BUNDLE_CONF" --bundles dmg,app
    fi
    ;;
  linux)
    "$TAURI" build --config "$BUNDLE_CONF" --bundles deb,appimage
    ;;
esac

echo "[4/4] Publishing installers to repo-root release folder…"
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
    versioned_dmg="envoyhome-desktop-${VERSION}-macos-${arch}.dmg"
    if publish_one dmg "$versioned_dmg"; then
      # Stable mirror filename (EnvoyMesh / EnvoyDev convention).
      cp -f "$OUT/$versioned_dmg" "$OUT/envoyhome-desktop.dmg"
      echo "  envoyhome-desktop.dmg  (stable mirror)"
    fi
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
ls -lah "$OUT"/envoyhome-desktop* 2>/dev/null || true
