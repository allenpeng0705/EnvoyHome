#!/usr/bin/env node
/**
 * docs-lint.mjs — cross-reference and count linter for the EnvoyHome design docs.
 *
 * This exists because three separate review rounds found the same class of defect
 * by hand: a Normative sentence whose section target did not exist, a verification
 * ID nobody owned, a range that listed a stage which never claimed it, and a count
 * that had drifted from the thing it counted. Those are mechanical, so they belong
 * in CI rather than in a reviewer's head.
 *
 * Checks:
 *   1. every `Design §X` / `Memory Design §X` / `Plan §X` target exists
 *   2. every in-document bare `§X` target exists (same file)
 *   3. every verification ID referenced anywhere is defined somewhere
 *   4. every defined v1 ID has exactly one owning stage in Plan §4 (and no dupes)
 *   5. `A..B` ranges expand to IDs that all exist
 *   6. every local markdown link resolves on disk
 *   7. counts that are *stated* in prose match the thing counted
 *   8. V-MEM / V-LEARN ID sets agree across Design §9.6, Memory §16 and Plan §4
 *
 * Exit 0 = clean, 1 = violations. No dependencies.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = {
  Design: "design_doc/EnvoyHome-Design.md",
  "Memory Design": "design_doc/EnvoyHome-Memory-Design.md",
  Plan: "design_doc/EnvoyHome-Implementation-Plan.md",
};
const EXTRA = [
  "design_doc/README.md",
  "AGENTS.md",
  "tests/min/conventions.md",
  "README.md",
  "design_doc/reviews/2026-10-08f-acceptance.md",
];

const problems = [];
const fail = (check, msg) => problems.push(`[${check}] ${msg}`);

/** Collect section numbers from headings: `## 4.`, `### 4.3`, `#### 4.3.1`, `### A.9`. */
function sections(text) {
  const out = new Set();
  for (const line of text.split("\n")) {
    const m = line.match(/^#{2,4}\s+(?:Appendix\s+([ABC])\b|(\d+(?:\.\d+)*)\.?\s)/);
    if (!m) continue;
    if (m[1]) { out.add(m[1]); out.add(`appendix-${m[1]}`); }
    if (m[2]) {
      const parts = m[2].split(".");
      for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join("."));
    }
  }
  // Appendix A's sub-schemas are `### A.1 …`
  for (const line of text.split("\n")) {
    const m = line.match(/^#{3,4}\s+([ABC])\.(\d+)\b/);
    if (m) out.add(`${m[1]}.${m[2]}`);
  }
  return out;
}

const docs = Object.fromEntries(
  Object.entries(DOCS).map(([k, p]) => {
    const text = readFileSync(join(ROOT, p), "utf8");
    return [k, { path: p, text, secs: sections(text) }];
  }),
);

/* ---------------------------------------------------------------- 1 & 2: refs */
// A reference may name its document (`Design §4.3`) or inherit one mentioned
// earlier on the same line (`Design §8.3, §19.4`) — the docs use both. A bare
// `§N` with nothing to inherit resolves inside the file it appears in.
// `GuideBook §36` and other externals are not ours to resolve.
const refRe = /(GuideBook|guidebook|Design|Memory Design|Plan)?\s*§\s*(\d+(?:\.\d+)*|[ABC](?:\.\d+)?)/g;
const appendixRe = /(Design|Memory Design|Plan)\s+Appendix\s+([ABC])(?:\.(\d+))?/g;

for (const [name, d] of Object.entries(docs)) {
  d.text.split("\n").forEach((line, i) => {
    const at = `${d.path}:${i + 1}`;
    let lastDoc = name;
    let prevEnd = -1;
    for (const m of line.matchAll(refRe)) {
      if (m[1] === "GuideBook" || m[1] === "guidebook") { prevEnd = m.index + m[0].length; continue; }
      // Inherit a document only when this ref continues a list begun by a
      // doc-qualified ref (`Design §8.3, §19.4`). Prose in between means the
      // ref is local to the file it lives in.
      const gap = prevEnd < 0 ? "" : line.slice(prevEnd, m.index);
      const continuesList = /^[\s,\/&+()*_\-\u2013\u2014]*$/.test(gap);
      // Appendices are document-local: `Design Appendix A.9` is written with
      // the word "Appendix", so a bare `§C.1` always means this file.
      const isAppendix = /^[ABC](\.\d+)?$/.test(m[2]);
      const target = DOCS[m[1]] ? m[1] : isAppendix ? name : continuesList ? lastDoc : name;
      if (DOCS[m[1]]) lastDoc = m[1];
      if (!docs[target].secs.has(m[2])) {
        fail("ref", `${at}: "${m[0].trim()}" → ${target} has no section ${m[2]}`);
      }
      prevEnd = m.index + m[0].length;
    }
    for (const m of line.matchAll(appendixRe)) {
      if (!DOCS[m[1]]) continue;
      const sec = m[3] ? `${m[2]}.${m[3]}` : m[2];
      if (!docs[m[1]].secs.has(sec)) {
        fail("ref", `${at}: "${m[0].trim()}" → ${m[1]} has no appendix ${sec}`);
      }
    }
  });
}

/* ------------------------------------------------------ 3 & 4: verification IDs */
const idRe = /\bV-(?:PROTO|RPC|SEC|CH|HAR|LLM|DAG|MEM|LEARN|UX-MEM|UX|SKILL|OUT|HA|P2-[A-Z]+)-\d+\b/g;

// Defined = appears as a table-key cell `| V-… |` in any of the three docs.
const defined = new Map();
for (const [name, d] of Object.entries(docs)) {
  d.text.split("\n").forEach((line, i) => {
    const m = line.match(/^\|\s*\*{0,2}(V-[A-Z0-9-]+-\d+)\*{0,2}\s*\|/);
    if (m) {
      if (!defined.has(m[1])) defined.set(m[1], []);
      defined.get(m[1]).push(`${d.path}:${i + 1}`);
    }
  });
}
const definedIds = new Set(defined.keys());

for (const [name, d] of Object.entries(docs)) {
  d.text.split("\n").forEach((line, i) => {
    for (const id of line.match(idRe) ?? []) {
      if (!definedIds.has(id)) {
        fail("id", `${d.path}:${i + 1}: ${id} is referenced but never defined`);
      }
    }
  });
}

// Plan §4 ownership: one stage per v1 ID.
const plan = docs.Plan.text;
const sec4 = plan.split(/^## 4\./m)[1]?.split(/^## /m)[0] ?? "";
const owners = new Map();
for (const line of sec4.split("\n")) {
  const m = line.match(/^\|\s*(V-[A-Z0-9-]+-\d+)\s*\|\s*\*{0,2}([^|*]+?)\*{0,2}\s*\|/);
  if (!m) continue;
  const [, id, owner] = m;
  if (!owners.has(id)) owners.set(id, []);
  owners.get(id).push(owner.trim());
}
for (const [id, list] of owners) {
  if (list.length > 1) fail("owner", `Plan §4: ${id} appears in ${list.length} rows (${list.join(" / ")})`);
  if (list.some((o) => o.includes(","))) fail("owner", `Plan §4: ${id} claims multiple owners: ${list[0]}`);
}
const unowned = [...definedIds].filter(
  (id) => !owners.has(id) && !id.startsWith("V-P2-"),
);
for (const id of unowned) fail("owner", `Plan §4: ${id} is defined but has no owning stage row`);

/* ------------------------------------------------------------- 5: ID ranges */
const rangeRe = /\b(V-[A-Z0-9-]+?)-(\d+)\.\.(V-[A-Z0-9-]+-)?(\d+)\b/g;
for (const [name, d] of Object.entries(docs)) {
  d.text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(rangeRe)) {
      const [, pre, from, pre2, to] = m;
      const family = pre2 ? pre2.replace(/-$/, "") : pre;
      if (pre2 && pre2.replace(/-$/, "") !== pre) {
        fail("range", `${d.path}:${i + 1}: range ${m[0]} spans two families`);
        continue;
      }
      for (let n = Number(from); n <= Number(to); n++) {
        if (!definedIds.has(`${family}-${n}`)) {
          fail("range", `${d.path}:${i + 1}: range ${m[0]} includes undefined ${family}-${n}`);
        }
      }
    }
  });
}

/* ------------------------------------------------------------- 6: local links */
for (const rel of [...Object.values(DOCS), ...EXTRA]) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const text = readFileSync(abs, "utf8");
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const href = m[1];
      if (/^(https?:|mailto:|#)/.test(href)) continue;
      const target = resolve(dirname(abs), href.split("#")[0]);
      if (!existsSync(target)) fail("link", `${rel}:${i + 1}: broken link → ${href}`);
    }
  });
}

/* ---------------------------------------------------------------- 7: counts */
const countOf = (text, re) => (text.match(re) ?? []).length;

// Build stages are `### B<n> — …` headings in Plan §3.
const stages = countOf(plan, /^### B\d+ —/gm);
if (stages !== 15) fail("count", `Plan §3: ${stages} stage headings, expected 15 (B0–B14)`);
if (!/B0–B14/.test(plan)) fail("count", "Plan: release bar does not say B0–B14");

const convText = readFileSync(join(ROOT, "tests/min/conventions.md"), "utf8");
const rules = countOf(convText, /^## R\d+ —/gm);
if (rules !== 13) fail("count", `conventions.md: ${rules} rules, expected 13 (R1–R13)`);
// Every rule must be enumerated in Plan §5.8, which claims to list them all.
const sec58 = plan.split(/^### 5\.8/m)[1]?.split(/^### /m)[0] ?? "";
for (let n = 1; n <= rules; n++) {
  if (!new RegExp(`\\bR${n}\\b`).test(sec58)) fail("count", `Plan §5.8 does not enumerate R${n}`);
}

// Section 10.1 screens and 10.2 flows, and the prose that counts them.
const sec101 = docs.Design.text.split(/^### 10\.1/m)[1]?.split(/^### /m)[0] ?? "";
const screens = countOf(sec101, /^\|\s*`[a-z][a-z.-]*`\s*\|/gm);
if (screens !== 15) fail("count", `Design §10.1: ${screens} screen rows, expected 15`);

const sec102 = docs.Design.text.split(/^### 10\.2/m)[1]?.split(/^### /m)[0] ?? "";
const flows = countOf(sec102, /^\d+\.\s+\*\*/gm);
if (flows !== 8) fail("count", `Design §10.2: ${flows} flows, expected 8`);

// Stated counts must match. These three drifted apart twice.
if (/\bseven\b[^.]{0,40}critical flows/i.test(docs.Design.text)) {
  fail("count", `Design §21 bar 4 says "seven" critical flows; §10.2 has ${flows}`);
}
if (/\bsix flows\b/i.test(plan)) {
  fail("count", `Plan §8 says "six flows"; Design §10.2 has ${flows}`);
}
if (/\b(seven|eight)\b/.test(docs.Design.text) === false) {
  fail("count", "Design does not state the flow count anywhere");
}

/* ------------------------------------------- 8: memory ID parity across docs */
const memIds = (t) => new Set(t.match(/\bV-(?:MEM|LEARN)-\d+\b/g) ?? []);
const dMem = memIds(docs.Design.text);
const mMem = memIds(docs["Memory Design"].text);
const pMem = memIds(plan);
for (const id of dMem) if (!mMem.has(id)) fail("parity", `Design has ${id}, Memory Design does not`);
for (const id of mMem) if (!dMem.has(id)) fail("parity", `Memory Design has ${id}, Design does not`);
for (const id of mMem) if (!pMem.has(id)) fail("parity", `Memory Design has ${id}, Plan does not`);


/* ------------------------------------------- 9: method scope is exhaustive */
// Every catalogued method must appear in exactly one row of Design §4.3.1. An
// earlier revision put "every home.list*" in the account-scoped row while
// listGrants/listActuations sat in owner-scope, so a router could not tell which
// applied — and an unlisted method silently inherited the catch-all.
{
  const sec431 = docs.Design.text.split(/^#### 4\.3\.1/m)[1]?.split(/^#### /m)[0] ?? "";
  if (sec431 === "") fail("scope", "Design has no §4.3.1 method-scope subsection");
  const rows = {
    "loopback-owner": sec431.split(/\n\|\s*\*\*owner-scope\*\*/)[0] ?? "",
    "owner-scope": "",
    "account-scoped": "",
  };
  const ownerIdx = sec431.indexOf("**owner-scope**");
  const acctIdx = sec431.indexOf("**account-scoped**");
  if (ownerIdx === -1 || acctIdx === -1) fail("scope", "Design §4.3.1 is missing a scope row");
  rows["owner-scope"] = sec431.slice(ownerIdx, acctIdx);
  rows["account-scoped"] = sec431.slice(acctIdx);

  const PHASE2_OR_HYPOTHETICAL = new Set(["home.getChannelConfig", "home.setPrivacyMode"]);
  const catalogued = new Set();
  const scopeOf = new Map();
  for (const [scope, body] of Object.entries(rows)) {
    for (const m of body.matchAll(/`(home\.[a-z][a-zA-Z]*)`/g)) {
      const name = m[1];
      // Methods named in the docs that are deliberately NOT v1 catalogue entries:
      // `getChannelConfig` is hypothetical (Design A.6), `setPrivacyMode` is Phase 2.
      if (PHASE2_OR_HYPOTHETICAL.has(name)) continue;
      catalogued.add(name);
      if (scopeOf.has(name)) {
        fail("scope", `Design §4.3.1 lists ${name} in both ${scopeOf.get(name)} and ${scope}`);
      }
      scopeOf.set(name, scope);
    }
  }
  // Methods that exist in the catalogue but in no scope row.
  const named = new Set();
  for (const m of docs.Design.text.matchAll(/`(home\.[a-z][a-zA-Z]*)`/g)) named.add(m[1]);
  const unspecified = [...named]
    .filter((n) => !PHASE2_OR_HYPOTHETICAL.has(n) && !scopeOf.has(n))
    .sort();
  if (unspecified.length > 0) {
    fail("scope", `not in any Design §4.3.1 scope row: ${unspecified.join(", ")}`);
  }
  if (catalogued.size < 60) fail("scope", `only ${catalogued.size} methods found in §4.3.1`);
}

/* ------------------------------------------- 10: the build-stage graph is a DAG */
// Stage order is the plan; a stage that depends on a later stage inverts it, and
// a cycle makes the plan unexecutable. Both happened once (B12 <-> B14, B13 -> B14).
{
  const blocks = plan.split(/^### (B\d+) — /m).slice(1);
  const deps = new Map();
  for (let i = 0; i < blocks.length; i += 2) {
    const name = blocks[i];
    const body = blocks[i + 1] ?? "";
    const m = body.match(/\| Depends on \|([^\n]*)/);
    if (!m) {
      fail("graph", `Plan ${name} has no "Depends on" row`);
      continue;
    }
    deps.set(name, [...new Set([...m[1].matchAll(/\bB(\d+)\b/g)].map((x) => `B${x[1]}`))]);
  }
  for (const [stage, list] of deps) {
    for (const dep of list) {
      if (!deps.has(dep)) fail("graph", `Plan ${stage} depends on ${dep}, which has no stage block`);
      else if (Number(dep.slice(1)) > Number(stage.slice(1))) {
        fail("graph", `Plan ${stage} depends on later stage ${dep} — stage order is inverted`);
      }
    }
  }
  const reaches = (start, seen) => {
    for (const dep of deps.get(start) ?? []) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      reaches(dep, seen);
    }
    return seen;
  };
  for (const stage of deps.keys()) {
    if (reaches(stage, new Set()).has(stage)) fail("graph", `Plan dependency cycle through ${stage}`);
  }
}

/* ------------------------------- 11: one wording per verification ID */
// The same ID certifying two different things in two documents is how a test and
// its criterion drift apart. Design §9.6 must match Memory Design §16 verbatim.
{
  const cells = (text, start, end) => {
    const seg = text.slice(text.indexOf(start), text.indexOf(end));
    const out = new Map();
    for (const line of seg.split("\n")) {
      const m = line.match(/^\|\s*(V-(?:MEM|LEARN|UX-MEM)-\d+)\s*\|([^|]*)\|?/);
      if (m) out.set(m[1], m[2]);
    }
    return out;
  };
  const norm = (s) =>
    s.replace(/\*\*|\*|`/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const a = cells(docs.Design.text, "### 9.6 Verification", "## 10. Settings UX");
  const b = cells(docs["Memory Design"].text, "## 16. Verification", "## 17. Fitness");
  for (const [id, textA] of a) {
    const textB = b.get(id);
    if (textB === undefined) continue;
    if (norm(textA) !== norm(textB)) {
      fail("idtext", `${id} reads differently in Design §9.6 and Memory Design §16`);
    }
  }
}

/* ---------------------------------------------------------------- report */
if (problems.length) {
  console.error(`docs-lint: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(
  `docs-lint: OK — refs resolve; ${definedIds.size} IDs defined with single owners; ` +
    `§4.3.1 covers every method; stage graph is a DAG; ID wording matches across docs; ` +
    `${stages} stages, ${rules} rules, ${flows} flows`,
);
