import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  dispatchForTest,
  loopbackSession,
  startDaemon,
  type HomeSession,
} from "../dist/index.js";

function ownerSession() {
  return loopbackSession();
}

function memberSession(accountIds: string[]): HomeSession {
  return {
    scopeKey: "dev",
    ownerId: "dev",
    isOwnerScope: false,
    deviceId: "dev",
    caller: {
      kind: "device",
      deviceId: "dev",
      accountIds,
      ownerTrusted: false,
    },
  };
}

test("V-HA-6/14: unbound event no turn; foreign listSources filtered", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-ha-rpc-"));
  let daemon: Awaited<ReturnType<typeof startDaemon>> | undefined;
  try {
    daemon = await startDaemon({
      config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "k" },
      packageVersion: "0.0.0-test",
    });
    await dispatchForTest(
      daemonRouter(daemon),
      "home.createAccount",
      { accountId: "alice", displayName: "Alice" },
      ownerSession(),
    );
    await dispatchForTest(
      daemonRouter(daemon),
      "home.createAccount",
      { accountId: "bob", displayName: "Bob" },
      ownerSession(),
    );
    await dispatchForTest(
      daemonRouter(daemon),
      "home.setChannelConfig",
      { id: "fake-events", config: {} },
      ownerSession(),
    );
    await dispatchForTest(
      daemonRouter(daemon),
      "home.enableChannel",
      { id: "fake-events" },
      ownerSession(),
    );
    const channelAccount = daemon.channels.loader.getChannelStatus("fake-events").channelAccount;
    await daemon.channels.objects.registerSources("fake-events", channelAccount, [
      { sourceId: "sensor.motion", displayName: "Motion", class: "presence" },
    ]);
    await dispatchForTest(
      daemonRouter(daemon),
      "home.setSourceBinding",
      {
        channel: "fake-events",
        channelAccount,
        sourceId: "sensor.motion",
        accountId: "alice",
        class: "presence",
        shared: false,
        neverUnattended: true,
      },
      ownerSession(),
    );
    const bobList = await dispatchForTest(
      daemonRouter(daemon),
      "home.listSources",
      { accountId: "bob" },
      memberSession(["bob"]),
    );
    assert.ok("result" in bobList);
    const sources = (bobList.result as { sources: Array<{ sourceId: string }> }).sources;
    assert.equal(sources.some((s) => s.sourceId === "sensor.motion"), false);

    const ctx = daemon.channels.loader.getContextForTests("fake-events");
    assert.ok(ctx);
    ctx!.registerSources([{ sourceId: "sensor.unbound", displayName: "Unbound", class: "sensor" }]);
    const ack = await ctx!.emitInbound({ sourceId: "sensor.unbound" });
    assert.equal(ack.accepted, true, JSON.stringify(ack));
    assert.equal(ack.reason, "unbound_no_turn");

    const shareAttempt = await dispatchForTest(
      daemonRouter(daemon),
      "home.setSourceBinding",
      {
        channel: "fake-events",
        channelAccount,
        sourceId: "sensor.motion",
        accountId: "alice",
        class: "presence",
        shared: true,
      },
      ownerSession(),
    );
    assert.ok("error" in shareAttempt);
    assert.match(
      (shareAttempt.error as { message: string }).message,
      /object_not_shareable|not_shareable/,
    );

  } finally {
    await daemon?.stop().catch(() => undefined);
    await rm(stateDir, { recursive: true, force: true });
  }
});

function daemonRouter(daemon: Awaited<ReturnType<typeof startDaemon>>) {
  return {
    config: daemon.config,
    startedAt: daemon.startedAt,
    logger: daemon.logger,
    subscriptions: daemon.subscriptions,
    connections: () => 0,
    activeTurns: () => 0,
    onShutdown: () => undefined,
    packageVersion: "0.0.0-test",
    accounts: daemon.accounts,
    bindings: daemon.bindings,
    pairing: daemon.pairing,
    memory: daemon.memory,
    channels: daemon.channels,
    turns: daemon.turns,
    providers: daemon.providers,
    harnesses: daemon.harnesses,
    workflows: daemon.workflows,
    skills: daemon.skills,
    artifacts: daemon.artifacts,
    actuations: daemon.actuations,
    pushTokens: daemon.pushTokens,
    push: daemon.push,
    localEngine: daemon.localEngine,
    meshStatus: () => ({ kind: "no-node" as const }),
  };
}
