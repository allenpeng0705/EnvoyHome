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

test("home.registerPushToken persists for paired device", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-push-"));
  try {
    const daemon = await startDaemon({
      config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "k" },
      packageVersion: "0.0.0-test",
    });
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

    daemon.pairing.__resetMintRateForTests();
    const minted = await dispatchForTest(
      deps,
      "home.mintPairing",
      { deviceLabel: "phone", host: "127.0.0.1", lanHost: "127.0.0.1" },
      loopbackSession(),
    );
    assert.ok("result" in minted);
    const deviceId = (minted.result as { device: { deviceId: string } }).device.deviceId;

    const deviceSession: HomeSession = {
      scopeKey: deviceId,
      ownerId: deviceId,
      isOwnerScope: false,
      deviceId,
      caller: {
        kind: "device",
        deviceId,
        accountIds: [],
        ownerTrusted: false,
      },
    };

    const reg = await dispatchForTest(
      deps,
      "home.registerPushToken",
      { platform: "ios", token: "abcdef0123456789", tokenType: "alert" },
      deviceSession,
    );
    assert.ok("result" in reg);
    assert.equal((reg.result as { ok: boolean }).ok, true);
    assert.equal((reg.result as { deviceId: string }).deviceId, deviceId);

    const stored = await daemon.pushTokens.get(deviceId);
    assert.ok(stored);
    assert.equal(stored!.platform, "ios");
    assert.equal(stored!.token, "abcdef0123456789");

    const un = await dispatchForTest(deps, "home.unregisterPushToken", {}, deviceSession);
    assert.ok("result" in un);
    assert.equal(await daemon.pushTokens.get(deviceId), undefined);

    await daemon.stop();
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
