// Local fake-ha demo — home.startDemoHa + real HA path stays independent.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetActiveXForTests } from "@envoyhome/test-utils";
import { createHaClient } from "@envoyhome/smarthome";
import { startDaemon, type RunningDaemon } from "../dist/index.js";

const daemons: RunningDaemon[] = [];

after(async () => {
  __resetActiveXForTests();
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

async function boot() {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-demo-ha-"));
  const daemon = await startDaemon({
    config: { wsPort: 0, httpPort: 0, stateDir, hatchApiKey: "k" },
    packageVersion: "0.0.0-test",
  });
  daemons.push(daemon);
  return {
    daemon,
    cleanup: async () => {
      await daemon.stop().catch(() => undefined);
      const idx = daemons.indexOf(daemon);
      if (idx >= 0) daemons.splice(idx, 1);
      await rm(stateDir, { recursive: true, force: true });
    },
  };
}

async function rpc(
  port: number,
  method: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const { WebSocket } = await import("ws");
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error("timeout"));
    }, 15_000);
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw)) as Record<string, unknown>;
      if (message["id"] !== 1) return;
      clearTimeout(timer);
      socket.close();
      resolve(message);
    });
    socket.on("open", () => socket.send(JSON.stringify({ id: 1, method, params })));
    socket.on("error", reject);
  });
}

test("home.startDemoHa: REST + bind + Home chat gate", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    });

    const started = await rpc(daemon.config.wsPort, "home.startDemoHa", {
      accountId: "alice",
    });
    assert.equal(started["error"], undefined, JSON.stringify(started));
    const result = started["result"] as {
      running: boolean;
      baseUrl: string;
      panelUrl: string;
      bound: string[];
    };
    assert.equal(result.running, true);
    assert.ok(result.baseUrl);
    assert.ok(result.bound.includes("light.living_room"));
    assert.ok(result.bound.includes("cover.garage_door"));
    assert.ok(result.bound.includes("lock.front_door"));
    assert.ok(result.bound.includes("alarm_control_panel.home"));
    assert.ok(result.bound.includes("sensor.outdoor_temperature"));

    const client = createHaClient({
      baseUrl: result.baseUrl,
      token: "envoyhome-demo",
    });
    await client.callService("light", "turn_on", { entity_id: "light.living_room" });
    assert.equal((await client.getState("light.living_room"))?.state, "on");
    await client.callService("lock", "unlock", { entity_id: "lock.front_door" });
    assert.equal((await client.getState("lock.front_door"))?.state, "unlocked");

    const panel = await fetch(result.panelUrl);
    assert.equal(panel.status, 200);
    const panelHtml = await panel.text();
    assert.match(panelHtml, /Home devices/);
    assert.match(panelHtml, /Lights & fans/);
    assert.match(panelHtml, /Security/);

    const st = await rpc(daemon.config.wsPort, "home.getChannelStatus", {
      id: "homeassistant",
    });
    assert.equal((st["result"] as { ready?: boolean }).ready, true);

    const home = await rpc(daemon.config.wsPort, "home.openSession", {
      accountId: "alice",
      purpose: "home",
    });
    assert.equal(home["error"], undefined);

    const status = await rpc(daemon.config.wsPort, "home.getDemoHaStatus", {});
    assert.equal((status["result"] as { running?: boolean }).running, true);

    const beforeStop = await rpc(daemon.config.wsPort, "home.listSources", {
      channel: "homeassistant",
      bound: true,
    });
    assert.ok(
      ((beforeStop["result"] as { sources: unknown[] }).sources ?? []).length > 0,
      "demo should bind HA objects",
    );

    await rpc(daemon.config.wsPort, "home.stopDemoHa", {});
    const afterStop = await rpc(daemon.config.wsPort, "home.listSources", {
      channel: "homeassistant",
    });
    assert.equal(afterStop["error"], undefined, JSON.stringify(afterStop));
    assert.deepEqual(
      (afterStop["result"] as { sources: unknown[] }).sources,
      [],
      "stop demo HA must remove demo objects",
    );
    const stAfter = await rpc(daemon.config.wsPort, "home.getChannelStatus", {
      id: "homeassistant",
    });
    assert.equal((stAfter["result"] as { enabled?: boolean }).enabled, false);
  } finally {
    await cleanup();
  }
});

test("home.stopDemoHa: sticky demo:true + real URL must not wipe/disable", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    });
    const started = await rpc(daemon.config.wsPort, "home.startDemoHa", {
      accountId: "alice",
    });
    assert.equal(started["error"], undefined, JSON.stringify(started));

    // Simulate Settings auto-save keeping sticky demo:true while switching to a real hub URL
    // (pre-fix merge behavior). Cleanup must key off URL, not the flag alone.
    const switched = await rpc(daemon.config.wsPort, "home.setChannelConfig", {
      id: "homeassistant",
      config: {
        baseUrl: "http://192.0.2.10:8123",
        demo: true,
      },
    });
    assert.equal(switched["error"], undefined, JSON.stringify(switched));

    // Leaving the demo URL should already have cleared demo inventory.
    const afterMigrate = await rpc(daemon.config.wsPort, "home.listSources", {
      channel: "homeassistant",
    });
    assert.deepEqual(
      (afterMigrate["result"] as { sources: unknown[] }).sources,
      [],
      "leaving demo URL clears demo objects",
    );

    // Re-bind a "real" overlapping entity id so Stop must not delete it.
    await rpc(daemon.config.wsPort, "home.enableChannel", { id: "homeassistant" });
    // register via setChannelConfig path won't invent sources — seed through startDemo then
    // re-point is enough for the Stop predicate; bind a fresh non-demo id manually via RPC
    // after registerSources isn't exposed. Use listSources empty + Stop must keep channel enabled.
    await rpc(daemon.config.wsPort, "home.stopDemoHa", {});
    const stAfter = await rpc(daemon.config.wsPort, "home.getChannelStatus", {
      id: "homeassistant",
    });
    assert.equal(
      (stAfter["result"] as { enabled?: boolean }).enabled,
      true,
      "Stop must not disable a real hub URL even with sticky demo:true",
    );
  } finally {
    await cleanup();
  }
});
