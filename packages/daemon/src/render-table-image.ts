/**
 * Styled GFM/table → PNG for decks (Design §9.5k / P2-P).
 * SVG → PNG via @resvg/resvg-js — no Chromium; system fonts for CJK.
 */

import { randomBytes } from "node:crypto";
import { Resvg } from "@resvg/resvg-js";
import type { TableData } from "./table-transform.js";

export const RENDER_TABLE_DIR = "output/diagrams";
export const RENDER_TABLE_TIMEOUT_MS = 30_000;
export const RENDER_TABLE_MAX_ROWS = 40;
export const RENDER_TABLE_MAX_COLS = 12;
export const RENDER_TABLE_MAX_PNG_BYTES = 2 * 1024 * 1024;

export function defaultRenderTableUri(stem?: string): string {
  const s =
    (stem ?? "table")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "table";
  return `${RENDER_TABLE_DIR}/${s}-${randomBytes(3).toString("hex")}.png`;
}

export function assertRenderTableOutputPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\.\/+/, "");
  const okPrefix =
    normalized.startsWith(`${RENDER_TABLE_DIR}/`) ||
    normalized.startsWith("output/tables/");
  if (
    !okPrefix ||
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(normalized)
  ) {
    throw new Error(
      "envoyhome.bad_params: path must be under output/diagrams/ or output/tables/",
    );
  }
  if (!normalized.toLowerCase().endsWith(".png")) {
    throw new Error("envoyhome.bad_params: table image path must end with .png");
  }
  return normalized;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function estimateColWidth(text: string): number {
  let w = 24;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 32;
    w += code > 0x2e80 ? 14 : 8;
  }
  return Math.min(280, Math.max(80, w));
}

export interface RenderTableImageOpts {
  title?: string;
  theme?: "default" | "dark";
}

export interface RenderTableImageResult {
  png: Buffer;
  rows: number;
  cols: number;
  width: number;
  height: number;
}

/** Build presentation-table SVG then rasterize. */
export function renderTablePng(
  table: TableData,
  opts?: RenderTableImageOpts,
): RenderTableImageResult {
  if (table.headers.length < 1) {
    throw new Error("envoyhome.bad_params: table has no headers");
  }
  if (table.headers.length > RENDER_TABLE_MAX_COLS) {
    throw new Error(
      `envoyhome.bad_params: table exceeds ${RENDER_TABLE_MAX_COLS} columns`,
    );
  }
  if (table.rows.length > RENDER_TABLE_MAX_ROWS) {
    throw new Error(
      `envoyhome.bad_params: table exceeds ${RENDER_TABLE_MAX_ROWS} rows for image render`,
    );
  }

  const dark = opts?.theme === "dark";
  const bg = dark ? "#1A1A2E" : "#FFFFFF";
  const headerBg = "#2B6CB0";
  const headerFg = "#FFFFFF";
  const bodyFg = dark ? "#D0D0D8" : "#333333";
  const altBg = dark ? "#252542" : "#F4F7FB";
  const grid = dark ? "#3A3A5A" : "#CBD5E0";
  const titleFg = dark ? "#F5F5F7" : "#1A1A2E";

  const cols = table.headers.length;
  const pad = 24;
  const titleH = opts?.title ? 40 : 0;
  const rowH = 36;
  const fontSize = 14;

  const colWidths: number[] = [];
  for (let c = 0; c < cols; c++) {
    let max = estimateColWidth(table.headers[c] ?? "");
    for (const row of table.rows) {
      max = Math.max(max, estimateColWidth(row[c] ?? ""));
    }
    colWidths.push(max);
  }
  const tableW = colWidths.reduce((a, b) => a + b, 0);
  const innerW = Math.min(1200, Math.max(400, tableW));
  const scaleX = innerW / tableW;
  const scaled = colWidths.map((w) => Math.floor(w * scaleX));
  // Absorb floor rounding so columns sum exactly to innerW (avoids right-edge gap).
  const scaledSum = scaled.reduce((a, b) => a + b, 0);
  if (scaled.length > 0 && scaledSum !== innerW) {
    scaled[scaled.length - 1]! += innerW - scaledSum;
  }
  const width = innerW + pad * 2;
  const height = pad * 2 + titleH + rowH * (1 + table.rows.length);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  parts.push(`<rect width="100%" height="100%" fill="${bg}"/>`);
  parts.push(
    `<style>text{font-family:Calibri,Arial,"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif;font-size:${fontSize}px}</style>`,
  );

  let y = pad;
  if (opts?.title) {
    parts.push(
      `<text x="${pad}" y="${y + 22}" fill="${titleFg}" font-size="18" font-weight="700">${xmlEscape(opts.title)}</text>`,
    );
    y += titleH;
  }

  // Header
  parts.push(
    `<rect x="${pad}" y="${y}" width="${innerW}" height="${rowH}" fill="${headerBg}" rx="4"/>`,
  );
  {
    let x = pad;
    for (let c = 0; c < cols; c++) {
      const cw = scaled[c]!;
      parts.push(
        `<text x="${x + 12}" y="${y + 24}" fill="${headerFg}" font-weight="700">${xmlEscape(table.headers[c] ?? "")}</text>`,
      );
      x += cw;
    }
  }
  y += rowH;

  for (let r = 0; r < table.rows.length; r++) {
    const row = table.rows[r]!;
    if (r % 2 === 1) {
      parts.push(
        `<rect x="${pad}" y="${y}" width="${innerW}" height="${rowH}" fill="${altBg}"/>`,
      );
    }
    let x = pad;
    for (let c = 0; c < cols; c++) {
      const cw = scaled[c]!;
      parts.push(
        `<text x="${x + 12}" y="${y + 24}" fill="${bodyFg}">${xmlEscape(row[c] ?? "")}</text>`,
      );
      // vertical grid
      if (c > 0) {
        parts.push(
          `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + rowH}" stroke="${grid}" stroke-width="1"/>`,
        );
      }
      x += cw;
    }
    parts.push(
      `<line x1="${pad}" y1="${y + rowH}" x2="${pad + innerW}" y2="${y + rowH}" stroke="${grid}" stroke-width="1"/>`,
    );
    y += rowH;
  }

  // Outer border
  const tableTop = pad + titleH;
  const tableH = rowH * (1 + table.rows.length);
  parts.push(
    `<rect x="${pad}" y="${tableTop}" width="${innerW}" height="${tableH}" fill="none" stroke="${grid}" stroke-width="1.5" rx="4"/>`,
  );
  parts.push("</svg>");

  const svg = parts.join("");
  let png: Buffer;
  try {
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: Math.min(1600, width * 2) },
      font: { loadSystemFonts: true },
      background: dark ? "rgb(26,26,46)" : "rgb(255,255,255)",
    });
    png = Buffer.from(resvg.render().asPng());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`envoyhome.table_raster_failed: ${msg.slice(0, 200)}`);
  }
  if (png.length < 32 || png[0] !== 0x89 || png[1] !== 0x50) {
    throw new Error("envoyhome.table_raster_failed: invalid PNG");
  }
  if (png.length > RENDER_TABLE_MAX_PNG_BYTES) {
    throw new Error(
      `envoyhome.bad_params: table PNG exceeds ${RENDER_TABLE_MAX_PNG_BYTES} bytes`,
    );
  }
  return {
    png,
    rows: table.rows.length,
    cols,
    width,
    height,
  };
}
