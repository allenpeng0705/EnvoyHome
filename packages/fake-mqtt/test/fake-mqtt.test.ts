import { test } from "node:test";
import assert from "node:assert/strict";
import mqtt from "mqtt";
import { DEMO_MQTT_PASSWORD, DEMO_MQTT_USERNAME, startFakeMqttServer } from "../dist/index.js";

test("fake-mqtt: broker publish updates store + panel API", async () => {
  const handle = await startFakeMqttServer({ mqttPort: 0, panelPort: 0 });
  try {
    assert.equal(handle.username, DEMO_MQTT_USERNAME);
    assert.equal(handle.password, DEMO_MQTT_PASSWORD);
    // Re-read actual ports from handle (0 → ephemeral).
    const brokerUrl = handle.brokerUrl;
    const client = mqtt.connect(brokerUrl, {
      reconnectPeriod: 0,
      connectTimeout: 5_000,
      username: handle.username,
      password: handle.password,
    });
    await new Promise<void>((resolve, reject) => {
      client.once("connect", () => resolve());
      client.once("error", reject);
    });
    await new Promise<void>((resolve, reject) => {
      client.publish("envoyhome/demo/switch/mqtt_desk", "ON", { qos: 0 }, (err) =>
        err ? reject(err) : resolve(),
      );
    });
    // Publish ack can fire before aedes emits `publish` — wait before tearing down the client.
    let row = handle.store.get("envoyhome/demo/switch/mqtt_desk");
    for (let i = 0; i < 40 && row?.state !== "ON"; i++) {
      await new Promise((r) => setTimeout(r, 25));
      row = handle.store.get("envoyhome/demo/switch/mqtt_desk");
    }
    client.end(true);
    assert.equal(row?.state, "ON");

    const res = await fetch(`${handle.panelUrl}api/devices`);
    assert.equal(res.ok, true);
    const devices = (await res.json()) as Array<{ topic: string; state: string }>;
    const desk = devices.find((d) => d.topic === "envoyhome/demo/switch/mqtt_desk");
    assert.equal(desk?.state, "ON");

    const panel = await fetch(handle.panelUrl);
    assert.equal(panel.ok, true);
    const html = await panel.text();
    assert.match(html, /MQTT devices/);
    assert.match(html, /Broker URL/);
    assert.match(html, /conn-meta/);
    assert.match(html, /Lights & switches/);
    assert.match(html, /Climate/);
    assert.ok(html.includes(handle.brokerUrl));

    // Writable thermostat — publish a setpoint number.
    const setRes = await fetch(`${handle.panelUrl}api/set`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "envoyhome/demo/climate/mqtt_thermostat",
        payload: "24",
      }),
    });
    assert.equal(setRes.ok, true);
    assert.equal(handle.store.get("envoyhome/demo/climate/mqtt_thermostat")?.state, "24");
  } finally {
    await handle.close();
  }
});
