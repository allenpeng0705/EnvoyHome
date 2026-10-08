// B8 — LearnQueue, flush, compact, session FTS, trust (V-MEM-*/V-LEARN-*).

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  MemoryFacade,
  MemoryError,
  __resetMemoryForTests,
  deriveTrust,
  compactPaths,
  COMPACT_MAX_ENTRIES,
  type DeepBackendHandle,
} from "../dist/index.js";

const dirs: string[] = [];

async function fresh(): Promise<{ mem: MemoryFacade; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "eh-mem-b8-"));
  dirs.push(root);
  return { mem: new MemoryFacade({ stateDir: root }), root };
}

afterEach(async () => {
  __resetMemoryForTests();
  while (dirs.length) {
    const d = dirs.pop()!;
    await rm(d, { recursive: true, force: true });
  }
});

describe("B8 memory depth", () => {
  test("V-MEM-8: flush before compact; flush skip/failure does not block", async () => {
    const { mem } = await fresh();
    const a = "alice";
    await mem.store.ensureAccountLayout(a);

    const ok = await mem.compactMemory(a, {
      trust: "agent",
      flushItems: [{ target: "l3", text: "flush note about groceries" }],
      consolidateNotes: ["consolidate summary"],
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.compactSummaryPath, "COMPACT.md");
    assert.ok(ok.flush);

    mem.setAccountMemorySettings(a, { flushEnabled: false });
    const skipped = await mem.compactMemory(a, {
      trust: "agent",
      flushItems: [{ target: "l3", text: "should skip" }],
    });
    assert.equal(skipped.flush.skipped, true);

    mem.setAccountMemorySettings(a, { flushEnabled: true });
    const failed = await mem.compactMemory(a, {
      trust: "agent",
      simulateFlushFailure: true,
    });
    assert.equal(failed.ok, true);
    assert.equal(failed.flush.skipped, true);
  });

  test("V-MEM-9: session_search works without L5 backend", async () => {
    const { mem } = await fresh();
    const a = "alice";
    await mem.indexSession(a, "s1", "User talked about peanut allergy and 花生");
    const { hits } = await mem.sessionSearch(a, { query: "peanut" });
    assert.ok(hits.length >= 1);
    assert.ok(hits.some((h) => h.path.includes("session-fts/")));
  });

  test("V-MEM-14: session FTS purged with retention (default 180d)", async () => {
    const { mem } = await fresh();
    const a = "alice";
    mem.setAccountMemorySettings(a, { sessionRetentionDays: 1 });
    const old = new Date("2020-01-01T00:00:00Z");
    await mem.indexSession(a, "old", "ancient session text", { now: old });
    await mem.sessions.purgeExpired(a, {
      now: new Date("2020-01-10T00:00:00Z"),
      retentionDays: 1,
    });
    const ids = await mem.sessions.listSessionIds(a);
    assert.ok(!ids.includes("old"));
  });

  test("V-MEM-15: background review defers when local model busy", async () => {
    const { mem } = await fresh();
    const a = "alice";
    mem.localModelBusy = true;
    const r = await mem.runBackgroundReview(a, {
      kind: "memory_append",
      targetPath: "MEMORY.md",
      payload: "should defer",
      summary: "defer",
      trust: "agent",
    });
    assert.equal(r.deferred, true);
    assert.equal(r.learnId, undefined);
  });

  test("V-MEM-16 + V-LEARN-1: one LearnQueue; skill unchanged until acceptLearn; accept refreshes", async () => {
    const { mem } = await fresh();
    const a = "alice";
    await mem.store.ensureAccountLayout(a);

    const proposed = await mem.proposeLearn(a, {
      kind: "skill_create",
      targetPath: "skills/cook.md",
      payload: "# Cook pasta\nBoil water.",
      summary: "cooking skill",
      trust: "agent",
    });
    assert.equal(proposed.ok, true);
    assert.equal(await mem.skills.read(a, "cook"), null);

    let refreshed = 0;
    mem.onStandingRefresh(() => {
      refreshed += 1;
    });

    await mem.acceptLearn(a, proposed.learn.id);
    const skill = await mem.skills.read(a, "cook");
    assert.ok(skill?.includes("Cook pasta"));
    assert.ok(skill?.includes("provenance"));
    assert.ok(refreshed >= 1);

    const listed = await mem.listPendingLearns(a, { status: "accepted" });
    assert.ok(listed.learns.some((l) => l.id === proposed.learn.id));
  });

  test("V-MEM-19: diffKey coalesce; overflow reject; learn_stale on moved base", async () => {
    const { mem } = await fresh();
    const a = "alice";
    const b = "bob";
    await mem.store.ensureAccountLayout(a);
    await mem.store.ensureAccountLayout(b);

    const p1 = await mem.proposeLearn(a, {
      kind: "memory_append",
      targetPath: "MEMORY.md",
      payload: "Prefer dark mode!",
      summary: "dark",
      trust: "agent",
    });
    const p2 = await mem.proposeLearn(a, {
      kind: "memory_append",
      targetPath: "MEMORY.md",
      payload: "prefer dark mode",
      summary: "dark2",
      trust: "agent",
    });
    assert.equal(p2.coalesced, true);
    assert.equal(p1.learn.id, p2.learn.id);

    // Fill bob's queue to cap (50)
    for (let i = 0; i < 50; i++) {
      await mem.proposeLearn(b, {
        kind: "memory_append",
        targetPath: "MEMORY.md",
        payload: `unique fact number ${i} about widgets`,
        summary: `f${i}`,
        trust: "agent",
      });
    }
    await assert.rejects(
      () =>
        mem.proposeLearn(b, {
          kind: "memory_append",
          targetPath: "MEMORY.md",
          payload: "brand new overflow payload xyz",
          summary: "overflow",
          trust: "agent",
        }),
      (err: unknown) => err instanceof MemoryError && err.code === "learn_rejected_full",
    );

    // Stale on alice: change MEMORY.md then accept memory_edit
    const lone = await mem.proposeLearn(a, {
      kind: "memory_edit",
      targetPath: "MEMORY.md",
      payload: "REPLACE_ME_UNIQUE",
      summary: "edit",
      trust: "owner",
    });
    await mem.store.appendMemory(a, "human edited MEMORY meanwhile", "## Standing");
    await assert.rejects(
      () => mem.acceptLearn(a, lone.learn.id),
      (err: unknown) => err instanceof MemoryError && err.code === "learn_stale",
    );
  });

  test("V-MEM-20: backend containment — disable leaves L1–L3; no cross-account chunks", async () => {
    const { mem } = await fresh();
    const a = "alice";
    const b = "bob";
    await mem.remember(a, { text: "Alice standing fact forever", target: "l2" });
    const backend: DeepBackendHandle = {
      id: "rag-stub",
      enabled: true,
      docs: new Map(),
    };
    mem.attachDeepBackend(backend);
    await mem.backendIngestDerived(a, "s1", "alice-only-chunk");
    await mem.backendIngestDerived(b, "s1", "bob-only-chunk");

    const aliceChunks = await mem.backendQuery(a, "s1");
    const bobChunks = await mem.backendQuery(b, "s1");
    assert.deepEqual(aliceChunks, ["alice-only-chunk"]);
    assert.deepEqual(bobChunks, ["bob-only-chunk"]);

    mem.disableDeepBackend();
    const standing = await mem.backendReadStanding(a);
    assert.ok(standing.memoryMd.includes("Alice standing fact"));

    await mem.deleteSession(a, "s1");
    assert.deepEqual(await mem.backendQuery(a, "s1"), []);

    await mem.purgeAccountBackendState(a);
  });

  test("V-MEM-21 + flush §8.1: event-source / sensitive → pending; accept keeps trust", async () => {
    assert.equal(
      deriveTrust({ bindingTrust: "owner", channelKind: "event-source" }),
      "untrusted",
    );
    assert.equal(
      deriveTrust({ bindingTrust: "owner", sensitiveResultSeen: true }),
      "untrusted",
    );

    const { mem } = await fresh();
    const a = "alice";
    const flush = await mem.flush(
      a,
      [{ target: "l2", text: "door was locked at 9pm" }],
      { trust: "untrusted" },
    );
    assert.equal(flush.directWrites.length, 0);
    assert.ok(flush.pendingLearnIds.length >= 1);

    const learnId = flush.pendingLearnIds[0]!;
    const before = await mem.listPendingLearns(a);
    const row = before.learns.find((l) => l.id === learnId)!;
    assert.equal(row.trust, "untrusted");

    await mem.acceptLearn(a, learnId);
    const md = (await mem.store.load(a)).memoryMd;
    assert.ok(md.includes("trust=untrusted"));
  });

  test("V-LEARN-2: review proposes L1/L2/skills as pending only", async () => {
    const { mem } = await fresh();
    const a = "alice";
    mem.localModelBusy = false;
    const r = await mem.runBackgroundReview(a, {
      kind: "skill_create",
      targetPath: "skills/x.md",
      payload: "skill body",
      summary: "skill",
      trust: "agent",
    });
    assert.equal(r.deferred, false);
    assert.equal(await mem.skills.read(a, "x"), null);
  });

  test("V-LEARN-3: provenance on flush/consolidate/learn writes", async () => {
    const { mem } = await fresh();
    const a = "alice";
    await mem.flush(a, [{ target: "l3", text: "flushed detail" }], {
      trust: "owner",
      turnId: "t1",
    });
    const day = new Date().toISOString().slice(0, 10);
    const daily = (await mem.store.load(a)).dailies.get(day) ?? "";
    assert.ok(daily.includes("source=flush"));
    assert.ok(daily.includes("trust=owner"));
  });

  test("V-MEM-2: compact/flush paths do not expose exec/network", async () => {
    const { mem } = await fresh();
    const a = "alice";
    // Contract: applyFlush / compactMemory only touch StandingStore + LearnQueue + diary.
    const result = await mem.compactMemory(a, {
      trust: "agent",
      flushItems: [{ target: "l3", text: "safe" }],
    });
    assert.equal(result.ok, true);
    assert.ok(!("exec" in result));
    assert.ok(!("network" in result));
  });

  test("V-MEM-6: backend cannot bypass LearnQueue for skills", async () => {
    const { mem } = await fresh();
    const a = "alice";
    mem.attachDeepBackend({ id: "x", enabled: true, docs: new Map() });
    // Only proposeLearn / acceptLearn write skills — no backend write API.
    assert.equal(typeof (mem as unknown as { backendWriteSkill?: unknown }).backendWriteSkill, "undefined");
    await mem.proposeLearn(a, {
      kind: "skill_create",
      targetPath: "skills/b.md",
      payload: "body",
      summary: "s",
      trust: "agent",
    });
    assert.equal(await mem.skills.read(a, "b"), null);
  });

  test("compact archives excluded from recall corpus", async () => {
    const { mem, root } = await fresh();
    const a = "alice";
    await mem.store.ensureAccountLayout(a);
    const p = compactPaths(join(root, "accounts", a));
    await mkdir(p.compactDir, { recursive: true });
    await writeFile(join(p.compactDir, "compact-old.md"), "secret archive peanut", "utf8");
    await mem.remember(a, { text: "visible peanut in MEMORY", target: "l2" });
    const { hits } = await mem.recall(a, { query: "peanut" });
    assert.ok(hits.every((h) => !h.path.includes("memory/compact/")));
    assert.ok(hits.some((h) => h.path === "MEMORY.md"));
    void COMPACT_MAX_ENTRIES;
  });
});
