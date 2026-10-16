# @envoyhome/desktop

Thin Settings shell for EnvoyHome (B12 / Design §10). Loopback WebSocket to the daemon (`ws://127.0.0.1:4780/ws` by default).

**Focus now:** desktop Settings depth + mobile thin client. Demo IM parked. Sidebar: **Chat**, **LLM** (Model Provider / Local Model / Routing / Memory), **Connections** (Pair devices / Home Assistant / MQTT / Channels), **Skills** (Skills / Workflows / Jobs / Smart home), **System**. Profile + Language in the top bar. Approvals Allow/Deny inline in Chat; grants under System → This machine. **LLM → Model Provider** (default) is cloud providers — preferred for agent; Add provider uses Mesh-style presets (MiniMax, Anthropic, OpenAI, DeepSeek, GLM, Qwen, Moonshot, xAI, OpenRouter, plus custom OpenAI-/Anthropic-compatible). **Local Model** guides **llama.cpp** first (built-in default, `:18792` + GGUF setup steps). **Ollama** is optional/collapsed (BYO `:11434`) — Connect is manual; after Connect, boot restores that choice. Never auto-enabled from install alone. Only one engine can be on at a time. **Routing** chooses the pool (Cloud / Local only / Smart Routing). Runtime is **envoy-harness** for every profile (Harness Settings UI hidden for now).

## Scripts

```bash
pnpm --filter @envoyhome/desktop build          # tsc + frontend bundle (esbuild + qrcode)
pnpm --filter @envoyhome/desktop test           # unit + Playwright V-UX smoke
pnpm exec playwright install chromium           # once, for V-UX tests
pnpm --filter @envoyhome/desktop tauri:dev
pnpm --filter @envoyhome/desktop tauri:build    # macOS .app / .dmg
```

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
