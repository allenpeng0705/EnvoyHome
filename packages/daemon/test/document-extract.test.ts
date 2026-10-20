// Design §9.5a — anydoc / native text extract (Adapt EnvoyMesh vault fixtures).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  DOCUMENT_TEXT_EXTRACTOR_ID,
  EXTRACT_DOCUMENT_DIR,
  assertExtractOutputPath,
  defaultExtractUri,
  extractDocumentText,
  extractSidecarUri,
  isAnydocExtension,
  isExtractableExtension,
  isNativeTextExtension,
} from "../dist/document-extract.js";
import { runExtendedWorkflowTool } from "../dist/workflow-tools.js";
import { homePaths } from "../dist/home-paths.js";

async function writeMinimalDocx(outputPath: string, text: string): Promise<void> {
  const workDir = join(tmpdir(), `eh-docx-${randomUUID()}`);
  await mkdir(join(workDir, "word", "_rels"), { recursive: true });
  await mkdir(join(workDir, "_rels"), { recursive: true });
  await writeFile(
    join(workDir, "[Content_Types].xml"),
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  await writeFile(
    join(workDir, "_rels", ".rels"),
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  await writeFile(
    join(workDir, "word", "document.xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  execSync(`cd "${workDir}" && zip -qr "${outputPath}" .`);
  await rm(workDir, { recursive: true, force: true });
}

test("extension helpers — full anydoc set", () => {
  assert.equal(DOCUMENT_TEXT_EXTRACTOR_ID, "anydoc-v1");
  for (const ext of [
    ".doc",
    ".docx",
    ".docm",
    ".ppt",
    ".pps",
    ".pot",
    ".pptx",
    ".pptm",
    ".ppsx",
    ".ppsm",
    ".xls",
    ".xlsx",
    ".xlsm",
    ".xlsb",
    ".odt",
    ".ods",
    ".odp",
    ".rtf",
    ".epub",
    ".csv",
    ".pdf",
  ]) {
    assert.equal(isAnydocExtension(ext), true, ext);
    assert.equal(isExtractableExtension(ext), true, ext);
  }
  assert.equal(isNativeTextExtension(".md"), true);
  assert.equal(isNativeTextExtension(".csv"), true); // UTF-8 fallback
  assert.equal(isExtractableExtension(".png"), false);
  assert.equal(extractSidecarUri("uploads/a-report.docx"), "uploads/a-report.docx.extract.md");
});

test("native markdown passthrough", async () => {
  const md = "# Hello\n\nWorld";
  const out = await extractDocumentText(".md", Buffer.from(md, "utf8"));
  assert.equal(out, md);
});

test("garbage office bytes → null", async () => {
  const out = await extractDocumentText(".docx", Buffer.from("not-a-docx"));
  assert.equal(out, null);
});

test("minimal docx → GFM via anydoc", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eh-docx-fx-"));
  try {
    const path = join(dir, "note.docx");
    await writeMinimalDocx(path, "EnvoyHome anydoc extract");
    const raw = await readFile(path);
    const out = await extractDocumentText(".docx", raw);
    assert.ok(out, "anydoc should return GFM");
    assert.match(out, /EnvoyHome anydoc extract/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("csv → GFM via anydoc (table)", async () => {
  const csv = "name,qty\napple,3\nbanana,2\n";
  const out = await extractDocumentText(".csv", Buffer.from(csv, "utf8"));
  assert.ok(out, "anydoc/csv should return text");
  assert.match(out, /apple/i);
  assert.match(out, /banana/i);
});

test("extract path helpers", () => {
  assert.match(defaultExtractUri("documents/Q1 Report.docx"), new RegExp(`^${EXTRACT_DOCUMENT_DIR}/q1-report-[a-f0-9]+\\.md$`));
  assert.equal(assertExtractOutputPath("output/extracts/a.md"), "output/extracts/a.md");
  assert.throws(() => assertExtractOutputPath("documents/a.md"), /output\/extracts/);
  assert.throws(() => assertExtractOutputPath("output/extracts/a.txt"), /output\/extracts/);
});

test("extract_document tool writes under output/extracts/", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-extract-tool-"));
  try {
    const paths = homePaths(stateDir);
    const accountId = "acct-a";
    const files = paths.accountFiles(accountId);
    await mkdir(join(files, "documents"), { recursive: true });
    const docxPath = join(files, "documents", "note.docx");
    await writeMinimalDocx(docxPath, "Tool extract hello");

    const out = await runExtendedWorkflowTool({
      tool: "extract_document",
      args: { sourcePath: "documents/note.docx" },
      skills: { listSkills: async () => [] } as never,
      channels: {} as never,
      paths,
      accountId,
    });
    const parsed = JSON.parse(out) as {
      uri: string;
      extractChars: number;
      extractor: string;
      sourcePath: string;
    };
    assert.equal(parsed.extractor, "anydoc-v1");
    assert.equal(parsed.sourcePath, "documents/note.docx");
    assert.ok(parsed.uri.startsWith(`${EXTRACT_DOCUMENT_DIR}/`));
    assert.ok(parsed.extractChars > 0);
    assert.match(String((parsed as { text?: string }).text ?? ""), /Tool extract hello/);
    const body = await readFile(join(files, parsed.uri), "utf8");
    assert.match(body, /Tool extract hello/);

    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "extract_document",
          args: { sourcePath: "documents/note.docx", path: "uploads/evil.md" },
          skills: { listSkills: async () => [] } as never,
          channels: {} as never,
          paths,
          accountId,
        }),
      /output\/extracts/,
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
