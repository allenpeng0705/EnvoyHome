# Thin wrapper — implementation is scripts/peers-check.mjs (cross-platform).
# Usage (Windows):  .\scripts\peers-check.ps1
#                   .\scripts\peers-check.ps1 --warn-only
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
& node (Join-Path $Root "scripts\peers-check.mjs") @args
exit $LASTEXITCODE
