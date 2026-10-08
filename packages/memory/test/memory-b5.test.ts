// B5 acceptance: V-MEM-1,3,4,5,7,10,11,13,17,18.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  INJECT_BUDGET,
  MemoryFacade,
  STANDING_DUTY_LINE,
  __resetMemoryForTests,
  buildL2Inject,
  omitMarker,
} from "../dist/index.js";

const temps: string[] = [];

afterEach(async () => {
  __resetMemoryForTests();
  for (const d of temps.splice(0)) {
    await rm(d, { recursive: true, force: true });
  }
});

async function tmpState(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "envoyhome-mem-"));
  temps.push(dir);
  return dir;
}

async function facadeWithAccount(
  accountId = "alice",
): Promise<{ facade: MemoryFacade; stateDir: string; accountId: string }> {
  const stateDir = await tmpState();
  const root = join(stateDir, "accounts", accountId);
  await mkdir(join(root, "memory", "compact"), { recursive: true });
  await writeFile(
    join(root, "profile.json"),
    JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), facts: {} }, null, 2) +
      "\n",
  );
  await writeFile(join(root, "MEMORY.md"), "# MEMORY\n\n## Standing\n\n", "utf8");
  const facade = new MemoryFacade({ stateDir });
  return { facade, stateDir, accountId };
}

test("V-MEM-1: no cross-account recall / forget", async () => {
  const stateDir = await tmpState();
  for (const id of ["alice", "bob"]) {
    const root = join(stateDir, "accounts", id);
    await mkdir(join(root, "memory"), { recursive: true });
    await writeFile(
      join(root, "profile.json"),
      JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), facts: {} }) + "\n",
    );
    await writeFile(
      join(root, "MEMORY.md"),
      `# MEMORY\n\n## Standing\n\n- secret for ${id} only\n`,
      "utf8",
    );
  }
  const facade = new MemoryFacade({ stateDir });

  const aliceHits = await facade.recall("alice", { query: "secret" });
  assert.equal(aliceHits.hits.length, 1);
  assert.ok(aliceHits.hits[0]!.snippet.includes("alice"));
  assert.ok(!aliceHits.hits[0]!.snippet.includes("bob"));

  const bobHits = await facade.recall("bob", { query: "secret" });
  assert.equal(bobHits.hits.length, 1);
  assert.ok(bobHits.hits[0]!.snippet.includes("bob"));

  // Path jail: alice cannot point paths at bob's tree.
  const escaped = await facade.recall("alice", {
    query: "secret",
    paths: ["../bob/MEMORY.md", "accounts/bob/MEMORY.md"],
  });
  assert.equal(escaped.hits.length, 0);

  await facade.forget("alice", { target: "note", query: "secret" });
  const bobAfter = await readFile(join(stateDir, "accounts", "bob", "MEMORY.md"), "utf8");
  assert.ok(bobAfter.includes("bob"));
});

test("V-MEM-3: supersede-by-key profile; L1 > L2 authority in inject order", async () => {
  const { facade, accountId } = await facadeWithAccount();
  await facade.updateProfile(accountId, { set: { name: "Alice" } });
  await facade.updateProfile(accountId, { set: { name: "Alicia" } });
  const { profile } = await facade.getProfile(accountId);
  assert.equal(profile.facts["name"]?.value, "Alicia");
  assert.equal(Object.keys(profile.facts).filter((k) => k === "name").length, 1);

  await facade.remember(accountId, { text: "team decided on blue lights", target: "l2" });
  const inject = await facade.buildStandingInject(accountId);
  const profileAt = inject.text.indexOf("## Profile");
  const memoryAt = inject.text.indexOf("## MEMORY");
  const dailyAt = inject.text.indexOf("## Daily");
  assert.ok(profileAt >= 0 && memoryAt > profileAt && dailyAt > memoryAt);
  assert.ok(inject.text.includes("Alicia"));
});

test("V-MEM-4 + V-MEM-18: inject budgets enforced; listMemory echoes caps contract", async () => {
  const { facade, accountId } = await facadeWithAccount();

  // Oversized profile facts → truncated inject, budget echoed.
  const big = "x".repeat(500);
  for (let i = 0; i < 20; i++) {
    await facade.updateProfile(accountId, { set: { [`fact_${i}`]: big } });
  }
  const inject = await facade.buildStandingInject(accountId);
  assert.ok(inject.profile.injectChars <= INJECT_BUDGET.l1);
  assert.equal(inject.profile.injectBudget, 2000);
  assert.equal(inject.profile.rawSoftCap, 20_000);
  assert.equal(inject.profile.truncated, true);

  // Oversized L2 with multiple sections → section-aware omit markers.
  const sections = ["## Standing", "## Narrative", "## Archive"];
  let md = "# MEMORY\n\n";
  for (const h of sections) {
    md += `${h}\n\n`;
    for (let i = 0; i < 40; i++) {
      md += `- bullet ${h} ${i} ${"y".repeat(80)}\n`;
    }
    md += "\n";
  }
  await writeFile(
    join(facade.stateDir, "accounts", accountId, "MEMORY.md"),
    md,
    "utf8",
  );
  facade.store.invalidate(accountId);
  const inject2 = await facade.buildStandingInject(accountId);
  assert.ok(inject2.memory.injectChars <= INJECT_BUDGET.l2);
  assert.equal(inject2.memory.injectBudget, 4000);
  assert.equal(inject2.memory.truncated, true);
  assert.ok(
    inject2.text.includes("entries omitted") || inject2.memory.sectionsOmitted.length > 0,
  );

  const listed = await facade.listMemory(accountId);
  assert.equal(listed.profileSummary.injectBudget, 2000);
  assert.equal(listed.profileSummary.rawSoftCap, 20_000);
  assert.equal(listed.profileSummary.truncated, true);
  const memNote = listed.notes.find((n) => n.path === "MEMORY.md");
  assert.ok(memNote);
  assert.equal(memNote!.injectBudget, 4000);
  assert.equal(memNote!.rawSoftCap, 40_000);
  assert.equal(memNote!.truncated, true);
  assert.ok(Array.isArray(memNote!.sectionsOmitted));
});

test("V-MEM-5: default files backend works with zero plugins", async () => {
  const { facade, accountId } = await facadeWithAccount();
  assert.deepEqual(facade.backendInfo().id, "files");
  assert.ok(facade.backendInfo().capabilities.includes("read_standing"));
  assert.ok(facade.backendInfo().capabilities.includes("search"));
  const listed = await facade.listMemory(accountId);
  assert.equal(listed.backendId, "files");
  await facade.remember(accountId, { text: "works offline", target: "l2" });
  const hits = await facade.recall(accountId, { query: "offline" });
  assert.ok(hits.hits.length >= 1);
});

test("V-MEM-7: after remember, same session sees updated fact", async () => {
  const { facade, accountId } = await facadeWithAccount();
  const before = await facade.buildStandingInject(accountId);
  const gen0 = before.generation;

  const result = await facade.remember(accountId, {
    text: "peanut allergy",
    target: "l2",
  });
  assert.ok(result.generation > gen0);
  assert.ok(result.inject.text.includes("peanut allergy"));

  const again = await facade.buildStandingInject(accountId);
  assert.ok(again.text.includes("peanut allergy"));
  assert.equal(again.generation, result.generation);
});

test("V-MEM-10: truncated inject includes recall/session_search duty line", async () => {
  const { facade, accountId } = await facadeWithAccount();
  const pad = "z".repeat(300);
  for (let i = 0; i < 30; i++) {
    await facade.updateProfile(accountId, { set: { [`k${i}`]: pad } });
  }
  const inject = await facade.buildStandingInject(accountId);
  assert.equal(inject.truncated, true);
  assert.equal(inject.dutyLine, STANDING_DUTY_LINE);
  assert.ok(inject.text.includes("recall"));
  assert.ok(inject.text.includes("session_search"));
  assert.ok(inject.text.includes(STANDING_DUTY_LINE));
});

test("V-MEM-11: concurrent standing writes cannot corrupt MEMORY.md", async () => {
  const { facade, accountId } = await facadeWithAccount();
  const root = join(facade.stateDir, "accounts", accountId);

  // Simulate flush + remember interleaving: many concurrent L2 writers.
  // Writer lock serializes them; MEMORY.md must stay well-formed.
  const writers = Array.from({ length: 50 }, (_, i) =>
    facade.store.appendMemory(accountId, `concurrent fact ${i}`),
  );
  const remembers = Array.from({ length: 50 }, (_, i) =>
    facade.remember(accountId, { text: `remembered ${i}`, target: "l2" }),
  );

  await Promise.all([...writers, ...remembers]);

  const md = await readFile(join(root, "MEMORY.md"), "utf8");
  const bullets = md.split("\n").filter((l) => l.startsWith("- "));
  assert.ok(bullets.length >= 100);
  for (const b of bullets) {
    assert.ok(b.length > 2);
    assert.equal(b.includes("\0"), false);
  }
  assert.ok(md.includes("## Standing") || md.includes("# MEMORY"));
});

test("V-MEM-13: FTS over L2+L3 only; CJK + short-CJK scan; compact excluded", async () => {
  const { facade, accountId, stateDir } = await facadeWithAccount();
  const root = join(stateDir, "accounts", accountId);

  await writeFile(
    join(root, "MEMORY.md"),
    "# MEMORY\n\n## Standing\n\n- 我对花生过敏 peanut allergy\n- prefer quiet mornings\n",
    "utf8",
  );
  await writeFile(
    join(root, "memory", "2026-10-08.md"),
    "- today noted 过敏 after lunch\n",
    "utf8",
  );
  await mkdir(join(root, "memory", "compact"), { recursive: true });
  await writeFile(
    join(root, "memory", "compact", "2026-09-01.md"),
    "- ROTATED compact diary should never match uniqueCompactTokenXYZ\n",
    "utf8",
  );
  facade.store.invalidate(accountId);

  // Chinese query matches Chinese content.
  const zh = await facade.recall(accountId, { query: "花生过敏" });
  assert.ok(zh.hits.length >= 1, "3+ CJK trigram should hit");
  assert.ok(zh.hits.some((h) => h.path === "MEMORY.md"));

  // Short CJK run inside mixed query → scan engine (V-MEM-13).
  const mixed = await facade.recall(accountId, { query: "花生 allergy" });
  assert.ok(mixed.hits.length >= 1, "花生 allergy must match");
  assert.ok(
    mixed.hits.some((h) => h.engine === "scan" || h.snippet.includes("花生")),
    "short CJK covered by scan or fts snippet",
  );
  const twoChar = await facade.recall(accountId, { query: "过敏" });
  assert.ok(twoChar.hits.length >= 1);
  assert.ok(twoChar.hits.some((h) => h.engine === "scan"));

  // compact/** excluded
  const compact = await facade.recall(accountId, { query: "uniqueCompactTokenXYZ" });
  assert.equal(compact.hits.length, 0);

  // L1 profile is NOT in recall corpus
  await facade.updateProfile(accountId, { set: { hidden_from_recall: "onlyInProfileZZZ" } });
  const noProfile = await facade.recall(accountId, { query: "onlyInProfileZZZ" });
  assert.equal(noProfile.hits.length, 0);
});

test("V-MEM-17: external MEMORY.md edit reloads before inject; no silent clobber", async () => {
  const { facade, accountId, stateDir } = await facadeWithAccount();
  const memPath = join(stateDir, "accounts", accountId, "MEMORY.md");

  await facade.remember(accountId, { text: "agent wrote this", target: "l2" });
  const gen1 = (await facade.buildStandingInject(accountId)).generation;

  // Human edits the file out of band.
  await writeFile(
    memPath,
    "# MEMORY\n\n## Standing\n\n- human edited standing fact\n",
    "utf8",
  );

  const inject = await facade.buildStandingInject(accountId);
  assert.ok(inject.text.includes("human edited standing fact"));
  assert.ok(!inject.text.includes("agent wrote this"));

  // Write after external edit: reload inside lock, last-writer-wins with warning.
  const loaded = await facade.store.appendMemory(accountId, "agent append after human");
  assert.ok(
    loaded.externalEditWarning ||
      (await readFile(memPath, "utf8")).includes("human edited standing fact"),
  );
  const finalMd = await readFile(memPath, "utf8");
  assert.ok(finalMd.includes("agent append after human"));
  // Human line preserved (append, not blind overwrite of whole file from stale cache).
  assert.ok(finalMd.includes("human edited standing fact"));
  assert.ok((await facade.buildStandingInject(accountId)).generation >= gen1);
});

test("V-MEM-18: section-aware L2 builder keeps whole bullets and omit markers", () => {
  const md = [
    "# MEMORY",
    "",
    "## Standing",
    "",
    "- keep me A",
    "- keep me B",
    "",
    "## Long",
    "",
    ...Array.from({ length: 50 }, (_, i) => `- long entry ${i} ${"w".repeat(60)}`),
    "",
  ].join("\n");

  const built = buildL2Inject(md, 500, ["## Standing"]);
  assert.ok(built.text.includes("keep me A"));
  assert.ok(built.text.includes("keep me B"));
  assert.ok(built.truncated);
  assert.ok(built.sectionsOmitted.length >= 1 || built.text.includes("entries omitted"));
  // Never a half bullet line.
  for (const line of built.text.split("\n")) {
    if (line.startsWith("- ")) {
      assert.ok(line.length > 2);
      assert.equal(line.endsWith("…") && line.length < 10, false);
    }
  }
  const marker = omitMarker("## Long", 3);
  assert.equal(marker, "§ Long — 3 entries omitted");
});
