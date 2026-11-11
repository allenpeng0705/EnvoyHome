# Build the Windows installer (NSIS EXE).
#
# PowerShell twin of scripts/build-desktop.sh for Windows (EnvoyMesh naming +
# EnvoyCoder build-exe.ps1 flow).
#
# Run this on Windows, from the EnvoyHome checkout:
#   .\scripts\build-desktop.ps1
#
# Needs: git, Node.js >= 22, pnpm, Rust, Visual Studio C++ build tools,
#        sibling ../EnvoyMesh (linked @envoymesh/*).
# envoy-harness: auto-cloned from scripts/envoy-harness.pin when missing
# (same idea as EnvoyCoder). Override: ENVOY_HARNESS_DIR / ENVOY_HARNESS_COMMIT.
# First-time EnvoyMesh: ENVOYHOME_PEERS_GIT_BASE + .\scripts\fetch-peers.sh
# (QuickStart.md §1). peers:check needs bash (Git for Windows) or pnpm peers:check.
#
# Push: stages push-config.json + AuthKey_*.p8 + serviceAccountKey.json into
# resources\push\ (REQUIRE_PUSH_CREDENTIALS=1 by default). Set
# $env:REQUIRE_PUSH_CREDENTIALS="0" to package without push.
#
# Obscura (Design §9.5f Stage D): stage fetches the pinned host binary into
# resources\obscura\ (scripts/fetch-obscura.mjs). Release builds fail if
# obscura.exe is missing. Set $env:ENVOYHOME_SKIP_OBSCURA="1" only for local
# debug. Force re-download: $env:ENVOYHOME_OBSCURA_FORCE="1".
# All platforms: pnpm obscura:fetch:all
#
# Final installer is copied to the **repo-root** release folder:
#   <EnvoyHome>\release\envoyhome-desktop-{version}-windows-{arch}-setup.exe
# Override with $env:OUT_DIR (relative → under repo root; absolute path allowed).

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
if ($env:OUT_DIR -and $env:OUT_DIR.Trim().Length -gt 0) {
  if ([System.IO.Path]::IsPathRooted($env:OUT_DIR)) {
    $Out = $env:OUT_DIR
  } else {
    $Out = Join-Path $Root $env:OUT_DIR
  }
} else {
  $Out = Join-Path $Root "release"
}
$BundleConf = "src-tauri/tauri.conf.bundle.json"

# Desktop product version: one-line root VERSION (EnvoyCoder / EnvoyMesh pattern).
Write-Host "Syncing desktop version from VERSION..."
node (Join-Path $Root "scripts\sync-desktop-version.mjs")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$Version = "0.0.0"
$versionFile = Join-Path $Root "VERSION"
if (Test-Path $versionFile) {
  $Version = (Get-Content -Raw $versionFile).Trim()
} else {
  try {
    Push-Location $Root
    $Version = (node -p "require('./package.json').version" 2>$null)
    if (-not $Version) { $Version = "0.0.0" }
  } catch {
    $Version = "0.0.0"
  } finally {
    Pop-Location
  }
}

function Get-DesktopArch {
  switch ($env:PROCESSOR_ARCHITECTURE) {
    "ARM64" { return "arm64" }
    "AMD64" { return "x64" }
    default { return "unknown" }
  }
}

if ($env:OS -ne "Windows_NT") {
  Write-Error "This script builds a Windows EXE. Run it on Windows.`nMac/Linux: scripts/build-desktop.sh"
  exit 1
}

Write-Host "============================================"
Write-Host "  EnvoyHome Desktop Builder (Tauri / Windows)"
Write-Host "  Version: $Version"
Write-Host "============================================"
Write-Host ""

Write-Host "[1/3] Staging Node runtime + packaged daemon + Obscura..."
node (Join-Path $Root "scripts\stage-desktop-bundle.mjs")
if ($LASTEXITCODE -ne 0) {
  Write-Error @"
stage-desktop-bundle.mjs failed (see messages above).
  Obscura retry: pnpm obscura:fetch
  Obscura skip (debug only): `$env:ENVOYHOME_SKIP_OBSCURA='1'
"@
  exit $LASTEXITCODE
}

$daemonMain = Join-Path $Root "apps\desktop\src-tauri\resources\daemon\main.mjs"
$daemonNm = Join-Path $Root "apps\desktop\src-tauri\resources\daemon\node_modules"
$nodeExe = Join-Path $Root "apps\desktop\src-tauri\resources\node-runtime\node.exe"
$pushDir = Join-Path $Root "apps\desktop\src-tauri\resources\push"
$obscuraExe = Join-Path $Root "apps\desktop\src-tauri\resources\obscura\obscura.exe"
$obscuraUnix = Join-Path $Root "apps\desktop\src-tauri\resources\obscura\obscura"
$obscuraVersion = Join-Path $Root "apps\desktop\src-tauri\resources\obscura\OBSCURA_VERSION"
if (-not (Test-Path $daemonMain)) {
  Write-Error "Staging did not produce resources\daemon\main.mjs"
  exit 1
}
if (-not (Test-Path $daemonNm)) {
  Write-Error "Staging did not produce resources\daemon\node_modules"
  exit 1
}
if (-not (Test-Path $nodeExe)) {
  Write-Error "Staging did not produce resources\node-runtime\node.exe"
  exit 1
}
if (-not (Test-Path $pushDir)) {
  Write-Error "Staging did not produce resources\push\ (push-config or .keep)"
  exit 1
}
# Obscura CLI (Stage D) — required for release unless explicitly skipped.
# Tauri bundles resources\obscura\** via tauri.conf.bundle.json.
if ($env:ENVOYHOME_SKIP_OBSCURA -eq "1") {
  Write-Warning "ENVOYHOME_SKIP_OBSCURA=1 — installer will not embed Obscura"
} elseif (-not (Test-Path $obscuraExe) -and -not (Test-Path $obscuraUnix)) {
  Write-Error @"
Staging did not produce resources\obscura\obscura.exe (or obscura).
  Obscura is required in the desktop package (Design §9.5f Stage D).
  Fix: pnpm obscura:fetch ; then re-run .\scripts\build-desktop.ps1
  Force: `$env:ENVOYHOME_OBSCURA_FORCE='1'; pnpm obscura:fetch
  Skip (debug only): `$env:ENVOYHOME_SKIP_OBSCURA='1'
"@
  exit 1
} else {
  $obscuraShown = if (Test-Path $obscuraExe) { $obscuraExe } else { $obscuraUnix }
  Write-Host "  ✓ Obscura bundled: $($obscuraShown.Substring($Root.Length).TrimStart('\','/'))"
  if (Test-Path $obscuraVersion) {
    $pin = (Get-Content -TotalCount 1 $obscuraVersion).Trim()
    Write-Host "    pin: $pin"
  }
}

Write-Host "[2/3] Building the app and the EXE..."
$TauriCandidates = @(
  (Join-Path $Root "apps\desktop\node_modules\.bin\tauri.cmd"),
  (Join-Path $Root "node_modules\.bin\tauri.cmd")
)
$Tauri = $TauriCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Tauri) {
  Write-Error "The Tauri CLI is not installed. From the repo root run: pnpm install"
  exit 1
}

# pnpm optional platform packages can be missing after a cross-OS copy of node_modules.
$tauriNative = @(
  (Join-Path $Root "node_modules\@tauri-apps\cli-win32-x64-msvc"),
  (Join-Path $Root "node_modules\@tauri-apps\cli-win32-arm64-msvc"),
  (Join-Path $Root "apps\desktop\node_modules\@tauri-apps\cli-win32-x64-msvc"),
  (Join-Path $Root "apps\desktop\node_modules\@tauri-apps\cli-win32-arm64-msvc")
) | Where-Object { Test-Path $_ }
if (-not $tauriNative) {
  Write-Error @"
The Tauri CLI native binding for Windows is missing (@tauri-apps/cli-win32-*-msvc).

Fix from the EnvoyHome root (PowerShell):
  Remove-Item -Recurse -Force node_modules
  pnpm install
Or:
  pnpm add -D @tauri-apps/cli-win32-x64-msvc --filter @envoyhome/desktop
Then re-run this script.
"@
  exit 1
}

Push-Location (Join-Path $Root "apps\desktop")
try {
  & $Tauri build --config $BundleConf --bundles nsis
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

Write-Host "[3/3] Publishing the EXE to repo-root release folder..."
Write-Host "  → $Out"
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$found = Get-ChildItem -Path (Join-Path $Root "apps\desktop\src-tauri\target") -Recurse -Filter "*-setup.exe" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending
if (-not $found) {
  Write-Error "The build finished, but no setup EXE was found under apps\desktop\src-tauri\target.`nExpected a copy into: $Out"
  exit 1
}
$arch = Get-DesktopArch
$versioned = "envoyhome-desktop-$Version-windows-$arch-setup.exe"
# Prefer the newest setup.exe (stale triples can linger under target/).
$newest = $found | Select-Object -First 1
$dest = Join-Path $Out $versioned
Copy-Item -Force $newest.FullName $dest
Write-Host "  $versioned  ←  $($newest.FullName)"
Write-Host "Done. Release package is in:"
Write-Host "  $dest"
