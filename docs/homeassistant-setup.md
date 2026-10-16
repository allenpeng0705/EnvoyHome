# EnvoyHome — Home Assistant setup

Operator checklist for the bundled **Home Assistant** channel (`plugins/channel-homeassistant`) and the `ha_*` tool bundle (`@envoyhome/smarthome`, Design §5.7).

| Item | Value |
|------|--------|
| Channel id | `homeassistant` |
| Kind | `event-source` (read credential; **no** actuate from the plugin) |
| Config RPC | `home.setChannelConfig` → `home.enableChannel` |
| Object bind | Same tab: Connections → **Home Assistant** (`home.setSourceBinding`) |
| Settings | Desktop → **Connections** → **Home Assistant** |
| Tools | `ha_list_entities`, `ha_get_state`, `ha_list_services`, `ha_call_service` |

**What HA is here:** EnvoyHome does not replace Home Assistant. HA remains the hub; EnvoyHome is the gated agent that reads state and (with approvals) calls services.

---

**Demo hub (no real HA yet):** see [`homeassistant-demo.md`](homeassistant-demo.md) — same Chat / Approvals / `ha_*` path; panel tiles stand for devices. **Start demo HA** under Connections → Home Assistant, or `pnpm fake:ha`. Smoke: `pnpm demo:ha-smoke`.

## Status (read this first)

| Piece | Today |
|-------|--------|
| Base URL + token (auto-save + enable) | ✅ Settings path works |
| Tools appear “available” after Enable | ✅ `home.listWorkflowTools` |
| REST tool calls (`ha_list_*` / `ha_get_state` / `ha_call_service`) when configured | ✅ via workflow / harness tool path |
| Live HA WebSocket → inbound turn (entity change events) | ⚠️ **Stub** — plugin registers no live inventory yet (B14 slice) |
| Actuation approvals / safety class / journal | ✅ Design rules apply; do not treat workflows as an approval bypass |

So you can **configure and exercise REST tools** against a real HA. Full “light turned on in HA → EnvoyHome turn” event plumbing is still incomplete.

---

## 1. Prerequisites

1. A running Home Assistant (OS, Container, or Core).
2. You can open it in a browser (typically `http://homeassistant.local:8123` or `http://<lan-ip>:8123`).
3. A **Long-Lived Access Token**:
   - HA → your **Profile** (bottom-left) → **Security** → **Long-Lived Access Tokens** → Create Token.
   - Copy the token once; HA will not show it again.

Prefer a read-capable token for the channel field (Design: event-source credentials are `credentialScope: "read"`). Actuation goes through daemon tools + Approvals, not through inventing a write-only plugin path.

---

## 2. Connect in desktop Settings

1. Start EnvoyHome (`pnpm desktop:dev` or daemon + desktop).
2. Create / select a **profile** (account).
3. Open **Connections** → **Home Assistant**.
4. Enter:
   - **Base URL** = HA root only, e.g. `http://homeassistant.local:8123`  
     (no `/api`, no trailing path)
   - **Access token** = long-lived token  
   Config saves and enables automatically. Use **Test connection** to verify.
5. Status line should show Home chat ready / enabled.

### Via RPC

```json
home.setChannelConfig {
  "id": "homeassistant",
  "config": { "baseUrl": "http://homeassistant.local:8123" },
  "secrets": { "accessToken": "<long-lived-token>" }
}
home.enableChannel { "id": "homeassistant" }
home.getChannelStatus { "id": "homeassistant" }
```

Secrets are write-only (never echoed in status / list). Persisted under the daemon state dir (`~/.envoyhome` by default).

---

## 3. Bind objects (when inventory exists)

Design: every entity/topic is an **object** bound to an account with a **class** (`light`, `lock`, …). Unbound objects open **no** turn.

1. Stay on **Connections** → **Home Assistant** (Objects section below the config form).
2. Bind an unbound source: pick **class**, account, optional `neverUnattended`.
3. Presence-class objects cannot be marked shared.

Until the HA channel registers live sources, the unbound list may stay empty — you can still test **REST tools** via workflows (below). Binding becomes required for the full event → turn path.

---

## 4. How to test (demo path)

### A. Catalogue gate (no HA needed beyond Enable)

1. Enable the channel (even without a reachable HA, Enable flips availability).
2. **Skills** → **Workflows** → New / Edit → **Available tools**.
3. `ha_*` rows should show **available** (not “Enable the homeassistant channel…”).

### B. REST read against a real HA (recommended smoke)

1. Configure real `baseUrl` + token; Enable.
2. New workflow (Who can use = your profile or Everyone):

```yaml
id: ha_smoke_list
match:
  keywords: ["ha smoke list"]
steps:
  - id: list
    type: tool
    name: ha_list_entities
```

3. **Validate** → **Save** → **Test run** (select a profile).
4. Expect step `ok` and JSON entity list in the result output.
5. Optional second workflow — read one entity you know exists:

```yaml
id: ha_smoke_state
match:
  keywords: ["ha smoke state"]
steps:
  - id: st
    type: tool
    name: ha_get_state
    args:
      objectId: homeassistant:light.living_room
```

Replace with a real bound handle (`channel:entity_id`) from Connections → Home Assistant (or HA States + bind).

### C. Actuation (careful)

`ha_call_service` is **`admin`**. Attended Test run will surface Approvals; unattended needs a tight grant. Safety-class entities (locks, alarms, covers, scripts, …) are **never** grant-satisfiable — expect deny / ask every time.

Demo only on a disposable lamp:

```yaml
id: ha_smoke_on
match:
  keywords: ["ha smoke on"]
steps:
  - id: on
    type: tool
    name: ha_call_service
    args:
      objectId: homeassistant:light.living_room
      domain: light
      service: turn_on
```

Approve in **Chat** / Approvals when prompted. Check HA that the light actually changed. Intent/outcome also live in the daemon actuation journal (`home.listActuations`) for operators.

### D. Curl sanity (outside EnvoyHome)

```bash
curl -sS -H "Authorization: Bearer $HASS_TOKEN" \
  -H "Content-Type: application/json" \
  "$HASS_URL/api/"
```

If this fails, EnvoyHome will fail too — fix HA URL/token first.

### E. Automated / engineer checks

```bash
pnpm --filter @envoyhome/smarthome test
pnpm --filter @envoyhome/daemon test -- test/workflow-tools.test.ts
pnpm --filter @envoyhome/daemon test -- test/smarthome-rpc.test.ts
# Appendix C.4 safety corpus (required-deny)
pnpm --filter @envoyhome/smarthome test -- test/safety.test.ts
```

---

## 5. Troubleshooting

| Symptom | Check |
|---------|--------|
| Tools “unavailable: Enable the homeassistant channel” | Save config then **Enable Home Assistant** |
| `tool_unavailable: … baseUrl + accessToken` | Both fields saved; re-Save after paste |
| HA API 401 | Token revoked / incomplete copy; create a new long-lived token |
| Connection refused | Wrong host/port; HA not on same LAN; use IP not `.local` if mDNS fails |
| Empty unbound list on HA tab | Expected while channel is event stub; REST tools still work |
| Actuation denied | Approvals / grant / safety class — by design (V-HA-4 / V-HA-5) |

---

## Related

- MQTT: [`docs/mqtt-setup.md`](mqtt-setup.md)
- Design §5.7 (smart-home surface)
- Local fake HA + light panel: [`docs/homeassistant-demo.md`](homeassistant-demo.md)
- Telegram demo pattern: [`docs/telegram-demo-setup.md`](telegram-demo-setup.md)
