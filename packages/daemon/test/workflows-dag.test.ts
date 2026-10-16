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

test("put/validate/enable/runWorkflow round-trip", async () => {
  const { daemon, cleanup } = await boot();
  try {
    const bad = daemon.workflows.validate(
      "id: loop\nmatch:\n  keywords: [x]\nnodes:\n  - {id: a, type: llm_fill, prompt: a}\n  - {id: b, type: llm_fill, prompt: b}\nedges:\n  - {from: a, to: b}\n  - {from: b, to: a}\n",
    );
    assert.equal(bad.ok, false);
    assert.match(bad.error ?? "", /cycle/);

    const yaml = [
      "id: brief_dag",
      "match:",
      "  keywords: [brief]",
      "steps:",
      "  - id: sum",
      "    type: llm_summarize",
      "    prompt: one line",
      "",
    ].join("\n");
    const ok = daemon.workflows.validate(yaml);
    assert.equal(ok.ok, true);
    assert.equal(ok.ok && ok.id, "brief_dag");

    const put = await daemon.workflows.put(yaml);
    assert.equal(put.id, "brief_dag");
    const listed = daemon.workflows.list();
    assert.ok(listed.some((w) => w.id === "brief_dag" && w.enabled));

    await daemon.workflows.setEnabled("brief_dag", false);
    assert.equal(daemon.workflows.getDef("brief_dag")?.enabled, false);

    await daemon.workflows.setEnabled("brief_dag", true);
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    await daemon.providers.setProvider({
      id: "local",
      kind: "local_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      model: "m",
      enabled: true,
    });
    await daemon.providers.setMode("alice", "local");

    const beforeSessions = await daemon.turns.listSessions("alice");
    const beforeCount = (beforeSessions.sessions as unknown[]).length;
    // Provider will fail to connect; llm step should surface as failed ok=false, not throw.
    const { results } = await daemon.turns.runWorkflowTest({
      accountId: "alice",
      workflowId: "brief_dag",
    });
    assert.ok(results.length >= 1);
    assert.equal(results[0]?.nodeId, "sum");
    // Ephemeral session must not linger.
    const afterSessions = await daemon.turns.listSessions("alice");
    assert.equal((afterSessions.sessions as unknown[]).length, beforeCount);
  } finally {
    await cleanup();
  }
});

test("write_file creates parent dirs for nested paths (demo notes/*)", async () => {
  const { daemon, stateDir, cleanup } = await boot();
  try {
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    const known = new Set(["write_file"]);
    await daemon.workflows.put(
      [
        "id: nest_write",
        "enabled: false",
        "match:",
        "  keywords: [nestwrite]",
        "steps:",
        "  - id: save",
        "    type: tool",
        "    name: write_file",
        "    args:",
        "      path: notes/household-intake.txt",
        "      content: demo body",
        "",
      ].join("\n"),
      "alice",
      known,
    );
    const { results } = await daemon.turns.runWorkflowTest({
      accountId: "alice",
      workflowId: "nest_write",
    });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.ok, true, results[0]?.detail);
    const written = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(stateDir, "accounts", "alice", "files", "notes", "household-intake.txt"), "utf8"),
    );
    assert.equal(written, "demo body");
  } finally {
    await cleanup();
  }
});

test("disabled schedule workflows are omitted from sync rows", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await daemon.workflows.put(
      [
        "id: morning",
        "match:",
        "  schedule: '0 7 * * *'",
        "enabled: false",
        "steps: []",
        "",
      ].join("\n"),
    );
    await daemon.workflows.put(
      [
        "id: evening",
        "match:",
        "  schedule: '0 19 * * *'",
        "steps: []",
        "",
      ].join("\n"),
    );
    const rows = daemon.workflows.scheduleSyncRows(daemon.workflows.mergedForAccount("alice"));
    // mergedForAccount with unknown account still returns globals
    assert.deepEqual(
      rows.map((r) => r.id).sort(),
      ["evening"],
    );
  } finally {
    await cleanup();
  }
});

test("account overlay put/get/remove uses accountId", async () => {
  const { daemon, cleanup } = await boot();
  try {
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    await daemon.workflows.put(
      "id: local_only\nmatch:\n  keywords: [hi]\nsteps: []\n",
      "alice",
    );
    const listed = daemon.workflows.list("alice");
    assert.ok(listed.some((w) => w.id === "local_only" && w.source === "account"));
    const got = daemon.workflows.getWorkflow("local_only", "alice");
    assert.ok(got?.yaml.includes("local_only"));
    assert.equal(daemon.workflows.getWorkflow("local_only"), null);
    await daemon.workflows.remove("local_only", "alice");
    assert.equal(daemon.workflows.getDef("local_only", "alice"), null);
  } finally {
    await cleanup();
  }
});
