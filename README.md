# EnvoyHome

A modern home agent built around an **EnvoyMesh** super channel.

## Design docs

| Doc | Role |
|-----|------|
| [`design_doc/EnvoyHome-Design.md`](design_doc/EnvoyHome-Design.md) | **Ground truth** — living all-in-one design for implementation and verification. Refine this file as decisions harden. |
| [`design_doc/EnvoyHome-Memory-Design.md`](design_doc/EnvoyHome-Memory-Design.md) | **Normative memory + learning depth** (companion to Design §9). |
| [`design_doc/EnvoyHome-Implementation-Plan.md`](design_doc/EnvoyHome-Implementation-Plan.md) | **Build plan** (subordinate) — Build Stages **B0–B14**, verification-ID ownership, soft-risk mitigations, first-day onboarding, v1 release bar. |
| [`tests/min/conventions.md`](tests/min/conventions.md) | **13 must-follow rules (R1–R13)**. Read before editing any package code. |
| [`AGENTS.md`](AGENTS.md) | Project-local instructions for AI coding agents. |

Supporting peer analysis and short agreed notes live under [`design_doc/`](design_doc/). This is not a HomeClaw port.

## Status

**Build Stage B0 (workspace bootstrap) is complete** — `pnpm install`, `pnpm -r build`, `pnpm -r lint`, `pnpm test` and `./scripts/peers-check.sh` all pass. Design gate **G1** and plan gate **G6** are accepted (Design §16); B1 is next.

**v1 is B0–B14.** Smart home is **v1 Core**, not an add-on: MQTT + Home Assistant through the Channel API and a `ha_*`/`mqtt_*` tool bundle, with automation expressed as static workflows (Design §5.7, Plan §3 B14). There is deliberately **no core device model** — EnvoyHome integrates with hubs, it is not one.

⚠️ Actuation (`ha_call_service`, `mqtt_publish`) is **`admin`** tier and unattended actuation needs a grant; the safety list (unlock, garage, valve, gate, disarm) can never be grant-covered (Design §5.7.2, conventions R13).

```bash
# Siblings are required: they are linked with `link:` (not workspace members, not on npm).
./scripts/peers-check.sh          # fail-closed: presence, linked packages, branch
./scripts/fetch-peers.sh          # clone them when ENVOYHOME_PEERS_GIT_BASE is set
pnpm install                      # never with CI=true (conventions R9)
./scripts/ci.sh                   # peers -> install -> build -> test -> lint
```

Ports: WS `4780` at `/ws`, HTTP `4781` (health at `GET /health`) — Design §2.4.

`design_doc/` is versioned (the historical `.gitignore` entry that hid the ground truth was removed on 2026-10-08).
