// B6 acceptance: V-HAR-* / V-LLM-* (daemon wiring) + sandbox isolation.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flushLoop, __resetActiveXForTests } from "@envoyhome/test-utils";
import { startDaemon, type RunningDaemon } from "../dist/index.js";
import { canonicalDigest } from "@envoyhome/harness-host";
import { PathJailError, safeJoin } from "../dist/index.js";

const daemons: RunningDaemon[] = [];

after(async () => {
  __resetActiveXForTests();
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

async function boot() {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-b6-"));
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

test("V-HAR-1: openSession + sendMessage turn under account A", async () => {
  const { daemon, cleanup } = await boot();
  await rpc(daemon.config.wsPort, "home.createAccount", {
    accountId: "alice",
    displayName: "Alice",
  });
  const opened = await rpc(daemon.config.wsPort, "home.openSession", { accountId: "alice" });
  assert.equal(opened["error"], undefined);
  const sessionId = (opened["result"] as { sessionId: string }).sessionId;

  await daemon.providers.setProvider({
    id: "local",
    kind: "local_openai_compat",
    baseUrl: "http://127.0.0.1:9",
    model: "m",
    enabled: true,
  });
  await daemon.providers.setMode("alice", "local");

  const sent = await daemon.turns.sendMessage({
    accountId: "alice",
    sessionId,
    text: "hello",
    callerKind: "loopback-owner",
    completionText: "hi from harness",
  });
  assert.equal(sent.status, "started");
  for (let i = 0; i < 50 && daemon.turns.activeTurnCount() > 0; i++) {
    await flushLoop(5);
  }
  const transcript = await daemon.turns.getTranscript("alice", sessionId);
  assert.ok(transcript.some((m) => m["text"] === "hi from harness"));
  await cleanup();
});

test("V-HAR-3: write outside sandbox_root fails", () => {
  const root = join(tmpdir(), "sandbox-a");
  assert.throws(() => safeJoin(root, "../../../etc/passwd"), PathJailError);
});

test("V-HAR-5: non-built-in harness requires confirm", async () => {
  const { daemon, cleanup } = await boot();
  const denied = await rpc(daemon.config.wsPort, "home.setHarness", {
    harnessId: "codex-adapter",
  });
  assert.ok(denied["error"]);
  const ok = await rpc(daemon.config.wsPort, "home.setHarness", {
    harnessId: "codex-adapter",
    confirm: true,
  });
  assert.equal(ok["error"], undefined);
  await cleanup();
});

test("V-HAR-6: harness sandbox_root scoped to account", async () => {
  const { daemon, cleanup } = await boot();
  assert.throws(
    () => daemon.turns.assertSandboxScope("alice", daemon.config.stateDir),
    /sandbox_root out of scope/,
  );
  await cleanup();
});

test("V-LLM-2/4: setProvider swap + secret not listed", async () => {
  const { daemon, cleanup } = await boot();
  await daemon.providers.setProvider({
    id: "cloud",
    kind: "cloud_openai_compat",
    baseUrl: "http://127.0.0.1:9",
    enabled: true,
  });
  await daemon.providers.setProviderSecret("cloud", "sk-test-secret");
  const listed = daemon.providers.listProviders("alice");
  assert.equal(JSON.stringify(listed).includes("sk-test-secret"), false);
  await rpc(daemon.config.wsPort, "home.setModelMode", { accountId: "alice", mode: "cloud" });
  await cleanup();
});

test("V-SEC-8: grant permits unattended exec", async () => {
  const { daemon, cleanup } = await boot();
  await rpc(daemon.config.wsPort, "home.createAccount", { accountId: "alice", displayName: "Alice" });
  const opened = await rpc(daemon.config.wsPort, "home.openSession", { accountId: "alice" });
  const sessionId = (opened["result"] as { sessionId: string }).sessionId;
  const digest = canonicalDigest({ cmd: "echo ok" });
  await daemon.turns.approvals.writeGrant({
    accountId: "alice",
    tool: "exec",
    argsDigest: digest,
    risk: "exec",
    grantedBy: "loopback-owner",
    expiresAt: null,
  });
  await daemon.turns.sendMessage({
    accountId: "alice",
    sessionId,
    text: "run",
    callerKind: "loopback-owner",
    origin: "unattended",
    plannedTools: [{ tool: "exec", args: { cmd: "echo ok" } }],
    completionText: "done",
  });
  await flushLoop();
  const transcript = await daemon.turns.getTranscript("alice", sessionId);
  assert.ok(transcript.some((m) => m["kind"] === "tool_result" || m["text"] === "done"));
  await cleanup();
});
