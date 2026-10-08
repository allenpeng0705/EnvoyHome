import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BindingStore,
  DeviceCredentialStore,
  dispatchForTest,
  freshSenderId,
  homePaths,
  loopbackSession,
  startDaemon,
  type RouterDeps,
  type RunningDaemon,
} from "../dist/index.js";
import { ChannelService } from "../dist/channels/service.js";
import { DaemonLogger } from "../dist/logger.js";
import { WorkflowStore } from "../dist/workflows.js";
import { SkillService } from "../dist/skills.js";
import { ArtifactService } from "../dist/artifacts.js";
import { ActuationService } from "../dist/actuation-service.js";

const daemons: RunningDaemon[] = [];

after(async () => {
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

function channelRouterDeps(stateDir: string): RouterDeps {
  const logger = new DaemonLogger();
  const devices = new DeviceCredentialStore();
  const bindings = new BindingStore(stateDir, devices);
  const channels = new ChannelService({ stateDir, bindings, logger });
  return {
    config: {
      instanceId: "test",
      label: "test",
      stateDir,
      wsPort: 0,
      httpPort: 0,
      hatchApiKey: "k",
      meshHostingEnabled: false,
      meshAttachEnabled: false,
      stateSchemaVersion: 1,
    },
    startedAt: new Date(),
    logger,
    subscriptions: { subscribe: () => ({ ok: true }) } as RouterDeps["subscriptions"],
    connections: () => 0,
    activeTurns: () => 0,
    onShutdown: () => undefined,
    packageVersion: "0.0.0-test",
    accounts: { list: async () => [], get: async () => undefined } as RouterDeps["accounts"],
    bindings,
    pairing: {} as RouterDeps["pairing"],
    memory: {} as RouterDeps["memory"],
    channels,
    turns: {} as RouterDeps["turns"],
    providers: {} as RouterDeps["providers"],
    harnesses: {} as RouterDeps["harnesses"],
    workflows: new WorkflowStore(homePaths(stateDir)),
    skills: new SkillService(homePaths(stateDir)),
    artifacts: new ArtifactService(homePaths(stateDir), () => "http://127.0.0.1:1"),
    actuations: new ActuationService(homePaths(stateDir)),
    meshStatus: () => ({ kind: "no-node" as const, peerId: "", multiaddrs: [], scopeKey: "" }),
  };
}

test("V-CH-2/9: unknown sender pairingRequired; setChannelConfig secrets not echoed", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "envoy-ch-"));
  const deps = channelRouterDeps(stateDir);
  try {
    await dispatchForTest(
      deps,
      "home.setChannelConfig",
      {
        id: "fake",
        config: { echo: true },
        secrets: { token: "top-secret-value" },
      },
      loopbackSession(),
    );
    const list = await dispatchForTest(deps, "home.listChannels", {}, loopbackSession());
    assert.equal("result" in list, true);
    const channels = (list as { result: { channels: Array<Record<string, unknown>> } }).result;
    assert.equal(JSON.stringify(channels).includes("top-secret-value"), false);

    await dispatchForTest(deps, "home.enableChannel", { id: "fake" }, loopbackSession());
    const loader = deps.channels.loader;
    const ctx = loader.getContextForTests("fake");
    assert.ok(ctx);
    const unknown = await ctx!.emitInbound({ senderId: freshSenderId(), text: "hi" });
    assert.equal(unknown.pairingRequired, true);

    const bad = await dispatchForTest(
      deps,
      "home.setChannelConfig",
      { id: "fake", config: { notDeclared: true } },
      loopbackSession(),
    );
    assert.ok("error" in bad);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-CH-6: hatch POST /v1/inbound with API key", async () => {
  const daemon = await startDaemon({
    config: { wsPort: 0, httpPort: 0, hatchApiKey: "hatch-key-6" },
    hatchBoundAccounts: ["alice"],
    packageVersion: "0.0.0-test",
  });
  daemons.push(daemon);
  const addr = daemon.http.address();
  assert.ok(addr && typeof addr === "object");
  const port = addr.port;
  const res = await fetch(`http://127.0.0.1:${port}/v1/inbound`, {
    method: "POST",
    headers: {
      authorization: "Bearer hatch-key-6",
      "content-type": "application/json",
    },
    body: JSON.stringify({ accountId: "alice", text: "hello hatch" }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { turnId: string; format: string };
  assert.ok(body.turnId);
  assert.equal(body.format, "markdown");
});

test("V-CH-4: persisted channels.json survives config write", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "envoy-ch-persist-"));
  const deps = channelRouterDeps(stateDir);
  try {
    await dispatchForTest(
      deps,
      "home.setChannelConfig",
      { id: "fake", config: {} },
      loopbackSession(),
    );
    const raw = await readFile(join(stateDir, "channels.json"), "utf8");
    assert.match(raw, /"fake"/);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
