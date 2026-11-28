/**
 * KnowYou / memory e2e through KnowledgeService (daemon façade).
 * Covers KB-P6 multi-arm ranking + keepers without a live LLM.
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { EpisodicIndex } from "@envoyhome/memory";
import { homePaths } from "../dist/home-paths.js";
import { KnowledgeService } from "../dist/knowledge-service.js";
import { DaemonLogger } from "../dist/logger.js";
import { EmbedEngineService } from "../dist/local-engine/embed-engine.js";

async function withSvc<T>(
  fn: (svc: KnowledgeService, accountId: string, root: string) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "ky-e2e-"));
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

async function seed(
  svc: KnowledgeService,
  accountId: string,
  rows: Array<{ key: string; text: string }>,
): Promise<void> {
  for (const row of rows) {
    await svc.updateKnowYou(accountId, {
      action: "supersede",
      key: row.key,
      text: row.text,
    });
  }
}

test("e2e: multi-arm search ranks drink preference over distractors (V-KY-9)", async () => {
  await withSvc(async (svc, accountId) => {
    await seed(svc, accountId, [
      {
        key: "pref.drink",
        text: "I prefer genmaicha in the afternoon. Token: e2e-ky-genmai-1",
      },
      {
        key: "note.garage",
        text: "The garage door squeaks on rainy days and needs paint.",
      },
      {
        key: "note.plumbing",
        text: "River Plumbing fixed the sink last spring.",
      },
      {
        key: "note.ladder",
        text: "Household ladder lives behind the furnace.",
      },
    ]);

    const { hits } = await svc.searchKnowYou(accountId, "afternoon drink preference tea", {
      limit: 3,
    });
    assert.ok(hits.length >= 1);
    assert.ok(hits.length <= 3);
    assert.ok(
      hits.some((h) => /genmaicha|e2e-ky-genmai-1/i.test(h.text)),
      `expected drink hit, got ${JSON.stringify(hits)}`,
    );
    assert.equal(hits[0]!.key, "pref.drink");
    assert.ok(
      hits.every((h) => h.engine === "multiarm" || h.engine === "fts" || h.engine === "scan"),
    );
  });
});

test("e2e: auto episodic inject is budgeted and labeled (V-KY-5 / V-KY-9)", async () => {
  await withSvc(async (svc, accountId) => {
    await seed(svc, accountId, [
      {
        key: "pref.drink",
        text: "I prefer jasmine tea each morning. Token: e2e-inject-jasmine-2",
      },
    ]);
    for (let i = 0; i < 12; i++) {
      await svc.updateKnowYou(accountId, {
        action: "supersede",
        key: `note.fill.${i}`,
        text: `Unrelated filler note ${i} about ladders paint and furnaces unique-${i}`,
      });
    }

    await svc.setPolicy(accountId, {
      episodicInject: "auto",
      knowledgeInject: "off",
      episodicInjectBudget: 900,
    });

    const rag = await svc.buildRagInject(accountId, "what drink do I prefer in the morning", {
      profileFacts: {},
      memoryMd: "",
    });
    assert.match(rag.episodic, /Related past context/);
    assert.match(rag.episodic, /jasmine|e2e-inject-jasmine-2|prefer/i);
    assert.ok(rag.episodic.length <= 950, `inject too large: ${rag.episodic.length}`);
    assert.ok(
      !/Unrelated filler note 11/i.test(rag.episodic) ||
        rag.episodic.split("Unrelated").length < 5,
      "must not dump the whole bank into inject",
    );
  });
});

test("e2e: standing filter drops episodic coffee when L1 drink=tea (V-KY-8)", async () => {
  await withSvc(async (svc, accountId, root) => {
    await seed(svc, accountId, [
      {
        key: "pref.drink",
        text: "Someone said coffee is best. Token: e2e-stale-coffee-3",
      },
    ]);
    await svc.setPolicy(accountId, {
      episodicInject: "auto",
      knowledgeInject: "off",
      episodicInjectBudget: 2000,
    });

    const rag = await svc.buildRagInject(accountId, "what is my favorite drink", {
      profileFacts: { drink: "tea" },
      memoryMd: "drink: tea\nFavorite drink is tea.",
    });
    assert.ok(
      !/coffee|e2e-stale-coffee-3/i.test(rag.episodic),
      `standing must filter coffee episodic, got: ${rag.episodic}`,
    );

    // Contradicted coffee hit must not be FSRS-reinforced (touch after standing filter).
    const epi = new EpisodicIndex((id) => join(root, "accounts", id));
    const coffee = (await epi.listActive(accountId)).find((r) =>
      /e2e-stale-coffee-3/i.test(r.text),
    );
    assert.ok(coffee);
    assert.equal(coffee!.accessCount ?? 0, 0);
    assert.equal(coffee!.lastAccessAt, undefined);
  });
});

test("e2e: untrusted ingest does not write KnowYou (V-KY-3)", async () => {
  await withSvc(async (svc, accountId) => {
    const results = await svc.ingestTurn(
      accountId,
      "I prefer cold brew coffee always",
      undefined,
      {
        allowWrites: false,
        profileFacts: {},
        memoryMd: "",
      },
    );
    assert.ok(results.every((r) => r.action === "SKIP"));
    const { hits } = await svc.searchKnowYou(accountId, "cold brew coffee");
    assert.equal(hits.length, 0);
  });
});

test("e2e: user-turn ingest then search finds preference (extract → multi-arm)", async () => {
  await withSvc(async (svc, accountId) => {
    const results = await svc.ingestTurn(
      accountId,
      "Please remember I prefer oat milk latte in the morning.",
      "Sure, I'll keep that in mind.",
      {
        allowWrites: true,
        profileFacts: {},
        memoryMd: "",
        sourceSessionId: "sess-e2e-1",
        sourceTurnId: "turn-1",
      },
    );
    assert.ok(
      results.some((r) => r.action === "ADD" || r.action === "SUPERSEDE"),
      `expected ADD/SUPERSEDE, got ${JSON.stringify(results)}`,
    );
    const { hits } = await svc.searchKnowYou(accountId, "oat milk latte morning", {
      limit: 5,
    });
    assert.ok(hits.some((h) => /oat|latte|prefer/i.test(h.text)));
  });
});

test("e2e: SUPERSEDE then search returns only active preference (V-KY-1)", async () => {
  await withSvc(async (svc, accountId) => {
    await seed(svc, accountId, [
      { key: "pref.drink", text: "I prefer coffee. Token: e2e-old-coffee" },
    ]);
    await seed(svc, accountId, [
      { key: "pref.drink", text: "I prefer tea now. Token: e2e-new-tea" },
    ]);
    const { hits } = await svc.searchKnowYou(accountId, "prefer drink", { limit: 5 });
    assert.ok(hits.some((h) => /e2e-new-tea|prefer tea/i.test(h.text)));
    assert.ok(!hits.some((h) => /e2e-old-coffee/i.test(h.text) && h.key === "pref.drink"));
  });
});

test("e2e: standing conflict → PENDING_LEARN, no episodic ADD (V-KY-7)", async () => {
  await withSvc(async (svc, accountId) => {
    const results = await svc.ingestTurn(
      accountId,
      "I prefer coffee instead of tea now",
      undefined,
      {
        allowWrites: true,
        profileFacts: { drink: "tea" },
        memoryMd: "drink: tea",
      },
    );
    assert.ok(results.some((r) => r.action === "PENDING_LEARN"));
    const { hits } = await svc.searchKnowYou(accountId, "coffee");
    assert.equal(hits.length, 0);
  });
});

test("e2e: no cross-account KnowYou bleed", async () => {
  await withSvc(async (svc, _alice, root) => {
    const paths = homePaths(root);
    await mkdir(paths.accountRoot("bob"), { recursive: true });

    await seed(svc, "alice", [
      { key: "pref.drink", text: "Alice prefers tea. Token: e2e-alice-tea" },
    ]);
    await seed(svc, "bob", [
      { key: "pref.drink", text: "Bob prefers coffee. Token: e2e-bob-coffee" },
    ]);

    const a = await svc.searchKnowYou("alice", "prefer drink", { limit: 5 });
    const b = await svc.searchKnowYou("bob", "prefer drink", { limit: 5 });
    assert.ok(a.hits.every((h) => /Alice|e2e-alice-tea|tea/i.test(h.text)));
    assert.ok(b.hits.every((h) => /Bob|e2e-bob-coffee|coffee/i.test(h.text)));
    assert.ok(!a.hits.some((h) => /Bob|e2e-bob-coffee/i.test(h.text)));
    assert.ok(!b.hits.some((h) => /Alice|e2e-alice-tea/i.test(h.text)));
  });
});

test("e2e: forget removes fact from subsequent search", async () => {
  await withSvc(async (svc, accountId) => {
    await seed(svc, accountId, [
      { key: "allergy.peanut", text: "Allergic to peanuts. Token: e2e-peanut-9" },
    ]);
    assert.ok((await svc.searchKnowYou(accountId, "peanut allergy")).hits.length >= 1);
    await svc.updateKnowYou(accountId, { action: "forget", key: "allergy.peanut" });
    assert.equal((await svc.searchKnowYou(accountId, "peanut allergy")).hits.length, 0);
  });
});

test("e2e: episodicInject=tool yields empty auto inject block", async () => {
  await withSvc(async (svc, accountId) => {
    await seed(svc, accountId, [
      { key: "pref.drink", text: "I prefer tea. Token: e2e-tool-only" },
    ]);
    await svc.setPolicy(accountId, {
      episodicInject: "tool",
      knowledgeInject: "off",
    });
    const rag = await svc.buildRagInject(accountId, "what drink do I prefer", {
      profileFacts: {},
      memoryMd: "",
    });
    assert.equal(rag.episodic, "");
    // Tool path still finds it
    const { hits } = await svc.searchKnowYou(accountId, "prefer drink tea");
    assert.ok(hits.some((h) => /e2e-tool-only|tea/i.test(h.text)));
  });
});

test("e2e: search limit clamps — never returns whole bank", async () => {
  await withSvc(async (svc, accountId) => {
    for (let i = 0; i < 25; i++) {
      await svc.updateKnowYou(accountId, {
        action: "supersede",
        key: `note.n${i}`,
        text: `I prefer tea flavor variant ${i} in the morning household note`,
      });
    }
    const { hits } = await svc.searchKnowYou(accountId, "prefer tea morning", { limit: 4 });
    assert.ok(hits.length <= 4);
    assert.ok(hits.length >= 1);
  });
});
