import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  EpisodicIndex,
  KnowledgeIndex,
  buildEpisodicInjectBlock,
  buildKnowledgeInjectBlock,
  candidateConflictsWithStanding,
  filterEpisodicAgainstStanding,
  filterKnowledgeAgainstStanding,
  textContradictsStandingValue,
  STANDING_DUTY_LINE,
} from "../dist/index.js";

test("V-KB-§3.4: reindex preserves user-edited _index.md", async () => {
  const root = await mkdtemp(join(tmpdir(), "kb-idx-"));
  const accountId = "acc1";
  const knowledge = join(root, "accounts", accountId, "files", "knowledge");
  await mkdir(knowledge, { recursive: true });
  await writeFile(join(knowledge, "a.md"), "# A\n\nFact one.\n", "utf8");
  await writeFile(join(knowledge, "_index.md"), "# My curated map\n\n- hand edit\n", "utf8");
  const idx = new KnowledgeIndex((id) => join(root, "accounts", id));
  await idx.reindex(accountId, knowledge);
  const kept = await readFile(join(knowledge, "_index.md"), "utf8");
  assert.match(kept, /hand edit/);
  assert.match(kept, /My curated map/);
  await rm(root, { recursive: true, force: true });
});

test("V-KB-1: delete index leaves knowledge files; reindex restores search", async () => {
  const root = await mkdtemp(join(tmpdir(), "kb-"));
  const accountId = "acc1";
  const accountRoot = join(root, "accounts", accountId);
  const knowledge = join(accountRoot, "files", "knowledge");
  await mkdir(knowledge, { recursive: true });
  await writeFile(
    join(knowledge, "handbook.md"),
    "# Handbook\n\nQuiet hours start at 22:00. Token: kb-quiet-22\n",
    "utf8",
  );

  const idx = new KnowledgeIndex((id) => join(root, "accounts", id));
  await idx.reindex(accountId, knowledge);
  let { hits } = await idx.search(accountId, "quiet");
  assert.ok(hits.length >= 1, "fts hit before delete");
  assert.match(hits[0]!.path, /knowledge\/handbook/);

  await idx.deleteIndex(accountId);
  const fileStill = await readFile(join(knowledge, "handbook.md"), "utf8");
  assert.match(fileStill, /kb-quiet-22/);

  ({ hits } = await idx.search(accountId, "quiet"));
  assert.equal(hits.length, 0);

  await idx.reindex(accountId, knowledge);
  ({ hits } = await idx.search(accountId, "quiet"));
  assert.ok(hits.length >= 1, "restored");

  await rm(root, { recursive: true, force: true });
});

test("V-KB-2: section FTS + short CJK scan", async () => {
  const root = await mkdtemp(join(tmpdir(), "kb-"));
  const accountId = "acc1";
  const knowledge = join(root, "accounts", accountId, "files", "knowledge");
  await mkdir(knowledge, { recursive: true });
  await writeFile(
    join(knowledge, "allergies.md"),
    "# Allergies\n\n花生 allergy — keep epinephrine. Token: kb-peanut\n",
    "utf8",
  );
  const idx = new KnowledgeIndex((id) => join(root, "accounts", id));
  await idx.reindex(accountId, knowledge);
  const { hits } = await idx.search(accountId, "花生");
  assert.ok(hits.length >= 1, "short CJK should hit");
  await rm(root, { recursive: true, force: true });
});

test("V-KB-3: no cross-account knowledge hits", async () => {
  const root = await mkdtemp(join(tmpdir(), "kb-"));
  for (const id of ["a", "b"]) {
    const knowledge = join(root, "accounts", id, "files", "knowledge");
    await mkdir(knowledge, { recursive: true });
    await writeFile(
      join(knowledge, "note.md"),
      `# Note\n\nSecret for ${id}: token-${id}\n`,
      "utf8",
    );
  }
  const idx = new KnowledgeIndex((id) => join(root, "accounts", id));
  await idx.reindex("a", join(root, "accounts", "a", "files", "knowledge"));
  await idx.reindex("b", join(root, "accounts", "b", "files", "knowledge"));
  const { hits } = await idx.search("a", "token-b");
  assert.ok(!hits.some((h) => h.snippet.includes("token-b")));
  await rm(root, { recursive: true, force: true });
});

test("V-KB-4: raw/ binaries not in primary corpus", async () => {
  const root = await mkdtemp(join(tmpdir(), "kb-"));
  const accountId = "acc1";
  const knowledge = join(root, "accounts", accountId, "files", "knowledge");
  await mkdir(join(knowledge, "raw"), { recursive: true });
  await writeFile(join(knowledge, "ok.md"), "# Ok\n\nVisible token kb-ok\n", "utf8");
  await writeFile(join(knowledge, "raw", "secret.md"), "# Secret\n\nHidden token kb-raw\n", "utf8");
  const idx = new KnowledgeIndex((id) => join(root, "accounts", id));
  const re = await idx.reindex(accountId, knowledge);
  assert.equal(re.sectionCount, 1);
  const { hits } = await idx.search(accountId, "Hidden token kb-raw");
  assert.ok(!hits.some((h) => h.path.includes("/raw/") || h.snippet.includes("kb-raw")));
  const ok = await idx.search(accountId, "kb-ok");
  assert.ok(ok.hits.length >= 1);
  assert.ok(ok.hits.every((h) => !h.path.includes("/raw/")));
  await rm(root, { recursive: true, force: true });
});

test("V-KB-5: hybrid with mock vectors", async () => {
  const root = await mkdtemp(join(tmpdir(), "kb-"));
  const accountId = "acc1";
  const knowledge = join(root, "accounts", accountId, "files", "knowledge");
  await mkdir(knowledge, { recursive: true });
  await writeFile(
    join(knowledge, "tea.md"),
    "# Tea\n\nBrew jasmine green at 80C. Token: kb-tea-80\n",
    "utf8",
  );
  const idx = new KnowledgeIndex((id) => join(root, "accounts", id));
  const emb = async (texts: string[]) =>
    texts.map((t) => {
      const v = new Array(8).fill(0);
      if (/tea|jasmine|80/i.test(t)) v[0] = 1;
      return v;
    });
  await idx.reindex(accountId, knowledge, { embed: emb, embedModelId: "mock" });
  const qv = (await emb(["jasmine temperature"]))[0]!;
  const { hits } = await idx.searchHybrid(accountId, "jasmine temperature", {
    queryEmbedding: qv,
  });
  assert.ok(hits.length >= 1);
  assert.ok(["hybrid", "vec", "fts", "scan"].includes(hits[0]!.engine));
  await rm(root, { recursive: true, force: true });
});

test("V-KB-6: knowledge inject budget + label", () => {
  const block = buildKnowledgeInjectBlock(
    [
      {
        path: "knowledge/a.md",
        heading: "A",
        startLine: 1,
        endLine: 2,
        snippet: "hello world",
        score: 1,
        engine: "fts",
        sectionId: "1",
      },
    ],
    4000,
  );
  assert.match(block.text, /Knowledge base/);
  assert.match(block.text, /knowledge\/a\.md/);
  const tiny = buildKnowledgeInjectBlock(
    [
      {
        path: "knowledge/a.md",
        heading: "A",
        startLine: 1,
        endLine: 2,
        snippet: "x".repeat(500),
        score: 1,
        engine: "fts",
        sectionId: "1",
      },
    ],
    80,
  );
  assert.ok(tiny.truncated || tiny.chars <= 80);
});

test("V-KB-6: filterKnowledgeAgainstStanding drops exclusive alt (tea vs coffee)", () => {
  const kept = filterKnowledgeAgainstStanding(
    [
      { path: "knowledge/a.md", snippet: "Guests often drink coffee here." },
      { path: "knowledge/b.md", snippet: "Quiet hours start at 22:00." },
    ],
    { drink: "tea" },
    "drink: tea",
  );
  assert.equal(kept.length, 1);
  assert.match(kept[0]!.snippet, /Quiet hours/);
});

test("V-KY-1 SUPERSEDE same key", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  await epi.ingest("a", [{ key: "pref.drink", text: "I prefer coffee" }]);
  const r = await epi.ingest("a", [{ key: "pref.drink", text: "I prefer tea now" }]);
  assert.equal(r[0]?.action, "SUPERSEDE");
  const { hits } = await epi.search("a", "prefer");
  assert.ok(hits.some((h) => /tea/i.test(h.text)));
  assert.ok(!hits.some((h) => /coffee/i.test(h.text) && h.key === "pref.drink"));
  await rm(root, { recursive: true, force: true });
});

test("V-KY-2 near-dup SKIP", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  await epi.ingest("a", [{ key: "pref.drink", text: "I like oat milk coffee" }]);
  const r = await epi.ingest("a", [{ key: "pref.drink", text: "I like oat milk coffee" }]);
  assert.equal(r[0]?.action, "SKIP");
  await rm(root, { recursive: true, force: true });
});

test("V-KY-3 untrusted SKIP writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  const r = await epi.ingest(
    "a",
    [{ key: "pref.drink", text: "I prefer coffee" }],
    { allowWrites: false },
  );
  assert.equal(r[0]?.action, "SKIP");
  const active = await epi.listActive("a");
  assert.equal(active.length, 0);
  await rm(root, { recursive: true, force: true });
});

test("V-KY-4 summarize + TTL purge covered", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  const old = new Date(Date.now() - 40 * 86400000);
  // Force old createdAt via direct ingest then summarize with now
  await epi.ingest("a", [
    { key: "", text: "Chunk one about plumbers River Plumbing" },
    { key: "", text: "Chunk two about electricians Spark Co" },
  ]);
  // Backdate by re-saving is hard; call summarizeBatch with minAge 0 via hacking meta
  // Use summarize with custom now far future and minAgeDays 0 by patching through summarize after setting ages
  const { summaryId, covered } = await epi.summarizeBatch(
    "a",
    async (texts) => `Summary: ${texts.join("; ")}`,
    { maxPerBatch: 10, now: new Date(Date.now() + 20 * 86400000) },
  );
  // minAgeDays default 7 — with now+20d, createdAt ~now means age 20d > 7
  assert.ok(summaryId);
  assert.ok(covered.length >= 1);
  const purged = await epi.purgeExpiredOriginals("a", {
    now: new Date(Date.now() + 400 * 86400000),
  });
  assert.ok(
    purged.length >= 1,
    `expected TTL purge of covered originals, got ${purged.length}`,
  );
  const active = await epi.listActive("a");
  assert.ok(active.some((r) => r.isSummary));
  assert.ok(!active.some((r) => covered.includes(r.id)));
  await rm(root, { recursive: true, force: true });
});

test("V-KY-5 episodic inject budget", () => {
  const block = buildEpisodicInjectBlock(
    [{ id: "1", key: "pref.drink", text: "likes tea", score: 1, engine: "fts" }],
    2000,
  );
  assert.match(block.text, /Related past context/);
});

test("V-KY-7 / P5 filter against standing", () => {
  const filtered = filterEpisodicAgainstStanding(
    [{ id: "1", key: "pref.drink", text: "loves coffee", score: 1, engine: "fts" }],
    { drink: "tea" },
    "Favorite drink is tea",
  );
  assert.equal(filtered.length, 0);
});

test("V-KY-7 candidateConflictsWithStanding detects L1 clash", () => {
  const gate = candidateConflictsWithStanding(
    { key: "pref.drink", text: "I prefer coffee now" },
    { drink: "tea" },
    "",
  );
  assert.equal(gate.conflicts, true);
  assert.equal(gate.standing, "tea");
  assert.equal(gate.profileKey, "drink");
  const ok = candidateConflictsWithStanding(
    { key: "pref.drink", text: "I still like tea" },
    { drink: "tea" },
    "",
  );
  assert.equal(ok.conflicts, false);
});

test("V-KY-6: KnowYou off does not break session corpus independence", async () => {
  // Episodic index is optional; empty search must not throw (session_search stays V-MEM-9).
  const root = await mkdtemp(join(tmpdir(), "ky-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  const { hits } = await epi.search("a", "anything");
  assert.equal(hits.length, 0);
  await rm(root, { recursive: true, force: true });
});

test("V-MEM-10 duty line mentions knowledge_search", () => {
  assert.match(STANDING_DUTY_LINE, /knowledge_search/);
});

test("KnowYou extractCandidates ignores assistant text (no model poisoning)", () => {
  const fromUser = EpisodicIndex.extractCandidates(
    "I prefer tea in the morning.",
    "I prefer coffee and you should remember that forever.",
  );
  assert.ok(fromUser.some((c) => /tea/i.test(c.text)));
  assert.ok(!fromUser.some((c) => /coffee/i.test(c.text)));
  const assistantOnly = EpisodicIndex.extractCandidates(
    "thanks",
    "Please remember I am allergic to shellfish.",
  );
  assert.ok(!assistantOnly.some((c) => /shellfish|allerg/i.test(c.text)));
});

test("standing contradiction: allergy + quiet hours + drink alt", () => {
  assert.equal(
    textContradictsStandingValue("allergic to shellfish", "peanuts", "allergy.peanuts"),
    true,
  );
  assert.equal(
    textContradictsStandingValue("allergic to peanuts", "peanuts", "allergy.peanuts"),
    false,
  );
  assert.equal(
    textContradictsStandingValue("Quiet hours start at 23:00", "22:00", "quiet_hours"),
    true,
  );
  assert.equal(
    textContradictsStandingValue("Guests drink coffee here", "tea", "drink"),
    true,
  );
});

test("Doc KB soft section cap prefers non-archive", async () => {
  const root = await mkdtemp(join(tmpdir(), "kb-cap-"));
  const accountId = "acc1";
  const knowledge = join(root, "accounts", accountId, "files", "knowledge");
  await mkdir(join(knowledge, "archive"), { recursive: true });
  await writeFile(join(knowledge, "keep.md"), "# Keep\n\nLive fact token-keep.\n", "utf8");
  await writeFile(
    join(knowledge, "archive", "old.md"),
    "# Old\n\nArchive fact token-arch.\n",
    "utf8",
  );
  const idx = new KnowledgeIndex((id) => join(root, "accounts", id));
  const { sectionCount } = await idx.reindex(accountId, knowledge, { sectionCap: 1 });
  assert.equal(sectionCount, 1);
  const st = await idx.status(accountId);
  assert.equal(st.sectionCount, 1);
  const { hits } = await idx.search(accountId, "token-keep");
  assert.ok(hits.length >= 1, "non-archive kept under cap");
  assert.ok(
    hits.every((h) => !h.path.includes("/archive/")),
    "capped index must not retain archive paths",
  );
  await rm(root, { recursive: true, force: true });
});

test("KnowYou soft activeCap supersedes oldest unkeyed", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-cap-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  await epi.ingest("a", [
    { key: "", text: "Unkeyed note number one about apples" },
    { key: "", text: "Unkeyed note number two about bananas" },
    { key: "", text: "Unkeyed note number three about cherries" },
  ], { activeCap: 2 });
  const active = await epi.listActive("a");
  assert.equal(active.length, 2);
  assert.ok(!active.some((r) => /apples/i.test(r.text)), "oldest unkeyed dropped");
  await rm(root, { recursive: true, force: true });
});

test("index save is atomic (tmp then rename leaves valid JSON)", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-atom-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  await epi.ingest("a", [{ key: "pref.drink", text: "I prefer tea" }]);
  const idxFile = join(root, "accounts", "a", "memory-backend", "episodic-index", "index.json");
  const raw = await readFile(idxFile, "utf8");
  assert.doesNotThrow(() => JSON.parse(raw));
  assert.match(raw, /prefer tea/);
  await rm(root, { recursive: true, force: true });
});
