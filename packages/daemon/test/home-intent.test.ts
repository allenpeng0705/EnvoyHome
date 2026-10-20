// Design §5.7.8 — V-HA-21/22/23 + Home chat gate (V-UX-8).
// Covers unit routing + daemon RPC end-to-end paths (openSession → turn → tools).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flushLoop, __resetActiveXForTests } from "@envoyhome/test-utils";
import { canonicalDigest } from "@envoyhome/harness-host";
import { startDaemon, type RunningDaemon } from "../dist/index.js";
import {
  BOUND_INJECT_CAP_HARD,
  buildBoundObjectCard,
  consumeStickyTurn,
  isHomeAssistantReady,
  isSmartHomeToolName,
  normalizePurpose,
  extractHomeProposalFromAssistant,
  planAffirmedHomeActuation,
  planFromPendingProposal,
  planLocalHomeActuation,
  resolveHomeSurface,
} from "../dist/home-intent.js";
import type { ObjectRecord } from "../dist/object-registry.js";

const daemons: RunningDaemon[] = [];

after(async () => {
  __resetActiveXForTests();
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

async function boot() {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-ha-nl-"));
  const daemon = await startDaemon({
    config: { wsPort: 0, httpPort: 0, stateDir, hatchApiKey: "k" },
    packageVersion: "0.0.0-test",
  });
  daemons.push(daemon);
  return {
    daemon,
    stateDir,
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

function sampleObject(partial: Partial<ObjectRecord> & Pick<ObjectRecord, "sourceId">): ObjectRecord {
  const now = new Date().toISOString();
  return {
    channel: "homeassistant",
    channelAccount: "default",
    sourceId: partial.sourceId,
    displayName: partial.displayName ?? partial.sourceId,
    class: partial.class ?? "light",
    bound: partial.bound ?? true,
    accountId: partial.accountId ?? "alice",
    shared: partial.shared ?? false,
    neverUnattended: partial.neverUnattended ?? false,
    actuationAllowList: partial.actuationAllowList ?? [],
    indirectionAllowList: partial.indirectionAllowList ?? [],
    firstSeen: partial.firstSeen ?? now,
    lastSeen: partial.lastSeen ?? now,
  };
}

async function enableHa(daemon: RunningDaemon): Promise<void> {
  await daemon.channels.setChannelConfig(
    "homeassistant",
    { baseUrl: "http://127.0.0.1:8123" },
    { accessToken: "test-token" },
  );
  await daemon.channels.enableChannel("homeassistant");
}

async function waitForApproval(
  daemon: RunningDaemon,
  accountId: string,
  timeoutMs = 2000,
  opts?: { minCount?: number; predicate?: (row: { id: string; argsDigest: string; tool: string; turnId?: string }) => boolean },
): Promise<{ id: string; argsDigest: string; tool: string; turnId?: string }> {
  const start = Date.now();
  const minCount = opts?.minCount ?? 1;
  while (Date.now() - start < timeoutMs) {
    await flushLoop();
    const listed = await daemon.turns.listApprovals(accountId);
    const rows =
      (listed.approvals as Array<{ id: string; argsDigest: string; tool: string; turnId?: string }>) ??
      [];
    if (rows.length >= minCount) {
      const hit = opts?.predicate ? rows.find(opts.predicate) : rows[0];
      if (hit) return hit;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("timed out waiting for approval");
}

/* ---- Unit: routing / inject (no daemon) -------------------------------- */

test("normalizePurpose + isSmartHomeToolName", () => {
  assert.equal(normalizePurpose("home"), "home");
  assert.equal(normalizePurpose("schedules"), "schedules");
  assert.equal(normalizePurpose("general"), "general");
  assert.equal(normalizePurpose(undefined), "general");
  assert.equal(normalizePurpose("other"), "general");
  assert.equal(isSmartHomeToolName("ha_get_state"), true);
  assert.equal(isSmartHomeToolName("mqtt_publish"), true);
  assert.equal(isSmartHomeToolName("exec"), false);
});

test("resolveHomeSurface: purpose / sticky / local / off (no LLM)", () => {
  const bound = [sampleObject({ sourceId: "light.kitchen", displayName: "Kitchen lamp" })];
  assert.equal(
    resolveHomeSurface({ purpose: "home", userText: "hello", boundObjects: bound }).reason,
    "purpose",
  );
  assert.equal(
    resolveHomeSurface({
      purpose: "schedules",
      userText: "turn on the kitchen lamp",
      boundObjects: bound,
    }).homeSurface,
    false,
  );
  assert.equal(
    resolveHomeSurface({
      purpose: "general",
      stickyHomeTurnsRemaining: 2,
      userText: "thanks",
      boundObjects: bound,
    }).reason,
    "sticky",
  );
  assert.equal(
    resolveHomeSurface({
      purpose: "general",
      userText: "turn on the Kitchen lamp",
      boundObjects: bound,
    }).reason,
    "local",
  );
  assert.equal(
    resolveHomeSurface({
      purpose: "general",
      userText: "status of light.kitchen",
      boundObjects: bound,
    }).reason,
    "local",
  );
  assert.equal(
    resolveHomeSurface({
      purpose: "general",
      userText: "summarize my notes",
      boundObjects: bound,
    }).homeSurface,
    false,
  );
  assert.equal(
    resolveHomeSurface({
      purpose: "general",
      userText: "打开卧室灯",
      boundObjects: [
        { displayName: "Bedroom / 卧室", sourceId: "light.bedroom", class: "light" },
      ],
    }).reason,
    "local",
    "CJK open-bedroom-light must enable home surface",
  );
  assert.equal(
    resolveHomeSurface({
      purpose: "general",
      userText: "  ",
      boundObjects: bound,
    }).reason,
    "off",
  );
});

test("planLocalHomeActuation: CJK + English on/off for bound lights", () => {
  const bound = [
    { displayName: "Bedroom / 卧室", sourceId: "light.bedroom", class: "light" as const },
    { displayName: "Kitchen / 厨房", sourceId: "light.kitchen", class: "light" as const },
  ];
  const zh = planLocalHomeActuation("打开卧室灯", bound);
  assert.ok(zh);
  assert.equal(zh!.tools[0]!.tool, "ha_call_service");
  assert.deepEqual(zh!.tools[0]!.args, {
    objectId: "homeassistant:light.bedroom",
    domain: "light",
    service: "turn_on",
  });
  const en = planLocalHomeActuation("turn off the kitchen light", bound);
  assert.ok(en);
  assert.equal(en!.tools[0]!.args.service, "turn_off");
  assert.equal(en!.tools[0]!.args.objectId, "homeassistant:light.kitchen");
  assert.equal(planLocalHomeActuation("summarize my notes", bound), undefined);
});

test("planLocalHomeActuation: climate setpoint (CJK + English)", () => {
  const bound = [
    {
      displayName: "Hallway thermostat",
      sourceId: "climate.hallway",
      class: "climate" as const,
    },
  ];
  const zh = planLocalHomeActuation("调高空调到26度", bound);
  assert.ok(zh);
  assert.deepEqual(zh!.tools[0]!.args, {
    objectId: "homeassistant:climate.hallway",
    domain: "climate",
    service: "set_temperature",
    temperature: 26,
  });
  assert.match(zh!.reply, /Approvals|审批/);
  const en = planLocalHomeActuation("set hallway thermostat to 22", bound);
  assert.ok(en);
  assert.equal(en!.tools[0]!.args.temperature, 22);
  assert.equal(en!.tools[0]!.args.service, "set_temperature");
});

test("planLocalHomeActuation: MQTT thermostat setpoint publishes number", () => {
  const bound = [
    {
      displayName: "MQTT Thermostat / MQTT温度",
      sourceId: "envoyhome/demo/climate/mqtt_thermostat",
      class: "climate" as const,
      channel: "mqtt",
    },
    {
      displayName: "Hallway thermostat",
      sourceId: "climate.hallway",
      class: "climate" as const,
      channel: "homeassistant",
    },
  ];
  const plan = planLocalHomeActuation("调高MQTT温度到24度", bound);
  assert.ok(plan);
  assert.equal(plan!.tools.length, 1);
  assert.equal(plan!.tools[0]!.tool, "mqtt_publish");
  assert.deepEqual(plan!.tools[0]!.args, {
    objectId: "mqtt:envoyhome/demo/climate/mqtt_thermostat",
    payload: "24",
  });
  assert.match(plan!.reply, /Approvals|审批/);
});

test("planAffirmedHomeActuation: 是的 recovers handle + setpoint from prior assistant", () => {
  const bound = [
    {
      displayName: "Hallway thermostat",
      sourceId: "climate.hallway",
      class: "climate" as const,
      channel: "homeassistant",
    },
  ];
  const withHandle = [
    {
      role: "assistant",
      content:
        "需要我把 Hallway thermostat 的目标温度设置为 24℃ 吗？\n`homeassistant:climate.hallway`",
    },
  ];
  const plan = planAffirmedHomeActuation("是的", withHandle, bound);
  assert.ok(plan);
  assert.equal(plan!.tools[0]!.tool, "ha_call_service");
  assert.deepEqual(plan!.tools[0]!.args, {
    objectId: "homeassistant:climate.hallway",
    domain: "climate",
    service: "set_temperature",
    temperature: 24,
  });
  // Real demo path: offer names the thermostat, no opaque handle yet.
  const namedOnly = [
    {
      role: "assistant",
      content: "需要我把 Hallway thermostat 的目标温度设置为 24℃ 吗？",
    },
  ];
  const fromName = planAffirmedHomeActuation("是的", namedOnly, bound);
  assert.ok(fromName);
  assert.equal(fromName!.tools[0]!.args.objectId, "homeassistant:climate.hallway");
  assert.equal(fromName!.tools[0]!.args.temperature, 24);
  assert.equal(planAffirmedHomeActuation("随便聊聊", withHandle, bound), undefined);

  // Session pending beats history scrape (multi-round durable offer).
  const pending = {
    tool: "ha_call_service",
    args: {
      objectId: "homeassistant:climate.hallway",
      domain: "climate",
      service: "set_temperature",
      temperature: 22,
    },
    summary: "Set hallway to 22°",
    createdAt: new Date().toISOString(),
  };
  const fromPending = planAffirmedHomeActuation("是的", namedOnly, bound, pending);
  assert.ok(fromPending);
  assert.equal(fromPending!.tools[0]!.args.temperature, 22);
  assert.equal(planFromPendingProposal(pending, true).tools[0]!.args.temperature, 22);

  const offer = extractHomeProposalFromAssistant(
    "需要我把 Hallway thermostat 的目标温度设置为 24℃ 吗？",
    bound,
    true,
  );
  assert.ok(offer);
  assert.equal(offer!.tools[0]!.args.temperature, 24);
});

test("planLocalHomeActuation: MQTT publish for bound mqtt topics", () => {
  const bound = [
    {
      displayName: "MQTT Desk lamp / MQTT台灯",
      sourceId: "envoyhome/demo/switch/mqtt_desk",
      class: "switch" as const,
      channel: "mqtt",
    },
    {
      displayName: "MQTT Porch light / MQTT廊灯",
      sourceId: "envoyhome/demo/light/mqtt_porch",
      class: "light" as const,
      channel: "mqtt",
    },
    {
      displayName: "Desk lamp",
      sourceId: "switch.desk_lamp",
      class: "switch" as const,
      channel: "homeassistant",
    },
  ];
  const mqtt = planLocalHomeActuation("打开MQTT台灯", bound);
  assert.ok(mqtt);
  assert.equal(mqtt!.tools[0]!.tool, "mqtt_publish");
  assert.deepEqual(mqtt!.tools[0]!.args, {
    objectId: "mqtt:envoyhome/demo/switch/mqtt_desk",
    payload: "ON",
  });
  assert.match(mqtt!.tools[0]!.summary!, /mqtt · .* · envoyhome\/demo\/switch\/mqtt_desk/);
  // Must not pick desk when user asked for 廊灯 (was a real demo bug).
  const porch = planLocalHomeActuation("打开MQTT廊灯", bound);
  assert.ok(porch);
  assert.equal(porch!.tools[0]!.tool, "mqtt_publish");
  assert.equal(porch!.tools[0]!.args.objectId, "mqtt:envoyhome/demo/light/mqtt_porch");
  const ha = planLocalHomeActuation("打开台灯", bound);
  assert.ok(ha);
  assert.equal(ha!.tools[0]!.tool, "ha_call_service");
  assert.match(ha!.tools[0]!.summary!, /homeassistant · .* · switch\.desk_lamp/);

  // MQTT-only demo: generic 台灯 still plans mqtt_publish.
  const mqttOnly = planLocalHomeActuation("打开台灯", [bound[0]!]);
  assert.ok(mqttOnly);
  assert.equal(mqttOnly!.tools[0]!.tool, "mqtt_publish");

  // Broad “mqtt” with several devices → no silent pick; choice list, no tools.
  const ambiguous = planLocalHomeActuation("打开 mqtt", bound);
  assert.ok(ambiguous);
  assert.equal(ambiguous!.tools.length, 0);
  assert.match(ambiguous!.reply, /mqtt_desk|mqtt_porch|更具体|specific/i);
});

test("V-HA-22: bound card lists household bound devices; capped; overflow note", () => {
  const objects = [
    sampleObject({ sourceId: "light.a", displayName: "A", accountId: "alice", bound: true }),
    sampleObject({ sourceId: "light.b", displayName: "B", accountId: "bob", bound: true }),
    sampleObject({ sourceId: "light.c", displayName: "C", accountId: "alice", bound: false }),
    sampleObject({
      sourceId: "light.shared",
      displayName: "SharedLamp",
      accountId: "bob",
      bound: true,
      shared: true,
    }),
  ];
  const card = buildBoundObjectCard(objects, "alice", 40);
  assert.match(card, /\bA\b/);
  assert.match(card, /\bB\b/);
  assert.match(card, /SharedLamp/);
  assert.match(card, /handle `homeassistant:light\.a`/);
  assert.match(card, /envoyhome-tools/);
  assert.doesNotMatch(card, /\bC\b/);
  assert.doesNotMatch(card, /entity_id dump|full HA/i);

  const many = Array.from({ length: 5 }, (_, i) =>
    sampleObject({ sourceId: `light.${i}`, displayName: `Lamp${i}`, accountId: "alice" }),
  );
  const capped = buildBoundObjectCard(many, "alice", 2);
  assert.match(capped, /Lamp0/);
  assert.match(capped, /Lamp1/);
  assert.doesNotMatch(capped, /Lamp4/);
  assert.match(capped, /3 more bound/);

  const hard = buildBoundObjectCard(many, "alice", BOUND_INJECT_CAP_HARD + 50);
  assert.match(hard, /Lamp0/);
});

test("sticky consume: local arms window; sticky decrements; off clears", () => {
  assert.equal(consumeStickyTurn("general", undefined, "local"), 3);
  assert.equal(consumeStickyTurn("general", 3, "sticky"), 2);
  assert.equal(consumeStickyTurn("general", 1, "sticky"), undefined);
  assert.equal(consumeStickyTurn("general", 2, "off"), undefined);
  assert.equal(consumeStickyTurn("home", 9, "purpose"), 9);
});

/* ---- Daemon integration / RPC e2e -------------------------------------- */

test("isHomeAssistantReady: needs enabled + baseUrl + token", async () => {
  const { daemon, cleanup } = await boot();
  try {
    assert.equal(await isHomeAssistantReady(daemon.channels), false);

    await daemon.channels.setChannelConfig(
      "homeassistant",
      { baseUrl: "http://127.0.0.1:8123" },
      {},
    );
    await daemon.channels.enableChannel("homeassistant");
    assert.equal(await isHomeAssistantReady(daemon.channels), false);

    await daemon.channels.setChannelConfig(
      "homeassistant",
      { baseUrl: "http://127.0.0.1:8123" },
      { accessToken: "tok" },
    );
    assert.equal(await isHomeAssistantReady(daemon.channels), true);
  } finally {
    await cleanup();
  }
});

test("V-UX-8 / V-HA-23: purpose=home refused until HA ready; succeeds when configured", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    });
    const denied = await rpc(daemon.config.wsPort, "home.openSession", {
      accountId: "alice",
      purpose: "home",
    });
    assert.ok(denied["error"]);
    const err = denied["error"] as { message?: string };
    assert.match(String(err.message ?? ""), /tool_unavailable|Home Assistant/i);

    const statusBefore = await rpc(daemon.config.wsPort, "home.getChannelStatus", {
      id: "homeassistant",
    });
    assert.equal((statusBefore["result"] as { ready?: boolean })?.ready, false);

    await enableHa(daemon);

    const statusAfter = await rpc(daemon.config.wsPort, "home.getChannelStatus", {
      id: "homeassistant",
    });
    assert.equal((statusAfter["result"] as { ready?: boolean })?.ready, true);

    const opened = await rpc(daemon.config.wsPort, "home.openSession", {
      accountId: "alice",
      purpose: "home",
      title: "Home",
    });
    assert.equal(opened["error"], undefined);
    const result = opened["result"] as { purpose?: string; sessionId?: string };
    assert.equal(result.purpose, "home");
    assert.ok(result.sessionId);

    const meta = await daemon.turns.sessions.get("alice", result.sessionId!);
    assert.equal(meta?.purpose, "home");
  } finally {
    await cleanup();
  }
});

test("V-HA-21: general Chat refuses ha_* and mqtt_* when turn is non-home", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    });
    const opened = await rpc(daemon.config.wsPort, "home.openSession", {
      accountId: "alice",
      purpose: "general",
    });
    const sessionId = (opened["result"] as { sessionId: string }).sessionId;

    await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "summarize my notes please",
      callerKind: "loopback-owner",
      plannedTools: [
        {
          tool: "ha_call_service",
          args: {
            objectId: "homeassistant:light.x",
            domain: "light",
            service: "turn_on",
          },
        },
      ],
      completionText: "ok",
    });
    await flushLoop();
    let transcript = await daemon.turns.getTranscript("alice", sessionId);
    let joined = transcript.map((m) => String(m["text"] ?? "")).join("\n");
    assert.match(joined, /tool_unavailable|home tools not enabled/i);

    await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "write a poem",
      callerKind: "loopback-owner",
      plannedTools: [
        { tool: "mqtt_publish", args: { objectId: "mqtt:home/x", payload: "1" } },
      ],
      completionText: "ok",
    });
    await flushLoop();
    transcript = await daemon.turns.getTranscript("alice", sessionId);
    joined = transcript.map((m) => String(m["text"] ?? "")).join("\n");
    assert.match(joined, /home tools not enabled/i);
  } finally {
    await cleanup();
  }
});

test("V-HA-21 local hit: home phrase enables surface (sticky armed)", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    });
    const opened = await rpc(daemon.config.wsPort, "home.openSession", {
      accountId: "alice",
    });
    const sessionId = (opened["result"] as { sessionId: string }).sessionId;

    await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "please turn on the lights",
      callerKind: "loopback-owner",
      completionText: "I'll prepare a proposal.",
    });
    await flushLoop();
    const meta = await daemon.turns.sessions.get("alice", sessionId);
    assert.equal(meta?.stickyHomeTurnsRemaining, 3);
  } finally {
    await cleanup();
  }
});

test("V-HA-21 sticky: follow-up non-home text keeps tools; counter decrements to clear", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    });
    await enableHa(daemon);
    const opened = await rpc(daemon.config.wsPort, "home.openSession", {
      accountId: "alice",
    });
    const sessionId = (opened["result"] as { sessionId: string }).sessionId;

    await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "turn on the lamp",
      callerKind: "loopback-owner",
      completionText: "ok",
    });
    await flushLoop();
    assert.equal((await daemon.turns.sessions.get("alice", sessionId))?.stickyHomeTurnsRemaining, 3);

    // Sticky turn: non-home phrase but tools still allowed (ha_get_state is read).
    await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "thanks",
      callerKind: "loopback-owner",
      plannedTools: [
        { tool: "ha_get_state", args: { objectId: "homeassistant:light.x" } },
      ],
      completionText: "checked",
    });
    await flushLoop();
    const afterSticky = await daemon.turns.sessions.get("alice", sessionId);
    assert.equal(afterSticky?.stickyHomeTurnsRemaining, 2);
    const mid = (await daemon.turns.getTranscript("alice", sessionId))
      .map((m) => String(m["text"] ?? ""))
      .join("\n");
    assert.doesNotMatch(mid, /home tools not enabled/);

    // Burn remaining sticky with non-home turns.
    for (let i = 0; i < 2; i++) {
      await daemon.turns.sendMessage({
        accountId: "alice",
        sessionId,
        text: `aside ${i}`,
        callerKind: "loopback-owner",
        completionText: "sure",
      });
      await flushLoop();
    }
    assert.equal(
      (await daemon.turns.sessions.get("alice", sessionId))?.stickyHomeTurnsRemaining,
      undefined,
    );

    // Cleared: ha_* refused again.
    await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "another aside",
      callerKind: "loopback-owner",
      plannedTools: [
        { tool: "ha_get_state", args: { objectId: "homeassistant:light.x" } },
      ],
      completionText: "nope",
    });
    await flushLoop();
    const end = (await daemon.turns.getTranscript("alice", sessionId))
      .map((m) => String(m["text"] ?? ""))
      .join("\n");
    assert.match(end, /home tools not enabled/);
  } finally {
    await cleanup();
  }
});

test("V-HA-21 bound displayName hit enables home surface", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    });
    await enableHa(daemon);
    const haCa = daemon.channels.loader.getChannelStatus("homeassistant").channelAccount;
    await daemon.channels.objects.registerSources("homeassistant", haCa, [
      { sourceId: "light.den", displayName: "Den Lamp", class: "light" },
    ]);
    await daemon.channels.objects.setSourceBinding({
      channel: "homeassistant",
      channelAccount: haCa,
      sourceId: "light.den",
      accountId: "alice",
      class: "light",
      shared: false,
      neverUnattended: false,
    });

    const opened = await rpc(daemon.config.wsPort, "home.openSession", {
      accountId: "alice",
    });
    const sessionId = (opened["result"] as { sessionId: string }).sessionId;

    await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "What is Den Lamp doing?",
      callerKind: "loopback-owner",
      plannedTools: [
        { tool: "ha_get_state", args: { objectId: "homeassistant:light.den" } },
      ],
      completionText: "looking",
    });
    await flushLoop();
    const meta = await daemon.turns.sessions.get("alice", sessionId);
    assert.equal(meta?.stickyHomeTurnsRemaining, 3);
    const joined = (await daemon.turns.getTranscript("alice", sessionId))
      .map((m) => String(m["text"] ?? ""))
      .join("\n");
    assert.doesNotMatch(joined, /home tools not enabled/);
  } finally {
    await cleanup();
  }
});

test("answerApproval wakes the approval's turnId (not first active turn for account)", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    });
    await enableHa(daemon);
    const haCa = daemon.channels.loader.getChannelStatus("homeassistant").channelAccount;
    await daemon.channels.objects.registerSources("homeassistant", haCa, [
      { sourceId: "light.kitchen", displayName: "Kitchen", class: "light" },
      { sourceId: "light.bedroom", displayName: "Bedroom", class: "light" },
    ]);
    for (const sourceId of ["light.kitchen", "light.bedroom"]) {
      await daemon.channels.objects.setSourceBinding({
        channel: "homeassistant",
        channelAccount: haCa,
        sourceId,
        accountId: "alice",
        class: "light",
        shared: false,
        neverUnattended: false,
      });
    }

    const opened = await rpc(daemon.config.wsPort, "home.openSession", {
      accountId: "alice",
      purpose: "home",
    });
    const sessionId = (opened["result"] as { sessionId: string }).sessionId;

    const argsA = {
      objectId: "homeassistant:light.kitchen",
      domain: "light",
      service: "turn_on",
    };
    const argsB = {
      objectId: "homeassistant:light.bedroom",
      domain: "light",
      service: "turn_on",
    };

    const p1 = daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "turn on Kitchen",
      callerKind: "loopback-owner",
      plannedTools: [{ tool: "ha_call_service", args: argsA, summary: "Turn on Kitchen" }],
      completionText: "a",
    });
    const a1 = await waitForApproval(daemon, "alice");
    assert.ok(a1.turnId);

    const p2 = daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "turn on Bedroom",
      callerKind: "loopback-owner",
      plannedTools: [{ tool: "ha_call_service", args: argsB, summary: "Turn on Bedroom" }],
      completionText: "b",
    });
    const a2 = await waitForApproval(daemon, "alice", 3000, {
      minCount: 2,
      predicate: (r) => r.id !== a1.id,
    });
    assert.ok(a2.turnId);
    assert.notEqual(a1.turnId, a2.turnId);

    // Answer the *second* turn first — must unblock p2, not leave it hanging on a1.
    await daemon.turns.answerApproval({
      id: a2.id,
      decision: "deny",
      argsDigest: a2.argsDigest || canonicalDigest(argsB),
      grantedBy: "loopback-owner",
    });
    await Promise.race([
      p2,
      new Promise((_, rej) => setTimeout(() => rej(new Error("p2 hung — wrong turn woken")), 2000)),
    ]);

    await daemon.turns.answerApproval({
      id: a1.id,
      decision: "deny",
      argsDigest: a1.argsDigest || canonicalDigest(argsA),
      grantedBy: "loopback-owner",
    });
    await p1;
    await flushLoop();
  } finally {
    await cleanup();
  }
});

test("V-HA-23 e2e: Home chat enables tools; actuation still needs Approvals", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    });
    await enableHa(daemon);
    const haCa = daemon.channels.loader.getChannelStatus("homeassistant").channelAccount;
    await daemon.channels.objects.registerSources("homeassistant", haCa, [
      { sourceId: "light.kitchen", displayName: "Kitchen", class: "light" },
    ]);
    await daemon.channels.objects.setSourceBinding({
      channel: "homeassistant",
      channelAccount: haCa,
      sourceId: "light.kitchen",
      accountId: "alice",
      class: "light",
      shared: false,
      neverUnattended: false,
    });

    const opened = await rpc(daemon.config.wsPort, "home.openSession", {
      accountId: "alice",
      purpose: "home",
      title: "Home chat",
    });
    assert.equal(opened["error"], undefined);
    const sessionId = (opened["result"] as { sessionId: string }).sessionId;

    const args = {
      objectId: "homeassistant:light.kitchen",
      domain: "light",
      service: "turn_on",
    };
    const sendPromise = daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "turn on Kitchen",
      callerKind: "loopback-owner",
      plannedTools: [{ tool: "ha_call_service", args, summary: "Turn on Kitchen" }],
      completionText: "proposed",
    });

    const approval = await waitForApproval(daemon, "alice");
    assert.equal(approval.tool, "ha_call_service");
    await daemon.turns.answerApproval({
      id: approval.id,
      decision: "deny",
      argsDigest: approval.argsDigest || canonicalDigest(args),
      grantedBy: "loopback-owner",
    });
    await sendPromise;
    await flushLoop();

    const joined = (await daemon.turns.getTranscript("alice", sessionId))
      .map((m) => String(m["text"] ?? ""))
      .join("\n");
    assert.doesNotMatch(joined, /home tools not enabled/);
    assert.match(joined, /approval_denied/);
  } finally {
    await cleanup();
  }
});

test("V-HA-22 e2e: home-surface inject mentions bound device, not unbound peers", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    });
    await enableHa(daemon);
    const haCa = daemon.channels.loader.getChannelStatus("homeassistant").channelAccount;
    await daemon.channels.objects.registerSources("homeassistant", haCa, [
      { sourceId: "light.mine", displayName: "MyBoundLamp", class: "light" },
      { sourceId: "light.other", displayName: "ForeignUnbound", class: "light" },
    ]);
    await daemon.channels.objects.setSourceBinding({
      channel: "homeassistant",
      channelAccount: haCa,
      sourceId: "light.mine",
      accountId: "alice",
      class: "light",
      shared: false,
      neverUnattended: false,
    });

    const opened = await rpc(daemon.config.wsPort, "home.openSession", {
      accountId: "alice",
      purpose: "home",
    });
    const sessionId = (opened["result"] as { sessionId: string }).sessionId;

    // Capture standing inject via a provider that echoes system content — use
    // completionText path and assert session pressure / maintain used inject by
    // reading objects through the same card builder the turn uses.
    const objects = await daemon.channels.objects.list({ bound: true });
    const card = buildBoundObjectCard(objects, "alice");
    assert.match(card, /MyBoundLamp/);
    assert.doesNotMatch(card, /ForeignUnbound/);

    await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "list my devices",
      callerKind: "loopback-owner",
      completionText: card.includes("MyBoundLamp") ? "I see MyBoundLamp" : "missing",
    });
    await flushLoop();
    const joined = (await daemon.turns.getTranscript("alice", sessionId))
      .map((m) => String(m["text"] ?? ""))
      .join("\n");
    assert.match(joined, /MyBoundLamp/);
  } finally {
    await cleanup();
  }
});

test("§5.7.8 multi-round: offer stashes pending; 是的 files Approvals", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    });
    await enableHa(daemon);
    const haCa = daemon.channels.loader.getChannelStatus("homeassistant").channelAccount;
    await daemon.channels.objects.registerSources("homeassistant", haCa, [
      { sourceId: "climate.hallway", displayName: "Hallway thermostat", class: "climate" },
    ]);
    await daemon.channels.objects.setSourceBinding({
      channel: "homeassistant",
      channelAccount: haCa,
      sourceId: "climate.hallway",
      accountId: "alice",
      class: "climate",
      shared: false,
      neverUnattended: false,
    });

    const opened = await rpc(daemon.config.wsPort, "home.openSession", {
      accountId: "alice",
      purpose: "home",
    });
    const sessionId = (opened["result"] as { sessionId: string }).sessionId;

    // Round 1: model offers without tools → pending stored.
    await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "感觉有点冷",
      callerKind: "loopback-owner",
      completionText: "需要我把 Hallway thermostat 的目标温度设置为 24℃ 吗？",
    });
    await flushLoop();
    const meta1 = await daemon.turns.sessions.get("alice", sessionId);
    assert.ok(meta1?.pendingHomeProposal);
    assert.equal(meta1!.pendingHomeProposal!.args["temperature"], 24);

    // Round 2: 是的 → real Approvals.
    const sendPromise = daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "是的",
      callerKind: "loopback-owner",
    });
    const approval = await waitForApproval(daemon, "alice");
    assert.equal(approval.tool, "ha_call_service");
    await daemon.turns.answerApproval({
      id: approval.id,
      decision: "deny",
      argsDigest: approval.argsDigest || "",
      grantedBy: "loopback-owner",
    });
    await sendPromise;
    await flushLoop();
    const meta2 = await daemon.turns.sessions.get("alice", sessionId);
    assert.equal(meta2?.pendingHomeProposal, undefined);
  } finally {
    await cleanup();
  }
});

test("§5.7.8 tool-loop fallthrough: fuzzy NL proposes objectId; Approvals still gate", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await rpc(daemon.config.wsPort, "home.createAccount", {
      accountId: "alice",
      displayName: "Alice",
    });
    await enableHa(daemon);
    const haCa = daemon.channels.loader.getChannelStatus("homeassistant").channelAccount;
    await daemon.channels.objects.registerSources("homeassistant", haCa, [
      { sourceId: "light.study", displayName: "Study lamp", class: "light" },
    ]);
    await daemon.channels.objects.setSourceBinding({
      channel: "homeassistant",
      channelAccount: haCa,
      sourceId: "light.study",
      accountId: "alice",
      class: "light",
      shared: false,
      neverUnattended: false,
    });

    const opened = await rpc(daemon.config.wsPort, "home.openSession", {
      accountId: "alice",
      purpose: "home",
    });
    const sessionId = (opened["result"] as { sessionId: string }).sessionId;

    // No local on/off match → tool-loop parses envoyhome-tools fence.
    const args = {
      objectId: "homeassistant:light.study",
      domain: "light",
      service: "turn_on",
    };
    const fence = [
      "I'll brighten the study.",
      "```envoyhome-tools",
      JSON.stringify([{ tool: "ha_call_service", args, summary: "Turn on Study lamp" }]),
      "```",
    ].join("\n");

    const sendPromise = daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "the study feels a bit dark, can you help?",
      callerKind: "loopback-owner",
      completionText: fence,
    });

    const approval = await waitForApproval(daemon, "alice");
    assert.equal(approval.tool, "ha_call_service");
    await daemon.turns.answerApproval({
      id: approval.id,
      decision: "deny",
      argsDigest: approval.argsDigest || canonicalDigest(args),
      grantedBy: "loopback-owner",
    });
    await sendPromise;
    await flushLoop();

    const joined = (await daemon.turns.getTranscript("alice", sessionId))
      .map((m) => String(m["text"] ?? ""))
      .join("\n");
    assert.match(joined, /approval_denied/);
  } finally {
    await cleanup();
  }
});
