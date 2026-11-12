// Design §9.5k / P2-R — V-OFFICE-34…38 thin table prep + MCP prefer honesty.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  normalizeCell,
  parseCsvText,
  parseGfmTable,
  runTableTransform,
  TABLE_TRANSFORM_OPS,
} from "../dist/table-transform.js";
import { runExtendedWorkflowTool } from "../dist/workflow-tools.js";
import { homePaths } from "../dist/home-paths.js";
import { BUILTIN_TOOLS } from "@envoyhome/harness-host";

test("V-OFFICE-34: normalize + richer filter", () => {
  assert.equal(normalizeCell("  $1,200  "), "1200");
  assert.equal(normalizeCell("12.5%"), "0.125");
  assert.equal(normalizeCell("n/a"), "");
  assert.equal(normalizeCell("—"), "");

  const table = parseGfmTable(`| Name | Qty | Region |
|------|-----|--------|
| a | $10 | North |
| b | 3 | South |
| c |  | East |
`);
  const norm = runTableTransform(table, { op: "normalize" });
  assert.equal(norm.table.rows[0]![1], "10");

  const gte = runTableTransform(norm.table, {
    op: "filter",
    column: "Qty",
    gte: "5",
  });
  assert.equal(gte.table.rows.length, 1);
  assert.equal(gte.table.rows[0]![0], "a");

  const empty = runTableTransform(norm.table, {
    op: "filter",
    column: "Qty",
    isEmpty: true,
  });
  assert.equal(empty.table.rows.length, 1);
  assert.equal(empty.table.rows[0]![0], "c");

  const inn = runTableTransform(norm.table, {
    op: "filter",
    column: "Region",
    values: ["North", "East"],
  });
  assert.equal(inn.table.rows.length, 2);

  const ne = runTableTransform(norm.table, {
    op: "filter",
    column: "Name",
    notEquals: "a",
  });
  assert.equal(ne.table.rows.length, 2);
});

test("V-OFFICE-35: dedupe / rename / top_n / head / tail", () => {
  const table = parseGfmTable(`| Name | Qty |
|------|-----|
| apple | 3 |
| banana | 9 |
| apple | 3 |
| cherry | 1 |
`);
  const deduped = runTableTransform(table, { op: "dedupe" });
  assert.equal(deduped.table.rows.length, 3);

  const renamed = runTableTransform(deduped.table, {
    op: "rename_columns",
    rename: { Qty: "Sales" },
  });
  assert.deepEqual(renamed.table.headers, ["Name", "Sales"]);

  const top = runTableTransform(renamed.table, {
    op: "top_n",
    column: "Sales",
    n: 2,
  });
  assert.equal(top.table.rows.length, 2);
  assert.equal(top.table.rows[0]![0], "banana");

  const head = runTableTransform(renamed.table, { op: "head", n: 1 });
  assert.equal(head.table.rows.length, 1);
  assert.equal(head.table.rows[0]![0], "apple");

  const tail = runTableTransform(renamed.table, { op: "tail", n: 1 });
  assert.equal(tail.table.rows.length, 1);
  assert.equal(tail.table.rows[0]![0], "cherry");
});

test("V-OFFICE-36: pipeline ≤16; nested refused", () => {
  assert.ok(TABLE_TRANSFORM_OPS.includes("pipeline"));
  const table = parseGfmTable(`| Name | Qty |
|------|-----|
| a | $5 |
| b | 2 |
| c | 9 |
`);
  const out = runTableTransform(table, {
    op: "pipeline",
    steps: [
      { op: "normalize" },
      { op: "filter", column: "Qty", gte: "3" },
      { op: "top_n", column: "Qty", n: 1 },
    ],
  });
  assert.equal(out.table.rows.length, 1);
  assert.equal(out.table.rows[0]![0], "c");
  assert.match(out.summary, /pipeline\[3\]/);

  assert.throws(
    () =>
      runTableTransform(table, {
        op: "pipeline",
        steps: [
          {
            op: "pipeline",
            steps: [{ op: "normalize" }],
          } as never,
        ],
      }),
    /pipeline|nested/,
  );
});

test("V-OFFICE-37: CSV quoted newlines", () => {
  const csv = `Name,Note
"alpha","line1
line2"
beta,ok
`;
  const table = parseCsvText(csv);
  assert.equal(table.headers.length, 2);
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[0]![0], "alpha");
  assert.match(table.rows[0]![1]!, /line1/);
  assert.match(table.rows[0]![1]!, /line2/);
  assert.equal(table.rows[1]![0], "beta");
});

test("V-OFFICE-38: catalogue + skill prep + MCP prefer", async () => {
  assert.ok(BUILTIN_TOOLS.table_transform);
  assert.equal(BUILTIN_TOOLS.table_transform.risk, "write");
  for (const op of [
    "normalize",
    "dedupe",
    "rename_columns",
    "top_n",
    "head",
    "tail",
    "pipeline",
  ] as const) {
    assert.ok(TABLE_TRANSFORM_OPS.includes(op), op);
  }

  const skill = await (
    await import("node:fs/promises")
  ).readFile(
    new URL("../skills-samples/office-documents/SKILL.md", import.meta.url),
    "utf8",
  );
  assert.match(skill, /pipeline/);
  assert.match(skill, /normalize/);
  assert.match(skill, /MUST prefer/);
  assert.match(skill, /[Nn]ever.*invent MCP|[Nn]ever invent MCP/);
  assert.match(skill, /Local SQL|local SQL|P2-S/);
  assert.match(skill, /office-bi-paths/);

  const root = await mkdtemp(join(tmpdir(), "eh-prep-"));
  try {
    const paths = homePaths(root);
    const accountId = "acct1";
    await mkdir(paths.accountFiles(accountId), { recursive: true });
    await writeFile(
      join(paths.accountFiles(accountId), "sales.csv"),
      'Name,Qty\n"x","$4"\ny,1\n',
      "utf8",
    );
    const out = JSON.parse(
      await runExtendedWorkflowTool({
        tool: "table_transform",
        args: {
          op: "pipeline",
          sourcePath: "sales.csv",
          steps: [
            { op: "normalize" },
            { op: "filter", column: "Qty", gte: "2" },
          ],
        },
        skills: { listInstalled: async () => [] } as never,
        channels: { getChannelStatus: () => ({ enabled: false }) } as never,
        paths,
        accountId,
      }),
    );
    assert.match(out.uri, /^output\/tables\//);
    assert.equal(out.rows, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
