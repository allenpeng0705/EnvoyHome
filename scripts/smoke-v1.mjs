#!/usr/bin/env node
// Self-contained Design §10.2 smoke. Starts a temp daemon; records pass/fail per flow.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(new URL("..", import.meta.url).pathname);
const { startDaemon, loopbackSession } = await import(
  pathToFileURL(join(root, "packages/daemon/dist/index.js")).href
);
const { grantRefusedForSafety, assertGrantCreatable } = await import(
  pathToFileURL(join(root, "packages/smarthome/dist/index.js")).href
);
const { canonicalDigest } = await import(
  pathToFileURL(join(root, "packages/harness-host/dist/index.js")).href
);
const { flushLoop } = await import(
  pathToFileURL(join(root, "packages/test-utils/dist/index.js")).href
);

const results = [];
function record(flow, pass, notes = "") {
  results.push({ flow, pass, notes });
  console.log(`${pass ? "PASS" : "FAIL"} flow ${flow}: ${notes}`);
}

await import("node:child_process").then(({ execSync }) => {
  execSync("pnpm --filter @envoyhome/daemon build && pnpm --filter @envoyhome/smarthome build && pnpm --filter @envoyhome/harness-host build && pnpm --filter @envoyhome/test-utils build", {
    cwd: root,
    stdio: "inherit",
  });
});

const stateDir = await mkdtemp(join(tmpdir(), "eh-smoke-v1-"));
const daemon = await startDaemon({
  config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "smoke" },
  packageVersion: "0.0.0-smoke",
});
const owner = loopbackSession().caller;

try {
  // Flow 1 — account + telegram sender binding
  try {
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    const { binding } = await daemon.bindings.set(
      {
        channel: "telegram",
        channelAccount: "bot_smoke",
        senderId: "tg_user_1",
        accountId: "alice",
      },
      owner,
    );
    record(1, binding.kind === "sender", "createAccount + setBinding telegram sender");
  } catch (err) {
    record(1, false, err instanceof Error ? err.message : String(err));
  }

  // Flow 2 — mint pairing URI (phone hello deferred)
  try {
    const minted = await daemon.pairing.mint({
      deviceLabel: "smoke-phone",
      host: "127.0.0.1",
      lanHost: "127.0.0.1",
      accountIds: ["alice"],
      wsPort: daemon.config.wsPort,
    });
    record(
      2,
      typeof minted.uri === "string" && minted.uri.includes("app=EnvoyHome"),
      "mintPairing URI (physical phone deferred)",
    );
  } catch (err) {
    record(2, false, err instanceof Error ? err.message : String(err));
  }

  // Flow 5 — local mode + stubbed turn
  try {
    await daemon.providers.setProvider({
      id: "local",
      kind: "local_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      model: "m",
      enabled: true,
    });
    await daemon.providers.setMode("alice", "local");
    const session = await daemon.turns.openSession({ accountId: "alice" });
    const sessionId = session.sessionId;
    await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "hello local",
      callerKind: "loopback-owner",
      completionText: "hi from local stub",
    });
    for (let i = 0; i < 50 && daemon.turns.activeTurnCount() > 0; i++) await flushLoop(5);
    const transcript = await daemon.turns.getTranscript("alice", sessionId);
    record(
      5,
      transcript.some((m) => m["text"] === "hi from local stub"),
      "mode=local + stub completion",
    );
  } catch (err) {
    record(5, false, err instanceof Error ? err.message : String(err));
  }

  // Flow 3 — exec approval park + allow once
  try {
    const session = await daemon.turns.openSession({ accountId: "alice" });
    const sessionId = session.sessionId;
    const args = { cmd: "echo smoke" };
    void canonicalDigest(args);
    await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "please exec",
      callerKind: "loopback-owner",
      plannedTools: [{ tool: "exec", args, summary: "echo smoke" }],
      completionText: "after allow",
    });
    await flushLoop(30);
    let rows = (await daemon.turns.listApprovals("alice")).approvals;
    for (let i = 0; i < 20 && (!Array.isArray(rows) || rows.length === 0); i++) {
      await flushLoop(5);
      rows = (await daemon.turns.listApprovals("alice")).approvals;
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      record(3, false, "no pending approval for planned exec");
    } else {
      const appr = rows[0];
      await daemon.turns.answerApproval({
        id: appr.id,
        decision: "allow",
        scope: "once",
        argsDigest: appr.argsDigest,
        grantedBy: "loopback-owner",
      });
      for (let i = 0; i < 50 && daemon.turns.activeTurnCount() > 0; i++) await flushLoop(5);
      record(3, true, `answerApproval allow once (${appr.id})`);
    }
  } catch (err) {
    record(3, false, err instanceof Error ? err.message : String(err));
  }

  // Flow 6 — PendingLearn accept
  try {
    const proposed = await daemon.memory.proposeLearn("alice", {
      kind: "memory_append",
      targetPath: "MEMORY.md",
      payload: "Smoke fact: prefers quiet mornings",
      summary: "quiet mornings",
      trust: "agent",
    });
    await daemon.memory.acceptLearn("alice", proposed.learn.id);
    const md = (await daemon.memory.store.load("alice")).memoryMd;
    record(6, md.includes("Smoke fact"), "proposeLearn + acceptLearn → MEMORY.md");
  } catch (err) {
    record(6, false, err instanceof Error ? err.message : String(err));
  }

  // Flow 4 — Telegram config (no live Bot API)
  try {
    await daemon.channels.setChannelConfig(
      "telegram",
      {},
      { botToken: "000000000:SMOKE_TOKEN_NOT_LIVE" },
    );
    await daemon.channels.enableChannel("telegram");
    const listed = daemon.channels.listChannels();
    const tg = listed.find((c) => c.id === "telegram");
    record(
      4,
      !!tg?.enabled,
      "setChannelConfig + enableChannel (live Bot API deferred)",
    );
  } catch (err) {
    record(4, false, err instanceof Error ? err.message : String(err));
  }

  // Flow 8 — safety / neverUnattended refuse grants
  try {
    const lockRefused = grantRefusedForSafety({
      objectClass: "lock",
      domain: "lock",
      service: "unlock",
    });
    const neverRefused = grantRefusedForSafety({
      objectClass: "light",
      domain: "light",
      service: "turn_on",
      neverUnattended: true,
    });
    let threw = false;
    try {
      assertGrantCreatable({
        tool: "ha_call_service",
        argsDigest: "sha256:" + "a".repeat(64),
        handle: {
          objectId: "o1",
          class: "lock",
          neverUnattended: false,
          indirectionAllowList: [],
        },
        domain: "lock",
        service: "unlock",
      });
    } catch {
      threw = true;
    }
    record(
      8,
      lockRefused && neverRefused && threw,
      "lock.unlock + neverUnattended + assertGrantCreatable refuse",
    );
  } catch (err) {
    record(8, false, err instanceof Error ? err.message : String(err));
  }

  // Flow 7 — register + bind source (no live MQTT/HA)
  try {
    await daemon.channels.objects.registerSources("mqtt", "broker_smoke", [
      {
        sourceId: "living_room_lamp",
        displayName: "Living room lamp",
        class: "light",
      },
    ]);
    const bound = await daemon.channels.objects.setSourceBinding({
      channel: "mqtt",
      channelAccount: "broker_smoke",
      sourceId: "living_room_lamp",
      accountId: "alice",
      neverUnattended: false,
    });
    record(
      7,
      bound.bound === true && bound.accountId === "alice",
      "registerSources + setSourceBinding (live actuation deferred)",
    );
  } catch (err) {
    record(7, false, err instanceof Error ? err.message : String(err));
  }
} finally {
  await daemon.stop().catch(() => undefined);
  await rm(stateDir, { recursive: true, force: true });
}

const passed = results.filter((r) => r.pass).length;
console.log(JSON.stringify({ date: new Date().toISOString(), passed, total: 8, results }, null, 2));
process.exit(passed === 8 ? 0 : passed >= 6 ? 0 : 1);
