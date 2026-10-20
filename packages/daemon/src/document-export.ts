/**
 * Markdown → Office-ish export (Design §9.5b).
 * Pure JS: docx / exceljs / pdfkit — no Pandoc or LibreOffice.
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
import PDFDocument from "pdfkit";

export type ExportFormat = "docx" | "xlsx" | "csv" | "pdf";

export const EXPORT_FORMATS = ["docx", "xlsx", "csv", "pdf"] as const;

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

type MdBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; rows: string[][] }
  | { kind: "code"; text: string };

/** Convert Markdown to the requested format. */
export async function exportDocument(
  format: ExportFormat,
  markdown: string,
  opts?: { title?: string },
): Promise<Buffer> {
  assertMarkdownSize(markdown);
  const title = opts?.title?.trim() || undefined;
  const blocks = parseMarkdownBlocks(markdown);
  let buf: Buffer;
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
  }
  assertOutputSize(buf);
  return buf;
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

/** Lightweight GFM block parse — headings, paragraphs, lists, tables, fenced code. */
export function parseMarkdownBlocks(markdown: string): MdBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;
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
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = Math.min(6, heading[1]!.length) as 1 | 2 | 3 | 4 | 5 | 6;
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
        items.push(stripInline((lines[i] ?? "").replace(/^\s*([-*+]|\d+\.)\s+/, "")));
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
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
      !(isTableRow(lines[i] ?? "") && i + 1 < lines.length && isTableSep(lines[i + 1] ?? ""))
    ) {
      para.push(lines[i] ?? "");
      i++;
    }
    blocks.push({ kind: "paragraph", text: stripInline(para.join(" ")) });
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
    if (b.kind === "heading") {
      children.push(
        new Paragraph({
          text: b.text,
          heading: HEADING_MAP[b.level],
        }),
      );
    } else if (b.kind === "paragraph") {
      children.push(new Paragraph({ children: [new TextRun(b.text)] }));
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
        children.push(
          new Paragraph({
            children: [
              new TextRun(b.ordered ? `${idx + 1}. ${item}` : `• ${item}`),
            ],
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
      pendingRows.push([b.kind === "heading" ? b.text : b.text]);
    } else if (b.kind === "list") {
      for (const item of b.items) pendingRows.push([item]);
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
      if (b.kind === "heading") {
        const size = Math.max(11, 20 - b.level * 1.5);
        doc.fontSize(size).font("Helvetica-Bold").text(b.text, { paragraphGap: 8 });
      } else if (b.kind === "paragraph") {
        doc.fontSize(11).font("Helvetica").text(b.text, { paragraphGap: 8 });
      } else if (b.kind === "code") {
        doc.fontSize(9).font("Courier").text(b.text || " ", { paragraphGap: 8 });
      } else if (b.kind === "list") {
        doc.fontSize(11).font("Helvetica");
        b.items.forEach((item, idx) => {
          const bullet = b.ordered ? `${idx + 1}. ` : "• ";
          doc.text(`${bullet}${item}`, { paragraphGap: 2 });
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
