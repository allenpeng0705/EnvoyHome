# @envoyhome/desktop

Thin Settings shell for EnvoyHome (B12 / Design §10). Loopback WebSocket to the daemon (`ws://127.0.0.1:4780/ws` by default).

**Focus now:** desktop Settings depth + mobile thin client. Demo IM parked. Sidebar: **Chat**, **LLM** (Model Provider / Local Model / Routing / Memory), **Connections** (Pair devices / Home Assistant / MQTT / Channels), **Skills** (Skills / Workflows / Jobs / Smart home), **System**. Profile + Language in the top bar. Approvals Allow/Deny inline in Chat; grants under System → This machine. **LLM → Model Provider** (default) is cloud providers — preferred for agent; Add provider uses Mesh-style presets (MiniMax, Anthropic, OpenAI, DeepSeek, GLM, Qwen, Moonshot, xAI, OpenRouter, plus custom OpenAI-/Anthropic-compatible). **Local Model** guides **llama.cpp** first (built-in default, `:18792` + GGUF setup steps). **Ollama** is optional/collapsed (BYO `:11434`) — Connect is manual; after Connect, boot restores that choice. Never auto-enabled from install alone. Only one engine can be on at a time. **Routing** chooses the pool (Cloud / Local only / Smart Routing). Runtime is **envoy-harness** for every profile (Harness Settings UI hidden for now).

## Scripts

```bash
pnpm --filter @envoyhome/desktop build          # tsc + frontend bundle (esbuild + qrcode)
pnpm --filter @envoyhome/desktop test           # unit + Playwright V-UX smoke
pnpm exec playwright install chromium           # once, for V-UX tests
pnpm --filter @envoyhome/desktop tauri:dev
pnpm --filter @envoyhome/desktop tauri:build    # macOS .app / .dmg (dev; no staged daemon)
```

### Desktop version

Source of truth is the one-line root **`VERSION`** file (EnvoyCoder / EnvoyMesh).
Full packaging notes: [`scripts/README.md`](../../scripts/README.md).

```bash
pnpm version:desktop -- 0.1.0   # writes VERSION + syncs package.json / Tauri / Cargo
pnpm version:desktop:check      # CI also runs this
```

Synced targets: root `package.json`, `apps/desktop/package.json`,
`src-tauri/tauri.conf.json`, `Cargo.toml`, `Cargo.lock` (`envoyhome`).
Installer scripts re-sync from `VERSION` before bundling. Mobile
(`apps/mobile/pubspec.yaml`) is bumped separately.

### Release installers (EnvoyCoder / EnvoyMesh pattern)

**Peers:** you need sibling **`../EnvoyMesh`**. **`envoy-harness` is auto-cloned** from `scripts/envoy-harness.pin` when missing (EnvoyCoder-style), then built and **esbuild-inlined** into the daemon.

```bash
# EnvoyMesh only (if not already beside this repo)
export ENVOYHOME_PEERS_GIT_BASE='git@github.com:YOUR_ORG'
./scripts/fetch-peers.sh && ./scripts/peers-check.sh
```

Bump the shipped harness by editing `scripts/envoy-harness.pin` (full 40-char sha). Overrides: `ENVOY_HARNESS_DIR`, `ENVOY_HARNESS_COMMIT`, `ENVOYHOME_HARNESS_FORCE_PIN=1`.

From the **repo root** (stages Node + packaged daemon into `src-tauri/resources/`, then Tauri):

```bash
./scripts/build-desktop.sh macos    # → <repo>/release/envoyhome-desktop-{ver}-macos-{arch}.dmg
./scripts/build-desktop.sh linux    # → <repo>/release/*.deb + *.AppImage (run on Linux)
./scripts/build-desktop.sh          # native host only (macos or linux)
```

Installers are copied into the **repo-root** `release/` folder (not under `src-tauri/target`). Override with `OUT_DIR=…`.

Windows (PowerShell, on a Windows host):

```powershell
.\scripts\build-desktop.ps1         # → <repo>\release\envoyhome-desktop-{ver}-windows-{arch}-setup.exe
```

Optional: `pnpm desktop:stage` only stages resources; `pnpm desktop:build` runs the shell script.

**Push credentials** are staged into the installer (EnvoyMesh pattern): put
`push-config.json`, `AuthKey_*.p8`, and `serviceAccountKey.json` at the **repo
root** (or under `~/.envoyhome`) before `./scripts/build-desktop.sh`. They land
in `resources/push/`; the app sets `ENVOYHOME_PUSH_CONFIG` for the supervised
daemon. Default `REQUIRE_PUSH_CREDENTIALS=1` fails the build if secrets are
missing — set `REQUIRE_PUSH_CREDENTIALS=0` to package without push. Dev
(`tauri:dev`) still uses `~/.envoyhome/push-config.json` as usual.

## Run

From the repo root (preferred):

```bash
pnpm desktop:dev                  # ./scripts/desktop-dev.sh — daemon build if needed → tauri:dev
```

Or manually:

1. Build daemon: `pnpm --filter @envoyhome/daemon build`
2. Either:
   - **Tauri** (`tauri:dev` / built `.app`) — supervises `envoyhome-daemon.js` when found, or
   - **Manual:** `pnpm --filter @envoyhome/daemon dev` then open `apps/desktop/ui-dist/`
3. Sidebar: Chat, **LLM**, **Connections**, **Skills**, **System** (last four are tabbed pages). Profile switcher + Language live in the top bar; approvals live in Chat.

Override WS: System → This machine → WS URL, or `localStorage.setItem('envoyhome.wsUrl', 'ws://127.0.0.1:PORT/ws')`.

State dir (providers, secrets, accounts): **`~/.envoyhome`** for both Tauri and `envoyhome-daemon` (override with `ENVOYHOME_STATE_DIR`). Do not rely on `cwd/.envoyhome` — that split caused “Add provider” to look empty after app restart.

## Notes

- Persistent WS subscribes to `home:turn-*` / `home:approval-*` / `home:learn-proposed`.
- System → This machine shows `wsPort` / `httpPort` / `publicBaseUrl` from `home.health`, plus Install/Restart/Uninstall for OS service units (`ENVOYHOME_SERVICE_DRY_RUN=1` skips launchctl/systemctl).
- Connections → Pair devices mints render a QR of the `envoy://pair?…` URI.
- Product icons: `apps/branding/` (mark `envoyhome-simple-b`); store pack in `apps/branding/store/`. See root [`QuickStart.md`](../../QuickStart.md).
