// Design §9.5k / V-OFFICE-15…29 — PPT layouts, images, templates, notes, master, visual fidelity, thin compute.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import {
  exportDocument,
  exportDocumentJs,
  markdownNeedsJsPptx,
  parseMarkdownBlocks,
  loadOfficeThemeFromDir,
  detectMasterPptxNote,
} from "../dist/document-export.js";
import {
  isSlideLayout,
  parseSlideDirectiveLine,
  parseSlideNotesLine,
  splitQuoteContent,
  resolveComparisonHeaders,
  resolveOfficeTheme,
  VISUAL,
  ENVOYHOME_SLIDE_MASTER,
} from "../dist/office-pptx.js";
import {
  parseGfmTable,
  runTableTransform,
  tableToCsv,
  TABLE_TRANSFORM_OPS,
} from "../dist/table-transform.js";
import {
  extractChartSeries,
  renderChartPng,
  encodePng,
} from "../dist/chart-table.js";
import { runExtendedWorkflowTool } from "../dist/workflow-tools.js";
import { homePaths } from "../dist/home-paths.js";
import { BUILTIN_TOOLS } from "@envoyhome/harness-host";

const DECK_MD = `# Kickoff
<!-- slide layout=section -->

## Agenda
<!-- slide layout=title_bullets -->
- Goals
- Timeline

## Two cols
<!-- slide layout=two_column -->
- Left A
- Left B
- Right A
- Right B

## Weird
<!-- slide layout=not_a_real_layout -->
- still works
`;

test("V-OFFICE-15: slide directives parse + unknown soft-default", async () => {
  assert.equal(parseSlideDirectiveLine("<!-- slide layout=section -->"), "section");
  assert.equal(isSlideLayout("two_column"), true);
  assert.equal(isSlideLayout("fancy"), false);
  assert.equal(markdownNeedsJsPptx(DECK_MD), true);

  const blocks = parseMarkdownBlocks(DECK_MD);
  assert.ok(blocks.some((b) => b.kind === "slide_directive" && b.layout === "section"));
  assert.ok(blocks.some((b) => b.kind === "slide_directive" && b.layout === "not_a_real_layout"));

  const { buffer, pptxNotes } = await exportDocument("pptx", DECK_MD, {
    title: "Kickoff",
    engine: "js",
  });
  assert.ok(buffer.length > 100);
  assert.equal(buffer[0], 0x50);
  assert.ok(pptxNotes?.unknownLayouts.includes("not_a_real_layout"));
});

test("V-OFFICE-16: jail image embed + escape refuse", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-pptx-img-"));
  try {
    const imgPath = join(root, "pic.png");
    // 1x1 PNG via encodePng
    const tiny = encodePng(1, 1, Buffer.from([0, 128, 255, 255]));
    await writeFile(imgPath, tiny);
    const md = `# Pic
![hi](pic.png)

# Escape attempt
![bad](../secret.png)
`;
    const result = await exportDocument("pptx", md, {
      engine: "js",
      resolveImage: async (rel) => {
        if (rel.includes("..")) return null;
        if (rel === "pic.png") return tiny;
        return null;
      },
    });
    assert.ok(result.pptxNotes);
    assert.equal(result.pptxNotes!.imageCount, 1);
    assert.ok(result.pptxNotes!.imageSkipped.some((s) => s.includes("secret")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("V-OFFICE-17: Owner template theme.json", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-tpl-"));
  try {
    const pack = join(root, "brand");
    await mkdir(pack, { recursive: true });
    await writeFile(
      join(pack, "theme.json"),
      JSON.stringify({
        id: "brand",
        colors: { title: "112233", accent: "FF5500" },
      }),
    );
    const theme = await loadOfficeThemeFromDir(pack);
    assert.ok(theme);
    assert.equal(theme!.id, "brand");
    assert.equal(theme!.colors?.title, "112233");

    const missing = await loadOfficeThemeFromDir(join(root, "nope"));
    assert.equal(missing, null);

    const exported = await exportDocument("pptx", "# Hi\n\n- a\n", {
      engine: "js",
      theme: theme!,
      templateNote: 'templateId "brand" applied',
    });
    assert.equal(exported.pptxNotes?.templateNote, 'templateId "brand" applied');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("V-OFFICE-18: auto prefers JS when layouts present", async () => {
  assert.equal(markdownNeedsJsPptx("# x\n<!-- slide layout=section -->\n"), true);
  assert.equal(markdownNeedsJsPptx("# plain\n\n- a\n"), false);
  const r = await exportDocument("pptx", "# x\n<!-- slide layout=section -->\n", {
    engine: "auto",
    env: { ...process.env, ENVOYHOME_LIBREOFFICE: "/nonexistent/soffice" },
  });
  assert.equal(r.engine, "js");
});

test("V-OFFICE-19: table_transform closed ops", () => {
  const table = parseGfmTable(`| Name | Qty |
|------|-----|
| apple | 3 |
| banana | 2 |
| apple | 1 |
`);
  assert.equal(TABLE_TRANSFORM_OPS.includes("summarize"), true);
  const sum = runTableTransform(table, { op: "summarize" });
  assert.match(sum.summary, /rows=3/);
  const filtered = runTableTransform(table, {
    op: "filter",
    column: "Name",
    equals: "apple",
  });
  assert.equal(filtered.table.rows.length, 2);
  const agg = runTableTransform(table, {
    op: "aggregate",
    column: "Qty",
    agg: "sum",
    groupBy: "Name",
  });
  assert.ok(agg.table.rows.length >= 2);
  assert.match(tableToCsv(agg.table), /apple/);
});

test("V-OFFICE-20: chart_table PNG", () => {
  const table = parseGfmTable(`| Region | Sales |
|--------|------:|
| North | 12 |
| South | 9 |
`);
  const series = extractChartSeries(table);
  const { png, stats } = renderChartPng("bar", series, { title: "Sales" });
  assert.ok(png.length > 50);
  assert.equal(png[0], 137);
  assert.equal(png[1], 80);
  assert.equal(stats.points, 2);
  const line = renderChartPng("line", series);
  assert.ok(line.png.length > 50);
  const pie = renderChartPng("pie", series);
  assert.ok(pie.png.length > 50);
});

test("V-OFFICE-21: builtins include table_transform + chart_table", () => {
  assert.ok(BUILTIN_TOOLS.table_transform);
  assert.ok(BUILTIN_TOOLS.chart_table);
  assert.equal(BUILTIN_TOOLS.table_transform.risk, "write");
  assert.equal(BUILTIN_TOOLS.chart_table.grantable, true);
});

test("V-OFFICE-19/20 via runExtendedWorkflowTool", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-compute-"));
  try {
    const paths = homePaths(root);
    const accountId = "acct1";
    await mkdir(paths.accountFiles(accountId), { recursive: true });
    const md = `| A | B |
|---|---|
| x | 1 |
| y | 2 |
`;
    const transformOut = await runExtendedWorkflowTool({
      tool: "table_transform",
      args: { op: "summarize", markdown: md },
      skills: { listInstalled: async () => [] } as never,
      channels: { getChannelStatus: () => ({ enabled: false }) } as never,
      paths,
      accountId,
    });
    const tj = JSON.parse(transformOut) as { uri: string; summary: string };
    assert.match(tj.uri, /^output\/tables\//);
    assert.match(tj.summary, /rows=2/);

    const chartOut = await runExtendedWorkflowTool({
      tool: "chart_table",
      args: { chartType: "bar", markdown: md, title: "Demo" },
      skills: { listInstalled: async () => [] } as never,
      channels: { getChannelStatus: () => ({ enabled: false }) } as never,
      paths,
      accountId,
    });
    const cj = JSON.parse(chartOut) as { uri: string; chartType: string };
    assert.match(cj.uri, /^output\/charts\/.+\.png$/);
    assert.equal(cj.chartType, "bar");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("plain pptx still works (V-OFFICE-1 regression)", async () => {
  const buf = await exportDocumentJs("pptx", "# Hello\n\n- one\n- two\n", {
    title: "Hello",
  });
  assert.equal(buf[0], 0x50);
  assert.equal(buf[1], 0x4b);
});

test("title without H1/H2 still keeps body content", async () => {
  const { buffer, pptxNotes } = await exportDocument(
    "pptx",
    "- alpha\n- beta\n",
    { title: "Orphan title", engine: "js" },
  );
  assert.ok(buffer.length > 200);
  assert.equal(buffer[0], 0x50);
  // No layout notes required — content must not be discarded into empty slide.
  assert.equal(pptxNotes?.imageCount ?? 0, 0);
});

test("title_only layout embeds jail images", async () => {
  const tiny = encodePng(2, 2, Buffer.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]));
  const md = `# Chart
<!-- slide layout=title_only -->
![Sales](output/charts/demo.png)
`;
  const result = await exportDocument("pptx", md, {
    engine: "js",
    resolveImage: async (p) => (p === "output/charts/demo.png" ? tiny : null),
  });
  assert.equal(result.pptxNotes?.imageCount, 1);
});

test("filter without predicate fails closed", () => {
  const table = parseGfmTable(`| A | B |
|---|---|
| x | 1 |
`);
  assert.throws(
    () => runTableTransform(table, { op: "filter", column: "A" }),
    /equals|notEquals|contains|gt|gte|lt|lte|values|isEmpty/,
  );
});

test("html export keeps slide directive + image notes", async () => {
  const html = (
    await exportDocumentJs(
      "html",
      `# Deck
<!-- slide layout=section -->
![x](a.png)
`,
    )
  ).toString("utf8");
  assert.match(html, /slide layout=section/);
  assert.match(html, /\[image: a\.png/);
});

test("V-OFFICE-22: quote + comparison layouts", async () => {
  assert.equal(isSlideLayout("quote"), true);
  assert.equal(isSlideLayout("comparison"), true);
  const md = `# Voice
<!-- slide layout=quote -->
Customers love the simplicity.
— Jane, Owner

## A vs B
<!-- slide layout=comparison -->
Left option
Right option
- Left pro
- Left con
- Right pro
- Right con
`;
  const { buffer, pptxNotes } = await exportDocument("pptx", md, {
    engine: "js",
  });
  assert.equal(buffer[0], 0x50);
  assert.equal(pptxNotes?.unknownLayouts.length ?? 0, 0);
  const zip = await JSZip.loadAsync(buffer);
  const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(slideXml);
  assert.match(slideXml!, /Customers love the simplicity|simplicity/);
});

test("V-OFFICE-23: speaker notes directive", async () => {
  assert.equal(
    parseSlideNotesLine("<!-- slide notes: Say revenue up -->"),
    "Say revenue up",
  );
  assert.equal(markdownNeedsJsPptx("# x\n<!-- slide notes: hi -->\n"), true);

  const md = `# Kickoff
<!-- slide layout=section -->
<!-- slide notes: Welcome the room; keep it under 60s -->

Body line
`;
  const blocks = parseMarkdownBlocks(md);
  assert.ok(blocks.some((b) => b.kind === "slide_notes"));

  const { buffer, pptxNotes } = await exportDocument("pptx", md, {
    engine: "js",
  });
  assert.equal(pptxNotes?.speakerNotesCount, 1);
  const zip = await JSZip.loadAsync(buffer);
  const noteNames = Object.keys(zip.files).filter(
    (n) => n.startsWith("ppt/notesSlides/") && n.endsWith(".xml") && !n.includes("_rels"),
  );
  assert.ok(noteNames.length >= 1, "expected notesSlides in pptx");
  const noteXml = await zip.file(noteNames[0]!)?.async("string");
  assert.ok(noteXml, `missing ${noteNames[0]}`);
  assert.match(noteXml!, /Welcome the room/);

  const auto = await exportDocument(
    "pptx",
    "# x\n<!-- slide notes: force js -->\n",
    {
      engine: "auto",
      env: { ...process.env, ENVOYHOME_LIBREOFFICE: "/nonexistent/soffice" },
    },
  );
  assert.equal(auto.engine, "js");
});

test("V-OFFICE-24: theme master + optional master.pptx note", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-master-"));
  try {
    const pack = join(root, "brand");
    await mkdir(pack, { recursive: true });
    await writeFile(
      join(pack, "theme.json"),
      JSON.stringify({
        id: "brand",
        footer: "Acme Confidential",
        colors: { accent: "003366", title: "003366" },
      }),
    );
    // Minimal blank pptx (PK zip) for presence detection
    const blank = await exportDocumentJs("pptx", "# Blank\n\n- seed\n", {
      title: "Blank master",
    });
    await writeFile(join(pack, "master.pptx"), blank);

    const theme = await loadOfficeThemeFromDir(pack);
    assert.ok(theme);
    assert.equal(theme!.footer, "Acme Confidential");

    const masterNote = await detectMasterPptxNote(pack);
    assert.match(masterNote ?? "", /master\.pptx present/);
    assert.match(masterNote ?? "", /no OOXML merge/);

    const exported = await exportDocument("pptx", "# Hi\n\n- a\n", {
      engine: "js",
      theme: theme!,
      masterNote,
      templateNote: 'templateId "brand" applied',
    });
    assert.equal(exported.pptxNotes?.masterNote, masterNote);
    const zip = await JSZip.loadAsync(exported.buffer);
    assert.ok(
      zip.file("ppt/slideMasters/slideMaster1.xml"),
      "expected slide master in pptx",
    );
    // pptxgenjs places defineSlideMaster objects on a slideLayout
    let foundFooter = false;
    for (const name of Object.keys(zip.files)) {
      if (!name.startsWith("ppt/slideLayouts/") || !name.endsWith(".xml")) continue;
      if (name.includes("_rels")) continue;
      const xml = await zip.file(name)?.async("string");
      if (xml?.includes("Acme Confidential")) {
        foundFooter = true;
        break;
      }
    }
    assert.ok(foundFooter, "expected theme footer on slide layout");
    void ENVOYHOME_SLIDE_MASTER;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("V-OFFICE-25: skill recipes cover polish directives", async () => {
  const { readFile } = await import("node:fs/promises");
  const skillPath = new URL(
    "../skills-samples/office-documents/SKILL.md",
    import.meta.url,
  );
  const skill = await readFile(skillPath, "utf8");
  assert.match(skill, /layout=quote/);
  assert.match(skill, /layout=comparison/);
  assert.match(skill, /slide notes:/);
  assert.match(skill, /master\.pptx/);
});

test("V-OFFICE-26: quote attribution not mashed", async () => {
  const split = splitQuoteContent(
    ["Customers love the simplicity.", "— Jane, Owner"],
    [],
  );
  assert.equal(split.quote, "Customers love the simplicity.");
  assert.match(split.attribution ?? "", /Jane/);

  const inline = splitQuoteContent(
    ["Customers love the simplicity. — Jane, Owner"],
    [],
  );
  assert.equal(inline.quote, "Customers love the simplicity.");
  assert.match(inline.attribution ?? "", /Jane/);

  const md = `# Voice
<!-- slide layout=quote -->
Customers love the simplicity.
— Jane, Owner
`;
  const blocks = parseMarkdownBlocks(md);
  const paras = blocks.filter((b) => b.kind === "paragraph").map((b) => b.text);
  assert.ok(paras.some((p) => p.includes("simplicity") && !p.includes("Jane")));
  assert.ok(paras.some((p) => /Jane/.test(p)));

  const { buffer } = await exportDocument("pptx", md, { engine: "js" });
  const zip = await JSZip.loadAsync(buffer);
  const runs: string[] = [];
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith("ppt/slides/") || !name.endsWith(".xml") || name.includes("_rels")) {
      continue;
    }
    const xml = (await zip.file(name)?.async("string")) ?? "";
    for (const m of xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)) runs.push(m[1] ?? "");
  }
  assert.ok(
    !runs.some((t) => t.includes("simplicity") && t.includes("Jane")),
    "quote+attr must be separate text runs",
  );
  assert.ok(runs.some((t) => t.includes("simplicity")));
  assert.ok(runs.some((t) => t.includes("Jane")));
});

test("V-OFFICE-27: comparison headers from one-liners / vs / |", () => {
  assert.deepEqual(resolveComparisonHeaders(["Build", "Buy"]), {
    left: "Build",
    right: "Buy",
    rest: [],
  });
  assert.deepEqual(resolveComparisonHeaders(["Build | Buy"]), {
    left: "Build",
    right: "Buy",
    rest: [],
  });
  assert.deepEqual(resolveComparisonHeaders(["Build vs Buy"]), {
    left: "Build",
    right: "Buy",
    rest: [],
  });
  assert.deepEqual(resolveComparisonHeaders(["Build Buy"]), {
    left: "Build",
    right: "Buy",
    rest: [],
  });

  const blocks = parseMarkdownBlocks(`## X
<!-- slide layout=comparison -->
Build
Buy
- a
- b
`);
  const paras = blocks.filter((b) => b.kind === "paragraph").map((b) => b.text);
  assert.ok(paras.includes("Build"));
  assert.ok(paras.includes("Buy"));

  // Multi-word headers must not mash into one para (P2-O review fix).
  const multi = parseMarkdownBlocks(`## A vs B
<!-- slide layout=comparison -->
Left option
Right option
- Left pro
- Right pro
`);
  const multiParas = multi
    .filter((b) => b.kind === "paragraph")
    .map((b) => b.text);
  assert.deepEqual(multiParas, ["Left option", "Right option"]);
  assert.deepEqual(resolveComparisonHeaders(multiParas), {
    left: "Left option",
    right: "Right option",
    rest: [],
  });

  // Directive-before-heading also keeps comparison split.
  const pre = parseMarkdownBlocks(`<!-- slide layout=comparison -->
## Title
Option A
Option B
- a
- b
`);
  const preParas = pre.filter((b) => b.kind === "paragraph").map((b) => b.text);
  assert.deepEqual(preParas, ["Option A", "Option B"]);
});

test("V-OFFICE-28: visual floor + presets", async () => {
  assert.ok(VISUAL.bodyPt >= 18);
  assert.equal(resolveOfficeTheme({ id: "dark" }).colors?.bg, "1A1A2E");
  assert.equal(resolveOfficeTheme({ id: "default" }).id, "default");
  // Partial override must still inherit dark panel/body (export_document path).
  assert.equal(
    resolveOfficeTheme({ id: "dark", footer: "Secret" }).colors?.panel,
    "252542",
  );
  assert.equal(
    resolveOfficeTheme({ id: "dark", footer: "Secret" }).footer,
    "Secret",
  );

  const { buffer } = await exportDocument(
    "pptx",
    `# Hi
<!-- slide layout=title_bullets -->
- one
- two
`,
    { engine: "js", theme: resolveOfficeTheme({ id: "dark" }) },
  );
  const zip = await JSZip.loadAsync(buffer);
  const slide1 = await zip.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(slide1);
  // Body text sz is hundredths of a point: 18pt → 1800
  assert.match(slide1!, /sz="1800"/);
  const pres = await zip.file("ppt/presentation.xml")?.async("string");
  assert.ok(pres);
  // 16:9 LAYOUT_16x9 = 10" × 5.625" → EMUs 9144000 × 5143500
  assert.match(pres!, /sldSz[^>]*cx="9144000"/);
  assert.match(pres!, /cy="5143500"/);
});

test("V-OFFICE-29: skill covers visual fidelity recipes", async () => {
  const { readFile } = await import("node:fs/promises");
  const skillPath = new URL(
    "../skills-samples/office-documents/SKILL.md",
    import.meta.url,
  );
  const skill = await readFile(skillPath, "utf8");
  assert.match(skill, /Visual fidelity/);
  assert.match(skill, /default.*dark|dark.*default/);
  assert.match(skill, /Comparison headers/);
});
