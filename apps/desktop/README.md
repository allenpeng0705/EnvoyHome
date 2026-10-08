# @envoyhome/desktop

Thin Settings shell for EnvoyHome (B12). Hosts or supervises the daemon; views call `home.*` RPCs over loopback WebSocket (`ws://127.0.0.1:4780/ws` by default).

## Scripts

```bash
pnpm --filter @envoyhome/desktop build
pnpm --filter @envoyhome/desktop test
pnpm --filter @envoyhome/desktop lint
```

## Run (dev)

1. Start the daemon: `pnpm dev:daemon` from the repo root (or `pnpm --filter @envoyhome/daemon dev`).
2. Open a WS client to the resolved port from **Advanced** (`home.getServiceStatus`, `home.hello`).
3. Settings views in `src/views/` map to verification IDs V-UX-1..5 and V-UX-MEM-1; smart-home body is `src/views/smarthome.tsx` (V-UX-6/7 owned by B14).

Full Tauri packaging is optional; this package compiles TypeScript views and config helpers for CI (R7 resolved-config test).
