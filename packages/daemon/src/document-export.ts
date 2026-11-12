/**
 * Markdown → Office-ish export (Design §9.5b / §9.5j / §9.5k / P2-K7 / P2-L).
 * Pure JS writers always available; optional local LibreOffice for print quality.
 */

import { randomBytes } from "node:crypto";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import PDFDocument from "pdfkit";
import {
  buildPptxFromBlocks,
  markdownNeedsJsPptx,
  parseImageLine,
  parseSlideDirectiveLine,
  parseSlideNotesLine,
  isAttributionLine,
  type OfficeTheme,
  type PptxExportNotes,
  type PptxMdBlock,
} from "./office-pptx.js";

export {
  SLIDE_LAYOUTS,
  isSlideLayout,
  markdownNeedsJsPptx,
  parseSlideNotesLine,
  isAttributionLine,
  splitQuoteContent,
  resolveComparisonHeaders,
  resolveOfficeTheme,
  VISUAL,
  DEFAULT_OFFICE_THEME,
  DARK_OFFICE_THEME,
  loadOfficeThemeFromDir,
  detectMasterPptxNote,
  type SlideLayout,
  type OfficeTheme,
  type PptxExportNotes,
} from "./office-pptx.js";

export type ExportFormat =
  | "docx"
  | "xlsx"
  | "csv"
  | "pdf"
  | "pptx"
  | "md"
  | "html"
  | "rtf"
  | "odt"
  | "ods"
  | "epub";

export const EXPORT_FORMATS = [
  "docx",
  "xlsx",
  "csv",
  "pdf",
  "pptx",
  "md",
  "html",
  "rtf",
  "odt",
  "ods",
  "epub",
] as const;

/** Sandbox-relative directory for exports (under account files/). */
export const EXPORT_DOCUMENT_DIR = "output/exports";

export const DOCUMENT_EXPORT_MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;
export const DOCUMENT_EXPORT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === "string" && (EXPORT_FORMATS as readonly string[]).includes(value);
}

export function exportExtension(format: ExportFormat): string {
  return `.${format}`;
}

export function exportMimeType(format: ExportFormat): string {
  switch (format) {
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "csv":
      return "text/csv; charset=utf-8";
    case "pdf":
      return "application/pdf";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "md":
      return "text/markdown; charset=utf-8";
    case "html":
      return "text/html; charset=utf-8";
    case "rtf":
      return "application/rtf";
    case "odt":
      return "application/vnd.oasis.opendocument.text";
    case "ods":
      return "application/vnd.oasis.opendocument.spreadsheet";
    case "epub":
      return "application/epub+zip";
  }
}

export function defaultExportUri(format: ExportFormat, title?: string): string {
  const stem = sanitizeStem(title) || "export";
  const id = randomBytes(3).toString("hex");
  return `${EXPORT_DOCUMENT_DIR}/${stem}-${id}${exportExtension(format)}`;
}

/** Refuse paths outside output/exports/. */
export function assertExportOutputPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (
    !normalized.startsWith(`${EXPORT_DOCUMENT_DIR}/`) ||
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(normalized)
  ) {
    throw new Error(
      `envoyhome.bad_params: export path must be under ${EXPORT_DOCUMENT_DIR}/`,
    );
  }
  return normalized;
}

export function assertMarkdownSize(markdown: string): void {
  const bytes = Buffer.byteLength(markdown, "utf8");
  if (bytes > DOCUMENT_EXPORT_MAX_MARKDOWN_BYTES) {
    throw new Error(
      `envoyhome.bad_params: markdown exceeds ${DOCUMENT_EXPORT_MAX_MARKDOWN_BYTES} bytes`,
    );
  }
}

export function assertOutputSize(buf: Buffer): void {
  if (buf.length > DOCUMENT_EXPORT_MAX_OUTPUT_BYTES) {
    throw new Error(
      `envoyhome.bad_params: export exceeds ${DOCUMENT_EXPORT_MAX_OUTPUT_BYTES} bytes`,
    );
  }
}

export type ExportEnginePreference = "auto" | "js" | "libreoffice";
export type ExportEngineUsed = "js" | "libreoffice";

export interface ExportDocumentResult {
  buffer: Buffer;
  engine: ExportEngineUsed;
  /** Additive §9.5k pptx notes (layouts / images / templates). */
  pptxNotes?: PptxExportNotes;
}

export interface ExportDocumentOpts {
  title?: string;
  engine?: ExportEnginePreference;
  env?: NodeJS.ProcessEnv;
  theme?: OfficeTheme;
  resolveImage?: (relPath: string) => Promise<Buffer | null>;
  /** When set, surfaces in pptxNotes.templateNote if theme applied. */
  templateId?: string;
  templateNote?: string;
  /** When set, surfaces in pptxNotes.masterNote (P2-N; no OOXML merge). */
  masterNote?: string;
}

export function isExportEnginePreference(
  value: unknown,
): value is ExportEnginePreference {
  return value === "auto" || value === "js" || value === "libreoffice";
}

/** Resolve tool/env engine preference (Design §9.5b). */
export function resolveExportEnginePreference(
  explicit: unknown,
  env: NodeJS.ProcessEnv = process.env,
): ExportEnginePreference {
  if (isExportEnginePreference(explicit)) return explicit;
  const fromEnv = (env.ENVOYHOME_EXPORT_ENGINE ?? "").trim().toLowerCase();
  if (isExportEnginePreference(fromEnv)) return fromEnv;
  return "auto";
}

type MdBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; rows: string[][] }
  | { kind: "code"; text: string }
  | { kind: "slide_directive"; layout: string }
  | { kind: "slide_notes"; text: string }
  | { kind: "image"; alt: string; path: string };

export interface ExportDocumentJsResult {
  buffer: Buffer;
  pptxNotes?: PptxExportNotes;
}

/** Pure-JS writers only (always available). */
export async function exportDocumentJs(
  format: ExportFormat,
  markdown: string,
  opts?: {
    title?: string;
    theme?: OfficeTheme;
    resolveImage?: (relPath: string) => Promise<Buffer | null>;
    templateNote?: string;
    masterNote?: string;
  },
): Promise<Buffer> {
  const { buffer } = await exportDocumentJsDetailed(format, markdown, opts);
  return buffer;
}

/** Like exportDocumentJs but returns pptx notes when format is pptx. */
export async function exportDocumentJsDetailed(
  format: ExportFormat,
  markdown: string,
  opts?: {
    title?: string;
    theme?: OfficeTheme;
    resolveImage?: (relPath: string) => Promise<Buffer | null>;
    templateNote?: string;
    masterNote?: string;
  },
): Promise<ExportDocumentJsResult> {
  assertMarkdownSize(markdown);
  const title = opts?.title?.trim() || undefined;
  const blocks = parseMarkdownBlocks(markdown);
  let buf: Buffer;
  let pptxNotes: PptxExportNotes | undefined;
  switch (format) {
    case "docx":
      buf = await exportDocx(blocks, title);
      break;
    case "xlsx":
      buf = await exportXlsx(blocks, title);
      break;
    case "csv":
      buf = Buffer.from(exportCsv(blocks), "utf8");
      break;
    case "pdf":
      buf = await exportPdf(blocks, title);
      break;
    case "pptx": {
      const built = await buildPptxFromBlocks(blocks as PptxMdBlock[], {
        ...(title ? { title } : {}),
        ...(opts?.theme ? { theme: opts.theme } : {}),
        ...(opts?.resolveImage ? { resolveImage: opts.resolveImage } : {}),
        ...(opts?.masterNote ? { masterNote: opts.masterNote } : {}),
      });
      buf = built.buffer;
      pptxNotes = built.notes;
      if (opts?.templateNote) pptxNotes.templateNote = opts.templateNote;
      if (opts?.masterNote) pptxNotes.masterNote = opts.masterNote;
      break;
    }
    case "md":
      buf = Buffer.from(exportMarkdown(markdown, title), "utf8");
      break;
    case "html":
      buf = Buffer.from(exportHtml(blocks, title), "utf8");
      break;
    case "rtf":
      buf = Buffer.from(exportRtf(blocks, title), "utf8");
      break;
    case "odt":
      buf = await exportOdt(blocks, title);
      break;
    case "ods":
      buf = await exportOds(blocks, title);
      break;
    case "epub":
      buf = await exportEpub(blocks, title);
      break;
  }
  assertOutputSize(buf);
  return pptxNotes ? { buffer: buf, pptxNotes } : { buffer: buf };
}

/**
 * Convert Markdown to the requested format.
 * `engine: "auto"` prefers LibreOffice when installed (non-md); falls back to JS.
 * Forced `libreoffice` fails closed when LO is missing or convert fails.
 */
export async function exportDocument(
  format: ExportFormat,
  markdown: string,
  opts?: ExportDocumentOpts,
): Promise<ExportDocumentResult> {
  const preference = opts?.engine ?? "auto";
  const env = opts?.env ?? process.env;
  const title = opts?.title?.trim() || undefined;
  const jsOpts = {
    ...(title ? { title } : {}),
    ...(opts?.theme ? { theme: opts.theme } : {}),
    ...(opts?.resolveImage ? { resolveImage: opts.resolveImage } : {}),
    ...(opts?.templateNote ? { templateNote: opts.templateNote } : {}),
    ...(opts?.masterNote ? { masterNote: opts.masterNote } : {}),
  };

  // §9.5k: layout/image decks prefer JS under auto (LO HTML flattens slides).
  const forceJsPptx =
    format === "pptx" && preference === "auto" && markdownNeedsJsPptx(markdown);

  if (format === "md" || preference === "js" || forceJsPptx) {
    const detailed = await exportDocumentJsDetailed(format, markdown, jsOpts);
    return {
      buffer: detailed.buffer,
      engine: "js",
      ...(detailed.pptxNotes ? { pptxNotes: detailed.pptxNotes } : {}),
    };
  }

  const { probeLibreOffice, convertWithLibreOffice, intermediateKindForFormat } =
    await import("./document-export-lo.js");
  const probe = await probeLibreOffice(env);

  if (!probe.available || !probe.binaryPath) {
    if (preference === "libreoffice") {
      throw new Error(
        "envoyhome.libreoffice_unavailable: LibreOffice not installed (set ENVOYHOME_LIBREOFFICE or install soffice)",
      );
    }
    const detailed = await exportDocumentJsDetailed(format, markdown, jsOpts);
    return {
      buffer: detailed.buffer,
      engine: "js",
      ...(detailed.pptxNotes ? { pptxNotes: detailed.pptxNotes } : {}),
    };
  }

  try {
    assertMarkdownSize(markdown);
    const blocks = parseMarkdownBlocks(markdown);
    const kind = intermediateKindForFormat(format);
    let intermediate: Buffer;
    let intermediateExt: ".html" | ".ods";
    if (kind === "ods") {
      intermediate = await exportOds(blocks, title);
      intermediateExt = ".ods";
    } else {
      intermediate = Buffer.from(exportHtml(blocks, title), "utf8");
      intermediateExt = ".html";
    }
    const buffer = await convertWithLibreOffice({
      format,
      intermediate,
      intermediateExt,
      binaryPath: probe.binaryPath,
      env,
    });
    assertOutputSize(buffer);
    return { buffer, engine: "libreoffice" };
  } catch (err) {
    if (preference === "libreoffice") throw err;
    // auto: honest JS fallback on LO failure
    const detailed = await exportDocumentJsDetailed(format, markdown, jsOpts);
    return {
      buffer: detailed.buffer,
      engine: "js",
      ...(detailed.pptxNotes ? { pptxNotes: detailed.pptxNotes } : {}),
    };
  }
}

function sanitizeStem(title: string | undefined): string {
  if (!title) return "";
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Short title-like lines under comparison/two_column stay separate paras (P2-O). */
function shouldSplitShortHeaderLine(cur: string, next: string): boolean {
  if (!(cur.length > 0 && cur.length <= 40 && next.length <= 40)) return false;
  if (/[.!?。！？]$/.test(cur) || /[.!?。！？]$/.test(next)) return false;
  // English sentence continuation → keep joining.
  if (/^[a-z]/.test(next) || /^[,;:]/.test(next)) return false;
  return true;
}

/** Lightweight GFM block parse — headings, paragraphs, lists, tables, fenced code. */
export function parseMarkdownBlocks(markdown: string): MdBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;
  /** Last `<!-- slide layout=… -->` — drives comparison header split (P2-O). */
  let lastSlideLayout: string | undefined;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      i++;
      const code: string[] = [];
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        code.push(lines[i] ?? "");
        i++;
      }
      if (i < lines.length) i++; // closing fence
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    const slideDir = parseSlideDirectiveLine(line);
    if (slideDir) {
      lastSlideLayout = slideDir;
      blocks.push({ kind: "slide_directive", layout: slideDir });
      i++;
      continue;
    }
    const slideNotes = parseSlideNotesLine(line);
    if (slideNotes !== undefined) {
      blocks.push({ kind: "slide_notes", text: slideNotes });
      i++;
      continue;
    }
    const image = parseImageLine(line);
    if (image) {
      blocks.push({ kind: "image", alt: image.alt, path: image.path });
      i++;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = Math.min(6, heading[1]!.length) as 1 | 2 | 3 | 4 | 5 | 6;
      // New slide: clear layout unless a directive (and optional notes) already
      // queued for this slide — `<!-- slide layout=comparison -->` may precede H2.
      if (level <= 2) {
        let keepLayout: string | undefined;
        for (let j = blocks.length - 1; j >= 0; j--) {
          const prev = blocks[j]!;
          if (prev.kind === "slide_notes") continue;
          if (prev.kind === "slide_directive") keepLayout = prev.layout;
          break;
        }
        lastSlideLayout = keepLayout;
      }
      blocks.push({ kind: "heading", level, text: stripInline(heading[2]!) });
      i++;
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1] ?? "")) {
      const rows: string[][] = [splitTableRow(line)];
      i += 2; // skip header + separator
      while (i < lines.length && isTableRow(lines[i] ?? "")) {
        rows.push(splitTableRow(lines[i]!));
        i++;
      }
      blocks.push({ kind: "table", rows });
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*([-*+]|\d+\.)\s+/, "").trim());
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    // Attribution lines stay their own paragraph (P2-O quote fidelity).
    if (isAttributionLine(line)) {
      blocks.push({ kind: "paragraph", text: line.trim() });
      i++;
      continue;
    }
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() &&
      !/^(#{1,6})\s+/.test(lines[i] ?? "") &&
      !(lines[i] ?? "").startsWith("```") &&
      !/^\s*([-*+]|\d+\.)\s+/.test(lines[i] ?? "") &&
      !parseSlideDirectiveLine(lines[i] ?? "") &&
      parseSlideNotesLine(lines[i] ?? "") === undefined &&
      !parseImageLine(lines[i] ?? "") &&
      !isAttributionLine(lines[i] ?? "") &&
      !(isTableRow(lines[i] ?? "") && i + 1 < lines.length && isTableSep(lines[i + 1] ?? ""))
    ) {
      // Short one-liner headers (comparison): keep as separate paras (P2-O).
      // Under comparison/two_column, allow multi-word titles ("Option A").
      // Elsewhere, only split single-token lines (Build/Buy) so prose stays joined.
      const next = (lines[i] ?? "").trim();
      const cur = (para[para.length - 1] ?? "").trim();
      const comparisonish =
        lastSlideLayout === "comparison" || lastSlideLayout === "two_column";
      if (
        shouldSplitShortHeaderLine(cur, next) &&
        (comparisonish || !cur.includes(" "))
      ) {
        break;
      }
      para.push(lines[i] ?? "");
      i++;
    }
    // Keep light inline markers for docx/html emphasis (V-OFFICE-3).
    blocks.push({ kind: "paragraph", text: para.join(" ").trim() });
  }
  return blocks;
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.includes("|");
}

function isTableSep(line: string): boolean {
  const t = line.trim();
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(t);
}

function splitTableRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => stripInline(c.trim()));
}

function stripInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

const HEADING_MAP = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
} as const;

async function exportDocx(blocks: MdBlock[], title?: string): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  if (title) {
    children.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.LEFT,
      }),
    );
  }
  for (const b of blocks) {
    if (b.kind === "slide_directive") {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `[slide layout=${b.layout}]`,
              italics: true,
              color: "666666",
            }),
          ],
        }),
      );
      continue;
    }
    if (b.kind === "slide_notes") {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `[slide notes: ${b.text}]`,
              italics: true,
              color: "666666",
            }),
          ],
        }),
      );
      continue;
    }
    if (b.kind === "image") {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `[image: ${b.path}${b.alt ? ` — ${b.alt}` : ""}]`,
              italics: true,
            }),
          ],
        }),
      );
      continue;
    }
    if (b.kind === "heading") {
      children.push(
        new Paragraph({
          text: b.text,
          heading: HEADING_MAP[b.level],
        }),
      );
    } else if (b.kind === "paragraph") {
      children.push(new Paragraph({ children: inlineRuns(b.text) }));
    } else if (b.kind === "code") {
      for (const line of b.text.split("\n")) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line || " ", font: "Courier New", size: 18 })],
          }),
        );
      }
    } else if (b.kind === "list") {
      b.items.forEach((item, idx) => {
        const prefix = b.ordered ? `${idx + 1}. ` : "• ";
        children.push(
          new Paragraph({
            children: [new TextRun(prefix), ...inlineRuns(item)],
          }),
        );
      });
    } else if (b.kind === "table") {
      const colCount = Math.max(...b.rows.map((r) => r.length), 1);
      const rows = b.rows.map(
        (row) =>
          new TableRow({
            children: Array.from({ length: colCount }, (_, ci) => {
              const cellText = row[ci] ?? "";
              return new TableCell({
                children: [new Paragraph({ children: [new TextRun(cellText)] })],
                width: { size: Math.floor(9000 / colCount), type: WidthType.DXA },
              });
            }),
          }),
      );
      children.push(
        new Table({
          rows,
          width: { size: 9000, type: WidthType.DXA },
        }),
      );
    }
  }
  if (children.length === 0) {
    children.push(new Paragraph({ children: [new TextRun("")] }));
  }
  const doc = new Document({
    sections: [{ children }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

async function exportXlsx(blocks: MdBlock[], title?: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EnvoyHome";
  const sheets: { name: string; rows: string[][] }[] = [];
  let currentName = title?.slice(0, 31) || "Sheet1";
  let pendingRows: string[][] = [];

  const flush = () => {
    if (pendingRows.length === 0) return;
    sheets.push({ name: uniqueSheetName(sheets, currentName), rows: pendingRows });
    pendingRows = [];
  };

  for (const b of blocks) {
    if (b.kind === "heading" && b.level <= 2) {
      flush();
      currentName = b.text.slice(0, 31) || currentName;
    } else if (b.kind === "table") {
      if (pendingRows.length > 0) flush();
      pendingRows = b.rows.map((r) => [...r]);
      flush();
    } else if (b.kind === "paragraph" || b.kind === "heading") {
      pendingRows.push([
        b.kind === "heading" ? b.text : stripInline(b.text),
      ]);
    } else if (b.kind === "list") {
      for (const item of b.items) pendingRows.push([stripInline(item)]);
    } else if (b.kind === "code") {
      for (const line of b.text.split("\n")) pendingRows.push([line]);
    }
  }
  flush();
  if (sheets.length === 0) {
    sheets.push({ name: "Sheet1", rows: [[""]] });
  }
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    for (const row of sheet.rows) {
      ws.addRow(row);
    }
  }
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}

function uniqueSheetName(
  existing: { name: string }[],
  desired: string,
): string {
  let name = desired.replace(/[\\/*?:[\]]/g, "_").slice(0, 31) || "Sheet1";
  const taken = new Set(existing.map((s) => s.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; n < 100; n++) {
    const suffix = ` (${n})`;
    const base = name.slice(0, Math.max(1, 31 - suffix.length));
    const candidate = `${base}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${name.slice(0, 28)}_${randomBytes(1).toString("hex")}`;
}

export function exportCsv(blocks: MdBlock[]): string {
  const table = blocks.find((b): b is Extract<MdBlock, { kind: "table" }> => b.kind === "table");
  if (table) {
    return table.rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
  }
  const lines: string[] = [];
  for (const b of blocks) {
    if (b.kind === "paragraph" || b.kind === "heading") lines.push(csvEscape(b.text));
    else if (b.kind === "list") for (const item of b.items) lines.push(csvEscape(item));
    else if (b.kind === "code") {
      for (const line of b.text.split("\n")) lines.push(csvEscape(line));
    }
  }
  return (lines.length ? lines.join("\n") : "") + (lines.length ? "\n" : "");
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Preserve light **bold** / *italic* in docx runs (structure fidelity). */
function inlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|[^*`]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const part = m[1]!;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      runs.push(new TextRun({ text: part.slice(1, -1), italics: true }));
    } else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      runs.push(new TextRun({ text: part.slice(1, -1), font: "Courier New" }));
    } else if (part) {
      runs.push(new TextRun(part));
    }
  }
  return runs.length ? runs : [new TextRun("")];
}

function exportMarkdown(markdown: string, title?: string): string {
  const body = markdown.replace(/\r\n/g, "\n").trim();
  if (title && !body.startsWith("# ")) {
    return `# ${title}\n\n${body}\n`;
  }
  return body.endsWith("\n") ? body : `${body}\n`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Light GFM inline → HTML (bold/italic/code only). */
function inlineHtml(text: string): string {
  const parts: string[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|[^*`]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const part = m[1]!;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      parts.push(`<strong>${escapeHtml(part.slice(2, -2))}</strong>`);
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      parts.push(`<em>${escapeHtml(part.slice(1, -1))}</em>`);
    } else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      parts.push(`<code>${escapeHtml(part.slice(1, -1))}</code>`);
    } else if (part) {
      parts.push(escapeHtml(part));
    }
  }
  return parts.join("") || escapeHtml(text);
}

function exportHtml(blocks: MdBlock[], title?: string): string {
  const parts: string[] = [
    "<!DOCTYPE html>",
    '<html lang="en"><head><meta charset="utf-8"/>',
    `<title>${escapeHtml(title || "Export")}</title>`,
    "<style>body{font-family:system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;line-height:1.5}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.35rem .5rem}pre{background:#f4f4f4;padding:.75rem;overflow:auto}</style>",
    "</head><body>",
  ];
  if (title) parts.push(`<h1>${escapeHtml(title)}</h1>`);
  for (const b of blocks) {
    if (b.kind === "slide_directive") {
      parts.push(`<!-- slide layout=${escapeHtml(b.layout)} -->`);
      continue;
    }
    if (b.kind === "slide_notes") {
      parts.push(`<!-- slide notes: ${escapeHtml(b.text)} -->`);
      continue;
    }
    if (b.kind === "image") {
      parts.push(
        `<p><em>[image: ${escapeHtml(b.path)}${b.alt ? ` — ${escapeHtml(b.alt)}` : ""}]</em></p>`,
      );
      continue;
    }
    if (b.kind === "heading") {
      parts.push(`<h${b.level}>${escapeHtml(b.text)}</h${b.level}>`);
    } else if (b.kind === "paragraph") {
      parts.push(`<p>${inlineHtml(b.text)}</p>`);
    } else if (b.kind === "code") {
      parts.push(`<pre><code>${escapeHtml(b.text)}</code></pre>`);
    } else if (b.kind === "list") {
      const tag = b.ordered ? "ol" : "ul";
      parts.push(
        `<${tag}>${b.items.map((i) => `<li>${inlineHtml(i)}</li>`).join("")}</${tag}>`,
      );
    } else if (b.kind === "table") {
      const [head, ...rest] = b.rows;
      parts.push("<table>");
      if (head) {
        parts.push(
          `<thead><tr>${head.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>`,
        );
      }
      parts.push("<tbody>");
      for (const row of rest) {
        parts.push(`<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`);
      }
      parts.push("</tbody></table>");
    }
  }
  parts.push("</body></html>\n");
  return parts.join("\n");
}

function rtfEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\line ");
}

function exportRtf(blocks: MdBlock[], title?: string): string {
  const body: string[] = [String.raw`{\rtf1\ansi\deff0`, String.raw`{\fonttbl{\f0 Times New Roman;}}`, "\\f0\\fs22 "];
  if (title) body.push(`\\b ${rtfEscape(title)}\\b0\\par\\par `);
  for (const b of blocks) {
    if (b.kind === "heading") {
      body.push(`\\b ${rtfEscape(b.text)}\\b0\\par `);
    } else if (b.kind === "paragraph") {
      body.push(`${rtfEscape(b.text)}\\par `);
    } else if (b.kind === "code") {
      body.push(`\\f1 ${rtfEscape(b.text)}\\f0\\par `);
    } else if (b.kind === "list") {
      b.items.forEach((item, idx) => {
        const bullet = b.ordered ? `${idx + 1}. ` : "\\bullet ";
        body.push(`${bullet}${rtfEscape(item)}\\par `);
      });
    } else if (b.kind === "table") {
      for (const row of b.rows) {
        body.push(`${rtfEscape(row.join(" | "))}\\par `);
      }
    }
  }
  body.push("}");
  return body.join("");
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Minimal ODF package: mimetype (STORE) + manifest + content.xml. */
async function zipOdfPackage(input: {
  mimetype: string;
  contentXml: string;
  rootPath: string;
}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", input.mimetype, { compression: "STORE" });
  zip.file(
    "META-INF/manifest.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
  <manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${xmlEscape(input.mimetype)}"/>
  <manifest:file-entry manifest:full-path="${xmlEscape(input.rootPath)}" manifest:media-type="text/xml"/>
</manifest:manifest>
`,
  );
  zip.file(input.rootPath, input.contentXml);
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return Buffer.from(out);
}

function odtBodyXml(blocks: MdBlock[], title?: string): string {
  const parts: string[] = [];
  if (title) {
    parts.push(`<text:h text:style-name="Heading_20_1" text:outline-level="1">${xmlEscape(title)}</text:h>`);
  }
  for (const b of blocks) {
    if (b.kind === "heading") {
      parts.push(
        `<text:h text:style-name="Heading_20_${b.level}" text:outline-level="${b.level}">${xmlEscape(stripInline(b.text))}</text:h>`,
      );
    } else if (b.kind === "paragraph") {
      parts.push(`<text:p>${xmlEscape(stripInline(b.text))}</text:p>`);
    } else if (b.kind === "code") {
      for (const line of b.text.split("\n")) {
        parts.push(`<text:p text:style-name="Preformatted_20_Text">${xmlEscape(line || " ")}</text:p>`);
      }
    } else if (b.kind === "list") {
      const tag = b.ordered ? "text:list" : "text:list";
      parts.push(`<${tag}>`);
      for (const item of b.items) {
        parts.push(
          `<text:list-item><text:p>${xmlEscape(stripInline(item))}</text:p></text:list-item>`,
        );
      }
      parts.push(`</${tag}>`);
    } else if (b.kind === "table") {
      const cols = Math.max(...b.rows.map((r) => r.length), 1);
      parts.push(`<table:table table:name="Table1">`);
      parts.push(
        Array.from({ length: cols }, () => `<table:table-column/>`).join(""),
      );
      for (const row of b.rows) {
        parts.push("<table:table-row>");
        for (let i = 0; i < cols; i++) {
          parts.push(
            `<table:table-cell office:value-type="string"><text:p>${xmlEscape(row[i] ?? "")}</text:p></table:table-cell>`,
          );
        }
        parts.push("</table:table-row>");
      }
      parts.push("</table:table>");
    }
  }
  if (!parts.length) parts.push("<text:p/>");
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  office:version="1.3">
  <office:body><office:text>
${parts.join("\n")}
  </office:text></office:body>
</office:document-content>
`;
}

async function exportOdt(blocks: MdBlock[], title?: string): Promise<Buffer> {
  return zipOdfPackage({
    mimetype: "application/vnd.oasis.opendocument.text",
    rootPath: "content.xml",
    contentXml: odtBodyXml(blocks, title),
  });
}

function odsSheetsFromBlocks(
  blocks: MdBlock[],
  title?: string,
): { name: string; rows: string[][] }[] {
  const sheets: { name: string; rows: string[][] }[] = [];
  let currentName = title?.slice(0, 31) || "Sheet1";
  let pending: string[][] = [];
  const flush = () => {
    if (!pending.length) return;
    sheets.push({ name: uniqueSheetName(sheets, currentName), rows: pending });
    pending = [];
  };
  for (const b of blocks) {
    if (b.kind === "heading" && b.level <= 2) {
      flush();
      currentName = stripInline(b.text).slice(0, 31) || currentName;
    } else if (b.kind === "table") {
      if (pending.length) flush();
      pending = b.rows.map((r) => [...r]);
      flush();
    } else if (b.kind === "paragraph" || b.kind === "heading") {
      pending.push([stripInline(b.text)]);
    } else if (b.kind === "list") {
      for (const item of b.items) pending.push([stripInline(item)]);
    } else if (b.kind === "code") {
      for (const line of b.text.split("\n")) pending.push([line]);
    }
  }
  flush();
  if (!sheets.length) sheets.push({ name: "Sheet1", rows: [[""]] });
  return sheets;
}

function odsBodyXml(blocks: MdBlock[], title?: string): string {
  const sheets = odsSheetsFromBlocks(blocks, title);
  const tableXml = sheets
    .map((sheet) => {
      const cols = Math.max(...sheet.rows.map((r) => r.length), 1);
      const rows = sheet.rows
        .map((row) => {
          const cells = Array.from({ length: cols }, (_, i) => {
            const v = row[i] ?? "";
            return `<table:table-cell office:value-type="string"><text:p>${xmlEscape(v)}</text:p></table:table-cell>`;
          }).join("");
          return `<table:table-row>${cells}</table:table-row>`;
        })
        .join("\n");
      return `<table:table table:name="${xmlEscape(sheet.name)}">
${Array.from({ length: cols }, () => "<table:table-column/>").join("")}
${rows}
</table:table>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  office:version="1.3">
  <office:body><office:spreadsheet>
${tableXml}
  </office:spreadsheet></office:body>
</office:document-content>
`;
}

async function exportOds(blocks: MdBlock[], title?: string): Promise<Buffer> {
  return zipOdfPackage({
    mimetype: "application/vnd.oasis.opendocument.spreadsheet",
    rootPath: "content.xml",
    contentXml: odsBodyXml(blocks, title),
  });
}

async function exportEpub(blocks: MdBlock[], title?: string): Promise<Buffer> {
  const docTitle = title || "Export";
  const htmlBody = exportHtml(blocks, docTitle);
  // Strip doctype/html wrapper — EPUB wants XHTML fragment in a full XHTML doc.
  const inner = htmlBody
    .replace(/^[\s\S]*<body>/i, "")
    .replace(/<\/body>[\s\S]*$/i, "")
    .trim();
  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${xmlEscape(docTitle)}</title>
  <style type="text/css">body{font-family:serif;line-height:1.5;max-width:40em;margin:1em auto;padding:0 1em}table{border-collapse:collapse}td,th{border:1px solid #999;padding:.25em .4em}pre{background:#f4f4f4;padding:.75em;overflow:auto}</style>
</head>
<body>
${inner}
</body>
</html>
`;
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${xmlEscape(docTitle)}</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="bookid">envoyhome-${randomBytes(4).toString("hex")}</dc:identifier>
    <dc:creator>EnvoyHome</dc:creator>
  </metadata>
  <manifest>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter1"/>
  </spine>
</package>
`,
  );
  zip.file(
    "OEBPS/toc.ncx",
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="envoyhome"/>
  </head>
  <docTitle><text>${xmlEscape(docTitle)}</text></docTitle>
  <navMap>
    <navPoint id="nav1" playOrder="1">
      <navLabel><text>${xmlEscape(docTitle)}</text></navLabel>
      <content src="chapter1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>
`,
  );
  zip.file("OEBPS/chapter1.xhtml", xhtml);
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return Buffer.from(out);
}

async function exportPdf(blocks: MdBlock[], title?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (title) {
      doc.fontSize(18).font("Helvetica-Bold").text(title, { paragraphGap: 12 });
      doc.moveDown(0.5);
    }

    for (const b of blocks) {
      if (b.kind === "slide_directive") {
        doc
          .fontSize(9)
          .font("Helvetica-Oblique")
          .fillColor("#666666")
          .text(`[slide layout=${b.layout}]`, { paragraphGap: 4 });
        doc.fillColor("#000000");
        continue;
      }
      if (b.kind === "slide_notes") {
        doc
          .fontSize(9)
          .font("Helvetica-Oblique")
          .fillColor("#666666")
          .text(`[slide notes: ${b.text}]`, { paragraphGap: 4 });
        doc.fillColor("#000000");
        continue;
      }
      if (b.kind === "image") {
        doc
          .fontSize(10)
          .font("Helvetica-Oblique")
          .text(`[image: ${b.path}${b.alt ? ` — ${b.alt}` : ""}]`, { paragraphGap: 6 });
        continue;
      }
      if (b.kind === "heading") {
        const size = Math.max(11, 20 - b.level * 1.5);
        doc.fontSize(size).font("Helvetica-Bold").text(b.text, { paragraphGap: 8 });
      } else if (b.kind === "paragraph") {
        doc.fontSize(11).font("Helvetica").text(stripInline(b.text), { paragraphGap: 8 });
      } else if (b.kind === "code") {
        doc.fontSize(9).font("Courier").text(b.text || " ", { paragraphGap: 8 });
      } else if (b.kind === "list") {
        doc.fontSize(11).font("Helvetica");
        b.items.forEach((item, idx) => {
          const bullet = b.ordered ? `${idx + 1}. ` : "• ";
          doc.text(`${bullet}${stripInline(item)}`, { paragraphGap: 2 });
        });
        doc.moveDown(0.4);
      } else if (b.kind === "table") {
        doc.fontSize(10).font("Helvetica");
        for (const row of b.rows) {
          doc.text(row.join("  |  "), { paragraphGap: 2 });
        }
        doc.moveDown(0.5);
      }
    }
    doc.end();
  });
}
