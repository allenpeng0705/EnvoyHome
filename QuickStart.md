# EnvoyHome QuickStart

Get the daemon, desktop app, and (optionally) the mobile client running locally.

Overview and design links: [`README.md`](README.md).

## Table of contents

- [Requirements](#requirements)
- [1. Clone siblings](#1-clone-siblings)
- [2. Install](#2-install)
- [3. Build & verify](#3-build--verify)
- [4. Run the daemon](#4-run-the-daemon)
- [5. Run the desktop app](#5-run-the-desktop-app)
- [6. Pair the mobile app](#6-pair-the-mobile-app)
- [7. First actions in Settings](#7-first-actions-in-settings)
- [Useful commands](#useful-commands)
- [Troubleshooting](#troubleshooting)

## Requirements

- macOS or Linux (desktop Tauri path is exercised on macOS)
- **Node.js ≥ 22** and **pnpm** (`packageManager` in root `package.json`)
- Sibling checkouts beside this repo (see below)
- Desktop: [Rust](https://rustup.rs/) + [Tauri CLI prerequisites](https://v2.tauri.app/start/prerequisites/) for `tauri:dev` / `tauri:build`
- Mobile (optional): [Flutter](https://docs.flutter.dev/get-started/install) stable, Xcode and/or Android SDK

## 1. Clone siblings

EnvoyHome links `@envoymesh/*` and harness packages with `link:` — they are **not** on npm.

```text
parent/
  EnvoyHome/
  EnvoyMesh/
  envoy-harness/
  EnvoyCoder/          # optional; patterns only
```

```bash
# From EnvoyHome root — fail-closed gate
./scripts/peers-check.sh

# Or clone when ENVOYHOME_PEERS_GIT_BASE is set (e.g. git@github.com:you)
export ENVOYHOME_PEERS_GIT_BASE='git@github.com:YOUR_ORG'
./scripts/fetch-peers.sh
./scripts/peers-check.sh
```

Default expected peer branch: `main` (override with `ENVOYHOME_PEER_BRANCH`).

## 2. Install

```bash
# R9: never run pnpm install with CI=true (pnpm strict-mode trap)
env -u CI pnpm install
```

## 3. Build & verify

```bash
pnpm -r build
pnpm -r test
# Full local CI sequence (docs-lint → peers → install → build → test → lint):
./scripts/ci.sh
```

## 4. Run the daemon

```bash
pnpm run dev:daemon
# equivalent: pnpm --filter @envoyhome/daemon run dev
```

Defaults (Design §2.4):

| Endpoint | URL |
|----------|-----|
| WebSocket | `ws://127.0.0.1:4780/ws` |
| Health | `http://127.0.0.1:4781/health` |

## 5. Run the desktop app

One line (builds the daemon if needed, then starts Tauri):

```bash
pnpm desktop:dev
# or: ./scripts/desktop-dev.sh
```

Tauri supervises the daemon when `packages/daemon/dist/bin/envoyhome-daemon.js` is present.

Or bundle UI only and open the shell:

```bash
pnpm --filter @envoyhome/desktop run frontend:bundle
# serve / open apps/desktop/ui-dist/ against a running daemon
```

Release build:

```bash
pnpm run desktop:tauri:build
# or: pnpm --filter @envoyhome/desktop tauri:build
```

Icons / branding: `apps/branding/` — see [`apps/branding/store/README.md`](apps/branding/store/README.md).

## 6. Pair the mobile app

1. Desktop → **Pairing** → mint a pair URI / show QR (`envoy://pair?…&app=EnvoyHome`).
2. On the phone:

```bash
cd apps/mobile
flutter pub get
flutter run
```

3. Scan the QR, or use **direct** `host:port` + token, or **SSH hop** (Design §19.2).

Push (APNs / FCM): [`docs/mobile-ios-android-setup.md`](docs/mobile-ios-android-setup.md).

Tests:

```bash
pnpm run mobile:flutter
# or: cd apps/mobile && flutter test
```

## 7. First actions in Settings

Typical first path after connect:

1. **Profiles** — first launch asks for a display name (modal); later opens use your last-used profile  

2. **Models** — provider preset + key, or **Local** / Ollama  
3. **Chat** — loopback turn against the daemon  
4. **Pairing** — mint QR for the phone  
5. **Approvals** — confirm elevated tool calls when prompted  

Demo IM (Telegram, etc.) stays last — see [`docs/telegram-demo-setup.md`](docs/telegram-demo-setup.md).

## Useful commands

```bash
./scripts/peers-check.sh
./scripts/ci.sh
pnpm run smoke:rpc
pnpm run smoke:v1
pnpm run doctor:fresh
pnpm run docs:lint
pnpm --filter @envoyhome/desktop test
pnpm --filter @envoyhome/desktop test:ux   # needs: pnpm exec playwright install chromium
```

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `peers-check` fails | Sibling missing, not a git checkout, or wrong branch |
| `pnpm install` weirdness under CI | `unset CI` / `env -u CI` (conventions R9) |
| Desktop “Connecting…” forever | Daemon up? `curl -s http://127.0.0.1:4781/health` |
| Mobile cannot pair | Same LAN / correct host; URI has `app=EnvoyHome`; desktop mint not revoked |
| Icons stale after branding change | Rebuild Tauri / reinstall Flutter app; pack under `apps/branding/store/` |

More context: [`README.md`](README.md) · Design · Implementation Plan · [`AGENTS.md`](AGENTS.md).
