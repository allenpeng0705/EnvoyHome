import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatchForTest, loopbackSession, startDaemon } from "../dist/index.js";

async function withServiceDir<T>(fn: (serviceDir: string) => Promise<T>): Promise<T> {
  const serviceDir = await mkdtemp(join(tmpdir(), "eh-svc-"));
  const prevDir = process.env["ENVOYHOME_SERVICE_DIR"];
  const prevDry = process.env["ENVOYHOME_SERVICE_DRY_RUN"];
  const prevJs = process.env["ENVOYHOME_DAEMON_JS"];
  process.env["ENVOYHOME_SERVICE_DIR"] = serviceDir;
  process.env["ENVOYHOME_SERVICE_DRY_RUN"] = "1";
  try {
    return await fn(serviceDir);
  } finally {
    if (prevDir === undefined) delete process.env["ENVOYHOME_SERVICE_DIR"];
    else process.env["ENVOYHOME_SERVICE_DIR"] = prevDir;
    if (prevDry === undefined) delete process.env["ENVOYHOME_SERVICE_DRY_RUN"];
    else process.env["ENVOYHOME_SERVICE_DRY_RUN"] = prevDry;
    if (prevJs === undefined) delete process.env["ENVOYHOME_DAEMON_JS"];
    else process.env["ENVOYHOME_DAEMON_JS"] = prevJs;
    await rm(serviceDir, { recursive: true, force: true });
  }
}

function depsOf(daemon: Awaited<ReturnType<typeof startDaemon>>) {
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

test("home.installService / uninstallService write unit under ENVOYHOME_SERVICE_DIR", async () => {
  await withServiceDir(async (serviceDir) => {
    const stateDir = await mkdtemp(join(tmpdir(), "eh-svc-state-"));
    const stub = join(serviceDir, "stub-daemon.js");
    await writeFile(stub, "// stub\n", "utf8");
    process.env["ENVOYHOME_DAEMON_JS"] = stub;
    try {
      const daemon = await startDaemon({
        config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "k" },
        packageVersion: "0.0.0-test",
      });
      const deps = depsOf(daemon);
      const installed = await dispatchForTest(
        deps,
        "home.installService",
        { manager: "auto" },
        loopbackSession(),
      );
      assert.ok("result" in installed);
      const unitPath = (installed.result as { unitPath: string }).unitPath;
      assert.ok(unitPath.startsWith(serviceDir));
      const body = await readFile(unitPath, "utf8");
      assert.match(body, /ENVOYHOME_STATE_DIR|envoyhome/);

      const status = await dispatchForTest(deps, "home.getServiceStatus", {}, loopbackSession());
      assert.ok("result" in status);
      assert.equal((status.result as { installed: boolean }).installed, true);

      const un = await dispatchForTest(
        deps,
        "home.uninstallService",
        { confirm: true },
        loopbackSession(),
      );
      assert.ok("result" in un);
      await daemon.stop();
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });
});

test("home.setMemorySettings persists via policy.json", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-mem-set-"));
  try {
    const daemon = await startDaemon({
      config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "k" },
      packageVersion: "0.0.0-test",
    });
    const deps = depsOf(daemon);
    const created = await dispatchForTest(
      deps,
      "home.createAccount",
      { displayName: "Mem", accountId: "mem1" },
      loopbackSession(),
    );
    assert.ok("result" in created);

    const set = await dispatchForTest(
      deps,
      "home.setMemorySettings",
      { accountId: "mem1", flushEnabled: false, reviewEnabled: false, sessionRetentionDays: 30 },
      loopbackSession(),
    );
    assert.ok("result" in set);
    assert.equal((set.result as { flushEnabled: boolean }).flushEnabled, false);

    const listed = await dispatchForTest(
      deps,
      "home.listMemory",
      { accountId: "mem1" },
      loopbackSession(),
    );
    assert.ok("result" in listed);
    assert.equal((listed.result as { flushEnabled: boolean }).flushEnabled, false);
    assert.equal((listed.result as { sessionRetentionDays: number }).sessionRetentionDays, 30);

    const health = await dispatchForTest(deps, "home.health", {}, loopbackSession());
    assert.ok("result" in health);
    assert.equal(typeof (health.result as { wsPort: number }).wsPort, "number");

    await daemon.stop();
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
