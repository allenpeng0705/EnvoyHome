# EnvoyHome — Smart home (HA + MQTT)

Short index for operators. Normative rules: Design **§5.7**. Stage: Plan **B14**.

| Guide | Use when |
|-------|----------|
| [`homeassistant-setup.md`](homeassistant-setup.md) | Connect Home Assistant, smoke-test REST tools / workflows |
| [`mqtt-setup.md`](mqtt-setup.md) | Connect an MQTT broker, or **Start demo MQTT** (works with demo HA) |
| [`telegram-demo-setup.md`](telegram-demo-setup.md) | Chat demo IM (separate from smart home) |

## Mental model

```text
HA / MQTT hub          EnvoyHome
─────────────          ─────────
entities / topics  →   event-source channel (read)
                   →   object registry (bind + class)
                   →   ha_* / mqtt_* tools + Approvals
```

EnvoyHome **integrates**; it does **not** become a hub.

## Desktop map

1. **Connections → Home Assistant** — HA URL/token (auto-save) or **Start demo HA**, plus **Add device to this home** (any profile can use bound devices)  
2. **Connections → MQTT** — broker URL or **Start demo MQTT**, plus MQTT bind/allow-list  

3. **Skills → Workflows** — Catalogue shows tools; Insert sample; Test run  

**Bind** registers a device for this EnvoyHome (class + safety flags). It is not personal ownership — one home, household control, Approvals still apply.

## What to demo today

1. **HA REST smoke** (recommended): real HA URL + token (or Start demo HA) → **Test connection** → Home chat / Approvals.  
2. **MQTT publish smoke**: **Start demo MQTT** → Home chat `打开MQTT台灯` → Allow in Approvals → panel shows ON. Both demos can be on together.  
3. **Safety story**: show that unlock / garage / script paths are denied without attended approval (Appendix C.4 / Design §5.7.2).

## Ambiguous devices (HA + MQTT)

Local planner matching (Design §5.7.8 P1):

1. Prefer specific names / bilingual segments (`MQTT廊灯`) over generic (`台灯` / `mqtt`).
2. Generic room phrases prefer **HA** when both channels match (`打开台灯` → HA desk).
3. If several devices still match equally → **no actuation**; chat lists `channel · name · sourceId` choices.
4. Approvals summaries use the same `channel · name · sourceId` form so Deny is obvious if the wrong device was selected.

## Tool args = opaque handles

`ha_*` / `mqtt_*` take `objectId` (`channel:sourceId`), never a raw `entity_id` / topic on the wire (Design §5.7.3, V-HA-14). Clear phrases use the local planner; fuzzy home turns fall through to the harness tool-loop (bound-object card + `envoyhome-tools` proposals). Approvals still gate every actuation.
