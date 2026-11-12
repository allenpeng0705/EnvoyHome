#!/usr/bin/env node
/**
 * Office §9.5k live verify — table_transform → chart_table → render_diagram →
 * render_table → export_document pptx with jail image embed
 * (Design 2026-11-12f / V-OFFICE-15…33).
 *
 * Usage:
 *   node scripts/office-live-verify.mjs
 *   ENVOYHOME_STATE_DIR=~/.envoyhome ENVOYHOME_ACCOUNT_ID=<id> node scripts/office-live-verify.mjs
 *
 * Without ENVOYHOME_STATE_DIR, uses a temp dir (fixture pass — still validates the tool chain).
 * With a real state dir + accountId, writes under that account's sandbox (dogfood on a home).
 *
 * Exit 0 = PASS. Prints a checklist-friendly summary.
 */

import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function loadDaemon() {
  const workflowTools = await import(
    pathToFileURL(join(root, "packages/daemon/dist/workflow-tools.js")).href
  );
  const homePaths = await import(
    pathToFileURL(join(root, "packages/daemon/dist/home-paths.js")).href
  );
  const jszipMod = await import(
    pathToFileURL(join(root, "packages/daemon/node_modules/jszip/lib/index.js"))
      .href
  );
  return { ...workflowTools, ...homePaths, JSZip: jszipMod.default };
}

function stubSkills() {
  return { listInstalled: async () => [] };
}
function stubChannels() {
  return { getChannelStatus: () => ({ enabled: false }) };
}

const TABLE_MD = `| Region | Sales |
|--------|------:|
| North | 12 |
| South | 9 |
| East | 15 |
`;

const CHART_PATH = "output/charts/live-verify-sales.png";
const DIAGRAM_PATH = "output/diagrams/live-verify-flow.png";
const TABLE_IMG_PATH = "output/diagrams/live-verify-table.png";

async function main() {
  const { runExtendedWorkflowTool, homePaths, JSZip } = await loadDaemon();

  const realState = process.env.ENVOYHOME_STATE_DIR?.trim();
  const accountId =
    process.env.ENVOYHOME_ACCOUNT_ID?.trim() || "live-verify-office";
  let stateDir = realState;
  let cleanup = null;
  if (!stateDir) {
    stateDir = await mkdtemp(join(tmpdir(), "envoyhome-office-live-"));
    cleanup = stateDir;
    console.log(`Using temp stateDir (fixture): ${stateDir}`);
  } else {
    console.log(`Using real stateDir: ${stateDir}`);
  }

  const paths = homePaths(stateDir);
  await mkdir(paths.accountFiles(accountId), { recursive: true });

  const common = {
    skills: stubSkills(),
    channels: stubChannels(),
    paths,
    accountId,
  };

  console.log("\n1) table_transform summarize…");
  const transformOut = JSON.parse(
    await runExtendedWorkflowTool({
      ...common,
      tool: "table_transform",
      args: { op: "summarize", markdown: TABLE_MD },
    }),
  );
  if (!transformOut.uri?.startsWith("output/tables/")) {
    throw new Error(`unexpected table uri: ${transformOut.uri}`);
  }
  console.log(`   ok → ${transformOut.uri} (${transformOut.summary?.split("\n")[0]})`);

  console.log("\n2) chart_table bar → fixed path…");
  const chartOut = JSON.parse(
    await runExtendedWorkflowTool({
      ...common,
      tool: "chart_table",
      args: {
        chartType: "bar",
        title: "Sales by region",
        path: CHART_PATH,
        markdown: TABLE_MD,
      },
    }),
  );
  if (chartOut.uri !== CHART_PATH) {
    throw new Error(`expected chart uri ${CHART_PATH}, got ${chartOut.uri}`);
  }
  const chartAbs = join(paths.accountFiles(accountId), CHART_PATH);
  const chartBytes = await readFile(chartAbs);
  if (chartBytes[0] !== 0x89 || chartBytes[1] !== 0x50) {
    throw new Error("chart file is not a PNG");
  }
  console.log(`   ok → ${chartOut.uri} (${chartBytes.length} bytes)`);

  console.log("\n3) render_diagram Mermaid flowchart…");
  const diagramOut = JSON.parse(
    await runExtendedWorkflowTool({
      ...common,
      tool: "render_diagram",
      args: {
        path: DIAGRAM_PATH,
        mermaid: `flowchart LR
  A[Lead] --> B[Qualify]
  B --> C[Close]
`,
      },
    }),
  );
  if (diagramOut.uri !== DIAGRAM_PATH) {
    throw new Error(`expected diagram uri ${DIAGRAM_PATH}, got ${diagramOut.uri}`);
  }
  const diagramAbs = join(paths.accountFiles(accountId), DIAGRAM_PATH);
  const diagramBytes = await readFile(diagramAbs);
  if (diagramBytes[0] !== 0x89 || diagramBytes[1] !== 0x50) {
    throw new Error("diagram file is not a PNG");
  }
  console.log(`   ok → ${diagramOut.uri} (${diagramBytes.length} bytes, kind=${diagramOut.kind})`);

  console.log("\n4) render_table styled PNG…");
  const tableImgOut = JSON.parse(
    await runExtendedWorkflowTool({
      ...common,
      tool: "render_table",
      args: {
        path: TABLE_IMG_PATH,
        title: "Sales by region",
        markdown: TABLE_MD,
      },
    }),
  );
  if (tableImgOut.uri !== TABLE_IMG_PATH) {
    throw new Error(`expected table img uri ${TABLE_IMG_PATH}, got ${tableImgOut.uri}`);
  }
  const tableImgBytes = await readFile(join(paths.accountFiles(accountId), TABLE_IMG_PATH));
  if (tableImgBytes[0] !== 0x89 || tableImgBytes[1] !== 0x50) {
    throw new Error("table image is not a PNG");
  }
  console.log(`   ok → ${tableImgOut.uri} (${tableImgBytes.length} bytes)`);

  console.log("\n5) export_document pptx with layouts + jail images…");
  const deckMd = `# Sales review
<!-- slide layout=section -->
<!-- slide notes: Open with the regional story; keep under 60s -->

## By region
<!-- slide layout=title_bullets -->
- North / South / East
- See chart on next slide

## Build vs buy
<!-- slide layout=comparison -->
Build
Buy
- Own the stack
- Faster iterate
- Lower ops
- Vendor roadmap

## Customer voice
<!-- slide layout=quote -->
Customers love the simplicity.
— Jane, Owner

## Flow
<!-- slide layout=title_only -->
![Flow](${DIAGRAM_PATH})

## Chart
<!-- slide layout=title_only -->
![Sales](${CHART_PATH})

## Table look
<!-- slide layout=title_only -->
![Table](${TABLE_IMG_PATH})
`;
  const exportOut = JSON.parse(
    await runExtendedWorkflowTool({
      ...common,
      tool: "export_document",
      args: {
        format: "pptx",
        title: "Live verify deck",
        engine: "js",
        markdown: deckMd,
      },
    }),
  );
  if (!exportOut.uri?.startsWith("output/exports/") || !exportOut.uri.endsWith(".pptx")) {
    throw new Error(`unexpected pptx uri: ${exportOut.uri}`);
  }
  if (exportOut.engine !== "js") {
    throw new Error(`expected engine js for layout deck, got ${exportOut.engine}`);
  }
  if ((exportOut.imageCount ?? 0) < 3) {
    throw new Error(
      `pptx expected ≥3 embedded images (imageCount=${exportOut.imageCount}, skipped=${JSON.stringify(exportOut.imageSkipped)})`,
    );
  }
  if ((exportOut.speakerNotesCount ?? 0) < 1) {
    throw new Error(
      `pptx missing speaker notes (speakerNotesCount=${exportOut.speakerNotesCount})`,
    );
  }

  const pptxAbs = join(paths.accountFiles(accountId), exportOut.uri);
  const pptxBuf = await readFile(pptxAbs);
  const zip = await JSZip.loadAsync(pptxBuf);
  const media = Object.keys(zip.files).filter((n) => n.startsWith("ppt/media/"));
  if (media.length < 1) {
    throw new Error("pptx zip has no ppt/media/* — image embed missing");
  }
  const notesXml = Object.keys(zip.files).filter(
    (n) =>
      n.startsWith("ppt/notesSlides/") &&
      n.endsWith(".xml") &&
      !n.includes("_rels"),
  );
  if (notesXml.length < 1) {
    throw new Error("pptx zip has no ppt/notesSlides/*.xml — speaker notes missing");
  }
  // P2-O: quote attribution + comparison headers must not be mashed
  let allSlideText = "";
  const textRuns = [];
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith("ppt/slides/slide") || !name.endsWith(".xml")) continue;
    const xml = (await zip.file(name)?.async("string")) ?? "";
    allSlideText += xml;
    for (const m of xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)) {
      textRuns.push(m[1] ?? "");
    }
  }
  if (!allSlideText.includes("Build") || !allSlideText.includes("Buy")) {
    throw new Error("comparison headers Build/Buy missing from pptx slides");
  }
  if (
    textRuns.some(
      (t) => t.includes("Customers love the simplicity") && t.includes("Jane"),
    )
  ) {
    throw new Error("quote mashed attribution into quote body (same text run)");
  }
  if (!textRuns.some((t) => t.includes("Customers love the simplicity"))) {
    throw new Error("quote body missing from pptx");
  }
  if (!textRuns.some((t) => t.includes("Jane"))) {
    throw new Error("quote attribution missing from pptx");
  }
  console.log(
    `   ok → ${exportOut.uri} (engine=${exportOut.engine}, imageCount=${exportOut.imageCount}, speakerNotes=${exportOut.speakerNotesCount}, media=${media.join(",")})`,
  );

  console.log(
    "\n=== PASS: office live verify (transform → chart → diagram → table → pptx) ===",
  );
  console.log(
    JSON.stringify(
      {
        mode: realState ? "real-home" : "fixture-temp",
        accountId,
        tableUri: transformOut.uri,
        chartUri: chartOut.uri,
        diagramUri: diagramOut.uri,
        tableImgUri: tableImgOut.uri,
        pptxUri: exportOut.uri,
        pptxBytes: pptxBuf.length,
        imageCount: exportOut.imageCount,
      },
      null,
      2,
    ),
  );

  if (cleanup) {
    await rm(cleanup, { recursive: true, force: true });
  }
}

main().catch(async (err) => {
  console.error("\n=== FAIL ===");
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exitCode = 1;
});
