# EnvoyHome design docs

## Ground truth (start here)

**[`EnvoyHome-Design.md`](EnvoyHome-Design.md)** — living all-in-one design.  
**[`EnvoyHome-Memory-Design.md`](EnvoyHome-Memory-Design.md)** — dedicated **Normative memory + learning** (peer-informed layers, flush, session_search, MemoryBackend). **Design §9** is the summary.  
**[`EnvoyHome-Implementation-Plan.md`](EnvoyHome-Implementation-Plan.md)** — **Build plan** (subordinate): Build Stages **B0–B14**, verification-ID ownership, soft-risk mitigations, first-day onboarding, v1 release bar.  
**[`analysis/peer-memory-systems.md`](analysis/peer-memory-systems.md)** — OpenClaw / Hermes / OpenHuman / HomeClaw memory comparative.  
**[`analysis/peer-harness-systems.md`](analysis/peer-harness-systems.md)** — OpenClaw / Hermes / OpenHuman harness comparative (+ envoy-harness default).

Latest (2026-10-08): **Q1–Q12 closed**; memory Normative; harness multi-plugin stance confirmed by peer study; **family multi-account share = v1 core**; **P2-Q4 finished** — hosting default, dual attach like EnvoyCoder if needed, no Social. Build plan locked (**B0–B14**); v1 release bar in Design §21 / Plan §8. **Smart home is v1 Core** (Design §5.7, Plan B14) — MQTT + Home Assistant, actuation is `admin`, no core device model. **G1 (Design) and G6 (Implementation Plan) are accepted** — changelog 2026-10-08c/d. **B0 is complete and verified**; B1 is next. Residual *non-gating* gaps are listed in Design §15.2.  
Use for **implementation + verification**. Changelog in each file.

`design_doc/` is **versioned** as of 2026-10-08 (the historical `.gitignore` entry was removed), so Plan §7's changelog-row review step can run.

If any other note conflicts with `EnvoyHome-Design.md` on product-wide invariants, **the Design doc wins**. For memory-layer detail, **Memory Design wins** unless Design.md explicitly overrides. For build ordering and stage ownership, **Implementation Plan wins** unless Design.md overrides — bump the plan.

## Method

Extract good ideas from peers → **fitness-check for EnvoyHome** (adopt / adapt / invent / reject) → refine Design doc → implement only after the readiness gates in **Design §16** (G1–G6).

**Not the goal:** Copy Hermes, OpenClaw, OpenHuman, or port HomeClaw wholesale.

## Supporting material

| Path | Role |
|------|------|
| [EnvoyHome-Implementation-Plan.md](EnvoyHome-Implementation-Plan.md) | **Build plan** — Build Stages **B0–B14**, verification-ID ownership, soft-risk mitigations, first-day onboarding, v1 release bar (subordinate) |
| [agreed/](agreed/) | Short topic snapshots (subordinate to Design doc) |
| [reviews/](reviews/) | Owner acceptance packets — one per large Normative batch |
| [analysis/](analysis/) | Peer research — non-normative |
| [analysis/synthesis.md](analysis/synthesis.md) | Cross-peer fitness (in progress) |

### Agreed snapshots

- [channels-and-harness.md](agreed/channels-and-harness.md)
- [dag-and-local-llm.md](agreed/dag-and-local-llm.md)
- [multi-account-and-security.md](agreed/multi-account-and-security.md)
- [advanced-memory-and-fleets.md](agreed/advanced-memory-and-fleets.md) — Memory Tree / auto-fetch / TokenJuice / fleets
- [smart-home-and-actuation.md](agreed/smart-home-and-actuation.md) — smart-home surface (MQTT + HA), object registry + resolver, safety class, actuation journal

**Owner acceptance packets**

- [2026-10-08f-acceptance.md](reviews/2026-10-08f-acceptance.md) — **Accepted 2026-10-09** (G1/G6 for changelog `2026-10-08f`)

### Analysis

- [homeclaw.md](analysis/homeclaw.md), [hermes.md](analysis/hermes.md), [openhuman.md](analysis/openhuman.md), [openclaw.md](analysis/openclaw.md), [envoy-family.md](analysis/envoy-family.md) (partial)
- [peer-memory-systems.md](analysis/peer-memory-systems.md), [peer-harness-systems.md](analysis/peer-harness-systems.md)
- [memory-tree-and-autofetch.md](analysis/memory-tree-and-autofetch.md), [tokenjuice-and-fleets.md](analysis/tokenjuice-and-fleets.md)

## Sibling repos

`../HomeClaw`, `../openclaw`, `../hermes-agent`, `../EnvoyCoder`, `../EnvoyMesh`, `../envoy-harness`
