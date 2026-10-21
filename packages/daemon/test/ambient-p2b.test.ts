// P2-B / Design §19.10 — V-P2-AMB-1/2/3 heartbeat + standing orders.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectDoctorIssues,
  dispatchForTest,
  homePaths,
  isHeartbeatSilentOk,
  HEARTBEAT_OK,
  MIN_HEARTBEAT_INTERVAL_MS,
  loopbackSession,
  startDaemon,
  StandingOrderStore,
  ScheduleService,
} from "../dist/index.js";

test("V-P2-AMB-1: HEARTBEAT_OK is silent; chatter is not", () => {
  assert.equal(isHeartbeatSilentOk(HEARTBEAT_OK), true);
  assert.equal(isHeartbeatSilentOk(`${HEARTBEAT_OK}\n`), true);
  assert.equal(isHeartbeatSilentOk(`${HEARTBEAT_OK}.`), true);
  assert.equal(isHeartbeatSilentOk("**HEARTBEAT_OK**"), true);
  assert.equal(isHeartbeatSilentOk("HEARTBEAT_OK\nall clear"), true);
  assert.equal(isHeartbeatSilentOk("all clear HEARTBEAT_OK"), true);
  assert.equal(isHeartbeatSilentOk("needs attention: lights on"), false);
  assert.equal(isHeartbeatSilentOk("Keep HEARTBEAT_OK inside visible text forever"), false);
  assert.equal(isHeartbeatSilentOk(""), false);
});

test("V-P2-AMB-1: enable heartbeat creates system:heartbeat every-job", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-p2b-hb-"));
  try {
    const daemon = await startDaemon({
      config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "k" },
      packageVersion: "0.0.0-test",
    });
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
    const set = await dispatchForTest(
      deps,
      "home.setHeartbeatConfig",
      { accountId: "alice", enabled: true, everyMs: 60 * 60_000 },
      loopbackSession(),
    );
    assert.ok("result" in set);
    const job = await daemon.schedules.store.getJob("alice", "system:heartbeat:alice");
    assert.ok(job);
    assert.equal(job!.enabled, true);
    assert.equal(job!.payload.kind, "system");
    assert.equal(job!.payload.systemJob, "heartbeat");
    assert.equal(job!.spec.kind, "every");

    const listed = await dispatchForTest(
      deps,
      "home.listSchedules",
      { accountId: "alice" },
      loopbackSession(),
    );
    assert.ok("result" in listed);
    const jobs = (listed.result as { jobs: Array<{ id: string }> }).jobs;
    assert.equal(
      jobs.some((j) => j.id.startsWith("system:")),
      false,
      "system jobs hidden from listSchedules",
    );
    await daemon.stop();
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-P2-AMB-3: Doctor warns when heartbeat interval is below floor", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-p2b-doc-"));
  try {
    const daemon = await startDaemon({
      config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "k" },
      packageVersion: "0.0.0-test",
    });
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    await daemon.turns.policy.write("alice", {
      heartbeatEnabled: true,
      heartbeatEveryMs: 60_000, // below MIN_HEARTBEAT_INTERVAL_MS (15m)
    });
    const issues = await collectDoctorIssues({
      config: daemon.config,
      accounts: daemon.accounts,
      bindings: daemon.bindings,
      channels: daemon.channels,
      policy: daemon.turns.policy,
    });
    assert.ok(issues.some((i) => i.id === "schedule.heartbeat_interval_low"));
    assert.ok(MIN_HEARTBEAT_INTERVAL_MS >= 15 * 60_000);
    await daemon.stop();
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-P2-AMB-2: standing smarthome_event refuses unbound sourceId; cron syncs", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-p2b-so-"));
  const paths = homePaths(stateDir);
  try {
    const store = new StandingOrderStore(paths);
    const svc = new ScheduleService({
      paths,
      defaultTimeZone: "UTC",
      now: () => new Date("2026-10-20T12:00:00.000Z"),
    });
    await svc.watchAccount("alice");

    await assert.rejects(
      async () =>
        store.put({
          accountId: "alice",
          name: "bad",
          when: { kind: "smarthome_event", sourceId: "" },
          action: { kind: "notify", message: "x" },
        }),
      /sourceId/,
    );

    const order = await store.put({
      accountId: "alice",
      name: "Morning stretch",
      when: { kind: "cron", cronExpr: "0 8 * * *", timeZone: "UTC" },
      action: { kind: "notify", message: "stretch" },
    });
    await svc.syncStandingCronJobs("alice", await store.list("alice"));
    const job = await svc.store.getJob("alice", `standing:${order.id}`);
    assert.ok(job);
    assert.equal(job!.payload.kind, "notify");
    assert.equal(job!.enabled, true);

    await assert.rejects(
      async () => svc.removeJob("alice", `standing:${order.id}`),
      /standing orders/,
    );

    await store.remove("alice", order.id);
    await svc.syncStandingCronJobs("alice", await store.list("alice"));
    assert.equal(await svc.store.getJob("alice", `standing:${order.id}`), undefined);
    await svc.stop();
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
