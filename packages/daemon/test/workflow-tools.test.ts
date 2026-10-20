// Workflow tool catalogue + dispatch — Design §7 (2026-10-15b).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flushLoop, __resetActiveXForTests } from "@envoyhome/test-utils";
import { BUILTIN_TOOLS, clearExtraToolSpecsForTests } from "@envoyhome/harness-host";
import { HA_TOOLS, MQTT_TOOLS } from "@envoyhome/smarthome";
import {
  dispatchForTest,
  loopbackSession,
  startDaemon,
  type RunningDaemon,
} from "../dist/index.js";
import {
  assertWorkflowToolsKnown,
  listWorkflowTools,
  runExtendedWorkflowTool,
  workflowToolNameSet,
} from "../dist/workflow-tools.js";
import { homePaths } from "../dist/home-paths.js";
import { SkillService } from "../dist/skills.js";
import { ChannelService } from "../dist/channels/service.js";
import { DaemonLogger } from "../dist/logger.js";
import { BindingStore } from "../dist/bindings.js";
import { DeviceCredentialStore } from "../dist/auth.js";
import mqttPlugin from "@envoyhome/channel-mqtt";
import haPlugin from "@envoyhome/channel-homeassistant";

const daemons: RunningDaemon[] = [];

after(async () => {
  __resetActiveXForTests();
  clearExtraToolSpecsForTests();
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

async function boot() {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-wf-tools-"));
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

test("catalogue includes builtins + HA decls; unverified skills omitted", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-wf-cat-"));
  try {
    clearExtraToolSpecsForTests();
    const paths = homePaths(stateDir);
    const skills = new SkillService(paths);
    const devices = new DeviceCredentialStore();
    const bindings = new BindingStore(stateDir, devices);
    const channels = new ChannelService({
      stateDir,
      bindings,
      logger: new DaemonLogger(),
      bundledPlugins: [mqttPlugin, haPlugin],
    });
    await channels.loadPersisted();

    const src = join(stateDir, "incoming-skill");
    await mkdir(src, { recursive: true });
    await writeFile(
      join(src, "SKILL.md"),
      `---
name: Draft skill
---
Not verified yet.
`,
    );
    const installed = await skills.installSkill({ source: "path", ref: src });
    assert.equal(installed.needsReview, true);

    const tools = await listWorkflowTools({ skills, channels });
    const names = new Set(tools.map((t) => t.name));
    // Completeness: every harness builtin + every HA/MQTT decl must appear.
    for (const name of Object.keys(BUILTIN_TOOLS)) {
      assert.ok(names.has(name), `missing builtin ${name}`);
    }
    for (const d of HA_TOOLS) {
      assert.ok(names.has(d.name), `missing HA tool ${d.name}`);
    }
    for (const d of MQTT_TOOLS) {
      assert.ok(names.has(d.name), `missing MQTT tool ${d.name}`);
    }
    // Scheduler / Jobs are triggers — not workflow tool names.
    assert.equal(names.has("proposeSchedule"), false);
    assert.equal(names.has("schedule"), false);
    assert.equal(names.has(`skill:${installed.id}`), false);

    const ha = tools.find((t) => t.name === "ha_get_state");
    assert.ok(ha);
    assert.equal(ha!.source, "smarthome");
    assert.equal(ha!.available, false);
    assert.ok(ha!.unavailableReason);

    await writeFile(
      join(paths.skillsDir, installed.id, "SKILL.md"),
      `---
name: Draft skill
---
Prefer short answers.
`,
    );
    const verify = await skills.verifySkill(installed.id);
    assert.equal(verify.ok, true);

    const tools2 = await listWorkflowTools({ skills, channels });
    assert.ok(tools2.some((t) => t.name === `skill:${installed.id}` && t.available));
  } finally {
    clearExtraToolSpecsForTests();
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("HA tools stay unavailable when channel enabled without credentials", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-wf-ha-enabled-"));
  try {
    const paths = homePaths(stateDir);
    const devices = new DeviceCredentialStore();
    const bindings = new BindingStore(stateDir, devices);
    const channels = new ChannelService({
      stateDir,
      bindings,
      logger: new DaemonLogger(),
      bundledPlugins: [mqttPlugin, haPlugin],
    });
    await channels.loadPersisted();
    // Enable with empty config — same as visiting Connections → HA (auto-enable).
    await channels.setChannelConfig("homeassistant", {}, {});
    await channels.enableChannel("homeassistant");

    const tools = await listWorkflowTools({
      skills: new SkillService(paths),
      channels,
    });
    const ha = tools.find((t) => t.name === "ha_get_state");
    assert.ok(ha);
    assert.equal(ha!.available, false);
    assert.match(ha!.unavailableReason ?? "", /Base URL|access token|token/i);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("put rejects unknown tool; known HA name accepted even when unavailable", async () => {
  const { daemon, cleanup } = await boot();
  try {
    const known = await workflowToolNameSet({
      skills: daemon.skills,
      channels: daemon.channels,
    });
    const bad = daemon.workflows.validate(
      [
        "id: bad_tool",
        "match:",
        "  keywords: [x]",
        "steps:",
        "  - id: t",
        "    type: tool",
        "    name: get_weather",
        "",
      ].join("\n"),
      known,
    );
    assert.equal(bad.ok, false);
    assert.match(bad.error ?? "", /workflow\.unknown_tool/);

    await assert.rejects(
      () =>
        daemon.workflows.put(
          [
            "id: bad_tool",
            "match:",
            "  keywords: [x]",
            "steps:",
            "  - id: t",
            "    type: tool",
            "    name: notify",
            "",
          ].join("\n"),
          undefined,
          known,
        ),
      /workflow\.unknown_tool/,
    );

    const put = await daemon.workflows.put(
      [
        "id: ha_probe",
        "match:",
        "  keywords: [lights]",
        "steps:",
        "  - id: st",
        "    type: tool",
        "    name: ha_get_state",
        "    args:",
        "      objectId: homeassistant:light.living_room",
        "",
      ].join("\n"),
      undefined,
      known,
    );
    assert.equal(put.id, "ha_probe");
  } finally {
    await cleanup();
  }
});

test("home.listWorkflowTools RPC + skill step returns SKILL.md body", async () => {
  const { daemon, stateDir, cleanup } = await boot();
  try {
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    const listed = await dispatchForTest(
      {
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
        skills: daemon.skills,
        artifacts: daemon.artifacts,
    webSearch: daemon.webSearch,
    browserControl: daemon.browserControl,
        actuations: daemon.actuations,
        pushTokens: daemon.pushTokens,
        push: daemon.push,
        localEngine: daemon.localEngine,
        meshStatus: () => ({ kind: "no-node" as const }),
      },
      "home.listWorkflowTools",
      { accountId: "alice" },
      loopbackSession(),
    );
    assert.ok(!listed.error, JSON.stringify(listed.error));
    const tools = (listed.result as { tools: Array<{ name: string }> }).tools;
    assert.ok(tools.some((t) => t.name === "write_file"));

    const src = join(stateDir, "skill-src");
    await mkdir(src, { recursive: true });
    await writeFile(
      join(src, "SKILL.md"),
      `---
name: Brief helper
---
Use a one-line morning brief.
`,
    );
    const installed = await daemon.skills.installSkill({ source: "path", ref: src });
    const verify = await daemon.skills.verifySkill(installed.id);
    assert.equal(verify.ok, true);

    const skillName = `skill:${installed.id}`;
    const known = await workflowToolNameSet({
      skills: daemon.skills,
      channels: daemon.channels,
    });
    await daemon.workflows.put(
      [
        "id: skill_run",
        "match:",
        "  keywords: [skillrun]",
        "steps:",
        `  - id: pack`,
        `    type: tool`,
        `    name: ${skillName}`,
        "",
      ].join("\n"),
      undefined,
      known,
    );

    await daemon.providers.setProvider({
      id: "local",
      kind: "local_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      model: "m",
      enabled: true,
    });
    await daemon.providers.setMode("alice", "local");

    const { results } = await daemon.turns.runWorkflowTest({
      accountId: "alice",
      workflowId: "skill_run",
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.ok, true);
    assert.match(String(results[0]?.output ?? ""), /one-line morning brief/);
  } finally {
    await cleanup();
  }
});

test("unavailable HA tool fails closed with tool_unavailable", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "ha_get_state",
          args: { objectId: "homeassistant:light.x" },
          skills: daemon.skills,
          channels: daemon.channels,
          paths: homePaths(daemon.config.stateDir),
        }),
      /envoyhome\.tool_unavailable/,
    );

    assert.throws(
      () =>
        assertWorkflowToolsKnown(
          { steps: [{ type: "tool", name: "not_a_real_tool" }] },
          new Set(["write_file"]),
        ),
      /workflow\.unknown_tool/,
    );
  } finally {
    await cleanup();
  }
});

test("mqtt_publish refuses unbound objectId (resolveObject chokepoint)", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await daemon.channels.setChannelConfig("mqtt", { brokerUrl: "mqtt://127.0.0.1:18883" }, {});
    await daemon.channels.enableChannel("mqtt");
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "mqtt_publish",
          args: { objectId: "mqtt:envoyhome/demo/not_bound", payload: "ON" },
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

test("V-HA-14: raw entity_id/topic refused; objectId required", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await daemon.channels.setChannelConfig(
      "homeassistant",
      { baseUrl: "http://127.0.0.1:18123" },
      { accessToken: "t" },
    );
    await daemon.channels.enableChannel("homeassistant");
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "ha_get_state",
          args: { entity_id: "light.living_room" },
          skills: daemon.skills,
          channels: daemon.channels,
          paths: homePaths(daemon.config.stateDir),
          accountId: "alice",
        }),
      /objectId.*resolved handle|raw entity_id/,
    );
    await daemon.channels.setChannelConfig("mqtt", { brokerUrl: "mqtt://127.0.0.1:18883" }, {});
    await daemon.channels.enableChannel("mqtt");
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "mqtt_publish",
          args: { topic: "home/x", payload: "1" },
          skills: daemon.skills,
          channels: daemon.channels,
          paths: homePaths(daemon.config.stateDir),
          accountId: "alice",
          origin: "attended",
          actuations: daemon.actuations,
        }),
      /objectId.*resolved handle|raw entity_id/,
    );
  } finally {
    await cleanup();
  }
});

test("sandbox_write alias is accepted by put validation", async () => {
  const { daemon, cleanup } = await boot();
  try {
    const known = await workflowToolNameSet({
      skills: daemon.skills,
      channels: daemon.channels,
    });
    const put = await daemon.workflows.put(
      [
        "id: alias_write",
        "match:",
        "  keywords: [note]",
        "steps:",
        "  - id: w",
        "    type: tool",
        "    name: sandbox_write",
        "    args:",
        "      path: notes/a.txt",
        "      content: hi",
        "",
      ].join("\n"),
      undefined,
      known,
    );
    assert.equal(put.id, "alias_write");
    // Drain any stray turns if present.
    for (let i = 0; i < 20 && daemon.turns.activeTurnCount() > 0; i++) {
      await flushLoop(5);
    }
  } finally {
    await cleanup();
  }
});

test("V-CRON-11: schedule propose refuses invented WHEN specs", async () => {
  const { daemon, cleanup } = await boot();
  try {
    const paths = homePaths(daemon.config.stateDir);
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "schedule",
          args: {
            action: "propose",
            text: "tomorrow at 8am",
            whenInstant: "2026-10-10T00:00:00.000Z",
          },
          accountId: "alice",
          skills: daemon.skills,
          channels: daemon.channels,
          paths,
          schedules: daemon.schedules,
        }),
      /refuses whenInstant/,
    );
    const out = await runExtendedWorkflowTool({
      tool: "schedule",
      args: { action: "propose", text: "Remind me tomorrow at 8:00 to stretch" },
      accountId: "alice",
      skills: daemon.skills,
      channels: daemon.channels,
      paths,
      schedules: daemon.schedules,
    });
    const parsed = JSON.parse(out) as { proposalId: string; resolvedLocal: string };
    assert.ok(parsed.proposalId);
    assert.match(parsed.resolvedLocal, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  } finally {
    await cleanup();
  }
});
