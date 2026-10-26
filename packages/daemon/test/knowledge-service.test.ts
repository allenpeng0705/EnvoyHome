// KnowledgeService — durable policy, V-KY-7 PendingLearn, purge, V-EMB-6 stale, RAG inject.

import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { homePaths } from "../dist/home-paths.js";
import { KnowledgeService } from "../dist/knowledge-service.js";
import { DaemonLogger } from "../dist/logger.js";
import { EmbedEngineService } from "../dist/local-engine/embed-engine.js";

async function withSvc<T>(fn: (svc: KnowledgeService, accountId: string, root: string) => Promise<T>) {
  const root = await mkdtemp(join(tmpdir(), "kb-svc-"));
  const paths = homePaths(root);
  const accountId = "alice";
  await mkdir(paths.accountRoot(accountId), { recursive: true });
  const embed = new EmbedEngineService(paths, new DaemonLogger());
  await embed.load();
  const svc = new KnowledgeService(paths, embed);
  try {
    return await fn(svc, accountId, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("knowledge policy persists per account", async () => {
  await withSvc(async (svc, accountId, root) => {
    const def = await svc.getPolicy(accountId);
    assert.equal(def.knowledgeInject, "auto");
    assert.equal(def.episodicInject, "auto");

    const next = await svc.setPolicy(accountId, {
      knowledgeInject: "auto",
      episodicInject: "off",
      knowledgeInjectBudget: 1234,
    });
    assert.equal(next.knowledgeInject, "auto");
    assert.equal(next.episodicInject, "off");
    assert.equal(next.knowledgeInjectBudget, 1234);

    const onDisk = join(
      homePaths(root).accountRoot(accountId),
      "memory-backend",
      "knowledge-policy.json",
    );
    const raw = JSON.parse(await readFile(onDisk, "utf8")) as {
      knowledgeInject: string;
      episodicInject: string;
    };
    assert.equal(raw.knowledgeInject, "auto");
    assert.equal(raw.episodicInject, "off");

    const again = await svc.getPolicy(accountId);
    assert.deepEqual(again, next);
  });
});

test("V-KY-7: standing conflict → PENDING_LEARN with plain text (no episodic ADD)", async () => {
  await withSvc(async (svc, accountId) => {
    const results = await svc.ingestTurn(
      accountId,
      "I prefer coffee in the morning",
      undefined,
      {
        allowWrites: true,
        profileFacts: { drink: "tea" },
        memoryMd: "drink: tea",
      },
    );
    const pending = results.filter((r) => r.action === "PENDING_LEARN");
    assert.ok(pending.length >= 1, `expected PENDING_LEARN, got ${JSON.stringify(results)}`);
    for (const p of pending) {
      assert.ok(typeof p.text === "string" && p.text.length > 0);
      assert.ok(!p.text.trimStart().startsWith("{"), "payload must be plain text, not JSON");
      assert.equal(p.profileKey, "drink");
    }
    const { hits } = await svc.searchKnowYou(accountId, "coffee");
    assert.equal(hits.length, 0, "conflict must not ADD to episodic");
  });
});

test("KnowYou purgeSession removes rows for that session", async () => {
  await withSvc(async (svc, accountId) => {
    const sessionId = "sess-purge-1";
    await svc.ingestTurn(accountId, "I prefer green tea always", undefined, {
      allowWrites: true,
      sourceSessionId: sessionId,
      sourceTurnId: "t1",
      profileFacts: {},
      memoryMd: "",
    });
    const before = await svc.searchKnowYou(accountId, "green tea");
    assert.ok(before.hits.length >= 1);
    const n = await svc.purgeSession(accountId, sessionId);
    assert.ok(n >= 1);
    const after = await svc.searchKnowYou(accountId, "green tea");
    assert.equal(after.hits.length, 0);
  });
});

test("V-EMB-6: markAllEmbedStale flips every listed account", async () => {
  await withSvc(async (svc, _accountId, root) => {
    const paths = homePaths(root);
    for (const id of ["a1", "a2"]) {
      await mkdir(paths.accountRoot(id), { recursive: true });
      await svc.knowledge.ensure(id);
      const st0 = await svc.knowledge.status(id);
      assert.equal(st0.embedStale, false);
    }
    await svc.markAllEmbedStale(["a1", "a2", "missing"]);
    assert.equal((await svc.knowledge.status("a1")).embedStale, true);
    assert.equal((await svc.knowledge.status("a2")).embedStale, true);
  });
});

test("buildRagInject auto + standing filter (V-KB-6)", async () => {
  await withSvc(async (svc, accountId) => {
    const knowledge = join(svc.knowledgeRoot(accountId));
    await mkdir(knowledge, { recursive: true });
    await writeFile(
      join(knowledge, "drinks.md"),
      "# Drinks\n\nHousehold default drink is coffee for guests.\n",
      "utf8",
    );
    await svc.reindexKnowledge(accountId);
    await svc.setPolicy(accountId, {
      knowledgeInject: "auto",
      episodicInject: "off",
      knowledgeInjectBudget: 2000,
    });

    const filtered = await svc.buildRagInject(accountId, "what drink", {
      profileFacts: { drink: "tea" },
      memoryMd: "drink: tea",
    });
    // L2 wins: coffee-vs-tea exclusive alt must not appear in inject block.
    assert.ok(
      !/coffee/i.test(filtered.knowledge),
      `expected coffee dropped, got: ${filtered.knowledge}`,
    );

    const toolOnly = await svc.setPolicy(accountId, { knowledgeInject: "tool" });
    assert.equal(toolOnly.knowledgeInject, "tool");
    const none = await svc.buildRagInject(accountId, "what drink", {
      profileFacts: { drink: "tea" },
      memoryMd: "",
    });
    assert.equal(none.knowledge, "");
    assert.equal(none.combined, "");
  });
});

test("home.updateKnowYou forget by key", async () => {
  await withSvc(async (svc, accountId) => {
    await svc.ingestTurn(accountId, "I prefer oat milk always", undefined, {
      allowWrites: true,
      profileFacts: {},
      memoryMd: "",
    });
    const before = await svc.searchKnowYou(accountId, "oat milk");
    assert.ok(before.hits.length >= 1);
    const key = before.hits[0]!.key || "pref.drink";
    await svc.updateKnowYou(accountId, { action: "forget", key });
    const after = await svc.searchKnowYou(accountId, "oat milk");
    assert.equal(after.hits.length, 0);
  });
});

test("V-EMB-6: searchKnowledge FTS-only while embedStale", async () => {
  await withSvc(async (svc, accountId) => {
    const knowledge = join(svc.knowledgeRoot(accountId));
    await mkdir(knowledge, { recursive: true });
    await writeFile(join(knowledge, "a.md"), "# A\n\nQuiet hours at 22:00.\n", "utf8");
    await svc.reindexKnowledge(accountId);
    await svc.knowledge.markEmbedStale(accountId);
    const { hits } = await svc.searchKnowledge(accountId, "quiet hours");
    assert.ok(hits.length >= 1);
    assert.ok(hits.every((h) => h.engine === "fts" || h.engine === "scan"));
  });
});

test("embedEngine setOnModelChange fires when modelId changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "emb-chg-"));
  const paths = homePaths(root);
  const eng = new EmbedEngineService(paths, new DaemonLogger());
  await eng.load();
  let seen = "";
  eng.setOnModelChange((id) => {
    seen = id;
  });
  eng.setMockEmbeddings(true);
  await eng.enable({
    prefer: "spawn",
    modelId: "qwen3-embedding-4b-q4_k_m",
  });
  assert.equal(seen, "qwen3-embedding-4b-q4_k_m");
  await eng.disable();
  await rm(root, { recursive: true, force: true });
});

test("sha256 mismatch quarantines embed GGUF", async () => {
  const root = await mkdtemp(join(tmpdir(), "emb-q-"));
  const paths = homePaths(root);
  const eng = new EmbedEngineService(paths, new DaemonLogger());
  await eng.load();
  const dir = eng.embedModelsDir();
  await mkdir(dir, { recursive: true });
  const fileName = "Qwen3-Embedding-0.6B-Q8_0.gguf";
  const abs = join(dir, fileName);
  await writeFile(abs, "not-a-real-gguf", "utf8");
  await assert.rejects(
    () =>
      (
        eng as unknown as {
          verifyEmbedFile: (f: string, p: string) => Promise<string>;
        }
      ).verifyEmbedFile(fileName, abs),
    /sha256/i,
  );
  await assert.rejects(() => access(abs), /ENOENT/);
  await access(`${abs}.bad-sha256`);
  await rm(root, { recursive: true, force: true });
});
