/**
 * Thin table compute (Design §9.5k / P2-M / P2-R).
 * Closed ops only — no arbitrary code / SQL / formulas.
 */

import { randomBytes } from "node:crypto";

export const TABLE_TRANSFORM_OPS = [
  "summarize",
  "normalize",
  "filter",
  "sort",
  "aggregate",
  "select_columns",
  "dedupe",
  "rename_columns",
  "top_n",
  "head",
  "tail",
  "pipeline",
] as const;

export type TableTransformOp = (typeof TABLE_TRANSFORM_OPS)[number];

/** Ops allowed inside `pipeline.steps` (no nested pipeline). */
export const TABLE_TRANSFORM_STEP_OPS = TABLE_TRANSFORM_OPS.filter(
  (op) => op !== "pipeline",
) as Exclude<TableTransformOp, "pipeline">[];

export const TABLE_TRANSFORM_MAX_ROWS = 10_000;
export const TABLE_TRANSFORM_MAX_COLS = 64;
export const TABLE_TRANSFORM_DIR = "output/tables";
export const TABLE_TRANSFORM_PIPELINE_MAX_STEPS = 16;
/** Design §9.5k — thin compute timeout. */
export const TABLE_TRANSFORM_TIMEOUT_MS = 30_000;

export function isTableTransformOp(value: unknown): value is TableTransformOp {
  return (
    typeof value === "string" &&
    (TABLE_TRANSFORM_OPS as readonly string[]).includes(value)
  );
}

export function isTableTransformStepOp(
  value: unknown,
): value is Exclude<TableTransformOp, "pipeline"> {
  return (
    typeof value === "string" &&
    (TABLE_TRANSFORM_STEP_OPS as readonly string[]).includes(value)
  );
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

export function assertTableCaps(table: TableData): void {
  let maxCols = table.headers.length;
  for (const row of table.rows) {
    if (row.length > maxCols) maxCols = row.length;
  }
  if (maxCols > TABLE_TRANSFORM_MAX_COLS) {
    throw new Error(
      `envoyhome.bad_params: table exceeds ${TABLE_TRANSFORM_MAX_COLS} columns`,
    );
  }
  if (table.rows.length > TABLE_TRANSFORM_MAX_ROWS) {
    throw new Error(
      `envoyhome.bad_params: table exceeds ${TABLE_TRANSFORM_MAX_ROWS} rows`,
    );
  }
}

/**
 * RFC4180-ish CSV: commas, quotes, escaped `""`, and newlines inside quotes.
 * (Design §9.5k / P2-R / V-OFFICE-37.)
 */
export function parseCsvText(text: string): TableData {
  const rows = parseCsvRecords(text.replace(/^\uFEFF/, ""));
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0]!;
  const body = rows.slice(1);
  const table = { headers, rows: body };
  assertTableCaps(table);
  return table;
}

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cur.trim());
      cur = "";
      continue;
    }
    if (ch === "\n" || (ch === "\r" && text[i + 1] !== "\n")) {
      row.push(cur.trim());
      cur = "";
      if (row.some((c) => c.length > 0) || row.length > 1) {
        records.push(row);
      }
      row = [];
      continue;
    }
    if (ch === "\r") continue; // swallowed before \n as CRLF
    cur += ch;
  }
  row.push(cur.trim());
  if (row.some((c) => c.length > 0) || row.length > 1) {
    records.push(row);
  }
  return records;
}

export function tableToCsv(table: TableData): string {
  const esc = (c: string) =>
    /[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
  const lines = [
    table.headers.map(esc).join(","),
    ...table.rows.map((r) =>
      table.headers.map((_, i) => esc(r[i] ?? "")).join(","),
    ),
  ];
  return lines.join("\n") + "\n";
}

export function tableToGfm(table: TableData, maxRows = 40): string {
  if (table.headers.length === 0) return "_empty table_";
  const rows = table.rows.slice(0, maxRows);
  const head = `| ${table.headers.join(" | ")} |`;
  const sep = `| ${table.headers.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (r) => `| ${table.headers.map((_, i) => r[i] ?? "").join(" | ")} |`,
  );
  const more =
    table.rows.length > maxRows
      ? `\n_… ${table.rows.length - maxRows} more rows_`
      : "";
  return [head, sep, ...body].join("\n") + more;
}

/** First GFM table in markdown → TableData. */
export function parseGfmTable(markdown: string): TableData {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i] ?? "";
    const sep = lines[i + 1] ?? "";
    if (!isTableRow(line) || !isTableSep(sep)) continue;
    const headers = splitTableRow(line);
    const rows: string[][] = [];
    i += 2;
    while (i < lines.length && isTableRow(lines[i] ?? "")) {
      rows.push(splitTableRow(lines[i]!));
      i++;
    }
    const table = { headers, rows };
    assertTableCaps(table);
    return table;
  }
  throw new Error(
    "envoyhome.bad_params: no GFM table found in markdown (need a | header | row then | --- | separator)",
  );
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
  return t.split("|").map((c) => c.trim());
}

export function defaultTableUri(stem?: string): string {
  const s =
    (stem ?? "table")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "table";
  return `${TABLE_TRANSFORM_DIR}/${s}-${randomBytes(3).toString("hex")}.csv`;
}

export function assertTableOutputPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (
    !normalized.startsWith(`${TABLE_TRANSFORM_DIR}/`) ||
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(normalized)
  ) {
    throw new Error(
      `envoyhome.bad_params: path must be under ${TABLE_TRANSFORM_DIR}/`,
    );
  }
  return normalized;
}

function colIndex(headers: string[], name: string): number {
  const i = headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  if (i < 0) {
    throw new Error(`envoyhome.bad_params: unknown column "${name}"`);
  }
  return i;
}

function toNumber(v: string): number | null {
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

const BLANK_TOKENS = new Set(["", "-", "—", "–", "n/a", "na", "null", "none"]);

/** Strip currency / thousands / percent for normalize. */
export function normalizeCell(raw: string): string {
  let s = raw.trim();
  if (BLANK_TOKENS.has(s.toLowerCase())) return "";
  // Currency symbols + whitespace
  s = s.replace(/^[$€£¥₩]\s*/, "").replace(/\s*[$€£¥₩]$/, "");
  const pct = /^-?\d[\d,]*\.?\d*\s*%$/.test(s);
  if (pct) {
    const n = toNumber(s.replace(/%$/, ""));
    if (n !== null) return String(n / 100);
  }
  // Thousands separators when the rest looks numeric
  const stripped = s.replace(/,/g, "");
  if (/^-?\d+\.?\d*$/.test(stripped) && stripped !== "") {
    return stripped;
  }
  return s;
}

export interface TableTransformArgs {
  op: TableTransformOp;
  /** filter / sort / aggregate / top_n / normalize (optional column list via columns) */
  column?: string;
  equals?: string;
  notEquals?: string;
  contains?: string;
  gt?: string;
  gte?: string;
  lt?: string;
  lte?: string;
  /** filter `in` — list of allowed values */
  values?: string[];
  isEmpty?: boolean;
  /** sort / top_n */
  ascending?: boolean;
  /** aggregate: sum|avg|count|min|max */
  agg?: "sum" | "avg" | "count" | "min" | "max";
  groupBy?: string;
  /** select_columns / normalize / dedupe */
  columns?: string[];
  /** rename_columns: map old → new */
  rename?: Record<string, string>;
  /** top_n / head / tail */
  n?: number;
  /** pipeline */
  steps?: TableTransformArgs[];
}

export function runTableTransform(
  table: TableData,
  args: TableTransformArgs,
): { table: TableData; summary: string } {
  assertTableCaps(table);
  const result = runTableTransformInner(table, args, 0);
  assertTableCaps(result.table);
  return result;
}

function runTableTransformInner(
  table: TableData,
  args: TableTransformArgs,
  depth: number,
): { table: TableData; summary: string } {
  if (depth > 1) {
    throw new Error("envoyhome.bad_params: nested pipeline refused");
  }
  switch (args.op) {
    case "pipeline": {
      const steps = args.steps;
      if (!Array.isArray(steps) || steps.length === 0) {
        throw new Error(
          "envoyhome.bad_params: pipeline requires non-empty steps[]",
        );
      }
      if (steps.length > TABLE_TRANSFORM_PIPELINE_MAX_STEPS) {
        throw new Error(
          `envoyhome.bad_params: pipeline exceeds ${TABLE_TRANSFORM_PIPELINE_MAX_STEPS} steps`,
        );
      }
      let cur = table;
      const parts: string[] = [];
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]!;
        if (!isTableTransformStepOp(step.op)) {
          throw new Error(
            `envoyhome.bad_params: pipeline step ${i} op invalid or nested pipeline`,
          );
        }
        const out = runTableTransformInner(cur, step, depth + 1);
        cur = out.table;
        parts.push(out.summary);
        assertTableCaps(cur);
      }
      return {
        table: cur,
        summary: `pipeline[${steps.length}]: ${parts.join(" → ")}`,
      };
    }
    case "summarize": {
      const summaryLines = [
        `rows=${table.rows.length}`,
        `cols=${table.headers.length}`,
        `headers=${table.headers.join(",")}`,
      ];
      for (const h of table.headers) {
        const idx = colIndex(table.headers, h);
        const nums = table.rows
          .map((r) => toNumber(r[idx] ?? ""))
          .filter((n): n is number => n !== null);
        if (nums.length) {
          const sum = nums.reduce((a, b) => a + b, 0);
          summaryLines.push(
            `${h}: n=${nums.length} sum=${sum} avg=${(sum / nums.length).toFixed(4)} min=${Math.min(...nums)} max=${Math.max(...nums)}`,
          );
        }
      }
      return {
        table,
        summary: summaryLines.join("\n"),
      };
    }
    case "normalize": {
      const idxs =
        args.columns && args.columns.length
          ? args.columns.map((c) => colIndex(table.headers, c))
          : table.headers.map((_, i) => i);
      const idxSet = new Set(idxs);
      const rows = table.rows.map((r) =>
        r.map((cell, i) => (idxSet.has(i) ? normalizeCell(cell) : cell)),
      );
      // Also normalize headers lightly (trim only)
      const headers = table.headers.map((h) => h.trim());
      return {
        table: { headers, rows },
        summary: `normalize cols=${idxs.length}`,
      };
    }
    case "filter": {
      if (!args.column) {
        throw new Error("envoyhome.bad_params: filter requires column");
      }
      const hasPred =
        args.equals !== undefined ||
        args.notEquals !== undefined ||
        args.contains !== undefined ||
        args.gt !== undefined ||
        args.gte !== undefined ||
        args.lt !== undefined ||
        args.lte !== undefined ||
        args.values !== undefined ||
        args.isEmpty !== undefined;
      if (!hasPred) {
        throw new Error(
          "envoyhome.bad_params: filter requires equals|notEquals|contains|gt|gte|lt|lte|values|isEmpty",
        );
      }
      const idx = colIndex(table.headers, args.column);
      const rows = table.rows.filter((r) =>
        matchFilter(r[idx] ?? "", args),
      );
      return {
        table: { headers: table.headers, rows },
        summary: `filter ${args.column}: ${rows.length}/${table.rows.length} rows`,
      };
    }
    case "sort": {
      if (!args.column) {
        throw new Error("envoyhome.bad_params: sort requires column");
      }
      const idx = colIndex(table.headers, args.column);
      const asc = args.ascending !== false;
      const rows = [...table.rows].sort((a, b) => {
        const cmp = compareCells(a[idx] ?? "", b[idx] ?? "");
        return asc ? cmp : -cmp;
      });
      return {
        table: { headers: table.headers, rows },
        summary: `sort ${args.column} ${asc ? "asc" : "desc"}`,
      };
    }
    case "aggregate": {
      const agg = args.agg ?? "sum";
      if (!args.column && agg !== "count") {
        throw new Error("envoyhome.bad_params: aggregate requires column");
      }
      if (args.groupBy) {
        const gIdx = colIndex(table.headers, args.groupBy);
        const vIdx = args.column ? colIndex(table.headers, args.column) : -1;
        const groups = new Map<string, number[]>();
        for (const r of table.rows) {
          const key = r[gIdx] ?? "";
          const list = groups.get(key) ?? [];
          if (agg === "count") list.push(1);
          else {
            const n = toNumber(r[vIdx] ?? "");
            if (n !== null) list.push(n);
          }
          groups.set(key, list);
        }
        const headers = [args.groupBy, agg];
        const rows: string[][] = [];
        for (const [key, vals] of groups) {
          rows.push([key, String(reduceAgg(agg, vals))]);
        }
        return {
          table: { headers, rows },
          summary: `aggregate ${agg} by ${args.groupBy}: ${rows.length} groups`,
        };
      }
      const vals =
        agg === "count"
          ? table.rows.map(() => 1)
          : table.rows
              .map((r) => toNumber(r[colIndex(table.headers, args.column!)] ?? ""))
              .filter((n): n is number => n !== null);
      const result = reduceAgg(agg, vals);
      return {
        table: {
          headers: ["metric", "value"],
          rows: [
            [
              `${agg}${args.column ? `(${args.column})` : ""}`,
              String(result),
            ],
          ],
        },
        summary: `${agg}=${result}`,
      };
    }
    case "select_columns": {
      const cols = args.columns;
      if (!cols?.length) {
        throw new Error(
          "envoyhome.bad_params: select_columns requires columns[]",
        );
      }
      const idxs = cols.map((c) => colIndex(table.headers, c));
      return {
        table: {
          headers: cols,
          rows: table.rows.map((r) => idxs.map((i) => r[i] ?? "")),
        },
        summary: `select ${cols.join(",")}`,
      };
    }
    case "dedupe": {
      const idxs =
        args.columns && args.columns.length
          ? args.columns.map((c) => colIndex(table.headers, c))
          : table.headers.map((_, i) => i);
      const seen = new Set<string>();
      const rows: string[][] = [];
      for (const r of table.rows) {
        const key = idxs.map((i) => r[i] ?? "").join("\u0001");
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(r);
      }
      return {
        table: { headers: table.headers, rows },
        summary: `dedupe: ${rows.length}/${table.rows.length} rows`,
      };
    }
    case "rename_columns": {
      const rename = args.rename;
      if (!rename || typeof rename !== "object" || Array.isArray(rename)) {
        throw new Error(
          "envoyhome.bad_params: rename_columns requires rename object",
        );
      }
      const entries = Object.entries(rename).filter(
        ([from, to]) =>
          typeof from === "string" &&
          typeof to === "string" &&
          from.trim() &&
          to.trim(),
      );
      if (!entries.length) {
        throw new Error(
          "envoyhome.bad_params: rename_columns requires at least one mapping",
        );
      }
      const headers = [...table.headers];
      for (const [from, to] of entries) {
        const i = colIndex(headers, from);
        headers[i] = to.trim();
      }
      // Fail closed on duplicate headers after rename
      const lower = headers.map((h) => h.toLowerCase());
      if (new Set(lower).size !== lower.length) {
        throw new Error(
          "envoyhome.bad_params: rename_columns would create duplicate headers",
        );
      }
      return {
        table: { headers, rows: table.rows },
        summary: `rename ${entries.map(([a, b]) => `${a}→${b}`).join(",")}`,
      };
    }
    case "top_n": {
      if (!args.column) {
        throw new Error("envoyhome.bad_params: top_n requires column");
      }
      const n = clampN(args.n, 10);
      const idx = colIndex(table.headers, args.column);
      // Default: largest first (descending)
      const asc = args.ascending === true;
      const sorted = [...table.rows].sort((a, b) => {
        const cmp = compareCells(a[idx] ?? "", b[idx] ?? "");
        return asc ? cmp : -cmp;
      });
      const rows = sorted.slice(0, n);
      return {
        table: { headers: table.headers, rows },
        summary: `top_n ${n} by ${args.column} ${asc ? "asc" : "desc"}`,
      };
    }
    case "head": {
      const n = clampN(args.n, 10);
      const rows = table.rows.slice(0, n);
      return {
        table: { headers: table.headers, rows },
        summary: `head ${rows.length}`,
      };
    }
    case "tail": {
      const n = clampN(args.n, 10);
      const rows = table.rows.slice(Math.max(0, table.rows.length - n));
      return {
        table: { headers: table.headers, rows },
        summary: `tail ${rows.length}`,
      };
    }
  }
}

function clampN(raw: number | undefined, fallback: number): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : fallback;
  if (n < 1) {
    throw new Error("envoyhome.bad_params: n must be >= 1");
  }
  if (n > TABLE_TRANSFORM_MAX_ROWS) {
    throw new Error(
      `envoyhome.bad_params: n exceeds ${TABLE_TRANSFORM_MAX_ROWS}`,
    );
  }
  return n;
}

function compareCells(a: string, b: string): number {
  const an = toNumber(a);
  const bn = toNumber(b);
  if (an !== null && bn !== null) return an - bn;
  return a.localeCompare(b);
}

function matchFilter(cell: string, args: TableTransformArgs): boolean {
  if (args.isEmpty !== undefined) {
    const empty = cell.trim() === "";
    if (args.isEmpty !== empty) return false;
  }
  if (args.equals !== undefined && cell !== args.equals) return false;
  if (args.notEquals !== undefined && cell === args.notEquals) return false;
  if (args.contains !== undefined && !cell.includes(args.contains)) return false;
  if (args.values !== undefined) {
    if (!args.values.includes(cell)) return false;
  }
  for (const [key, bound] of [
    ["gt", args.gt],
    ["gte", args.gte],
    ["lt", args.lt],
    ["lte", args.lte],
  ] as const) {
    if (bound === undefined) continue;
    const cmp = compareCells(cell, bound);
    if (key === "gt" && !(cmp > 0)) return false;
    if (key === "gte" && !(cmp >= 0)) return false;
    if (key === "lt" && !(cmp < 0)) return false;
    if (key === "lte" && !(cmp <= 0)) return false;
  }
  return true;
}

function reduceAgg(agg: string, vals: number[]): number {
  if (agg === "count") return vals.length;
  if (vals.length === 0) return 0;
  if (agg === "sum") return vals.reduce((a, b) => a + b, 0);
  if (agg === "avg") return vals.reduce((a, b) => a + b, 0) / vals.length;
  if (agg === "min") return Math.min(...vals);
  if (agg === "max") return Math.max(...vals);
  return 0;
}
