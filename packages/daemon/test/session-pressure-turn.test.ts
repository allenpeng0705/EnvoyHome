// Memory Design §8 — daemon pre-turn flush + L0 compact (Gateway role).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
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
  const stateDir = await mkdtemp(join(tmpdir(), "eh-sess-press-"));
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

test("soft-only flush writes durable L3 without rewriting transcript", async () => {
  const { daemon, stateDir, cleanup } = await boot();
  try {
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    // 32k window → soft margin 4k; size history into soft-only zone.
    await daemon.providers.setProvider({
      id: "mid-cloud",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
      contextTokens: 32_768,
    });
    const opened = await daemon.turns.openSession({ accountId: "alice" });
    const sessionId = String(opened.sessionId);
    const sessionDir = join(stateDir, "accounts", "alice", "sessions", sessionId);
    await mkdir(sessionDir, { recursive: true });
    const durable =
      "I prefer oat milk in the morning and I have a peanut allergy noted for cooks";
    // 32k window: soft≈20.5k / compact≈24.5k tokens. ~85k chars ≈ soft-only zone.
    const filler = "x".repeat(85_000);
    const lines = [
      JSON.stringify({ role: "user", text: durable, at: new Date().toISOString() }),
      JSON.stringify({
        role: "assistant",
        text: "Got it about your preference and allergy.",
        at: new Date().toISOString(),
      }),
      JSON.stringify({ role: "user", text: filler, at: new Date().toISOString() }),
      JSON.stringify({
        role: "assistant",
        text: "continuing the long work session with more detail here please",
        at: new Date().toISOString(),
      }),
    ];
    await writeFile(join(sessionDir, "transcript.jsonl"), `${lines.join("\n")}\n`, "utf8");

    await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "continue",
      callerKind: "loopback-owner",
      completionText: "ok after soft flush",
    });
    for (let i = 0; i < 50 && daemon.turns.activeTurnCount() > 0; i++) {
      await flushLoop(5);
    }

    const transcript = await daemon.turns.getTranscript("alice", sessionId);
    assert.ok(
      !transcript.some((l) => l.kind === "compaction_summary"),
      "soft flush must not compact",
    );
    const meta = JSON.parse(await readFile(join(sessionDir, "meta.json"), "utf8")) as {
      compactionCount?: number;
      memoryFlushCompactionCount?: number;
    };
    assert.equal(meta.compactionCount ?? 0, 0);
    assert.equal(meta.memoryFlushCompactionCount, 0);

    // Local calendar day — flush / StandingStore.appendDaily (not UTC ISO).
    const now = new Date();
    const day = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const l3 = await readFile(
      join(stateDir, "accounts", "alice", "memory", `${day}.md`),
      "utf8",
    );
    assert.match(l3, /prefer oat milk/);
  } finally {
    await cleanup();
  }
});

test("pre-turn compact rewrites long transcript under small contextTokens", async () => {
  const { daemon, stateDir, cleanup } = await boot();
  try {
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    await daemon.providers.setProvider({
      id: "tiny-cloud",
      kind: "cloud_openai_compat",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
      contextTokens: 4096,
    });
    const opened = await daemon.turns.openSession({ accountId: "alice" });
    const sessionId = String(opened.sessionId);
    const sessionDir = join(stateDir, "accounts", "alice", "sessions", sessionId);
    await mkdir(sessionDir, { recursive: true });
    const lines = [];
    for (let i = 0; i < 40; i++) {
      lines.push(
        JSON.stringify({
          role: i % 2 === 0 ? "user" : "assistant",
          text: `history line ${i} `.repeat(40),
          at: new Date().toISOString(),
        }),
      );
    }
    await writeFile(join(sessionDir, "transcript.jsonl"), `${lines.join("\n")}\n`, "utf8");

    await daemon.turns.sendMessage({
      accountId: "alice",
      sessionId,
      text: "continue",
      callerKind: "loopback-owner",
      completionText: "ok after compact",
    });
    for (let i = 0; i < 50 && daemon.turns.activeTurnCount() > 0; i++) {
      await flushLoop(5);
    }

    const transcript = await daemon.turns.getTranscript("alice", sessionId);
    assert.ok(transcript.length < 42, `expected compact, got ${transcript.length} lines`);
    assert.ok(
      transcript.some((l) => l.kind === "compaction_summary"),
      "missing compaction_summary",
    );
    const meta = JSON.parse(await readFile(join(sessionDir, "meta.json"), "utf8")) as {
      compactionCount?: number;
      memoryFlushCompactionCount?: number;
    };
    assert.ok((meta.compactionCount ?? 0) >= 1);
    assert.ok(meta.memoryFlushCompactionCount !== undefined);
  } finally {
    await cleanup();
  }
});
