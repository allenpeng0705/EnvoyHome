# EnvoyHome

Self-hosted **home agent** control plane — desktop Settings shell, Flutter phone client, and daemon — built around an **EnvoyMesh** super channel (`home.*`).

**Hands-on:** start with [`QuickStart.md`](QuickStart.md).

## What you get

| Surface | Path | Role |
|---------|------|------|
| Daemon | `packages/daemon` | Control plane — WS `:4780/ws`, HTTP `:4781` |
| Desktop | `apps/desktop` | Tauri Settings shell (Chat, Pairing, Approvals, Models, Local, …) |
| Mobile | `apps/mobile` | Flutter thin client — QR / direct / SSH hop into the same `home.*` channel |
| Branding | `apps/branding` | Product mark + store icon pack (`store/` for App Store & Play) |

Product order: **desktop → EnvoyMesh mobile → demo IM last**. Smart home (HA + MQTT) is v1 Core via hubs — EnvoyHome is not a hub itself.

## Design docs

| Doc | Role |
|-----|------|
| [`design_doc/EnvoyHome-Design.md`](design_doc/EnvoyHome-Design.md) | **Ground truth** — Normative product + security |
| [`design_doc/EnvoyHome-Memory-Design.md`](design_doc/EnvoyHome-Memory-Design.md) | Memory layers L0–L7, flush, LearnQueue |
| [`design_doc/EnvoyHome-Implementation-Plan.md`](design_doc/EnvoyHome-Implementation-Plan.md) | Build Stages **B0–B14**, verification IDs |
| [`tests/min/conventions.md`](tests/min/conventions.md) | Rules **R1–R13** (read before package edits) |
| [`AGENTS.md`](AGENTS.md) | Instructions for AI coding agents |
| [`design_doc/`](design_doc/) | Peer analysis, agreed notes, reviews |

## Status

v1 is **B0–B14**. Desktop + mobile thin clients are the active product path. Design gate **G1** and plan gate **G6** are accepted.

⚠️ Actuation (`ha_call_service`, `mqtt_publish`) is **`admin`** tier; unattended actuation needs a grant. The safety class (unlock, garage, valve, gate, disarm, …) is never grant-covered (Design §5.7.2, conventions R13).

## Quick commands

```bash
./scripts/peers-check.sh          # fail-closed sibling check
./scripts/fetch-peers.sh          # clone siblings when ENVOYHOME_PEERS_GIT_BASE is set
env -u CI pnpm install            # never install with CI=true (R9)
./scripts/ci.sh                   # docs-lint → peers → install → build → test → lint
pnpm desktop:dev                  # one-shot desktop (build daemon if needed → Tauri)
```

Ports (Design §2.4): WebSocket `4780` at `/ws`, HTTP `4781` (`GET /health`).

Sibling layout (linked with `link:`, not npm):

```text
parent/
  EnvoyHome/       ← this repo
  EnvoyMesh/       ← @envoymesh/*
  envoy-harness/   ← default harness
  EnvoyCoder/      ← reference patterns only
```

## Branding & store assets

Product mark (simple house + Mesh halo): `apps/branding/envoyhome-simple-b.jpg`  
Release pack (desktop / iOS / Android / App Store / Play): [`apps/branding/store/README.md`](apps/branding/store/README.md)

## License

See repository license file when present; otherwise all rights reserved by the project owner until published.
