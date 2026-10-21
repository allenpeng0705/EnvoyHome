# Owner acceptance packet — Design changelog `2026-10-20q`

**Status: ACCEPTED 2026-10-20** (owner: Allen Peng) — direction recorded in chat; Normative text in Design §19.13 P2-E2.

**Code:** Shipped as Design `2026-10-20r`/`s` / Plan P2-E2 `[x]` — `task` children are real `LocalMeshSubmitter`+`Agent` (Home jail tools); parent remains harness-host `runTurn`; `spawn_helper` wraps `task`.

---

## What was accepted

| Item | Decision |
|------|----------|
| Parallel children | Use **envoy-harness sub-agents** (`task` + `LocalMeshSubmitter`, caps / batching / optional fan-out) |
| OpenClaw `sessions_spawn` / swarm-as-default | Remain **Reject** as core |
| Q10 | Unchanged — user-facing agent stays `default`; children are execution workers |
| `spawn_helper` | Keep until E2 ships; then unify or demote (one delegation story) |
| Verify | Add **V-P2-AGENT-3** at code time |

---

## Decision record

**Accept** — Design `2026-10-20q` P2-E2 + Plan board row `[ ]`, owner Allen Peng, **2026-10-20**.
