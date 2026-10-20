// Design §9.5b — Markdown → docx/xlsx/csv/pdf export.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DOCUMENT_EXPORT_MAX_MARKDOWN_BYTES,
  EXPORT_DOCUMENT_DIR,
  assertExportOutputPath,
  assertMarkdownSize,
  defaultExportUri,
  exportCsv,
  exportDocument,
  exportMimeType,
  isExportFormat,
  parseMarkdownBlocks,
} from "../dist/document-export.js";
import { runExtendedWorkflowTool } from "../dist/workflow-tools.js";
import { homePaths } from "../dist/home-paths.js";

const SAMPLE_MD = `# Report

Hello **world**.

| Name | Qty |
|------|-----|
| apple | 3 |
| banana | 2 |

## Notes

- first
- second
`;

test("format helpers", () => {
  assert.equal(isExportFormat("docx"), true);
  assert.equal(isExportFormat("pptx"), false);
  assert.equal(exportMimeType("pdf"), "application/pdf");
  assert.match(defaultExportUri("docx", "My Report"), new RegExp(`^${EXPORT_DOCUMENT_DIR}/my-report-[a-f0-9]+\\.docx$`));
  assert.equal(assertExportOutputPath("output/exports/a.docx"), "output/exports/a.docx");
  assert.throws(() => assertExportOutputPath("documents/a.docx"), /output\/exports/);
  assert.throws(() => assertExportOutputPath("output/exports/../x.docx"), /output\/exports/);
});

test("parseMarkdownBlocks finds table + heading", () => {
  const blocks = parseMarkdownBlocks(SAMPLE_MD);
  assert.ok(blocks.some((b) => b.kind === "heading" && b.text === "Report"));
  const table = blocks.find((b) => b.kind === "table");
  assert.ok(table && table.kind === "table");
  assert.equal(table.rows.length, 3);
  assert.equal(table.rows[0]![0], "Name");
});

test("exportCsv prefers first table", () => {
  const csv = exportCsv(parseMarkdownBlocks(SAMPLE_MD));
  assert.match(csv, /Name,Qty/);
  assert.match(csv, /apple,3/);
});

test("md → docx / xlsx / csv / pdf bytes", async () => {
  const docx = await exportDocument("docx", SAMPLE_MD, { title: "Report" });
  assert.ok(docx.length > 100);
  // ZIP/OOXML magic
  assert.equal(docx[0], 0x50);
  assert.equal(docx[1], 0x4b);

  const xlsx = await exportDocument("xlsx", SAMPLE_MD, { title: "Report" });
  assert.ok(xlsx.length > 100);
  assert.equal(xlsx[0], 0x50);
  assert.equal(xlsx[1], 0x4b);

  const csv = await exportDocument("csv", SAMPLE_MD);
  assert.match(csv.toString("utf8"), /banana,2/);

  const pdf = await exportDocument("pdf", SAMPLE_MD, { title: "Report" });
  assert.ok(pdf.length > 100);
  assert.equal(pdf.subarray(0, 4).toString("utf8"), "%PDF");
});

test("markdown size cap", () => {
  assert.throws(
    () => assertMarkdownSize("x".repeat(DOCUMENT_EXPORT_MAX_MARKDOWN_BYTES + 1)),
    /exceeds/,
  );
});

test("export_document tool writes under output/exports/", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-export-"));
  try {
    const paths = homePaths(stateDir);
    const accountId = "acct-a";
    await mkdir(paths.accountFiles(accountId), { recursive: true });
    const out = await runExtendedWorkflowTool({
      tool: "export_document",
      args: {
        format: "docx",
        markdown: SAMPLE_MD,
        title: "Budget",
      },
      skills: { listSkills: async () => [] } as never,
      channels: {} as never,
      paths,
      accountId,
    });
    const parsed = JSON.parse(out) as {
      uri: string;
      bytes: number;
      mimeType: string;
      format: string;
    };
    assert.equal(parsed.format, "docx");
    assert.ok(parsed.uri.startsWith(`${EXPORT_DOCUMENT_DIR}/`));
    assert.ok(parsed.bytes > 100);
    const abs = join(paths.accountFiles(accountId), parsed.uri);
    const buf = await readFile(abs);
    assert.equal(buf.length, parsed.bytes);
    assert.equal(buf[0], 0x50);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("export_document sourcePath + path jail", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-export-src-"));
  try {
    const paths = homePaths(stateDir);
    const accountId = "acct-a";
    const files = paths.accountFiles(accountId);
    await mkdir(join(files, "notes"), { recursive: true });
    await writeFile(join(files, "notes", "memo.md"), SAMPLE_MD, "utf8");

    const out = await runExtendedWorkflowTool({
      tool: "export_document",
      args: {
        format: "csv",
        sourcePath: "notes/memo.md",
        path: "output/exports/memo.csv",
      },
      skills: { listSkills: async () => [] } as never,
      channels: {} as never,
      paths,
      accountId,
    });
    const parsed = JSON.parse(out) as { uri: string };
    assert.equal(parsed.uri, "output/exports/memo.csv");
    const body = await readFile(join(files, parsed.uri), "utf8");
    assert.match(body, /apple/);

    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "export_document",
          args: {
            format: "docx",
            markdown: "# x",
            path: "documents/evil.docx",
          },
          skills: { listSkills: async () => [] } as never,
          channels: {} as never,
          paths,
          accountId,
        }),
      /output\/exports/,
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
