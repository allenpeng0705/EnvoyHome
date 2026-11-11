// Design §19.4 / V-P2-PRIV-1 / V-P2-PRIV-2 — Privacy Mode RPC + fail-closed.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flushLoop, __resetActiveXForTests } from "@envoyhome/test-utils";
import { clearExtraToolSpecsForTests } from "@envoyhome/harness-host";
import {
  dispatchForTest,
  loopbackSession,
  startDaemon,
  type RunningDaemon,
} from "../dist/index.js";
import { runExtendedWorkflowTool } from "../dist/workflow-tools.js";
import { homePaths } from "../dist/home-paths.js";

const daemons: RunningDaemon[] = [];

after(async () => {
  __resetActiveXForTests();
  clearExtraToolSpecsForTests();
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
  await flushLoop();
});

async function boot() {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-priv-"));
  const daemon = await startDaemon({
    config: { wsPort: 0, httpPort: 0, stateDir, hatchApiKey: "k" },
    packageVersion: "0.0.0-test",
  });
  daemons.push(daemon);
  await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
  const deps = {
    config: daemon.config,
    startedAt: daemon.startedAt,
    logger: daemon.logger,
    subscriptions: daemon.subscriptions,
    connections: () => 0,
    activeTurns: () => 0,
    onShutdown: () => undefined,
    packageVersion: "0.0.0-test",
    accounts: daemon.accounts,
    household: daemon.household,
    bindings: daemon.bindings,
    pairing: daemon.pairing,
    memory: daemon.memory,
    channels: daemon.channels,
    turns: daemon.turns,
    providers: daemon.providers,
    harnesses: daemon.harnesses,
    workflows: daemon.workflows,
    workflowStepTemplates: daemon.workflowStepTemplates,
    schedules: daemon.schedules,
    standingOrders: daemon.standingOrders,
    skills: daemon.skills,
    artifacts: daemon.artifacts,
    webSearch: daemon.webSearch,
    browserControl: daemon.browserControl,
    actuations: daemon.actuations,
    pushTokens: daemon.pushTokens,
    push: daemon.push,
    localEngine: daemon.localEngine,
    meshStatus: () => ({ kind: "no-node" as const }),
  };
  return {
    daemon,
    deps,
    stateDir,
    cleanup: async () => {
      await daemon.stop().catch(() => undefined);
      const idx = daemons.indexOf(daemon);
      if (idx >= 0) daemons.splice(idx, 1);
      await rm(stateDir, { recursive: true, force: true });
    },
  };
}

test("home.getPrivacyMode / setPrivacyMode Owner-scope round-trip", async () => {
  const { daemon, deps, cleanup } = await boot();
  try {
    const got = await dispatchForTest(
      deps,
      "home.getPrivacyMode",
      { accountId: "alice" },
      loopbackSession(),
    );
    assert.ok("result" in got);
    assert.equal((got.result as { enabled: boolean }).enabled, false);
    assert.equal((got.result as { blockSmartHomeEgress: boolean }).blockSmartHomeEgress, true);

    const set = await dispatchForTest(
      deps,
      "home.setPrivacyMode",
      { accountId: "alice", enabled: true, blockSmartHomeEgress: true },
      loopbackSession(),
    );
    assert.ok("result" in set);
    assert.equal((set.result as { ok: boolean; enabled: boolean }).ok, true);
    assert.equal((set.result as { enabled: boolean }).enabled, true);

    const again = await daemon.turns.privacyMode.get("alice");
    assert.equal(again.enabled, true);
    assert.equal(again.blockSmartHomeEgress, true);

    await dispatchForTest(
      deps,
      "home.setPrivacyMode",
      { accountId: "alice", enabled: false },
      loopbackSession(),
    );
    assert.equal((await daemon.turns.privacyMode.get("alice")).enabled, false);
  } finally {
    await cleanup();
  }
});

test("V-P2-PRIV-2: ha_call_service / mqtt_publish refuse when Privacy Mode blocks egress", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await daemon.turns.privacyMode.set("alice", {
      enabled: true,
      blockSmartHomeEgress: true,
    });
    await daemon.channels.setChannelConfig(
      "homeassistant",
      { baseUrl: "http://127.0.0.1:18123" },
      { accessToken: "t" },
    );
    await daemon.channels.enableChannel("homeassistant");
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "ha_call_service",
          args: {
            objectId: "ha:light.demo",
            domain: "light",
            service: "turn_on",
          },
          skills: daemon.skills,
          channels: daemon.channels,
          paths: homePaths(daemon.config.stateDir),
          accountId: "alice",
          origin: "attended",
          actuations: daemon.actuations,
        }),
      /envoyhome\.privacy_mode: smart-home egress blocked/,
    );

    await daemon.channels.setChannelConfig("mqtt", { brokerUrl: "mqtt://127.0.0.1:18883" }, {});
    await daemon.channels.enableChannel("mqtt");
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "mqtt_publish",
          args: { objectId: "mqtt:home/x", payload: "1" },
          skills: daemon.skills,
          channels: daemon.channels,
          paths: homePaths(daemon.config.stateDir),
          accountId: "alice",
          origin: "attended",
          actuations: daemon.actuations,
        }),
      /envoyhome\.privacy_mode: smart-home egress blocked/,
    );

    // Reads still allowed under Privacy Mode (egress flag targets actuation).
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "ha_get_state",
          args: { objectId: "ha:light.demo" },
          skills: daemon.skills,
          channels: daemon.channels,
          paths: homePaths(daemon.config.stateDir),
          accountId: "alice",
        }),
      /envoyhome\.object_not_bound/,
    );
  } finally {
    await cleanup();
  }
});

test("V-P2-PRIV-1: web_search / web_extract / browser refuse under Privacy Mode", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await daemon.turns.privacyMode.set("alice", {
      enabled: true,
      blockSmartHomeEgress: true,
    });
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "web_search",
          args: { query: "weather" },
          skills: daemon.skills,
          channels: daemon.channels,
          paths: homePaths(daemon.config.stateDir),
          accountId: "alice",
          origin: "attended",
          webSearch: daemon.webSearch,
        }),
      /envoyhome\.privacy_mode: web_search blocked/,
    );
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "web_extract",
          args: { url: "https://example.com/" },
          skills: daemon.skills,
          channels: daemon.channels,
          paths: homePaths(daemon.config.stateDir),
          accountId: "alice",
          origin: "attended",
          webSearch: daemon.webSearch,
        }),
      /envoyhome\.privacy_mode: web_extract blocked/,
    );
    await daemon.webSearch.setConfig({ researchEnabled: true });
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "web_research",
          args: { query: "weather" },
          skills: daemon.skills,
          channels: daemon.channels,
          paths: homePaths(daemon.config.stateDir),
          accountId: "alice",
          origin: "attended",
          webSearch: daemon.webSearch,
        }),
      /envoyhome\.privacy_mode: web_research blocked/,
    );
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "browser",
          args: { action: "navigate", url: "https://example.com/" },
          skills: daemon.skills,
          channels: daemon.channels,
          paths: homePaths(daemon.config.stateDir),
          accountId: "alice",
          origin: "attended",
          browserControl: daemon.browserControl,
        }),
      /envoyhome\.privacy_mode: browser blocked/,
    );
  } finally {
    await cleanup();
  }
});

test("home.get/setPrivacyMode refuse unknown account", async () => {
  const { deps, cleanup } = await boot();
  try {
    await assert.rejects(
      () =>
        dispatchForTest(
          deps,
          "home.getPrivacyMode",
          { accountId: "no-such-seat" },
          loopbackSession(),
        ),
      /not_found|account/,
    );
    await assert.rejects(
      () =>
        dispatchForTest(
          deps,
          "home.setPrivacyMode",
          { accountId: "no-such-seat", enabled: true },
          loopbackSession(),
        ),
      /not_found|account/,
    );
  } finally {
    await cleanup();
  }
});

test("Privacy Mode + scene standing order: cron scene ok; presence needs bound source", async () => {
  const { daemon, deps, cleanup } = await boot();
  try {
    await dispatchForTest(
      deps,
      "home.setPrivacyMode",
      { accountId: "alice", enabled: true, blockSmartHomeEgress: true },
      loopbackSession(),
    );
    const scene = await dispatchForTest(
      deps,
      "home.putStandingOrder",
      {
        accountId: "alice",
        id: "scene:good_morning:test",
        name: "Good morning",
        enabled: true,
        when: { kind: "cron", cronExpr: "0 7 * * *" },
        action: {
          kind: "agentTurn",
          prompt: "Run good-morning routine under Privacy Mode (local tools only).",
        },
      },
      loopbackSession(),
    );
    assert.ok("result" in scene, JSON.stringify(scene));
    const listed = await dispatchForTest(
      deps,
      "home.listStandingOrders",
      { accountId: "alice" },
      loopbackSession(),
    );
    assert.ok("result" in listed);
    const orders = (listed.result as { orders: Array<{ id: string }> }).orders;
    assert.ok(orders.some((o) => o.id.startsWith("scene:")));

    const presence = await dispatchForTest(
      deps,
      "home.putStandingOrder",
      {
        accountId: "alice",
        name: "Leave home",
        enabled: true,
        when: {
          kind: "smarthome_event",
          sourceId: "binary_sensor.anyone_home",
          eventType: "occupancy",
        },
        action: { kind: "agentTurn", prompt: "Leave-home routine" },
      },
      loopbackSession(),
    );
    assert.ok("error" in presence, "unbound presence source must fail");
  } finally {
    await daemon.stop().catch(() => undefined);
    await cleanup();
  }
});

test("V-P2-PRIV-2: blockSmartHomeEgress false allows actuation path past privacy gate", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await daemon.turns.privacyMode.set("alice", {
      enabled: true,
      blockSmartHomeEgress: false,
    });
    await daemon.channels.setChannelConfig("mqtt", { brokerUrl: "mqtt://127.0.0.1:18883" }, {});
    await daemon.channels.enableChannel("mqtt");
    // Still fails closed on unbound — proves privacy gate did not refuse first.
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "mqtt_publish",
          args: { objectId: "mqtt:home/x", payload: "1" },
          skills: daemon.skills,
          channels: daemon.channels,
          paths: homePaths(daemon.config.stateDir),
          accountId: "alice",
          origin: "attended",
          actuations: daemon.actuations,
        }),
      /envoyhome\.object_not_bound/,
    );
  } finally {
    await cleanup();
  }
});
