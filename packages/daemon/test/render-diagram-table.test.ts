// Design §9.5k / P2-P — V-OFFICE-30…33 render_diagram + render_table.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertSafeMermaidSource,
  renderDiagramPng,
  DIAGRAM_KINDS,
} from "../dist/render-diagram.js";
import { renderTablePng } from "../dist/render-table-image.js";
import { parseGfmTable } from "../dist/table-transform.js";
import { runExtendedWorkflowTool } from "../dist/workflow-tools.js";
import { homePaths } from "../dist/home-paths.js";
import { BUILTIN_TOOLS } from "@envoyhome/harness-host";

test("V-OFFICE-30: Mermaid subset render + refuse unsafe", async () => {
  assert.ok(DIAGRAM_KINDS.includes("flowchart"));
  assert.throws(
    () => assertSafeMermaidSource("flowchart LR\n  click A href \"http://x\""),
    /click/,
  );
  assert.throws(
    () =>
      assertSafeMermaidSource("flowchart LR\n  click A call cb()\n  A-->B"),
    /click|call/,
  );
  assert.throws(
    () => assertSafeMermaidSource("flowchart LR\n  call doThing()\n  A-->B"),
    /call/,
  );
  assert.throws(
    () => assertSafeMermaidSource("%%{init: {}}%%\nflowchart LR\n  A-->B"),
    /init/,
  );
  assert.throws(
    () => assertSafeMermaidSource("classDiagram\n  class A"),
    /must start with/,
  );
  // Labels / message text containing "call" must NOT false-positive.
  assert.doesNotThrow(() =>
    assertSafeMermaidSource("flowchart LR\n  A[call API] --> B[Done]\n"),
  );
  assert.doesNotThrow(() =>
    assertSafeMermaidSource(
      "sequenceDiagram\n  Alice->>Bob: call home\n  Bob-->>Alice: ok\n",
    ),
  );

  const { png, kind } = await renderDiagramPng(`flowchart LR
  A[Start] --> B[Done]
`);
  assert.equal(kind, "flowchart");
  assert.equal(png[0], 0x89);
  assert.equal(png[1], 0x50);
  assert.ok(png.length > 200);
});

test("V-OFFICE-31: render_table styled PNG", () => {
  const table = parseGfmTable(`| Region | Sales |
|--------|------:|
| North | 12 |
| South | 9 |
`);
  const { png, rows, cols } = renderTablePng(table, { title: "Sales" });
  assert.equal(rows, 2);
  assert.equal(cols, 2);
  assert.equal(png[0], 0x89);
  assert.ok(png.length > 200);
});

test("V-OFFICE-32: catalogue + fence tools + caps", async () => {
  assert.ok(BUILTIN_TOOLS.render_diagram);
  assert.ok(BUILTIN_TOOLS.render_table);
  assert.equal(BUILTIN_TOOLS.render_diagram.risk, "write");
  assert.equal(BUILTIN_TOOLS.render_table.grantable, true);

  const root = await mkdtemp(join(tmpdir(), "eh-diagram-"));
  try {
    const paths = homePaths(root);
    const accountId = "acct1";
    await mkdir(paths.accountFiles(accountId), { recursive: true });

    const diagramOut = JSON.parse(
      await runExtendedWorkflowTool({
        tool: "render_diagram",
        args: {
          mermaid: "sequenceDiagram\n  Alice->>Bob: Hi\n  Bob-->>Alice: Hello\n",
          path: "output/diagrams/seq-test.png",
        },
        skills: { listInstalled: async () => [] } as never,
        channels: { getChannelStatus: () => ({ enabled: false }) } as never,
        paths,
        accountId,
      }),
    );
    assert.equal(diagramOut.uri, "output/diagrams/seq-test.png");
    assert.equal(diagramOut.kind, "sequenceDiagram");

    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "render_diagram",
          args: { mermaid: "flowchart LR\n  click A href \"x\"" },
          skills: { listInstalled: async () => [] } as never,
          channels: { getChannelStatus: () => ({ enabled: false }) } as never,
          paths,
          accountId,
        }),
      /click/,
    );

    const tableOut = JSON.parse(
      await runExtendedWorkflowTool({
        tool: "render_table",
        args: {
          markdown: "| A | B |\n|---|---|\n| 1 | 2 |\n",
          path: "output/diagrams/t.png",
        },
        skills: { listInstalled: async () => [] } as never,
        channels: { getChannelStatus: () => ({ enabled: false }) } as never,
        paths,
        accountId,
      }),
    );
    assert.equal(tableOut.uri, "output/diagrams/t.png");
    assert.equal(tableOut.rows, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("V-OFFICE-33: skill documents diagram recipe", async () => {
  const { readFile } = await import("node:fs/promises");
  const skill = await readFile(
    new URL("../skills-samples/office-documents/SKILL.md", import.meta.url),
    "utf8",
  );
  assert.match(skill, /render_diagram/);
  assert.match(skill, /render_table/);
  assert.match(skill, /flowchart LR/);
  assert.match(skill, /output\/diagrams/);
});
