# Owner acceptance packet — Design changelog `2026-10-20h`

**Status: ACCEPTED 2026-10-20** (owner: Allen Peng).

Changelog `2026-10-20h` is accepted for **Phase 2 Normative** §19.9–§19.13 (agent capabilities). It does **not** reopen v1 G1/G6 (`2026-10-08f`) or the B0–B14 release bar.

**Code gate:** Cleared — P2-A…E package implementation may proceed (ship order P2-A first unless Owner reorders).

---

## What was accepted

| Section | Epic | One-line |
|---------|------|----------|
| §19.9 | **P2-A** | `edit_file` / `apply_patch` under path jail; reject shared terminal |
| §19.10 | **P2-B** | Heartbeat system job + standing orders on ScheduleService/workflows; reject Lobster core |
| §19.11 | **P2-C** | Same-account `message` + capped `sessions_*`; event-source notify-only |
| §19.12 | **P2-D** | D1 `view_image` + richer PDF; D2 generate after Privacy Mode |
| §19.13 | **P2-E** | Turn-scoped `spawn_helper`; Q10 one default agent; no Settings roster yet |

Also: §19.2 wave **2b′**; §19.3 reject list; §19.6 verify IDs; Plan epic board + soft-risks; AGENTS.md Don’t line.

**Ship order:** P2-A → P2-B → P2-C → P2-D1 → P2-E → P2-D2 (after IM/mobile Current Milestone unless Owner reorders).

---

## Defaults locked

1. Phase 2 Design — catalogue entry when each epic ships.  
2. Helpers before Settings multi-agent roster (Q10 preserved).  
3. Media understand before generate; generate Owner-opt-in + Privacy Mode.  
4. No OpenClaw terminal / swarm-default / Lobster / cross-account messaging / device nodes in this set.

---

## Residual (non-gating)

1. Exact RPC shapes for standing orders / heartbeat Settings — finalize at epic code time.  
2. Silent OK token string — product pick at P2-B.  
3. `spawn_helper` final tool name — may alias at ship.  
4. Privacy Mode RPC still Phase 2 (blocks **P2-D2**).  
5. Device nodes / MCP / Code Mode remain out of scope (§19.3).

---

## Decision record

**Accept** — Design `2026-10-20h` §19.9–§19.13 + Plan P2-A…E board, owner Allen Peng, **2026-10-20**.

Further Normative change after Accept requires a **new** changelog row (do not silently rewrite `2026-10-20h`).
