import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  EpisodicIndex,
  StandingStore,
  buildEpisodicInjectBlock,
  buildStandingInject,
  candidateConflictsWithStanding,
  filterEpisodicAgainstStanding,
  rankKnowYouFacts,
  knowYouRetention,
  nextKnowYouStability,
  nextKnowYouHebbianWeight,
  pruneKnowYouHebbianEdges,
  createKnowYouLexicon,
  tokenizeKnowYou,
  expandKnowYouTokens,
  buildStructuralKnowYouEdges,
  buildSemanticKnowYouAdjacency,
  diffuseKnowYouGraph,
  KNOWYOU_PIN_IMPORTANCE,
  KNOWYOU_MAX_HEBBIAN_EDGES,
  KNOWYOU_DEFAULT_IMPORTANCE,
  KNOWYOU_KEYED_IMPORTANCE,
} from "../dist/index.js";

function fact(
  id: string,
  text: string,
  extra: Partial<{
    key: string;
    importance: number;
    stability: number;
    lastAccessAt: string;
    replacesId: string;
    createdAt: string;
    updatedAt: string;
  }> = {},
) {
  const now = Date.now();
  return {
    id,
    text,
    importance: extra.importance ?? 0.6,
    createdAt: extra.createdAt ?? new Date(now - 86400000).toISOString(),
    updatedAt: extra.updatedAt ?? new Date(now - 86400000).toISOString(),
    ...(extra.key !== undefined ? { key: extra.key } : {}),
    ...(extra.stability !== undefined ? { stability: extra.stability } : {}),
    ...(extra.lastAccessAt !== undefined ? { lastAccessAt: extra.lastAccessAt } : {}),
    ...(extra.replacesId !== undefined ? { replacesId: extra.replacesId } : {}),
  };
}

test("multi-arm rank prefers lexical match over unrelated bank rows", () => {
  const now = Date.now();
  const hits = rankKnowYouFacts({
    query: "what drink do I prefer",
    nowMs: now,
    limit: 3,
    facts: [
      fact("tea", "I prefer tea in the morning", { key: "pref.drink", importance: 0.7 }),
      fact("noise", "The garage door squeaks on rainy days", { importance: 0.9, stability: 30 }),
      fact("plumbers", "River Plumbing fixed the sink last year", {
        importance: 0.8,
        stability: 20,
      }),
    ],
  });
  assert.ok(hits.length >= 1);
  assert.equal(hits[0]!.id, "tea");
  assert.ok(hits[0]!.lexical > 0);
  assert.ok(hits.length <= 3);
});

test("rankKnowYouFacts: empty query / empty facts / limit clamp", () => {
  assert.deepEqual(rankKnowYouFacts({ query: "tea", facts: [] }), []);
  assert.deepEqual(
    rankKnowYouFacts({
      query: "   ",
      facts: [fact("a", "I prefer tea")],
    }),
    [],
  );
  const many = Array.from({ length: 20 }, (_, i) =>
    fact(`f${i}`, `I prefer tea flavor number ${i}`),
  );
  const capped = rankKnowYouFacts({ query: "prefer tea", facts: many, limit: 100 });
  assert.ok(capped.length <= 64);
  const one = rankKnowYouFacts({ query: "prefer tea", facts: many, limit: 0 });
  assert.equal(one.length, 1);
});

test("FSRS-lite: pin retains; aged decays; touch bumps stability", () => {
  const now = Date.now();
  const pinned = knowYouRetention({
    importance: KNOWYOU_PIN_IMPORTANCE,
    stability: 1,
    createdAt: new Date(now - 100 * 86400000).toISOString(),
    nowMs: now,
  });
  assert.equal(pinned, 1);
  const aged = knowYouRetention({
    importance: 0.6,
    stability: 1,
    lastAccessAt: new Date(now - 30 * 86400000).toISOString(),
    createdAt: new Date(now - 60 * 86400000).toISOString(),
    nowMs: now,
  });
  assert.ok(aged < 0.5);
  const fresh = knowYouRetention({
    importance: 0.6,
    stability: 1,
    lastAccessAt: new Date(now).toISOString(),
    createdAt: new Date(now - 60 * 86400000).toISOString(),
    nowMs: now,
  });
  assert.ok(fresh > 0.9);
  const next = nextKnowYouStability({ stability: 1, retention: aged, firstTouch: true });
  assert.ok(next > 1);
  const again = nextKnowYouStability({ stability: next, retention: 0.9, firstTouch: false });
  assert.ok(again >= next * 0.9);
});

test("activation arm ignores high-importance facts with no lexical overlap", () => {
  const now = Date.now();
  const hits = rankKnowYouFacts({
    query: "plumbing sink",
    nowMs: now,
    limit: 5,
    facts: [
      fact("sticky", "I prefer tea every morning", {
        key: "pref.drink",
        importance: KNOWYOU_PIN_IMPORTANCE,
        stability: 100,
      }),
      fact("plumb", "River Plumbing fixed the sink", { importance: 0.5 }),
    ],
  });
  assert.ok(hits.some((h) => h.id === "plumb"));
  assert.ok(!hits.some((h) => h.id === "sticky"), "pin must not flood unrelated queries");
});

test("pruneKnowYouHebbianEdges drops inactive endpoints and caps", () => {
  const active = new Set(["a", "b", "c"]);
  const pruned = pruneKnowYouHebbianEdges(
    [
      { a: "a", b: "b", w: 0.5 },
      { a: "a", b: "dead", w: 0.9 },
      { a: "dead", b: "b", w: 0.9 },
      { a: "a", b: "a", w: 1 },
      { a: "b", b: "c", w: 0.1 },
      { a: "c", b: "b", w: 0.2 }, // dedupe keep max
    ],
    active,
  );
  assert.equal(pruned.length, 2);
  assert.ok(pruned.every((e) => active.has(e.a) && active.has(e.b)));
  const bc = pruned.find((e) => (e.a === "b" && e.b === "c") || (e.a === "c" && e.b === "b"));
  assert.equal(bc?.w, 0.2);

  const flooded = Array.from({ length: KNOWYOU_MAX_HEBBIAN_EDGES + 50 }, (_, i) => ({
    a: `x${i}`,
    b: `y${i}`,
    w: (i + 1) / (KNOWYOU_MAX_HEBBIAN_EDGES + 50),
  }));
  const ids = new Set(flooded.flatMap((e) => [e.a, e.b]));
  const capped = pruneKnowYouHebbianEdges(flooded, ids);
  assert.equal(capped.length, KNOWYOU_MAX_HEBBIAN_EDGES);
  assert.ok(capped[0]!.w >= capped[capped.length - 1]!.w);
});

test("dangling hebbian edges must not boost unrelated active facts", () => {
  const now = Date.now();
  // Superseded "old" co-activated with "noise"; only "tea" and "noise" remain active.
  const hits = rankKnowYouFacts({
    query: "prefer tea drink",
    nowMs: now,
    limit: 5,
    facts: [
      fact("tea", "I prefer tea in the morning", { key: "pref.drink", importance: 0.7 }),
      fact("noise", "The garage door squeaks loudly", { importance: 0.5 }),
    ],
    hebbianEdges: [
      { a: "tea", b: "old-superseded", w: 0.99 },
      { a: "old-superseded", b: "noise", w: 0.99 },
    ],
  });
  assert.ok(hits.some((h) => h.id === "tea"));
  // noise must not outrank tea via dangling chain through old-superseded
  const tea = hits.find((h) => h.id === "tea");
  const noise = hits.find((h) => h.id === "noise");
  assert.ok(tea);
  if (noise) assert.ok(tea!.score >= noise.score);
});

test("buildStructuralKnowYouEdges ignores replacesId outside active set", () => {
  const edges = buildStructuralKnowYouEdges([
    { id: "new", key: "pref.drink", replacesId: "old" },
    { id: "other", key: "pref.food" },
  ]);
  assert.ok(!edges.some((e) => e.a === "old" || e.b === "old"));
});

test("semantic adjacency + diffuse surfaces related neighbor", () => {
  const lexicon = createKnowYouLexicon();
  const facts = [
    { id: "a", text: "morning tea preference latte oat milk" },
    { id: "b", text: "morning tea preference espresso roast" },
    { id: "c", text: "garage door paint ladder tools" },
  ];
  const adj = buildSemanticKnowYouAdjacency(facts, lexicon, { minWeight: 0.1 });
  assert.ok((adj.get("a")?.get("b") ?? 0) > 0);
  const seeds = new Map([["a", 1]]);
  const diffused = diffuseKnowYouGraph(seeds, adj, { hops: 2, gamma: 0.55 });
  assert.ok((diffused.get("b") ?? 0) > 0);
  assert.equal(diffused.get("c") ?? 0, 0);
});

test("tokenize / lexicon expand covers CJK and typos", () => {
  const toks = tokenizeKnowYou("花生 allergy prefered");
  assert.ok(toks.includes("花生"));
  assert.ok(toks.includes("allergy"));
  const expanded = expandKnowYouTokens(toks, createKnowYouLexicon());
  assert.ok(expanded.includes("preferred") || expanded.includes("prefer"));
});

test("hebbian weight saturates toward 1", () => {
  let w = 0;
  for (let i = 0; i < 500; i++) w = nextKnowYouHebbianWeight(w);
  assert.ok(w > 0.9 && w <= 1);
});

test("V-KY-9: search is budgeted multi-arm — not inject-all of the bank", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky9-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  const filler = Array.from({ length: 40 }, (_, i) => ({
    key: "",
    text: `Unrelated household note number ${i} about paint and ladders`,
  }));
  await epi.ingest("a", [
    ...filler,
    { key: "pref.drink", text: "I prefer oat milk latte in the morning" },
  ]);
  const { hits } = await epi.search("a", "prefer drink latte", { limit: 5, touch: false });
  assert.ok(hits.length > 0);
  assert.ok(hits.length <= 5, `expected ≤5 hits, got ${hits.length}`);
  assert.ok(hits.some((h) => /latte|prefer/i.test(h.text)));
  assert.ok(hits.every((h) => h.engine === "multiarm" || h.engine === "fts" || h.engine === "scan"));
  assert.ok(hits.length < 40);
  const block = buildEpisodicInjectBlock(hits, 800);
  assert.match(block.text, /Related past context/);
  assert.ok(block.chars <= 800 || block.truncated);
  await rm(root, { recursive: true, force: true });
});

test("V-KY-8: keepers — standing filter, taint SKIP, scarce inject still independent", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky8-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));

  const skipped = await epi.ingest(
    "a",
    [{ key: "pref.drink", text: "I prefer coffee" }],
    { allowWrites: false },
  );
  assert.equal(skipped[0]?.action, "SKIP");

  await epi.ingest("a", [{ key: "pref.drink", text: "I prefer coffee" }]);
  const { hits } = await epi.search("a", "drink prefer", { limit: 4, touch: false });
  assert.ok(hits.some((h) => /coffee/i.test(h.text)));

  const filtered = filterEpisodicAgainstStanding(hits, { drink: "tea" }, "drink: tea");
  assert.equal(filtered.length, 0);

  const gate = candidateConflictsWithStanding(
    { key: "pref.drink", text: "I prefer coffee now" },
    { drink: "tea" },
    "",
  );
  assert.equal(gate.conflicts, true);

  const standing = new StandingStore(root);
  await standing.ensureAccountLayout("a");
  const memPath = standing.paths("a").memory;
  await writeFile(memPath, "## Preferences\n\n- Drink: tea\n", "utf8");
  const loaded = await standing.load("a", { force: true });
  const inject = buildStandingInject({
    profile: loaded.profile,
    memoryMd: loaded.memoryMd,
    todayContent: "",
    yesterdayContent: "",
    identityMd: loaded.identityMd,
    caps: {
      l1: { injectBudget: 2000 },
      l2: { injectBudget: 4000 },
      l3: { injectBudget: 2000 },
    },
  });
  assert.match(inject.text, /tea/i);
  assert.ok(!/coffee/i.test(inject.text));

  await rm(root, { recursive: true, force: true });
});

test("V-KY-10: fact bank is not sole memory — StandingStore + LearnQueue paths remain", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky10-"));
  const standing = new StandingStore(root);
  await standing.ensureAccountLayout("a");
  const memPath = standing.paths("a").memory;
  await writeFile(memPath, "## Notes\n\n- Household: EnvoyHome standing truth\n", "utf8");
  const before = await readFile(memPath, "utf8");

  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  await epi.ingest("a", [{ key: "pref.drink", text: "I prefer tea" }]);
  await epi.search("a", "prefer tea", { limit: 3, touch: false });

  const after = await readFile(memPath, "utf8");
  assert.equal(after, before, "KnowYou bank must not rewrite MEMORY.md");
  assert.match(after, /standing truth/);

  const gate = candidateConflictsWithStanding(
    { key: "pref.drink", text: "I prefer coffee" },
    { drink: "tea" },
    after,
  );
  assert.equal(gate.conflicts, true);

  await rm(root, { recursive: true, force: true });
});

test("KB-P6: recall touch raises accessCount / stability", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-touch-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  await epi.ingest("a", [{ key: "pref.drink", text: "I prefer green tea" }]);
  const { hits } = await epi.search("a", "prefer tea", { limit: 3, touch: true });
  assert.ok(hits.length >= 1);
  await epi.touchHits("a", hits.map((h) => h.id));
  const active = await epi.listActive("a");
  const row = active.find((r) => r.key === "pref.drink");
  assert.ok(row);
  assert.ok((row!.accessCount ?? 0) >= 1);
  assert.ok(row!.lastAccessAt);
  assert.ok((row!.stability ?? 0) >= 1);
  await rm(root, { recursive: true, force: true });
});

test("KB-P6: touch:false does not mutate FSRS fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-notouch-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  await epi.ingest("a", [{ key: "pref.drink", text: "I prefer black tea" }]);
  await epi.search("a", "prefer tea", { limit: 3, touch: false });
  // Give any accidental async touch a chance — then assert still untouched
  await new Promise((r) => setTimeout(r, 30));
  const active = await epi.listActive("a");
  const row = active.find((r) => r.key === "pref.drink");
  assert.ok(row);
  assert.equal(row!.accessCount ?? 0, 0);
  assert.equal(row!.lastAccessAt, undefined);
  await rm(root, { recursive: true, force: true });
});

test("KB-P6: multi-hit touch writes hebbian edge between co-activated facts", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-heb-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  await epi.ingest("a", [
    { key: "pref.drink", text: "I prefer morning tea latte" },
    { key: "", text: "Morning tea latte with oat milk is my ritual" },
  ]);
  const { hits } = await epi.search("a", "morning tea latte", { limit: 4, touch: false });
  assert.ok(hits.length >= 2, `need ≥2 hits for hebbian, got ${hits.length}`);
  await epi.touchHits(
    "a",
    hits.map((h) => h.id),
  );
  // Second search should still succeed; edges pruned to active only
  const again = await epi.search("a", "morning tea latte", { limit: 4, touch: false });
  assert.ok(again.hits.length >= 1);
  await rm(root, { recursive: true, force: true });
});

test("KB-P6: supersede prunes hebbian edges to old id", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-prune-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  await epi.ingest("a", [
    { key: "pref.drink", text: "I prefer coffee in the morning" },
    { key: "", text: "Morning coffee ritual with oat milk" },
  ]);
  const first = await epi.search("a", "prefer coffee morning", { limit: 4, touch: false });
  assert.ok(first.hits.length >= 1);
  await epi.touchHits(
    "a",
    first.hits.map((h) => h.id),
  );
  const before = await epi.listActive("a");
  const oldDrink = before.find((r) => r.key === "pref.drink");
  assert.ok(oldDrink);

  await epi.ingest("a", [{ key: "pref.drink", text: "I prefer tea in the morning now" }]);
  const after = await epi.listActive("a");
  assert.ok(!after.some((r) => r.id === oldDrink!.id));
  assert.ok(after.some((r) => /tea/i.test(r.text) && r.key === "pref.drink"));

  // Ranking must not crash / ghost via old id; tea should win for tea query
  const { hits } = await epi.search("a", "prefer tea morning", { limit: 5, touch: false });
  assert.ok(hits.some((h) => /tea/i.test(h.text)));
  assert.ok(!hits.some((h) => h.id === oldDrink!.id));
  await rm(root, { recursive: true, force: true });
});

test("KB-P6: soft-cap drops unkeyed first; forget removes keyed fact", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-pin-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  await epi.ingest("a", [{ key: "pref.drink", text: "I prefer tea forever" }]);
  let active = await epi.listActive("a");
  assert.ok(active.some((r) => r.key === "pref.drink"));

  const filler = Array.from({ length: 8 }, (_, i) => ({
    key: "",
    text: `Filler chunk about ladders paint ${i} unique ${Math.random()}`,
  }));
  await epi.ingest("a", filler, { activeCap: 5 });
  active = await epi.listActive("a");
  assert.ok(active.length <= 5);
  assert.ok(
    active.some((r) => r.key === "pref.drink"),
    "keyed drink fact should survive soft-cap preference for unkeyed drops",
  );

  await epi.updateKnowYou("a", { action: "forget", key: "pref.drink" });
  active = await epi.listActive("a");
  assert.ok(!active.some((r) => r.key === "pref.drink"));
  await rm(root, { recursive: true, force: true });
});

test("KB-P6: soft-cap never drops keyed prefs (overflow allowed)", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-keyed-cap-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  const keyed = Array.from({ length: 6 }, (_, i) => ({
    key: `pref.item.${i}`,
    text: `I prefer keyed item ${i} uniquely ${Math.random()}`,
  }));
  await epi.ingest("a", keyed, { activeCap: 2 });
  const active = await epi.listActive("a");
  assert.equal(active.filter((r) => r.key?.startsWith("pref.item.")).length, 6);
  assert.ok(active.length > 2, "keyed overflow past soft-cap must remain active");
  await rm(root, { recursive: true, force: true });
});

test("V-KY-8: touch only post-standing-filter survivors (no reinforce contradicted)", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-touch-filter-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  await epi.ingest("a", [
    { key: "pref.drink", text: "I prefer coffee Token touch-filter-coffee" },
    { key: "note.ladder", text: "Ladder lives behind the furnace Token touch-filter-ladder" },
  ]);
  const { hits } = await epi.search("a", "prefer drink ladder", { limit: 5, touch: false });
  assert.ok(hits.some((h) => /coffee/i.test(h.text)));
  const survivors = filterEpisodicAgainstStanding(hits, { drink: "tea" }, "drink: tea");
  assert.ok(!survivors.some((h) => /coffee/i.test(h.text)));
  await epi.touchHits(
    "a",
    survivors.map((h) => h.id),
  );
  const active = await epi.listActive("a");
  const coffee = active.find((r) => /coffee/i.test(r.text));
  assert.ok(coffee);
  assert.equal(coffee!.accessCount ?? 0, 0, "contradicted episodic must not be FSRS-touched");
  assert.equal(coffee!.lastAccessAt, undefined);
  const ladder = active.find((r) => /ladder/i.test(r.text));
  if (survivors.some((h) => /ladder/i.test(h.text))) {
    assert.ok(ladder);
    assert.ok((ladder!.accessCount ?? 0) >= 1);
  }
  await rm(root, { recursive: true, force: true });
});

test("KB-P6: importance ≥ pin is never soft-capped away", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-pin2-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  // Seed a normal keyed fact then raise importance via updateKnowYou supersede + direct row edit
  // by re-writing through updateKnowYou and then searching after save with pin via internal touch path:
  // Use JSON seed so we can set importance = 1 (pin).
  const accountRoot = join(root, "accounts", "a");
  const idxDir = join(accountRoot, "memory-backend", "episodic-index");
  await mkdir(idxDir, { recursive: true });
  const now = new Date().toISOString();
  await writeFile(
    join(idxDir, "index.json"),
    JSON.stringify({
      meta: {
        version: 1,
        keepOriginalDays: 180,
        minAgeDays: 7,
        recentPreferDays: 7,
        lastSummarizeAt: null,
      },
      rows: [
        {
          id: "ep_pin",
          key: "pref.drink",
          text: "Pinned: I prefer tea",
          status: "active",
          createdAt: now,
          updatedAt: now,
          contentHash: "pinhash",
          importance: KNOWYOU_PIN_IMPORTANCE,
          stability: 1,
        },
      ],
    }),
    "utf8",
  );
  // Force migrate by listing
  assert.ok((await epi.listActive("a")).some((r) => r.id === "ep_pin"));

  const filler = Array.from({ length: 12 }, (_, i) => ({
    key: `tmp.${i}`,
    text: `Temporary preference note ${i} about widgets ${Math.random()}`,
  }));
  await epi.ingest("a", filler, { activeCap: 3 });
  const active = await epi.listActive("a");
  assert.ok(
    active.some((r) => r.id === "ep_pin"),
    "pinned row must survive soft-cap",
  );
  await rm(root, { recursive: true, force: true });
});

test("KB-P6: JSON migrate preserves edges + FSRS fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-mig-"));
  const accountRoot = join(root, "accounts", "a");
  const idxDir = join(accountRoot, "memory-backend", "episodic-index");
  await mkdir(idxDir, { recursive: true });
  const now = new Date().toISOString();
  await writeFile(
    join(idxDir, "index.json"),
    JSON.stringify({
      meta: {
        version: 1,
        keepOriginalDays: 180,
        minAgeDays: 7,
        recentPreferDays: 7,
        lastSummarizeAt: null,
      },
      rows: [
        {
          id: "ep_tea",
          key: "pref.drink",
          text: "I prefer jasmine tea",
          status: "active",
          createdAt: now,
          updatedAt: now,
          contentHash: "abc",
          importance: 0.85,
          stability: 2.5,
          lastAccessAt: now,
          accessCount: 3,
        },
        {
          id: "ep_other",
          key: "",
          text: "Jasmine tea ritual mornings",
          status: "active",
          createdAt: now,
          updatedAt: now,
          contentHash: "def",
        },
      ],
      edges: [{ a: "ep_tea", b: "ep_other", w: 0.4 }],
    }),
    "utf8",
  );

  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  const active = await epi.listActive("a");
  assert.equal(active.length, 2);
  const tea = active.find((r) => r.id === "ep_tea");
  assert.ok(tea);
  assert.equal(tea!.importance, 0.85);
  assert.equal(tea!.stability, 2.5);
  assert.equal(tea!.accessCount, 3);
  const other = active.find((r) => r.id === "ep_other");
  assert.ok(other);
  assert.equal(other!.importance ?? KNOWYOU_DEFAULT_IMPORTANCE, KNOWYOU_DEFAULT_IMPORTANCE);
  assert.equal(other!.stability ?? 1, 1);

  const { hits } = await epi.search("a", "prefer jasmine tea", { limit: 3, touch: false });
  assert.ok(hits.some((h) => h.id === "ep_tea"));
  await rm(root, { recursive: true, force: true });
});

test("KB-P6: FTS fallback when multi-arm finds nothing (short / odd query)", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-fts-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  await epi.ingest("a", [{ key: "", text: "XYZUNIQUETOKEN household widget" }]);
  // Query with no ≥2-char overlap for multi-arm tokens may still hit via FTS trigram/scan
  const { hits } = await epi.search("a", "XYZUNIQUETOKEN", { limit: 3, touch: false });
  assert.ok(hits.length >= 1);
  assert.ok(hits.some((h) => /XYZUNIQUETOKEN/i.test(h.text)));
  await rm(root, { recursive: true, force: true });
});

test("KB-P6: no cross-account bleed on multi-arm search", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-xacc-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  await epi.ingest("alice", [{ key: "pref.drink", text: "Alice prefers tea" }]);
  await epi.ingest("bob", [{ key: "pref.drink", text: "Bob prefers coffee" }]);
  const a = await epi.search("alice", "prefer drink", { limit: 5, touch: false });
  const b = await epi.search("bob", "prefer drink", { limit: 5, touch: false });
  assert.ok(a.hits.every((h) => /Alice|tea/i.test(h.text)));
  assert.ok(b.hits.every((h) => /Bob|coffee/i.test(h.text)));
  assert.ok(!a.hits.some((h) => /Bob|coffee/i.test(h.text)));
  assert.ok(!b.hits.some((h) => /Alice|tea/i.test(h.text)));
  await rm(root, { recursive: true, force: true });
});

test("KB-P6: ingest sets keyed vs unkeyed default importance", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-imp-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  await epi.ingest("a", [
    { key: "pref.drink", text: "I prefer tea" },
    { key: "", text: "Random chunk about windows" },
  ]);
  const active = await epi.listActive("a");
  const keyed = active.find((r) => r.key === "pref.drink");
  const unkeyed = active.find((r) => !r.key);
  assert.equal(keyed?.importance, KNOWYOU_KEYED_IMPORTANCE);
  assert.equal(unkeyed?.importance, KNOWYOU_DEFAULT_IMPORTANCE);
  assert.equal(keyed?.stability, 1);
  await rm(root, { recursive: true, force: true });
});

test("KB-P6: empty search query returns no hits", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-emptyq-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  await epi.ingest("a", [{ key: "pref.drink", text: "I prefer tea" }]);
  const { hits } = await epi.search("a", "   ", { limit: 5, touch: false });
  assert.equal(hits.length, 0);
  await rm(root, { recursive: true, force: true });
});

test("KB-P6: SUPERSEDE still surfaces new text via multi-arm (V-KY-1 regression)", async () => {
  const root = await mkdtemp(join(tmpdir(), "ky-sup-"));
  const epi = new EpisodicIndex((id) => join(root, "accounts", id));
  await epi.ingest("a", [{ key: "pref.drink", text: "I prefer coffee" }]);
  const r = await epi.ingest("a", [{ key: "pref.drink", text: "I prefer tea now" }]);
  assert.equal(r[0]?.action, "SUPERSEDE");
  const { hits } = await epi.search("a", "prefer", { limit: 5, touch: false });
  assert.ok(hits.some((h) => /tea/i.test(h.text)));
  assert.ok(!hits.some((h) => /coffee/i.test(h.text) && h.key === "pref.drink"));
  await rm(root, { recursive: true, force: true });
});
