# Local stand-in Home Assistant

**Product rule:** EnvoyHome’s Chat, Home chat, bindings, `ha_*` tools, and Approvals are always the **real** control path.  
`@envoyhome/fake-ha` is only a **local hub stand-in** (REST + device panel) so you can exercise that path without a Pi/Docker HA. The browser panel stands for real devices — it is not a second product.

| Hub | When |
|-----|------|
| **Your Home Assistant** | Production — see [`homeassistant-setup.md`](homeassistant-setup.md) |
| **Local stand-in (`fake-ha`)** | Lab / first-run — this doc |

There is **no** demo-only actuation bypass. `demo: true` on the channel config is metadata only.

---

## Same path as a real hub

```
You (Chat / Home chat)
        │
        ▼
 EnvoyHome daemon  ── Approvals Allow/Deny ──►  ha_call_service
        │                                              │
        │         baseUrl + accessToken                │
        └──────────────────────────────────────────────┘
                              │
                              ▼
              Hub REST  (/api/states, /api/services/…)
                              │
              ┌───────────────┴───────────────┐
              │ real HA :8123   │  stand-in :18123 │
              │ (devices)       │  (device panel)  │
              └─────────────────┴─────────────────┘
```

| Piece | Stand-in | Real HA |
|-------|----------|---------|
| Connections Base URL + token | `http://127.0.0.1:18123` + `envoyhome-demo` | your hub + long-lived token |
| Enable channel / bind objects | ✅ (Start demo HA binds inventory) | ✅ (Connections → Home Assistant) |
| Home chat (`purpose: home`) | ✅ always home-surface | ✅ |
| Chat (general) home heuristic | ✅ phrases / aliases | ✅ |
| Approvals before actuation | ✅ | ✅ |
| Panel / HA UI shows state | stand-in device panel | HA frontend |
| Live WS entity → inbound turn | stub (both today) | stub (both today) |

---

## What the stand-in devices can do

Panel tiles and `ha_call_service` share one store (panel polls ~1s).

| Section | Entity | Try saying | After **Allow** |
|---------|--------|------------|-----------------|
| Lights | `light.bedroom` | `打开卧室灯` / `turn on the bedroom light` | on |
| | `light.kitchen` | `关闭厨房灯` | off |
| | `light.living_room` | `打开客厅灯` | on |
| Switches | `switch.desk_lamp` | `打开台灯` | on |
| Fan | `fan.ceiling` | `打开风扇` | on |
| Cover | `cover.living_blinds` | `打开窗帘` | open |
| Garage | `cover.garage_door` | `打开车库` | open (safety) |
| Lock | `lock.front_door` | `开锁` / `unlock the front door` | unlocked (safety) |
| Climate | `climate.hallway` | `调高空调到26度` / `set thermostat to 22` | setpoint (Allow) |
| Media | `media_player.living_room` | play/pause phrases | playing / paused |
| Sensors | motion / temp / contact | panel simulate / drift | read |

Full inventory is in the panel sections (lights, climate, covers, security, sensors, media).

---

## How Chat / Home chat route (real routing)

Design §5.7.8 — no extra LLM classify on every turn.

| Surface | When `ha_*` + bound card are on |
|---------|----------------------------------|
| **Home chat** | Always (HA configured + enabled) |
| **Chat** | Local hit: home phrase, bound name/id, room aliases (卧室/客厅/…), or sticky after a home hit |

**Actuation sequence (identical for stand-in and real HA):**

1. Phrase matches → home-surface turn.
2. Local planner (clear on/off) **or** harness tool-loop (fuzzy NL) → `ha_call_service` / `mqtt_*` with opaque `objectId` handle.
3. Approvals **Allow** → daemon REST → hub state changes.
4. Device panel / HA UI reflects state.

If chat only *claims* success and there is **no** Approvals card, nothing was sent to the hub.

---

## Lab script (10 minutes)

1. `pnpm desktop:dev` — status green.
2. Connections → **Home Assistant** → **Start demo HA** → device panel opens automatically.
3. Keep the panel visible (it is your “HA UI”).
4. **Home chat:** `打开卧室灯` → Allow → Bedroom tile **on**.
5. **Chat:** `summarize my notes` → no HA change; then `关闭厨房灯` → Allow → Kitchen **off**.
6. Safety: `开锁` → Deny (unchanged) → again Allow (unlocked).

Automated: `pnpm demo:ha-smoke` (daemon must be running).

---

## Start / stop

**UI:** Connections → **Home Assistant** → **Start demo HA** / **Stop demo HA** (start fills Base URL + token, enables channel, binds devices, opens the panel; stop removes those demo objects and disables the channel so a later real hub stays clean).

**CLI hub only:**

```bash
pnpm fake:ha
```

- Base URL: `http://127.0.0.1:18123`
- Access token: `envoyhome-demo`

**RPC:** `home.startDemoHa` / `home.getDemoHaStatus` / `home.stopDemoHa`  
(name is historical; behavior is “point the real homeassistant channel at a local stand-in hub”.)

---

## Switch to your real hub

Prefer **Stop demo HA** first (removes demo devices from Objects and disables the channel). Then paste your real Base URL + long-lived token (config saves and enables automatically). Use **Test connection** to verify. Re-bind entities under Connections → Home Assistant.

If you paste a real URL without Stop, EnvoyHome clears demo objects when the URL leaves the demo port, and clears the sticky `demo` flag so a later Stop cannot disable your real hub. Chat / Home chat / Approvals stay the same; only the hub behind REST changes.
