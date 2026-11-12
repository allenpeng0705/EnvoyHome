/**
 * Local SQL execution — sql_load / sql_query (Design §9.5k / P2-S2).
 * DuckDB CLI; preamble loads jailed files; user SQL never sees raw paths they assert.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { extname, dirname } from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import ExcelJS from "exceljs";
import type { HomePaths } from "./home-paths.js";
import { resolveSandboxPath, type WorkspaceMode } from "./fs-jail.js";
import {
  assertSafeLocalSql,
  LOCALSQL_MAX_LOAD_FILES,
  LOCALSQL_MAX_RESULT_ROWS,
  LOCALSQL_TIMEOUT_MS,
} from "./localsql-policy.js";
import {
  getLocalSqlInstallService,
  resolveEnvLocalSqlBinary,
} from "./localsql-install.js";
import {
  assertTableCaps,
  assertTableOutputPath,
  defaultTableUri,
  parseCsvText,
  tableToCsv,
  tableToGfm,
  TABLE_TRANSFORM_DIR,
} from "./table-transform.js";

export const LOCALSQL_REGISTRY_REL = `${TABLE_TRANSFORM_DIR}/.localsql-registry.json`;

export interface LocalSqlRegistryEntry {
  name: string;
  sourcePath: string;
  /** Absolute path last resolved (not trusted on reload — re-resolve). */
  kind: "csv" | "xlsx";
  /** Optional worksheet for `.xlsx` (persisted so sql_query reloads the same sheet). */
  sheetName?: string;
}

export interface LocalSqlRegistry {
  version: 1;
  tables: LocalSqlRegistryEntry[];
  updatedAt: string;
}

type PathInput = {
  paths: HomePaths;
  accountId: string;
  workspaceRoot?: string | null;
  workspaceMode?: WorkspaceMode | null;
  workspaceMounts?: Array<{
    id: string;
    hostPath: string;
    mode: WorkspaceMode;
  }> | null;
};

let chain: Promise<unknown> = Promise.resolve();

/** Global concurrency 1 (Design §9.5k). */
function withLocalSqlLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function toolPathOpts(
  paths: HomePaths,
  accountId: string,
  input: PathInput,
  write: boolean,
  path: string,
): Parameters<typeof resolveSandboxPath>[0] {
  return {
    accountFilesRoot: paths.accountFiles(accountId),
    shareRoot: paths.shareDir,
    path,
    write,
    workspaceMounts: input.workspaceMounts ?? null,
    workspaceRoot: input.workspaceRoot ?? null,
    workspaceMode: input.workspaceMode ?? null,
  };
}

function assertTableName(name: string): string {
  const n = name.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(n)) {
    throw new Error(
      "envoyhome.bad_params: table name must be [A-Za-z_][A-Za-z0-9_]{0,63}",
    );
  }
  const reserved = new Set(["duckdb", "main", "temp", "information_schema"]);
  if (reserved.has(n.toLowerCase())) {
    throw new Error(`envoyhome.bad_params: reserved table name "${n}"`);
  }
  return n;
}

function sqlStringLiteral(absPath: string): string {
  return `'${absPath.replace(/'/g, "''")}'`;
}

function requireDuckdbBinary(): string {
  const svc = getLocalSqlInstallService();
  const bin =
    svc?.resolveBinaryPath() ?? resolveEnvLocalSqlBinary(process.env) ?? null;
  if (!bin) {
    throw new Error(
      "envoyhome.tool_unavailable: local SQL not ready — Owner Install DuckDB (System → Files) or set ENVOYHOME_DUCKDB",
    );
  }
  return bin;
}

type DuckdbExecFn = (
  binary: string,
  script: string,
  opts?: { csvStdout?: boolean },
) => Promise<{ stdout: string; stderr: string }>;

let testExec: DuckdbExecFn | null = null;

/** Test hook — replace DuckDB CLI spawn. */
export function __setLocalSqlExecForTests(fn: DuckdbExecFn | null): void {
  testExec = fn;
}

async function readRegistry(input: PathInput): Promise<LocalSqlRegistry> {
  try {
    const resolved = resolveSandboxPath(
      toolPathOpts(input.paths, input.accountId, input, false, LOCALSQL_REGISTRY_REL),
    );
    const raw = await readFile(resolved.absolute, "utf8");
    const parsed = JSON.parse(raw) as LocalSqlRegistry;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.tables)) {
      return { version: 1, tables: [], updatedAt: new Date().toISOString() };
    }
    return parsed;
  } catch {
    return { version: 1, tables: [], updatedAt: new Date().toISOString() };
  }
}

async function writeRegistry(
  input: PathInput,
  registry: LocalSqlRegistry,
): Promise<void> {
  registry.updatedAt = new Date().toISOString();
  const resolved = resolveSandboxPath(
    toolPathOpts(input.paths, input.accountId, input, true, LOCALSQL_REGISTRY_REL),
  );
  await mkdir(dirname(resolved.absolute), { recursive: true });
  await writeFile(
    resolved.absolute,
    `${JSON.stringify(registry, null, 2)}\n`,
    "utf8",
  );
}

/** Materialize xlsx → temp csv under output/tables/.localsql-tmp/ */
async function materializeSource(
  input: PathInput,
  sourcePath: string,
  sheetName?: string,
): Promise<{ absPath: string; kind: "csv" | "xlsx"; cleanup?: string }> {
  const cleaned = sourcePath.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (
    cleaned.includes("..") ||
    cleaned.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(cleaned)
  ) {
    throw new Error("envoyhome.bad_params: sourcePath path escape refused");
  }
  const ext = extname(cleaned).toLowerCase();
  if (ext !== ".csv" && ext !== ".xlsx") {
    throw new Error(
      "envoyhome.bad_params: sql_load sourcePath must be .csv or .xlsx",
    );
  }
  const resolved = resolveSandboxPath(
    toolPathOpts(input.paths, input.accountId, input, false, cleaned),
  );
  if (!existsSync(resolved.absolute)) {
    throw new Error(`envoyhome.bad_params: sourcePath not found: ${cleaned}`);
  }
  if (ext === ".csv") {
    return { absPath: resolved.absolute, kind: "csv" };
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(resolved.absolute);
  const sheet = sheetName
    ? wb.getWorksheet(sheetName)
    : wb.worksheets[0];
  if (!sheet) {
    throw new Error("envoyhome.bad_params: worksheet not found");
  }
  const headers: string[] = [];
  const rows: string[][] = [];
  sheet.eachRow((row, rowNumber) => {
    const vals = (row.values as unknown[])
      .slice(1)
      .map((v) => (v == null ? "" : String(v)));
    if (rowNumber === 1) headers.push(...vals);
    else rows.push(vals);
  });
  const table = { headers, rows };
  assertTableCaps(table);
  const tmpRel = `${TABLE_TRANSFORM_DIR}/.localsql-tmp/${randomBytes(4).toString("hex")}.csv`;
  const tmp = resolveSandboxPath(
    toolPathOpts(input.paths, input.accountId, input, true, tmpRel),
  );
  await mkdir(dirname(tmp.absolute), { recursive: true });
  await writeFile(tmp.absolute, tableToCsv(table), "utf8");
  return { absPath: tmp.absolute, kind: "xlsx", cleanup: tmp.absolute };
}

function buildLoadPreamble(
  loads: Array<{ name: string; absPath: string }>,
): string {
  const lines: string[] = [];
  for (const L of loads) {
    lines.push(
      `CREATE OR REPLACE TEMP TABLE ${L.name} AS SELECT * FROM read_csv_auto(${sqlStringLiteral(L.absPath)}, HEADER=true, ALL_VARCHAR=true);`,
    );
  }
  return lines.join("\n");
}

async function runDuckdbScript(
  binary: string,
  script: string,
  opts?: { csvStdout?: boolean },
): Promise<{ stdout: string; stderr: string }> {
  if (testExec) return testExec(binary, script, opts);
  return new Promise((resolve, reject) => {
    const args = opts?.csvStdout ? ["-csv", "-c", script] : ["-c", script];
    const child = spawn(binary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DUCKDB_NOSYSTEM: "1" },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(
          `envoyhome.timeout: local SQL exceeded ${LOCALSQL_TIMEOUT_MS}ms`,
        ),
      );
    }, LOCALSQL_TIMEOUT_MS);
    child.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString("utf8");
      if (stdout.length > 8 * 1024 * 1024) {
        child.kill("SIGKILL");
        reject(new Error("envoyhome.localsql_failed: stdout exceeds 8 MiB"));
      }
    });
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `envoyhome.localsql_failed: duckdb exited ${code}: ${stderr.slice(0, 400) || stdout.slice(0, 200)}`,
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export async function runSqlLoad(input: {
  args: Record<string, unknown>;
} & PathInput): Promise<string> {
  return withLocalSqlLock(async () => {
    requireDuckdbBinary();
    const name = assertTableName(String(input.args.name ?? ""));
    const sourcePath =
      typeof input.args.sourcePath === "string"
        ? input.args.sourcePath.trim()
        : "";
    if (!sourcePath) {
      throw new Error("envoyhome.bad_params: sql_load requires sourcePath");
    }
    const sheetName =
      typeof input.args.sheetName === "string" && input.args.sheetName.trim()
        ? input.args.sheetName.trim()
        : undefined;
    const clear = input.args.clear === true;

    // Validate file is readable + jailed now
    const mat = await materializeSource(input, sourcePath, sheetName);
    if (mat.cleanup) {
      await rm(mat.cleanup, { force: true }).catch(() => undefined);
    }

    let registry = await readRegistry(input);
    if (clear) registry = { version: 1, tables: [], updatedAt: "" };
    registry.tables = registry.tables.filter((t) => t.name !== name);
    if (registry.tables.length >= LOCALSQL_MAX_LOAD_FILES) {
      throw new Error(
        `envoyhome.bad_params: registry exceeds ${LOCALSQL_MAX_LOAD_FILES} tables — clear or drop`,
      );
    }
    const kind = extname(sourcePath).toLowerCase() === ".xlsx" ? "xlsx" : "csv";
    registry.tables.push({
      name,
      sourcePath: sourcePath.replace(/\\/g, "/"),
      kind,
      ...(sheetName ? { sheetName } : {}),
    });
    await writeRegistry(input, registry);
    return JSON.stringify({
      name,
      sourcePath: sourcePath.replace(/\\/g, "/"),
      kind,
      ...(sheetName ? { sheetName } : {}),
      registryUri: LOCALSQL_REGISTRY_REL,
      tables: registry.tables.map((t) => t.name),
    });
  });
}

export async function runSqlQuery(input: {
  args: Record<string, unknown>;
} & PathInput): Promise<string> {
  return withLocalSqlLock(async () => {
    const binary = requireDuckdbBinary();
    const sqlRaw = typeof input.args.sql === "string" ? input.args.sql : "";
    const sql = assertSafeLocalSql(sqlRaw);

    const registry = await readRegistry(input);
    const inlineTables: Array<{ name: string; sourcePath: string; sheetName?: string }> =
      [];
    if (Array.isArray(input.args.tables)) {
      for (const t of input.args.tables) {
        if (!t || typeof t !== "object") continue;
        const o = t as Record<string, unknown>;
        if (typeof o.name !== "string" || typeof o.sourcePath !== "string") {
          throw new Error(
            "envoyhome.bad_params: tables[] entries need name + sourcePath",
          );
        }
        inlineTables.push({
          name: assertTableName(o.name),
          sourcePath: o.sourcePath.trim(),
          ...(typeof o.sheetName === "string" && o.sheetName.trim()
            ? { sheetName: o.sheetName.trim() }
            : {}),
        });
      }
    }

    const toLoad: Array<{ name: string; sourcePath: string; sheetName?: string }> =
      [];
    if (inlineTables.length) {
      toLoad.push(...inlineTables);
    } else {
      for (const t of registry.tables) {
        toLoad.push({
          name: t.name,
          sourcePath: t.sourcePath,
          ...(t.sheetName ? { sheetName: t.sheetName } : {}),
        });
      }
    }
    if (toLoad.length > LOCALSQL_MAX_LOAD_FILES) {
      throw new Error(
        `envoyhome.bad_params: exceeds ${LOCALSQL_MAX_LOAD_FILES} loaded tables`,
      );
    }

    const cleanups: string[] = [];
    const loads: Array<{ name: string; absPath: string }> = [];
    try {
      for (const t of toLoad) {
        const mat = await materializeSource(input, t.sourcePath, t.sheetName);
        if (mat.cleanup) cleanups.push(mat.cleanup);
        loads.push({ name: t.name, absPath: mat.absPath });
      }

      const preamble = buildLoadPreamble(loads);
      const lead = sql.replace(/--.*$/gm, "").trim();
      const isSelectish = /^(with|select)\b/i.test(lead);
      const producesCsv =
        isSelectish ||
        /^(describe|show|summarize|explain)\b/i.test(lead);

      let uri: string | undefined;
      let rows = 0;
      let cols = 0;
      let preview = "";
      let summary = "";

      if (producesCsv) {
        const body = isSelectish
          ? `SELECT * FROM (${sql}) AS _eh_q LIMIT ${LOCALSQL_MAX_RESULT_ROWS + 1}`
          : sql;
        const script = `${preamble}\n${body}`;
        const { stdout } = await runDuckdbScript(binary, script, {
          csvStdout: true,
        });
        const table = parseCsvText(stdout || "\n");
        if (table.rows.length > LOCALSQL_MAX_RESULT_ROWS) {
          throw new Error(
            `envoyhome.bad_params: result exceeds ${LOCALSQL_MAX_RESULT_ROWS} rows`,
          );
        }
        assertTableCaps(table);
        uri =
          typeof input.args.path === "string" && input.args.path.trim()
            ? assertTableOutputPath(input.args.path.trim())
            : defaultTableUri("sql-query");
        const out = resolveSandboxPath(
          toolPathOpts(input.paths, input.accountId, input, true, uri),
        );
        await mkdir(dirname(out.absolute), { recursive: true });
        const csv = tableToCsv(table);
        await writeFile(out.absolute, csv, "utf8");
        rows = table.rows.length;
        cols = table.headers.length;
        preview = tableToGfm(table);
        summary = `rows=${rows} cols=${cols}`;
      } else {
        // CREATE TABLE etc. — execute without CSV capture
        const script = `${preamble}\n${sql}`;
        await runDuckdbScript(binary, script);
        summary = "ok (non-SELECT statement)";
      }

      return JSON.stringify({
        ...(uri ? { uri } : {}),
        rows,
        cols,
        summary,
        ...(preview ? { preview } : {}),
        loaded: loads.map((l) => l.name),
        mimeType: uri ? "text/csv" : undefined,
      });
    } finally {
      for (const c of cleanups) {
        await rm(c, { force: true }).catch(() => undefined);
      }
    }
  });
}
