/**
 * Simple table → PNG charts (Design §9.5k / P2-M2).
 * Pure JS raster — no Python / no cloud.
 */

import { randomBytes } from "node:crypto";
import { deflateSync } from "node:zlib";
import type { TableData } from "./table-transform.js";

function toNumber(v: string): number | null {
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export const CHART_TYPES = ["bar", "line", "pie"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const CHART_TABLE_DIR = "output/charts";
export const CHART_MAX_POINTS = 64;

export function isChartType(value: unknown): value is ChartType {
  return typeof value === "string" && (CHART_TYPES as readonly string[]).includes(value);
}

export function defaultChartUri(stem?: string): string {
  const s =
    (stem ?? "chart")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "chart";
  return `${CHART_TABLE_DIR}/${s}-${randomBytes(3).toString("hex")}.png`;
}

export function assertChartOutputPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (
    !normalized.startsWith(`${CHART_TABLE_DIR}/`) ||
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(normalized)
  ) {
    throw new Error(
      `envoyhome.bad_params: path must be under ${CHART_TABLE_DIR}/`,
    );
  }
  return normalized;
}

/** Design §9.5k — thin compute timeout. */
export const CHART_TABLE_TIMEOUT_MS = 30_000;

export interface ChartSeries {
  labels: string[];
  values: number[];
}

/** Use first column as labels, second numeric column as values (or named). */
export function extractChartSeries(
  table: TableData,
  opts?: { labelColumn?: string; valueColumn?: string },
): ChartSeries {
  if (table.headers.length < 1 || table.rows.length < 1) {
    throw new Error("envoyhome.bad_params: table too small for chart");
  }
  const labelIdx = opts?.labelColumn
    ? table.headers.findIndex(
        (h) => h.toLowerCase() === opts.labelColumn!.toLowerCase(),
      )
    : 0;
  if (labelIdx < 0) {
    throw new Error(`envoyhome.bad_params: unknown label column`);
  }
  let valueIdx = opts?.valueColumn
    ? table.headers.findIndex(
        (h) => h.toLowerCase() === opts.valueColumn!.toLowerCase(),
      )
    : -1;
  if (valueIdx < 0) {
    for (let c = 0; c < table.headers.length; c++) {
      if (c === labelIdx) continue;
      if (table.rows.some((r) => toNumber(r[c] ?? "") !== null)) {
        valueIdx = c;
        break;
      }
    }
  }
  if (valueIdx < 0) {
    throw new Error("envoyhome.bad_params: no numeric value column");
  }
  const labels: string[] = [];
  const values: number[] = [];
  for (const r of table.rows.slice(0, CHART_MAX_POINTS)) {
    const n = toNumber(r[valueIdx] ?? "");
    if (n === null) continue;
    labels.push(r[labelIdx] ?? "");
    values.push(n);
  }
  if (values.length === 0) {
    throw new Error("envoyhome.bad_params: no numeric points for chart");
  }
  return { labels, values };
}

const PALETTE = [
  [43, 108, 176],
  [56, 161, 105],
  [214, 158, 46],
  [229, 62, 62],
  [128, 90, 213],
  [49, 151, 149],
  [221, 107, 32],
  [113, 128, 150],
];

export function renderChartPng(
  type: ChartType,
  series: ChartSeries,
  opts?: { title?: string; width?: number; height?: number },
): { png: Buffer; stats: Record<string, unknown> } {
  const width = opts?.width ?? 640;
  const height = opts?.height ?? 400;
  const rgba = Buffer.alloc(width * height * 4, 255);
  // white bg already
  const setPx = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = 255;
  };
  const fillRect = (
    x0: number,
    y0: number,
    w: number,
    h: number,
    r: number,
    g: number,
    b: number,
  ) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) setPx(x, y, r, g, b);
    }
  };

  const margin = 48;
  const plotW = width - margin * 2;
  const plotH = height - margin * 2;
  const maxV = Math.max(...series.values, 1);
  const minV = Math.min(0, ...series.values);
  const span = maxV - minV || 1;

  // axis box
  fillRect(margin, margin, plotW, 1, 200, 200, 200);
  fillRect(margin, margin + plotH, plotW, 1, 180, 180, 180);
  fillRect(margin, margin, 1, plotH, 180, 180, 180);

  if (type === "bar") {
    const n = series.values.length;
    const gap = 4;
    const barW = Math.max(2, Math.floor((plotW - gap * (n + 1)) / n));
    for (let i = 0; i < n; i++) {
      const v = series.values[i]!;
      const h = Math.round(((v - minV) / span) * (plotH - 4));
      const x = margin + gap + i * (barW + gap);
      const y = margin + plotH - h;
      const pal = PALETTE[i % PALETTE.length] ?? [43, 108, 176];
      fillRect(x, y, barW, h, pal[0]!, pal[1]!, pal[2]!);
    }
  } else if (type === "line") {
    const n = series.values.length;
    const pts = series.values.map((v, i) => {
      const x = margin + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
      const y = margin + plotH - ((v - minV) / span) * (plotH - 4);
      return { x: Math.round(x), y: Math.round(y) };
    });
    for (let i = 1; i < pts.length; i++) {
      drawLine(
        setPx,
        pts[i - 1]!.x,
        pts[i - 1]!.y,
        pts[i]!.x,
        pts[i]!.y,
        43,
        108,
        176,
      );
    }
    for (const p of pts) {
      fillRect(p.x - 2, p.y - 2, 5, 5, 43, 108, 176);
    }
  } else {
    // pie
    const sum = series.values.reduce((a, b) => a + Math.abs(b), 0) || 1;
    const cx = Math.round(width / 2);
    const cy = Math.round(height / 2);
    const radius = Math.min(plotW, plotH) / 2 - 8;
    let angle = -Math.PI / 2;
    for (let i = 0; i < series.values.length; i++) {
      const slice = (Math.abs(series.values[i]!) / sum) * Math.PI * 2;
      const pal = PALETTE[i % PALETTE.length] ?? [43, 108, 176];
      fillPieSlice(
        setPx,
        cx,
        cy,
        radius,
        angle,
        angle + slice,
        pal[0]!,
        pal[1]!,
        pal[2]!,
      );
      angle += slice;
    }
  }

  const png = encodePng(width, height, rgba);
  const sum = series.values.reduce((a, b) => a + b, 0);
  return {
    png,
    stats: {
      type,
      points: series.values.length,
      labels: series.labels,
      values: series.values,
      sum,
      min: Math.min(...series.values),
      max: Math.max(...series.values),
      ...(opts?.title ? { title: opts.title } : {}),
    },
  };
}

function drawLine(
  setPx: (x: number, y: number, r: number, g: number, b: number) => void,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  g: number,
  b: number,
): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (;;) {
    setPx(x, y, r, g, b);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function fillPieSlice(
  setPx: (x: number, y: number, r: number, g: number, b: number) => void,
  cx: number,
  cy: number,
  radius: number,
  a0: number,
  a1: number,
  r: number,
  g: number,
  b: number,
): void {
  const r2 = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      let ang = Math.atan2(dy, dx);
      // normalize relative to a0..a1 spanning possibly >π
      let a = ang;
      while (a < a0) a += Math.PI * 2;
      while (a > a0 + Math.PI * 2) a -= Math.PI * 2;
      if (a >= a0 && a <= a1) setPx(x, y, r, g, b);
    }
  }
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Unfiltered RGBA → PNG. */
export function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
