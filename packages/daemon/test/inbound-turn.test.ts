import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flushLoop, __resetActiveXForTests } from "@envoyhome/test-utils";
import type { ModelProvider } from "@envoyhome/providers";
import {
  freshSenderId,
  startDaemon,
  type RunningDaemon,
} from "../dist/index.js";

const daemons: RunningDaemon[] = [];
const dirs: string[] = [];

after(async () => {
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
  for (const dir of dirs.splice(0)) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
  __resetActiveXForTests();
});

async function boot(): Promise<RunningDaemon> {
  const stateDir = await mkdtemp(join(tmpdir(), "envoy-inbound-"));
  dirs.push(stateDir);
  const daemon = await startDaemon({
    config: { wsPort: 0, httpPort: 0, hatchApiKey: "k-in", stateDir },
    packageVersion: "0.0.0-test",
  });
  daemons.push(daemon);
  return daemon;
}

test("inbound chat → turn + home:turn-finished emit", async () => {
  const daemon = await boot();

  await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
  await daemon.channels.setChannelConfig("fake", {});
  await daemon.channels.enableChannel("fake");
  const channelAccount = daemon.channels.loader.getChannelStatus("fake").channelAccount;

  const senderId = freshSenderId();
  await daemon.bindings.set(
    {
      channel: "fake",
      channelAccount,
      senderId,
      accountId: "alice",
    },
    { kind: "loopback-owner", accountIds: [], ownerTrusted: true },
  );

  const finished: unknown[] = [];
  daemon.events.asNodeService().on("home:turn-finished", (data) => {
    finished.push(data);
  });

  const stub: ModelProvider = {
    id: "stub-local",
    kind: "llama-cpp",
    label: "stub",
    async complete() {
      return {
        text: "hello-from-turn",
        model: "stub",
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    },
    describe() {
      return { id: "stub-local", kind: "llama-cpp", label: "stub", hasSecret: false };
    },
  };
  daemon.providers.getRouter().setLocal(stub);

  const ctx = daemon.channels.loader.getContextForTests("fake");
  assert.ok(ctx);
  const ack = await ctx!.emitInbound({ senderId, text: "ping inbound", rawRef: "1:2" });
  assert.equal(ack.accepted, true);
  assert.ok(ack.sessionId);

  await flushLoop(40);
  assert.ok(finished.length >= 1, "expected home:turn-finished");
  const payload = finished[0] as { accountId: string; status: string };
  assert.equal(payload.accountId, "alice");
  assert.equal(payload.status, "ok");
});

test("event-source unbound still opens no turn", async () => {
  const daemon = await boot();

  await daemon.channels.setChannelConfig("fake-events", {});
  await daemon.channels.enableChannel("fake-events");

  const before = daemon.turns.activeTurnCount();
  const ctx = daemon.channels.loader.getContextForTests("fake-events");
  assert.ok(ctx);
  ctx!.registerSources([{ sourceId: "sensor.x", displayName: "X", class: "binary_sensor" }]);
  const ack = await ctx!.emitInbound({ sourceId: "sensor.x" });
  assert.equal(ack.accepted, true);
  assert.equal(ack.reason, "unbound_no_turn");
  await flushLoop(10);
  assert.equal(daemon.turns.activeTurnCount(), before);
});
