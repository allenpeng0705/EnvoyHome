import { test } from "node:test";
import assert from "node:assert/strict";
import { createHaClient } from "@envoyhome/smarthome";
import { DEMO_TOKEN, startFakeHaServer } from "../dist/index.js";

test("fake HA REST: probe, list, get, callService + panel", async () => {
  const ha = await startFakeHaServer({ port: 0 });
  // port 0 → OS assigns; read from handle
  const baseUrl = ha.baseUrl;
  try {
    const client = createHaClient({ baseUrl, token: ha.token });
    const probe = await client.probe();
    assert.equal(probe.ok, true);

    const entities = await client.listEntities();
    assert.ok(entities.some((e) => e.entityId === "light.living_room"));

    const before = await client.getState("light.living_room");
    assert.equal(before?.state, "off");

    await client.callService("light", "turn_on", { entity_id: "light.living_room" });
    const after = await client.getState("light.living_room");
    assert.equal(after?.state, "on");

    await client.callService("cover", "open_cover", { entity_id: "cover.garage_door" });
    assert.equal((await client.getState("cover.garage_door"))?.state, "open");

    await client.callService("alarm_control_panel", "alarm_arm_home", {
      entity_id: "alarm_control_panel.home",
    });
    assert.equal((await client.getState("alarm_control_panel.home"))?.state, "armed_home");

    await client.callService("media_player", "media_play", {
      entity_id: "media_player.living_room",
    });
    assert.equal((await client.getState("media_player.living_room"))?.state, "playing");

    assert.ok(entities.some((e) => e.entityId === "sensor.outdoor_temperature"));
    assert.ok(entities.some((e) => e.entityId === "binary_sensor.hallway_motion"));

    const services = await client.listServices();
    assert.ok(services.some((d) => d.domain === "light"));
    assert.ok(services.some((d) => d.domain === "cover"));
    assert.ok(services.some((d) => d.domain === "alarm_control_panel"));

    const panel = await fetch(ha.panelUrl);
    assert.equal(panel.status, 200);
    const html = await panel.text();
    assert.match(html, /Home devices/);
    assert.match(html, /Access token/);
    assert.match(html, /Base URL/);
    assert.match(html, /envoyhome-demo/);
    assert.match(html, /Lights & fans/);
    assert.match(html, /Covers & garage/);
    assert.match(html, /Security/);
    assert.match(html, /Sensors/);
    const statesRes = await fetch(`${baseUrl}/api/states`, {
      headers: { Authorization: `Bearer ${ha.token}` },
    });
    const statesJson = (await statesRes.json()) as Array<{ entity_id: string }>;
    assert.ok(statesJson.some((e) => e.entity_id === "light.living_room"));

    const bad = await fetch(`${baseUrl}/api/states`, {
      headers: { Authorization: "Bearer wrong" },
    });
    assert.equal(bad.status, 401);
    assert.equal(DEMO_TOKEN, "envoyhome-demo");
  } finally {
    await ha.close();
  }
});
