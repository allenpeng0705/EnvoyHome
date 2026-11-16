// Owner create-time grants for Scenes/standing (Design §4.4 / 2026-11-13b).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flushLoop, __resetActiveXForTests } from "@envoyhome/test-utils";
import { toolArgsDigest } from "@envoyhome/harness-host";
import { startDaemon, type RunningDaemon } from "../dist/index.js";

const daemons: RunningDaemon[] = [];

after(async () => {
  __resetActiveXForTests();
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

async function boot() {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-grants-"));
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
    }, 8_000);
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

async function bindHaLight(daemon: RunningDaemon, accountId: string, sourceId: string, cls: string) {
  const channelAccount =
    daemon.channels.loader.getChannelStatus("homeassistant").channelAccount || "default";
  await daemon.channels.objects.registerSources("homeassistant", channelAccount, [
    { sourceId, displayName: sourceId, class: cls },
  ]);
  await daemon.channels.objects.setSourceBinding({
    channel: "homeassistant",
    channelAccount,
    sourceId,
    accountId,
    class: cls,
    shared: false,
    neverUnattended: cls === "lock" || cls === "alarm" || cls === "presence",
  });
}

test("putUnattendedGrants mints claimable ha_call_service digest; extra args still match", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    });
    await bindHaLight(daemon, "alice", "light.living_room", "light");
    const objectId = "homeassistant:light.living_room";
    const ans = await rpc(daemon.config.wsPort, "home.putUnattendedGrants", {
      accountId: "alice",
      grants: [
        { tool: "ha_call_service", objectId, domain: "light", service: "turn_on" },
        { tool: "ha_call_service", objectId, domain: "light", service: "turn_off" },
      ],
    });
    assert.equal(ans.error, undefined, JSON.stringify(ans.error));
    const grants = (ans.result as { grants: Array<{ tool: string; argsDigest: string }> }).grants;
    assert.equal(grants.length, 2);
    const expectedOn = toolArgsDigest("ha_call_service", {
      objectId,
      domain: "light",
      service: "turn_on",
    });
    assert.equal(grants[0]?.argsDigest, expectedOn);
    const claimed = await daemon.turns.approvals.claimGrant({
      accountId: "alice",
      tool: "ha_call_service",
      argsDigest: toolArgsDigest("ha_call_service", {
        objectId,
        domain: "light",
        service: "turn_on",
        brightness: 128,
      }),
      actuationId: "test-act",
    });
    assert.ok(claimed);
    await flushLoop();
  } finally {
    await cleanup();
  }
});

test("putUnattendedGrants refuses safety-class lock", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    });
    await bindHaLight(daemon, "alice", "lock.front", "lock");
    const ans = await rpc(daemon.config.wsPort, "home.putUnattendedGrants", {
      accountId: "alice",
      grants: [
        {
          tool: "ha_call_service",
          objectId: "homeassistant:lock.front",
          domain: "lock",
          service: "unlock",
        },
      ],
    });
    assert.ok(ans.error);
    await flushLoop();
  } finally {
    await cleanup();
  }
});

test("putUnattendedGrants refuses object bound to another seat; validates before write", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    });
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "bob",
      displayName: "Bob",
    });
    await bindHaLight(daemon, "bob", "light.kitchen", "light");
    const objectId = "homeassistant:light.kitchen";
    const ans = await rpc(daemon.config.wsPort, "home.putUnattendedGrants", {
      accountId: "alice",
      grants: [
        { tool: "ha_call_service", objectId, domain: "light", service: "turn_on" },
        {
          tool: "ha_call_service",
          objectId: "homeassistant:light.missing",
          domain: "light",
          service: "turn_off",
        },
      ],
    });
    assert.ok(ans.error);
    const listed = await daemon.turns.approvals.listGrants("alice");
    assert.equal(listed.length, 0, "no partial grants after failed batch");
    await flushLoop();
  } finally {
    await cleanup();
  }
});
