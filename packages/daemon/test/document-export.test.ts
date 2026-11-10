// Design §9.5b — Markdown → docx/xlsx/csv/pdf export (+ optional LibreOffice).

import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  exportDocumentJs,
  exportMimeType,
  isExportFormat,
  parseMarkdownBlocks,
} from "../dist/document-export.js";
import {
  __resetLibreOfficeForTests,
  probeLibreOffice,
} from "../dist/document-export-lo.js";
import { runExtendedWorkflowTool } from "../dist/workflow-tools.js";
import { homePaths } from "../dist/home-paths.js";
import { collectDoctorIssues } from "../dist/doctor/index.js";
import { defaultConfig } from "../dist/index.js";

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
  assert.equal(isExportFormat("pptx"), true);
  assert.equal(isExportFormat("md"), true);
  assert.equal(isExportFormat("html"), true);
  assert.equal(isExportFormat("rtf"), true);
  assert.equal(isExportFormat("odt"), true);
  assert.equal(isExportFormat("ods"), true);
  assert.equal(isExportFormat("epub"), true);
  assert.equal(isExportFormat("exe"), false);
  assert.equal(exportMimeType("pdf"), "application/pdf");
  assert.match(exportMimeType("pptx"), /presentationml/);
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

test("md → docx / xlsx / csv / pdf / pptx / md / html / rtf bytes", async () => {
  const docx = await exportDocumentJs("docx", SAMPLE_MD, { title: "Report" });
  assert.ok(docx.length > 100);
  // ZIP/OOXML magic
  assert.equal(docx[0], 0x50);
  assert.equal(docx[1], 0x4b);

  const xlsx = await exportDocumentJs("xlsx", SAMPLE_MD, { title: "Report" });
  assert.ok(xlsx.length > 100);
  assert.equal(xlsx[0], 0x50);
  assert.equal(xlsx[1], 0x4b);

  const csv = await exportDocumentJs("csv", SAMPLE_MD);
  assert.match(csv.toString("utf8"), /banana,2/);

  const pdf = await exportDocumentJs("pdf", SAMPLE_MD, { title: "Report" });
  assert.ok(pdf.length > 100);
  assert.equal(pdf.subarray(0, 4).toString("utf8"), "%PDF");

  // V-OFFICE-1
  const pptx = await exportDocumentJs("pptx", SAMPLE_MD, { title: "Report" });
  assert.ok(pptx.length > 100);
  assert.equal(pptx[0], 0x50);
  assert.equal(pptx[1], 0x4b);

  // V-OFFICE-2
  const md = await exportDocumentJs("md", SAMPLE_MD, { title: "Report" });
  assert.match(md.toString("utf8"), /# Report/);
  const html = await exportDocumentJs("html", SAMPLE_MD, { title: "Report" });
  assert.match(html.toString("utf8"), /<html/i);
  assert.match(html.toString("utf8"), /apple/);
  const rtf = await exportDocumentJs("rtf", SAMPLE_MD, { title: "Report" });
  assert.match(rtf.toString("utf8"), /\\rtf1/);

  // V-OFFICE-9 — ODT/ODS/EPUB (PDF already covered above)
  const odt = await exportDocumentJs("odt", SAMPLE_MD, { title: "Report" });
  assert.ok(odt.length > 100);
  assert.equal(odt[0], 0x50);
  assert.equal(odt[1], 0x4b);
  const ods = await exportDocumentJs("ods", SAMPLE_MD, { title: "Report" });
  assert.ok(ods.length > 100);
  assert.equal(ods[0], 0x50);
  const epub = await exportDocumentJs("epub", SAMPLE_MD, { title: "Report" });
  assert.ok(epub.length > 100);
  assert.equal(epub[0], 0x50);
});

test("V-OFFICE-3: xlsx multi-sheet from H2 + tables", async () => {
  const multi = `# Workbook

## Apples

| Name | Qty |
|------|-----|
| fuji | 1 |

## Bananas

| Name | Qty |
|------|-----|
| cavendish | 2 |
`;
  const xlsx = await exportDocumentJs("xlsx", multi, { title: "Fruit" });
  assert.ok(xlsx.length > 200);
  assert.equal(xlsx[0], 0x50);
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
        engine: "js",
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
      engine: string;
    };
    assert.equal(parsed.format, "docx");
    assert.equal(parsed.engine, "js");
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
        engine: "js",
      },
      skills: { listSkills: async () => [] } as never,
      channels: {} as never,
      paths,
      accountId,
    });
    const parsed = JSON.parse(out) as { uri: string; engine: string };
    assert.equal(parsed.uri, "output/exports/memo.csv");
    assert.equal(parsed.engine, "js");
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

test("V-OFFICE-10: auto falls back to js when LO missing; forced libreoffice fails", async () => {
  __resetLibreOfficeForTests();
  const env = { ...process.env, ENVOYHOME_LIBREOFFICE: "/no/such/soffice" };
  delete env.PATH; // avoid real soffice on PATH during probe of bare names — still ok via absolute env
  const auto = await exportDocument("pdf", SAMPLE_MD, {
    title: "Report",
    engine: "auto",
    env: { ENVOYHOME_LIBREOFFICE: "/no/such/soffice", PATH: "" },
  });
  assert.equal(auto.engine, "js");
  assert.equal(auto.buffer.subarray(0, 4).toString("utf8"), "%PDF");

  await assert.rejects(
    () =>
      exportDocument("pdf", SAMPLE_MD, {
        engine: "libreoffice",
        env: { ENVOYHOME_LIBREOFFICE: "/no/such/soffice", PATH: "" },
      }),
    /libreoffice_unavailable/,
  );

  const mdAlways = await exportDocument("md", SAMPLE_MD, {
    engine: "libreoffice",
    env: { ENVOYHOME_LIBREOFFICE: "/no/such/soffice", PATH: "" },
  });
  assert.equal(mdAlways.engine, "js");
  void env;
});

test("V-OFFICE-10: fake soffice convert path returns engine libreoffice", async () => {
  __resetLibreOfficeForTests();
  const binDir = await mkdtemp(join(tmpdir(), "eh-fake-lo-"));
  const fake = join(binDir, "soffice");
  // Minimal fake: on --version print LibreOffice; on --convert-to write magic output.
  const script = `#!/bin/sh
set -e
if [ "$1" = "--version" ]; then
  echo "LibreOffice 24.2.0.0 fake"
  exit 0
fi
outdir=""
convert=""
infile=""
while [ $# -gt 0 ]; do
  case "$1" in
    --outdir) outdir="$2"; shift 2 ;;
    --convert-to) convert="$2"; shift 2 ;;
    --headless|--norestore|--nolockcheck|--nodefault|--nofirststartwizard) shift ;;
    -env:UserInstallation=*) shift ;;
    *) infile="$1"; shift ;;
  esac
done
ext=$(echo "$convert" | cut -d: -f1)
base=$(basename "$infile")
stem=\${base%.*}
out="$outdir/$stem.$ext"
case "$ext" in
  pdf) printf '%%PDF-1.4 fake' > "$out" ;;
  docx|xlsx|pptx|odt|ods|epub) printf 'PK\\x03\\x04fake' > "$out" ;;
  html) printf '<html>fake</html>' > "$out" ;;
  rtf) printf '{\\\\rtf1 fake}' > "$out" ;;
  csv) printf 'a,b\\n' > "$out" ;;
  *) printf 'fake' > "$out" ;;
esac
exit 0
`;
  await writeFile(fake, script, "utf8");
  await chmod(fake, 0o755);
  try {
    // Keep a minimal PATH so the fake shell script can call basename/cut/printf.
    const loEnv = {
      ENVOYHOME_LIBREOFFICE: fake,
      PATH: "/bin:/usr/bin",
    };
    const probe = await probeLibreOffice(loEnv, { force: true });
    assert.equal(probe.available, true);
    assert.equal(probe.binaryPath, fake);

    const pdf = await exportDocument("pdf", SAMPLE_MD, {
      title: "Report",
      engine: "auto",
      env: loEnv,
    });
    assert.equal(pdf.engine, "libreoffice");
    assert.match(pdf.buffer.toString("utf8"), /%PDF/);

    const forced = await exportDocument("docx", SAMPLE_MD, {
      engine: "libreoffice",
      env: loEnv,
    });
    assert.equal(forced.engine, "libreoffice");
  } finally {
    __resetLibreOfficeForTests();
    await rm(binDir, { recursive: true, force: true });
  }
});

test("V-OFFICE-10: Doctor warns when LibreOffice missing", async () => {
  __resetLibreOfficeForTests();
  const stateDir = await mkdtemp(join(tmpdir(), "eh-doc-lo-"));
  try {
    const issues = await collectDoctorIssues(
      {
        config: defaultConfig({ stateDir }),
        accounts: { list: async () => [] } as never,
        bindings: {
          list: async () => [],
          listOwnerExclusiveViolations: async () => [],
        } as never,
        channels: { objects: { list: async () => [] } } as never,
      },
      { env: { ENVOYHOME_LIBREOFFICE: "/no/such/soffice", PATH: "" } },
    );
    const hit = issues.find((i) => i.id === "office.libreoffice_missing");
    assert.ok(hit);
    assert.equal(hit!.severity, "warn");
    assert.equal(hit!.fixable, false);
    assert.match(hit!.message, /libreoffice|LibreOffice/i);
  } finally {
    __resetLibreOfficeForTests();
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OFFICE-11: export_document JS fallback includes installHint", async () => {
  __resetLibreOfficeForTests();
  const stateDir = await mkdtemp(join(tmpdir(), "eh-export-hint-"));
  const prev = process.env.ENVOYHOME_LIBREOFFICE;
  process.env.ENVOYHOME_LIBREOFFICE = "/no/such/soffice";
  try {
    const paths = homePaths(stateDir);
    const accountId = "acct-a";
    await mkdir(paths.accountFiles(accountId), { recursive: true });
    const out = await runExtendedWorkflowTool({
      tool: "export_document",
      args: {
        format: "pdf",
        markdown: SAMPLE_MD,
        title: "Hint",
        engine: "auto",
      },
      skills: { listSkills: async () => [] } as never,
      channels: {} as never,
      paths,
      accountId,
    });
    const parsed = JSON.parse(out) as {
      engine: string;
      quality: string;
      installHint?: string;
      qualityNote?: string;
    };
    assert.equal(parsed.engine, "js");
    assert.equal(parsed.quality, "structure");
    assert.ok(parsed.installHint && parsed.installHint.length > 5);
    assert.match(String(parsed.qualityNote), /LibreOffice|print-ready|simpler layout/i);
  } finally {
    if (prev === undefined) delete process.env.ENVOYHOME_LIBREOFFICE;
    else process.env.ENVOYHOME_LIBREOFFICE = prev;
    __resetLibreOfficeForTests();
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OFFICE-11: getDocumentExportStatus missing + hint", async () => {
  __resetLibreOfficeForTests();
  const { getDocumentExportStatus, libreOfficeInstallHint } = await import(
    "../dist/document-export-lo.js"
  );
  const st = await getDocumentExportStatus(
    { ENVOYHOME_LIBREOFFICE: "/no/such/soffice" },
    { force: true, platform: "darwin" },
  );
  assert.equal(st.libreOfficeRuntime, "missing");
  assert.equal(st.libreOfficeInstallHint, libreOfficeInstallHint("darwin"));
  assert.match(st.libreOfficeInstallHint, /brew install/);
  assert.match(st.whyText, /print-ready|LibreOffice/i);
});
