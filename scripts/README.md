# Packaging scripts

How to cut desktop installers. Run each desktop script **on that OS** from the
EnvoyHome checkout root after `pnpm install`.

## Desktop product version

Source of truth is the one-line root **`VERSION`** file (same idea as EnvoyCoder
and EnvoyMesh). Do **not** hand-edit `package.json` / Tauri / Cargo versions for
a release — bump `VERSION` and sync:

```bash
pnpm version:desktop -- 0.2.0    # writes VERSION, then syncs all desktop targets
pnpm version:desktop             # re-sync from the current VERSION file
pnpm version:desktop:check       # fail if anything drifted (also run by ./scripts/ci.sh)
```

`scripts/sync-desktop-version.mjs` writes the number into:

| File | Why |
|------|-----|
| `VERSION` | source of truth |
| `package.json` | release artifact names (`envoyhome-desktop-{ver}-…`) |
| `apps/desktop/package.json` | desktop package |
| `apps/desktop/src-tauri/tauri.conf.json` | Tauri / installer metadata |
| `apps/desktop/src-tauri/Cargo.toml` | Rust crate version |
| `apps/desktop/src-tauri/Cargo.lock` | `envoyhome` package entry |

Mobile is separate: bump `apps/mobile/pubspec.yaml` on its own.

Installer builds call `sync-desktop-version.mjs` first so the DMG/EXE name and
the app metadata stay on the same number.

## Desktop installers

**Entry points only:** `./scripts/build-desktop.sh` (macOS/Linux) and
`.\scripts\build-desktop.ps1` (Windows). They call the other scripts for you:
peers (local first, then git) → stage → Tauri → publish (macOS also signs/notarizes).

Prefer sibling **`../EnvoyMesh`** + **`../envoy-harness`** beside EnvoyHome
(`link:` `@envoymesh/*` — not on npm). Missing peers are fetched automatically.

```bash
pnpm install   # R9: unset CI
./scripts/build-desktop.sh macos          # DMG
# Windows: .\scripts\build-desktop.ps1    # EXE
# Optional private clone base: ENVOYHOME_PEERS_GIT_BASE=git@github.com:YOUR_ORG
```

| OS | Command | Output (repo-root **`release/`**) |
|----|---------|-------------------------------------|
| macOS | `./scripts/build-desktop.sh macos` | `envoyhome-desktop-{ver}-macos-{arch}.dmg` + stable `envoyhome-desktop.dmg` |
| Linux | `./scripts/build-desktop.sh linux` | `.deb` + `.AppImage` |
| Windows | `.\scripts\build-desktop.ps1` | `envoyhome-desktop-{ver}-windows-{arch}-setup.exe` + stable `envoyhome-desktop.exe` |

Override the output folder with `OUT_DIR=…` (relative → under repo root, or absolute).

Manual peers (optional): `pnpm peers:fetch` / `pnpm peers:check`.

### Harness pin

Edit `scripts/envoy-harness.pin` (full 40-char sha) to bump the harness shipped
inside the daemon. Overrides: `ENVOY_HARNESS_DIR`, `ENVOY_HARNESS_COMMIT`,
`ENVOYHOME_HARNESS_FORCE_PIN=1` (destructive replace of `../envoy-harness`).

### Push credentials (optional for packaging)

Put `push-config.json`, `AuthKey_*.p8`, and `serviceAccountKey.json` at the
**repo root** (or `~/.envoyhome`) before packaging. They are staged into
`resources/push/`. Default `REQUIRE_PUSH_CREDENTIALS=1` fails if a config is
present but secrets are missing; set `REQUIRE_PUSH_CREDENTIALS=0` to package
without push. No config → packages without push.

### macOS signing / notarization (required for DMG)

Release DMGs are always Developer ID–signed and notarized (Gatekeeper on more
Macs). Same pipeline as **../EnvoyMesh** and **../EnvoyCoder** (EnvoyDev):

1. Copy `sign-macos-release.env.example` → `sign-macos-release.env` (gitignored).
2. Fill the four Apple exports (reuse Mesh/Coder values when the same team).
3. `./scripts/build-desktop.sh macos` — deep-signs staged resources, signs
   `EnvoyHome.app`, packages the DMG, notarizes when Apple accepts the ticket.

Operator guide: [`../EnvoyMesh/docs/macos-mirror-signing.md`](../../EnvoyMesh/docs/macos-mirror-signing.md).
Missing credentials abort the build; unsigned release DMGs are not supported.

After deferred codesign, packaging uses `scripts/package-macos-dmg.sh` (not
`tauri bundle --bundles dmg`) so Developer ID is preserved, then `notarytool`
+ staple. Windows EXE must be built on a Windows host with
`.\scripts\build-desktop.ps1`.

## Agent scenario tests

Prompt catalogue under [`tests/agent-scenarios/`](../tests/agent-scenarios/) (Schedule + General packs).

| Gate | Command |
|------|---------|
| **V-AGENT-SCENARIO-1** (CI) | `pnpm agent:scenarios` |
| **V-AGENT-SCENARIO-2** (optional live LLM) | `pnpm agent:eval` — real model via **`~/.envoyhome`** (starts daemon if needed; reuses desktop if up) |

Live eval is **not** part of `./scripts/ci.sh`. New LLM-direct pack: `pnpm agent:eval:live-direct` (filter `live-llm`). Against an already-running WS only: `pnpm agent:eval:ws`. Related: `scripts/schedule-chat-corpus.mjs`.

## Related docs

- Agent scenarios: [`tests/agent-scenarios/README.md`](../tests/agent-scenarios/README.md)
- Desktop app notes: [`apps/desktop/README.md`](../apps/desktop/README.md)
- Quick start: [`QuickStart.md`](../QuickStart.md)
- Peer layout: [`AGENTS.md`](../AGENTS.md)
