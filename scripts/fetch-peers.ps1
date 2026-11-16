# Thin wrapper — implementation is scripts/fetch-peers.mjs (local first, then git).
# Usage (Windows):  .\scripts\fetch-peers.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
& node (Join-Path $Root "scripts\fetch-peers.mjs") @args
exit $LASTEXITCODE
