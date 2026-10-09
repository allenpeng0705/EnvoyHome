# Owner acceptance packet — Design changelog `2026-10-08f`

**Status: ACCEPTED 2026-10-09** (owner: Allen Peng).

Changelog `2026-10-08f` is accepted for **G1** (Design) and **G6** (Implementation Plan). Recorded in Design §15.2 / §16 and Plan Current Milestone.

**Build-plan walk (2026-10-08):** Owner chose Decision **1C** (plan/build against 08f as working truth; defer formal G1/G6 until after waves).

**Post-wave (2026-10-08):** Waves PR0 + B1–B14 on `main`; harden bars 4–7 automated; owner chose harden-first before Accept.

**Accept decision (2026-10-09):** Accept 08f Normative as the product contract so workload can go to **desktop → EnvoyMesh mobile → demo IM last**. Residual gaps below remain **non-gating** (same honesty as packet §5).

---

## Harden evidence at Accept

| Bar | Status |
|-----|--------|
| HA C.4 registry diff | **Fixture green**; live still optional |
| 4 Manual §10.2 | **8/8 automated** (`smoke-v1`); live phone/Telegram/MQTT deferred |
| 5 Doctor fresh | **Green** |
| 6 HomeClaw dry-run | **Green** (fixture) |
| 7 Tauri macOS | **Green** (`.app` + `.dmg`; supervise landed) |
| 8 G1 + G6 | **Accepted 2026-10-09** |

## Residual (accepted as known)

1. Live HA C.4 not yet run against a household instance.  
2. Credential-scope probe / full live MQTT–HA e2e thinner than unit corpus.  
3. Desktop Settings product quality still `[~]` (primary post-Accept work).  
4. Demo IM (Telegram) deferred by owner product order.  
5. Phase 2 Privacy Mode RPC / mobile thin client not in this Accept.  
6. Design §15.2 residual gaps (device model, agentskills.io, V-DAG-4 model file, migrate trust granularity).

## Decision record

**Accept** — G1 (Design §16) and G6 (Implementation Plan) for `2026-10-08f`, owner Allen Peng, **2026-10-09**.

Further Normative change requires a **new** changelog row (do not silently rewrite 08f).

## Why 08f / review trail / evidence

Unchanged from the pre-Accept packet body: see git history for the full audit tables (§1–§6 as of PENDING). Summary: three adversarial audits → safety class, grants, memory/taint/caps, verification floor; four review passes; CI + protocol/daemon/memory/smarthome suites green at Accept.
