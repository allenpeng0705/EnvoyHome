# EnvoyHome — MQTT setup

Operator checklist for the bundled **MQTT** channel (`plugins/channel-mqtt`) and the `mqtt_*` tool bundle (`@envoyhome/smarthome`, Design §5.7).

| Item | Value |
|------|--------|
| Channel id | `mqtt` |
| Kind | `event-source` (read credential; **no** actuate from the plugin) |
| Config RPC | `home.setChannelConfig` → `home.enableChannel` |
| Object bind | Same tab: Connections → **MQTT** (`actuationAllowList` for topics) |
| Settings | Desktop → **Connections** → **MQTT** |
| Tools | `mqtt_subscribe`, `mqtt_read`, `mqtt_publish` |

**What MQTT is here:** a generic IoT bus (Mosquitto, Zigbee2MQTT, ESPHome, …). EnvoyHome is not a broker — point it at yours (or use the local **Demo MQTT** for testing).

---

## Status (read this first)

| Piece | Today |
|-------|--------|
| Auto-save broker URL + optional user/pass, auto-enable | ✅ Connections → MQTT |
| Test connection (TCP reachability via channel health) | ✅ |
| **Start / Stop demo MQTT** (fake broker + device panel) | ✅ Same idea as Demo HA |
| Demo HA + Demo MQTT at the same time | ✅ Different ports (HA `18123`, MQTT `18883` / panel `18884`) |
| Tools appear “available” after Enable | ✅ `home.listWorkflowTools` |
| Live `mqtt_publish` / read via mqtt.js | ✅ Real broker I/O |
| Live broker subscribe → inbound turn | ⚠️ Still stub — channel plugin does not open turns yet |
| Safety: unlisted topics are safety-class; QoS 0 / no retain for actuation | ✅ Normative rules |

---

## 1. Fastest path: Demo MQTT (recommended for testing)

1. Start EnvoyHome desktop (daemon with current protocol).
2. Pick a profile.
3. **Connections** → **MQTT** → **Start demo MQTT**.
4. Form fills with demo broker URL + user/pass (`mqtt://127.0.0.1:18883`, `envoyhome` / `demo`). A browser panel opens with fake devices (`MQTT台灯`, porch light, fan, **MQTT温度** thermostat).
5. **Home chat** unlocks (HA **or** MQTT ready).
6. Say e.g. `打开MQTT台灯` → **Approvals** → **Allow** → panel shows **ON**. Or `调高MQTT温度到24度` → Allow → thermostat tile shows **24 °C**.

You can also **Start demo HA** on the Home Assistant tab — both demos run together. Prefer phrases with `MQTT` when both are bound so the local planner picks the MQTT object.

Standalone (optional):

```bash
pnpm fake:mqtt
# broker mqtt://127.0.0.1:18883  panel http://127.0.0.1:18884/
```

Then **Start demo MQTT** in the UI attaches to the already-running broker.

---

## 2. Prerequisites (real broker)

1. An MQTT broker you control, e.g.:
   - [Mosquitto](https://mosquitto.org/) on LAN: `mqtt://192.168.x.x:1883`
   - Or HA’s MQTT integration broker if you already use that
2. Prefer a **read-only** ACL user for the channel secrets (subscribe only). Write/publish belongs on the daemon tool path after Approvals — not on an unrestricted event-source credential.

```bash
mosquitto -p 1883
# or Docker:
# docker run --rm -p 1883:1883 eclipse-mosquitto:2
```

---

## 3. Connect a real broker in desktop Settings

1. Start EnvoyHome.
2. Open **Connections** → **MQTT**.
3. Enter **Broker URL** (e.g. `mqtt://127.0.0.1:1883`) and optional **Username** / **Password**.
   Config saves and enables automatically. Use **Test connection** to verify the host/port is reachable.
4. Status line should show enabled (and healthy when the broker accepts TCP).

### Via RPC

```json
home.setChannelConfig {
  "id": "mqtt",
  "config": { "brokerUrl": "mqtt://127.0.0.1:1883" },
  "secrets": { "username": "envoy_ro", "password": "…" }
}
home.enableChannel { "id": "mqtt" }
home.getChannelStatus { "id": "mqtt" }
```

Demo RPCs: `home.startDemoMqtt` / `home.getDemoMqttStatus` / `home.stopDemoMqtt`. Stop (or leaving the demo broker URL) removes demo-bound topics from Objects and disables the demo channel when still pointed at the fake broker by URL. Prefer **Stop demo MQTT** before configuring a real broker.

---

## 4. Bind topics as objects

Demo MQTT binds topics automatically. For a real broker:

1. Stay on **Connections** → **MQTT** (Objects section below the config form).
2. Bind `sourceId` (topic) to an account.
3. Set **class** (`light`, `switch`, …).
4. Fill **MQTT allow-list** with topics this object may actuate on.  
   Empty / unlisted topics are **safety-class** (approval every time; never grant-satisfiable).

---

## 5. How to test

### A. Demo round-trip

1. Start demo MQTT.
2. Home chat: `打开MQTT台灯` → Allow in Approvals.
3. Confirm panel / `GET http://127.0.0.1:18884/api/devices`.

### B. Catalogue gate

1. Enable MQTT.
2. **Skills** → **Workflows** → **Available tools** → `mqtt_*` should be **available**.

### C. External broker check

```bash
mosquitto_sub -h 127.0.0.1 -t 'home/test' -v
mosquitto_pub -h 127.0.0.1 -t 'home/test' -m '1'
```

### D. Engineer checks

```bash
pnpm --filter @envoyhome/fake-mqtt test
pnpm --filter @envoyhome/smarthome test
pnpm --filter @envoyhome/daemon test -- test/demo-mqtt.test.ts
```

---

## 6. Troubleshooting

| Symptom | Check |
|---------|--------|
| Tools unavailable | Enable MQTT after broker URL is set |
| Demo start fails / stale daemon | Quit and reopen EnvoyHome so the daemon picks up new RPCs |
| Actuation refused for a topic | Topic not on object `actuationAllowList` → safety class |
| Confused HA vs MQTT | Bound object’s **channel** picks the tool (`ha_*` vs `mqtt_*`). Say `MQTT台灯` when both demos are on. |

---

## Related

- Home Assistant: [`docs/homeassistant-setup.md`](homeassistant-setup.md)
- Design §5.7
- Telegram: [`docs/telegram-demo-setup.md`](telegram-demo-setup.md)
