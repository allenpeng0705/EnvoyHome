// Local fake-mqtt demo — home.startDemoMqtt; can coexist with demo HA.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetActiveXForTests } from "@envoyhome/test-utils";
import { createMqttClient } from "@envoyhome/smarthome";
import { startDaemon, type RunningDaemon } from "../dist/index.js";

const daemons: RunningDaemon[] = [];

after(async () => {
  __resetActiveXForTests();
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

async function boot() {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-demo-mqtt-"));
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

test("home.startDemoMqtt: broker + bind + publish round-trip", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    });

    const started = await rpc(daemon.config.wsPort, "home.startDemoMqtt", {
      accountId: "alice",
    });
    assert.equal(started["error"], undefined, JSON.stringify(started));
    const result = started["result"] as {
      running: boolean;
      brokerUrl: string;
      panelUrl: string;
      username: string;
      password: string;
      bound: string[];
    };
    assert.equal(result.running, true);
    assert.ok(result.brokerUrl.startsWith("mqtt://"));
    assert.ok(result.bound.includes("envoyhome/demo/switch/mqtt_desk"));

    const st = await rpc(daemon.config.wsPort, "home.getChannelStatus", { id: "mqtt" });
    assert.equal((st["result"] as { ready?: boolean }).ready, true);

    assert.equal(result.username, "envoyhome");
    assert.equal(result.password, "demo");
    const client = createMqttClient({
      brokerUrl: result.brokerUrl,
      username: result.username,
      password: result.password,
    });
    try {
      await client.publish("envoyhome/demo/switch/mqtt_desk", "ON");
      // aedes applies store update shortly after publish ack — poll before assert.
      let state = "";
      for (let i = 0; i < 40; i++) {
        const panel = await fetch(`${result.panelUrl}api/devices`);
        const devices = (await panel.json()) as Array<{ topic: string; state: string }>;
        state = devices.find((d) => d.topic === "envoyhome/demo/switch/mqtt_desk")?.state ?? "";
        if (state === "ON") break;
        await new Promise((r) => setTimeout(r, 25));
      }
      assert.equal(state, "ON");
    } finally {
      await client.close();
    }

    // Both demos can run together (HA start should not stop MQTT).
    const ha = await rpc(daemon.config.wsPort, "home.startDemoHa", { accountId: "alice" });
    assert.equal(ha["error"], undefined, JSON.stringify(ha));
    const mqttStill = await rpc(daemon.config.wsPort, "home.getDemoMqttStatus");
    assert.equal((mqttStill["result"] as { running?: boolean }).running, true);

    await rpc(daemon.config.wsPort, "home.stopDemoMqtt", {});
    const mqttAfterStop = await rpc(daemon.config.wsPort, "home.getChannelStatus", {
      id: "mqtt",
    });
    assert.equal((mqttAfterStop["result"] as { ready?: boolean }).ready, false);
    assert.equal((mqttAfterStop["result"] as { enabled?: boolean }).enabled, false);
    const mqttSources = await rpc(daemon.config.wsPort, "home.listSources", { channel: "mqtt" });
    assert.deepEqual(
      (mqttSources["result"] as { sources: unknown[] }).sources,
      [],
      "stop demo MQTT must remove demo objects",
    );

    await rpc(daemon.config.wsPort, "home.stopDemoHa", {});
    const haAfterStop = await rpc(daemon.config.wsPort, "home.getChannelStatus", {
      id: "homeassistant",
    });
    assert.equal((haAfterStop["result"] as { ready?: boolean }).ready, false);
    const haSources = await rpc(daemon.config.wsPort, "home.listSources", {
      channel: "homeassistant",
    });
    assert.deepEqual(
      (haSources["result"] as { sources: unknown[] }).sources,
      [],
      "stop demo HA must remove demo objects",
    );
  } finally {
    await cleanup();
  }
});
