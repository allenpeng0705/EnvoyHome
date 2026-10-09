# Agreed: smart-home surface and physical actuation

**Status:** Agreed (2026-10-08f) — Normative in [Design §5.7](../EnvoyHome-Design.md) and Build Stage **B14** in the [Implementation Plan](../EnvoyHome-Implementation-Plan.md).  
**Role:** Short explanation for implementers. This snapshot does **not** override Design; if it disagrees, Design wins.  
**Why it exists:** smart home was promoted to v1 Core in 2026-10-08e and then substantially re-specified in 2026-10-08f after three independent audits. Unlike every other major decision (channels, workflows, multi-account, advanced memory) it had no snapshot, which is how a regex-shaped safety list survived a review round.

## 1. What we ship (v1)

| Surface | Notes |
|---------|-------|
| **MQTT** | The generic protocol surface. Works with Tasmota, Zigbee2MQTT, ESPHome — **no hub required**, so it is the minimal slice. |
| **Home Assistant** | The recommended aggregator: its entity + service model, REST/WS API. |
| `@envoyhome/smarthome` | Tool bundle: `ha_list_entities`, `ha_get_state`, `ha_list_services`, `ha_call_service`, `mqtt_subscribe`, `mqtt_read`, `mqtt_publish`. |
| `plugins/channel-mqtt`, `plugins/channel-homeassistant` | `kind: "event-source"`, **read-only credentials**, notification-only outbound. |
| Example workflows | Morning brief (`schedule` trigger), motion → notify (`event` trigger). |

**We integrate with hubs; we are not one.** No MQTT broker, no Zigbee/Matter/Thread radio, no hub replacement, and **no core device model** (Design §5.7.1). The one thing we do keep is an **object registry** (`objects.json`) — a source→account binding with a declared `class` — because the safety classifier and the resolver need it.

## 2. The five mechanisms that carry the safety story

1. **Object registry (§5.7.3).** Sources are registered by the **authenticated plugin instance** (`ChannelContext.registerSources`), not asserted per event. An event for an unregistered `sourceId` is dropped before account lookup. The record holds `{class, accountId, shared, neverUnattended, actuationAllowList}` and is **not writable by a tool, skill or workflow**.
2. **Resolver chokepoint (§5.7.3).** `resolveObject(...)` is the smart-home analogue of `safeJoin`: every `ha_*`/`mqtt_*` tool takes a **resolved handle**, never a raw `entity_id`/topic, and foreign/unbound objects fail `envoyhome.object_not_bound`. **This applies to reads as well** — otherwise `ha_get_state` on another account's lock is an allow-tier cross-account read.
3. **Data-driven safety class (§5.7.2).** Keyed on the resolved object's declared `class` first (plus a service deny list, script/scene/button indirection, the MQTT allow-list, and `neverUnattended`). **Unknown defaults to safety-class.** Model-chosen strings may only escalate. Never grant-satisfiable, refused at *creation and dispatch*. The required-deny corpus is **Appendix C.4**.
4. **Read-only plugin credentials (§5.3.1, §5.3.5 rule 6).** A channel plugin that holds a *write* credential can bypass the approval gate entirely, because it owns the connection. So the write credential lives with the daemon and only the gated tools use it; `outbound` is notification-only; there is **no `actuate` capability**.
5. **Actuation journal (§5.7.7).** `idempotent` is part of the tool contract; a non-idempotent service (`*.toggle`) never runs unattended; the intent record is written **before** dispatch and reconciled on restart (`pending` → `confirmed`/`failed`/`unconfirmed`, never re-issued); actuations per object are serialized.

## 3. Risk posture in one line each

- **Actuation is `admin`** — `ask` when attended, deny unattended without a grant (**Design §4.3.2**). It is *not* "owner + loopback": a household member may actuate **her own** bound objects from her phone, which is the whole point.
- **Grants for actuating tools are narrow by construction** — full digest committing to a resolved object *and* a desired state, refused if broad (`envoyhome.grant_too_broad`), **claimed** (not consumed) by compare-and-swap at dispatch so a live grant remains reusable until revoke/TTL.
- **Presence is `sensitive` and forced local** — `sensitive` results re-route the turn local or fail closed (`envoyhome.privacy_local_unavailable`); every `event-source` turn is privacy-tagged by construction (§5.7.4 rule 5).
- **Sharing is read-only and never for presence classes** — `shared: true` is refused for `lock`/`alarm`/`camera`/`presence`.
- **Cross-account actuation is forbidden in v1** — not "grantable with care". A real object-ACL model is a Phase 2 question.

## 4. Privacy: the home leaks presence (Design §5.7.4)

Object state must not reach, by an automatic path: **L0** transcript-derived **L4** search rows, **L1/L2/L3**, **COMPACT.md** and `memory/compact/**`, **L5/L6** backend state, **artifacts**, **`turn-delta` subscribers other than the originator**, **outbound notifications**, or the **default log**. It enters standing memory only via an explicit user instruction or an accepted PendingLearn, and the taint is **per-span** — a `sensitive` result inside an owner turn is still untrusted (Memory Design §13).

## 5. What is deliberately out of v1

Additional aggregators, a canonical device/entity model, scenes/automation authoring UI, presence-aware automations, camera pipelines, radios. Each has a stated **trigger to revisit** in Design §19.8 — they are deferred, not rejected.

## 6. Reading order for an implementer

1. Design **§5.7** (whole section — 5.7.1 scope, 5.7.2 safety class, 5.7.3 registry + resolver, 5.7.4 privacy, 5.7.5 delivery, 5.7.6 verification, 5.7.7 journal).
2. Design **§4.3.1/§4.3.2/§4.3.3** (method scope, tool disposition, turn origin) and **§4.4** (approvals + grants).
3. Conventions **R13** — including the **withdrawn** regex, so it is not reintroduced.
4. Plan **B14** and Appendix **C.4** (required-deny corpus).
5. Memory Design **§13** (trust derivation, result-level taint) and **§8.1** (the shared taint gate).

## 7. Peer precedent

**Hermes** ships Home Assistant as both a first-class tool set (`tools/homeassistant_tool.py`) and a bidirectional platform (`plugins/platforms/homeassistant/`). It treats smart home as an edge adapter — which is the right shape — but its platform holds its own credential and can therefore act outside any approval gate, which is exactly the failure mode §5.3.1/§5.7.5 prevents. No peer has a core device model. See [`../analysis/hermes.md`](../analysis/hermes.md).
