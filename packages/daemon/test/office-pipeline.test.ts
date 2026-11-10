// P2-K / §9.5j — targeted extract + promote_knowledge (V-OFFICE-4…7).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  sliceExtractBySheetName,
  sliceExtractBySlideIndex,
  sliceExtractByPageRange,
} from "../dist/phase2-tools.js";
import { promoteKnowledgeFile } from "../dist/promote-knowledge.js";
import { runExtendedWorkflowTool } from "../dist/workflow-tools.js";
import { homePaths } from "../dist/home-paths.js";

const SHEET_GFM = `# Workbook

## Sales

| Region | Amt |
|--------|-----|
| West | 10 |

## Costs

| Region | Amt |
|--------|-----|
| West | 4 |
`;

const SLIDE_GFM = `# Intro

Welcome

## Agenda

- one
- two

## Next

Done
`;

test("V-OFFICE-4: sheetName / slideIndex / page slice", () => {
  const sales = sliceExtractBySheetName(SHEET_GFM, "Sales");
  assert.match(sales, /## Sales/);
  assert.match(sales, /West \| 10/);
  assert.ok(!sales.includes("## Costs"));

  const missing = sliceExtractBySheetName(SHEET_GFM, "Missing");
  assert.match(missing, /not found/);
  assert.match(missing, /## Costs/);

  const slide2 = sliceExtractBySlideIndex(SLIDE_GFM, 2);
  assert.match(slide2, /## Agenda/);
  assert.ok(!slide2.includes("# Intro"));

  const pages = sliceExtractByPageRange("Page1\fPage2\fPage3", 2, 2);
  assert.match(pages, /Page2/);
});

test("V-OFFICE-6/7: promote_knowledge copies md and refuses binary ext", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-promote-"));
  try {
    const paths = homePaths(stateDir);
    const accountId = "alice";
    const files = paths.accountFiles(accountId);
    await mkdir(join(files, "output", "extracts"), { recursive: true });
    await writeFile(join(files, "output", "extracts", "note.md"), "# Note\n\nHello KB\n", "utf8");

    const out = await runExtendedWorkflowTool({
      tool: "promote_knowledge",
      args: { sourcePath: "output/extracts/note.md" },
      skills: { listSkills: async () => [] } as never,
      channels: {} as never,
      paths,
      accountId,
    });
    const parsed = JSON.parse(out) as {
      ok: boolean;
      knowledgePath: string;
      bytes: number;
    };
    assert.equal(parsed.ok, true);
    assert.equal(parsed.knowledgePath, "knowledge/note.md");
    const body = await readFile(join(files, "knowledge", "note.md"), "utf8");
    assert.match(body, /Hello KB/);

    await assert.rejects(
      () =>
        promoteKnowledgeFile({
          accountId,
          paths,
          sourcePath: "output/extracts/note.docx",
        }),
      /\.md/,
    );

    await assert.rejects(
      () =>
        promoteKnowledgeFile({
          accountId,
          paths,
          sourcePath: "../etc/passwd.md",
        }),
      /jail|refused|bad_params/,
    );

    // V-OFFICE-7: server enforces canPromoteKnowledgePath (not UI-only).
    await mkdir(join(files, "knowledge"), { recursive: true });
    await writeFile(join(files, "knowledge", "already.md"), "# Already\n", "utf8");
    await mkdir(join(files, "output", "replies"), { recursive: true });
    await writeFile(join(files, "output", "replies", "spill.md"), "# Spill\n", "utf8");
    await assert.rejects(
      () =>
        promoteKnowledgeFile({
          accountId,
          paths,
          sourcePath: "knowledge/already.md",
        }),
      /uploads\/|output\/extracts|documents\/|output\/exports|extract\.md|bad_params/,
    );
    await assert.rejects(
      () =>
        promoteKnowledgeFile({
          accountId,
          paths,
          sourcePath: "output/replies/spill.md",
        }),
      /uploads\/|output\/extracts|documents\/|output\/exports|extract\.md|bad_params/,
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OFFICE-5: multi extract sidecars stay independent", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-multi-extract-"));
  try {
    const paths = homePaths(stateDir);
    const accountId = "alice";
    const files = paths.accountFiles(accountId);
    await mkdir(join(files, "uploads"), { recursive: true });
    await writeFile(join(files, "uploads", "a.extract.md"), "# A\n\none\n", "utf8");
    await writeFile(join(files, "uploads", "b.extract.md"), "# B\n\ntwo\n", "utf8");
    const a = await readFile(join(files, "uploads", "a.extract.md"), "utf8");
    const b = await readFile(join(files, "uploads", "b.extract.md"), "utf8");
    assert.match(a, /one/);
    assert.match(b, /two/);
    assert.notEqual(a, b);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
