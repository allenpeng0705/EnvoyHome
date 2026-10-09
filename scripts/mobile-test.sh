#!/usr/bin/env bash
# Run Dart unit tests for packages/mobile-client (V-P2-MOB-1 scaffold).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/packages/mobile-client"

if ! command -v dart >/dev/null 2>&1; then
  echo "mobile-test: dart not on PATH — skip (install Flutter/Dart for V-P2-MOB-1)"
  exit 0
fi

if [[ ! -d "$ROOT/../EnvoyMesh/packages/envoy-thin-client-dart" ]]; then
  echo "mobile-test: missing sibling EnvoyMesh/packages/envoy-thin-client-dart" >&2
  exit 1
fi

dart pub get
dart test
echo "mobile-test: OK"
