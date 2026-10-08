// B9 daemon integration — V-DAG-1..2 (routing), reload RPC.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flushLoop, __resetActiveXForTests } from "@envoyhome/test-utils";
import { startDaemon, type RunningDaemon } from "../dist/index.js";

const daemons: RunningDaemon[] = [];

after(async () => {
  __resetActiveXForTests();
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

async function boot() {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-dag-"));
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

test("V-DAG-1/2: keyword workflow route; unmatched harness route", async () => {
  const { daemon, stateDir, cleanup } = await boot();
  try {
    await mkdir(join(stateDir, "workflows"), { recursive: true });
    await writeFile(
      join(stateDir, "workflows", "brief.json"),
      JSON.stringify({
        id: "brief",
        match: { keywords: ["morning brief"] },
        steps: [{ type: "llm_summarize", prompt: "one line" }],
      }),
    );
    await daemon.workflows.reload();

    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    const session = await daemon.turns.openSession({ accountId: "alice" });
    const sessionId = session.sessionId as string;

    await daemon.providers.setProvider({
      id: "local",
      kind: "local_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      model: "m",
      enabled: true,
    });
    await daemon.providers.setMode("alice", "local");

    const matched = await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "morning brief please",
      callerKind: "loopback-owner",
    });
    assert.equal(matched.route, "workflow");

    const unmatched = await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "hello unrelated",
      callerKind: "loopback-owner",
      completionText: "harness reply",
    });
    assert.equal(unmatched.route, "harness");

    // Wait until background turns finish writing transcript (avoid rm race).
    for (let i = 0; i < 50 && daemon.turns.activeTurnCount() > 0; i++) {
      await flushLoop(5);
    }
    assert.equal(daemon.turns.activeTurnCount(), 0);
  } finally {
    await cleanup();
  }
});

test("home.reloadWorkflows returns count", async () => {
  const { daemon, stateDir, cleanup } = await boot();
  try {
    await mkdir(join(stateDir, "workflows"), { recursive: true });
    await writeFile(
      join(stateDir, "workflows", "x.yml"),
      "id: x\nmatch:\n  schedule: '0 7 * * *'\nsteps: []\n",
    );
    const reloaded = await daemon.workflows.reload();
    assert.equal(reloaded, 1);
  } finally {
    await cleanup();
  }
});
