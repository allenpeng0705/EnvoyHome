/**
 * Local SQL statement / path policy (Design §9.5k / P2-S0).
 * Fail closed — used by sql_query (P2-S2). Install (S1) does not execute SQL.
 */

/** Max SQL source bytes per sql_query call. */
export const LOCALSQL_MAX_SQL_BYTES = 16 * 1024;
/** Max result rows written to output/tables. */
export const LOCALSQL_MAX_RESULT_ROWS = 10_000;
/** Wall-clock timeout for one DuckDB invocation. */
export const LOCALSQL_TIMEOUT_MS = 30_000;
/** Max tables registered via sql_load per call. */
export const LOCALSQL_MAX_LOAD_FILES = 8;

/**
 * Substrings / keywords refused anywhere in the SQL text (case-insensitive).
 * Prefer overparse-refuse: unknown dangerous surface → deny.
 */
export const LOCALSQL_REFUSE_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\battach\b/i, why: "ATTACH refused" },
  { re: /\bdetach\b/i, why: "DETACH refused" },
  { re: /\binstall\b/i, why: "INSTALL extension refused" },
  { re: /\bload\s+['"]/i, why: "LOAD extension refused" },
  { re: /\bcopy\b/i, why: "COPY refused (use sql_query result writer)" },
  { re: /\bexport\b/i, why: "EXPORT refused" },
  { re: /\bimport\b/i, why: "IMPORT refused" },
  { re: /\bpragma\b/i, why: "PRAGMA refused" },
  { re: /\bcall\b/i, why: "CALL refused" },
  { re: /\bcheckpoint\b/i, why: "CHECKPOINT refused" },
  { re: /\bvacuum\b/i, why: "VACUUM refused" },
  { re: /\bforce\b/i, why: "FORCE refused" },
  { re: /\bsystem\b/i, why: "SYSTEM refused" },
  { re: /\bshell\b/i, why: "SHELL refused" },
  { re: /\bhttp/i, why: "http(s) URLs in SQL refused" },
  { re: /\bftp:\/\//i, why: "ftp URLs refused" },
  { re: /\bfile:\/\//i, why: "file:// URLs refused" },
  { re: /\bread_/i, why: "read_* table functions refused (use sql_load)" },
  { re: /\bwrite_/i, why: "write_* table functions refused" },
  { re: /\bglob\s*\(/i, why: "glob() refused" },
  { re: /\bparquet_scan\b/i, why: "parquet_scan refused" },
  { re: /\bcsv_scan\b/i, why: "csv_scan refused" },
  { re: /\biceberg_/i, why: "iceberg_* refused" },
  { re: /\bdelta_/i, why: "delta_* refused" },
  { re: /\bs3:\/\//i, why: "s3:// refused" },
  { re: /\bazure/i, why: "azure remote refused" },
  { re: /\bgcs:\/\//i, why: "gcs:// refused" },
  { re: /;/, why: "multi-statement (;) refused — one statement only" },
];

/** Leading keywords allowed for sql_query (after strip comments). */
export const LOCALSQL_ALLOW_LEAD =
  /^(with|select|create\s+temp\s+table|create\s+temporary\s+table|create\s+table|describe|show|summarize|explain)\b/i;

export function assertSafeLocalSql(sql: string): string {
  // One statement: allow a single trailing semicolon only.
  let text = sql.replace(/\r\n/g, "\n").trim().replace(/;+\s*$/, "").trim();
  if (!text) {
    throw new Error("envoyhome.bad_params: empty SQL");
  }
  if (Buffer.byteLength(text, "utf8") > LOCALSQL_MAX_SQL_BYTES) {
    throw new Error(
      `envoyhome.bad_params: SQL exceeds ${LOCALSQL_MAX_SQL_BYTES} bytes`,
    );
  }
  // Strip line comments for lead check only; refuse patterns still see full text.
  const noLineComments = text
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n")
    .trim();
  for (const p of LOCALSQL_REFUSE_PATTERNS) {
    if (p.re.test(text)) {
      throw new Error(`envoyhome.localsql_refused: ${p.why}`);
    }
  }
  if (!LOCALSQL_ALLOW_LEAD.test(noLineComments)) {
    throw new Error(
      "envoyhome.localsql_refused: statement must start with WITH|SELECT|CREATE [TEMP] TABLE|DESCRIBE|SHOW|SUMMARIZE|EXPLAIN",
    );
  }
  return text;
}
