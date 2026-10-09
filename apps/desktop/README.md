# @envoyhome/desktop

Thin Settings shell for EnvoyHome (B12 / Design §10). Loopback WebSocket to the daemon (`ws://127.0.0.1:4780/ws` by default).

**Focus now:** desktop Settings depth + mobile thin client. Demo IM parked. **Models** = preset → API key → Save (OpenAI/Anthropic/DeepSeek/GLM/MiniMax/Ollama/llama.cpp). **Chat** = loopback turns; **Pairing** = mint/QR/revoke; **Approvals** = pending + grants.

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
3. Nav: Chat, Profiles (display name only), Pairing (QR), Approvals, Models, Memory, Smart home, Doctor, Advanced

Override WS: Advanced → WS URL, or `localStorage.setItem('envoyhome.wsUrl', 'ws://127.0.0.1:PORT/ws')`.

## Notes

- Persistent WS subscribes to `home:turn-*` / `home:approval-*` / `home:learn-proposed`.
- Advanced shows `wsPort` / `httpPort` / `publicBaseUrl` from `home.health`, plus Install/Restart/Uninstall for OS service units (`ENVOYHOME_SERVICE_DRY_RUN=1` skips launchctl/systemctl).
- Pairing mints render a QR of the `envoy://pair?…` URI.
- Product icons: `apps/branding/` (mark `envoyhome-simple-b`); store pack in `apps/branding/store/`. See root [`QuickStart.md`](../../QuickStart.md).
