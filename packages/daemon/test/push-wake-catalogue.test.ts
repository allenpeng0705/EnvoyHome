// Design `2026-10-22f` — push wake catalogue (suppressIfLive vs always).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DaemonLogger } from "../dist/logger.js";
import { homePaths } from "../dist/home-paths.js";
import { PushTokenStore } from "../dist/push-tokens.js";
import { PushDispatcher } from "../dist/push-dispatch.js";
import { LiveDevicePresence, PUSH_LIVE_IDLE_MS } from "../dist/push-live.js";
import {
  dispatchForTest,
  loopbackSession,
  startDaemon,
  type HomeSession,
} from "../dist/index.js";

test("LiveDevicePresence recent activity window", () => {
  const live = new LiveDevicePresence();
  const t0 = 1_000_000;
  assert.equal(live.isRecentlyActive("d1", PUSH_LIVE_IDLE_MS, t0), false);
  live.touch("d1", t0);
  assert.equal(live.isRecentlyActive("d1", PUSH_LIVE_IDLE_MS, t0 + 1_000), true);
  assert.equal(
    live.isRecentlyActive("d1", PUSH_LIVE_IDLE_MS, t0 + PUSH_LIVE_IDLE_MS + 1),
    false,
  );
  live.clear("d1");
  assert.equal(live.isRecentlyActive("d1", PUSH_LIVE_IDLE_MS, t0 + 1_000), false);
});

test("suppressIfLive skips recently active device; always does not", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-push-wake-"));
  try {
    const store = new PushTokenStore(homePaths(stateDir));
    await store.register({
      deviceId: "phone-1",
      platform: "ios",
      token: "deadbeef",
      accountIds: ["alice"],
    });
    const live = new LiveDevicePresence();
    live.touch("phone-1");
    const push = new PushDispatcher(store, stateDir, new DaemonLogger(), live);
    await push.init();

    const interactive = await push.notifyAccount(
      "alice",
      { title: "t", body: "b", data: { type: "approval" } },
      "suppressIfLive",
    );
    assert.equal(interactive.sent, 0);
    assert.equal(interactive.skippedLive, 1);

    const schedule = await push.notifyAccount(
      "alice",
      { title: "t", body: "reminder", data: { type: "schedule" } },
      "always",
    );
    // No APNs creds → sent stays 0, but must not skip as live.
    assert.equal(schedule.skippedLive, 0);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("onProductEvent choice-needed fans out like approval", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-push-choice-"));
  try {
    const store = new PushTokenStore(homePaths(stateDir));
    await store.register({
      deviceId: "d1",
      platform: "ios",
      token: "deadbeef",
      accountIds: ["alice"],
    });
    const push = new PushDispatcher(store, stateDir, new DaemonLogger());
    await push.init();
    await push.onProductEvent("home:choice-needed", {
      accountId: "alice",
      id: "ch-1",
      question: "Which room?",
      selection: "one",
    });
    assert.ok(await store.get("d1"));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("onProductEvent turn-finished ok wakes; suppressIfLive clears after disconnect", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-push-turn-"));
  try {
    const store = new PushTokenStore(homePaths(stateDir));
    await store.register({
      deviceId: "phone-1",
      platform: "ios",
      token: "deadbeef",
      accountIds: ["alice"],
    });
    const live = new LiveDevicePresence();
    const sent: Array<{ type?: string; body: string }> = [];
    const push = new PushDispatcher(
      store,
      stateDir,
      new DaemonLogger(),
      live,
      async (_row, payload) => {
        sent.push({ type: payload.data?.type, body: payload.body });
        return 200;
      },
    );
    await push.init();

    live.touch("phone-1");
    await push.onProductEvent("home:turn-finished", {
      accountId: "alice",
      sessionId: "s1",
      turnId: "t1",
      status: "ok",
      preview: "Lights are on",
    });
    assert.equal(sent.length, 0, "live device must suppress turn wake");

    live.clear("phone-1"); // WS/mesh disconnect
    await push.onProductEvent("home:turn-finished", {
      accountId: "alice",
      sessionId: "s1",
      turnId: "t2",
      status: "ok",
      preview: "Lights are on",
    });
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.type, "turn");
    // Lock-screen privacy: never put assistant preview in the APNs/FCM body.
    assert.equal(sent[0]!.body, "Your reply is ready");
    assert.doesNotMatch(sent[0]!.body, /Lights/);

    await push.onProductEvent("home:turn-finished", {
      accountId: "alice",
      sessionId: "s1",
      turnId: "t2b",
      status: "ok",
      locale: "zh",
    });
    assert.equal(sent[1]!.body, "回复已就绪");

    const beforeCancel = sent.length;
    await push.onProductEvent("home:turn-finished", {
      accountId: "alice",
      sessionId: "s1",
      turnId: "t3",
      status: "cancelled",
    });
    assert.equal(sent.length, beforeCancel, "cancelled turns must not wake");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("turn-finished prefers originating deviceId fan-out", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-push-origin-"));
  try {
    const store = new PushTokenStore(homePaths(stateDir));
    await store.register({
      deviceId: "phone-a",
      platform: "ios",
      token: "aaa",
      accountIds: ["alice"],
    });
    await store.register({
      deviceId: "phone-b",
      platform: "ios",
      token: "bbb",
      accountIds: ["alice"],
    });
    const sent: string[] = [];
    const push = new PushDispatcher(
      store,
      stateDir,
      new DaemonLogger(),
      undefined,
      async (row) => {
        sent.push(row.deviceId);
        return 200;
      },
    );
    await push.init();

    await push.onProductEvent("home:turn-finished", {
      accountId: "alice",
      sessionId: "s1",
      turnId: "t1",
      status: "ok",
      deviceId: "phone-a",
      preview: "secret presence detail",
    });
    assert.deepEqual(sent, ["phone-a"]);

    sent.length = 0;
    await push.onProductEvent("home:turn-finished", {
      accountId: "alice",
      sessionId: "s1",
      turnId: "t2",
      status: "ok",
      deviceId: "gone-device",
    });
    assert.equal(sent.length, 2, "missing prefer device falls back to account fan-out");
    assert.ok(sent.includes("phone-a") && sent.includes("phone-b"));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("notifyAccount fails closed when token has empty accountIds", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-push-fanout-"));
  try {
    const store = new PushTokenStore(homePaths(stateDir));
    await store.register({
      deviceId: "zero-bound",
      platform: "ios",
      token: "deadbeef",
      accountIds: [],
    });
    await store.register({
      deviceId: "alice-phone",
      platform: "android",
      token: "cafebabe",
      accountIds: ["alice"],
    });
    const push = new PushDispatcher(store, stateDir, new DaemonLogger());
    await push.init();

    const emptyMatch = (await store.list()).filter((t) =>
      t.accountIds.includes("alice"),
    );
    assert.equal(emptyMatch.length, 1);
    assert.equal(emptyMatch[0]!.deviceId, "alice-phone");

    // No APNs/FCM creds → sent stays 0; must not treat empty accountIds as all seats.
    const result = await push.notifyAccount(
      "alice",
      { title: "t", body: "b", data: { type: "approval" } },
      "always",
    );
    assert.equal(result.skippedLive, 0);
    const bob = await push.notifyAccount(
      "bob",
      { title: "t", body: "b", data: { type: "approval" } },
      "always",
    );
    assert.equal(bob.sent, 0);
    assert.equal(bob.skippedLive, 0);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("revoke clears push token via onRevokeLive", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-push-revoke-"));
  const daemon = await startDaemon({
    config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "k" },
    packageVersion: "0.0.0-test",
  });
  try {
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
      liveDevices: daemon.liveDevices,
      localEngine: daemon.localEngine,
      meshStatus: () => ({ kind: "no-node" as const }),
    };

    daemon.pairing.__resetMintRateForTests();
    const minted = await dispatchForTest(
      deps,
      "home.mintPairing",
      { deviceLabel: "phone", host: "127.0.0.1", lanHost: "127.0.0.1" },
      loopbackSession(),
    );
    assert.ok("result" in minted, `mint failed: ${JSON.stringify(minted)}`);
    const deviceId = (minted.result as { device: { deviceId: string } }).device.deviceId;

    await daemon.pushTokens.register({
      deviceId,
      platform: "ios",
      token: "deadbeef01",
      accountIds: ["alice"],
    });
    assert.ok(await daemon.pushTokens.get(deviceId));

    await daemon.pairing.revoke(deviceId);
    // onRevokeLive fires unregister asynchronously — wait briefly.
    for (let i = 0; i < 20; i++) {
      if (!(await daemon.pushTokens.get(deviceId))) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(await daemon.pushTokens.get(deviceId), undefined);
  } finally {
    await daemon.stop();
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("home.sendTestPush allowed for exclusive-Owner device (not loopback-only)", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-push-test-owner-"));
  const daemon = await startDaemon({
    config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "k" },
    packageVersion: "0.0.0-test",
  });
  try {
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
      liveDevices: daemon.liveDevices,
      localEngine: daemon.localEngine,
      meshStatus: () => ({ kind: "no-node" as const }),
    };

    const created = await dispatchForTest(
      deps,
      "home.createAccount",
      { displayName: "Owner", accountId: "alice" },
      loopbackSession(),
    );
    assert.ok("result" in created, `createAccount failed: ${JSON.stringify(created)}`);
    const ownerId = daemon.household.getOwnerAccountId() ?? "alice";
    assert.equal(ownerId, "alice");

    daemon.pairing.__resetMintRateForTests();
    const minted = await dispatchForTest(
      deps,
      "home.mintPairing",
      {
        deviceLabel: "owner-phone",
        host: "127.0.0.1",
        lanHost: "127.0.0.1",
        accountIds: [ownerId],
      },
      loopbackSession(),
    );
    assert.ok("result" in minted, `mint failed: ${JSON.stringify(minted)}`);
    const deviceId = (minted.result as { device: { deviceId: string } }).device.deviceId;

    const ownerDevice: HomeSession = {
      scopeKey: deviceId,
      ownerId: deviceId,
      isOwnerScope: true,
      deviceId,
      caller: {
        kind: "device",
        deviceId,
        accountIds: [ownerId],
        ownerTrusted: false,
      },
    };

    const testPush = await dispatchForTest(deps, "home.sendTestPush", {}, ownerDevice);
    assert.ok("result" in testPush, `expected ok, got ${JSON.stringify(testPush)}`);
    assert.equal((testPush.result as { ok: boolean }).ok, true);
    assert.equal(typeof (testPush.result as { sent: number }).sent, "number");

    // Member device must still be refused (Owner-scope).
    const member: HomeSession = {
      ...ownerDevice,
      scopeKey: "member-dev",
      deviceId: "member-dev",
      caller: {
        kind: "device",
        deviceId: "member-dev",
        accountIds: ["someone-else"],
        ownerTrusted: false,
      },
    };
    const denied = await dispatchForTest(deps, "home.sendTestPush", {}, member);
    assert.ok("error" in denied, "member must not sendTestPush");
  } finally {
    await daemon.stop();
    await rm(stateDir, { recursive: true, force: true });
  }
});
