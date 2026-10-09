# Cross-agent synthesis

**Status:** Working draft — canonical fitness table lives in [`../EnvoyHome-Design.md`](../EnvoyHome-Design.md) §13. Update that file first.

## Method

Extract → fitness for EnvoyHome → adopt / adapt / invent / reject.

## Spine (owned design, not a collage)

1. Daemon + EnvoyMesh super channel (`home.*`) — EnvoyCoder-adapted  
2. **Family multi-account** share one agent — HomeClaw-adapted + Settings invent (≠ Social product)  
3. Channel API + HTTP hatch — OpenClaw + HomeClaw hybrid  
4. Harness plugins, default envoy-harness — OpenClaw/EnvoyCoder-adapted (peers: [`peer-harness-systems.md`](peer-harness-systems.md))  
5. Static workflows + local LLM — HomeClaw-adapted; lean mix router invent  
6. AgentSkills interop — OpenClaw-adapted  
7. **Memory + consolidation + gated learning** — Hermes/OpenClaw-adapted (§9 v1 Normative)  
8. **Smart-home surface** (MQTT + Home Assistant) — Hermes-adapted; object registry + resolver + gated, class-keyed actuation invent (§5.7, B14)  
9. Reject: peer clones, Ext-Agent-only forever, sandbox-off default, IM zoo day-one, silent skill overwrite, **being a hub / broker / radio controller**  

## Memory / learning (v1 Normative — Design §9 + Memory Design)

Depth: [`../EnvoyHome-Memory-Design.md`](../EnvoyHome-Memory-Design.md).  
Peers: [`peer-memory-systems.md`](peer-memory-systems.md).

MemoryFacade; L1–L3 standing files; L4 session_search; flush-before-compact; COMPACT.md; LearnQueue; MemoryBackend slot. Tree/auto-fetch/TokenJuice out of v1 core.

## Advanced investigation (locked — Design §19.7)

| Candidate | Decision |
|-----------|----------|
| Memory Tree | Invent later as optional plugin; no core tree (P2-Q5) |
| Auto-fetch sync | Adapt as Channel/workflow jobs (P2-Q6 A) |
| Pre-turn active-memory | Opt-in escalate later; default off (P2-Q6 B) |
| TokenJuice | Optional harness middleware; default off (P2-Q7) |
| Fleets | Defer; mesh-first (P2-Q8) |

Detail: [memory-tree-and-autofetch.md](memory-tree-and-autofetch.md), [tokenjuice-and-fleets.md](tokenjuice-and-fleets.md), [agreed/advanced-memory-and-fleets.md](../agreed/advanced-memory-and-fleets.md).

## Smart home (v1 Normative — Design §5.7 + Plan B14)

MQTT (generic) + Home Assistant (aggregator) through a tool bundle and `kind: "event-source"` channel plugins, with automations as static workflows. **No core device model** — an object registry (`objects.json`), a `resolveObject` chokepoint, a data-driven **safety class** keyed on the object's declared class, read-only plugin credentials, and a journalled, idempotent actuation path. Peers: [`hermes.md`](hermes.md) (HA as a first-class edge), [`../agreed/smart-home-and-actuation.md`](../agreed/smart-home-and-actuation.md).

## Still deferred (Phase 2+ — Design §19)

Mobile thin client (dials **hosting** peer), Privacy Mode (must also cover smart-home egress), federation, capability nodes, **additional smart-home platforms and a device model**. (Not memory/learning — that is §9. Not smart home — that is v1, §5.7.)

## Closed product decisions (see Design §15)

Desktop = new Tauri app; `@envoyhome/*` + `@envoymesh/*` deps; no full mobile in MVP1; triage optional; workflows global+overlay; migrate v1 matrix; Apache-2.0; **P2-Q4 finished:** mesh = **hosting default**; **dual attach like EnvoyCoder if needed**; **no Social**; attach never phone route.
