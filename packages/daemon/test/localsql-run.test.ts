// Design §9.5k / P2-S2 — V-OFFICE-40 / V-OFFICE-41.

import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { homePaths } from "../dist/home-paths.js";
import {
  LocalSqlInstallService,
  __resetLocalSqlInstallForTests,
} from "../dist/localsql-install.js";
import {
  runSqlLoad,
  runSqlQuery,
  __setLocalSqlExecForTests,
} from "../dist/localsql-run.js";
import { assertSafeLocalSql } from "../dist/localsql-policy.js";
import { runExtendedWorkflowTool } from "../dist/workflow-tools.js";
import { BUILTIN_TOOLS } from "@envoyhome/harness-host";

async function withSqlEnv(
  fn: (ctx: {
    paths: ReturnType<typeof homePaths>;
    accountId: string;
    files: string;
    binary: string;
  }) => Promise<void>,
): Promise<void> {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-sql-run-"));
  const binary = join(stateDir, "fake-duckdb");
  await writeFile(
    binary,
    "#!/bin/sh\necho 'fake duckdb should be hooked'\nexit 1\n",
    "utf8",
  );
  await chmod(binary, 0o755);
  __resetLocalSqlInstallForTests();
  __setLocalSqlExecForTests(null);
  const paths = homePaths(stateDir);
  const accountId = "acct1";
  const files = paths.accountFiles(accountId);
  await mkdir(files, { recursive: true });
  const prev = process.env.ENVOYHOME_DUCKDB;
  process.env.ENVOYHOME_DUCKDB = binary;
  const svc = new LocalSqlInstallService(paths, process.env);
  await svc.load();
  try {
    await fn({ paths, accountId, files, binary });
  } finally {
    __setLocalSqlExecForTests(null);
    __resetLocalSqlInstallForTests();
    if (prev === undefined) delete process.env.ENVOYHOME_DUCKDB;
    else process.env.ENVOYHOME_DUCKDB = prev;
    await rm(stateDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

test("V-OFFICE-40: sql_load jail paths only", async () => {
  await withSqlEnv(async ({ paths, accountId, files }) => {
    await writeFile(join(files, "sales.csv"), "Name,Qty\nalpha,3\nbeta,1\n", "utf8");

    await assert.rejects(
      () =>
        runSqlLoad({
          args: { name: "sales", sourcePath: "../etc/passwd" },
          paths,
          accountId,
        }),
      /path escape|bad_params|jail/i,
    );

    await assert.rejects(
      () =>
        runSqlLoad({
          args: { name: "sales", sourcePath: "/etc/passwd" },
          paths,
          accountId,
        }),
      /path escape|bad_params/i,
    );

    await assert.rejects(
      () =>
        runSqlLoad({
          args: { name: "sales", sourcePath: "notes.txt" },
          paths,
          accountId,
        }),
      /\.csv|\.xlsx/i,
    );

    const ok = JSON.parse(
      await runSqlLoad({
        args: { name: "sales", sourcePath: "sales.csv" },
        paths,
        accountId,
      }),
    );
    assert.equal(ok.name, "sales");
    assert.equal(ok.sourcePath, "sales.csv");
    assert.ok(ok.tables.includes("sales"));
  });
});

test("V-OFFICE-41: sql_query caps + statement refuse corpus", async () => {
  // Policy corpus (S0 freeze — still the gate for S2).
  assert.throws(() => assertSafeLocalSql("ATTACH 'x.db' AS x"), /ATTACH/);
  assert.throws(() => assertSafeLocalSql("COPY t TO 'out.csv'"), /COPY/);
  assert.throws(
    () => assertSafeLocalSql("SELECT * FROM read_csv_auto('x.csv')"),
    /read_/,
  );
  assert.throws(
    () => assertSafeLocalSql("SELECT * FROM 'https://evil.example/a.csv'"),
    /http/,
  );
  assert.throws(() => assertSafeLocalSql("SELECT 1; SELECT 2"), /multi-statement/);
  assert.throws(() => assertSafeLocalSql("PRAGMA version"), /PRAGMA/);
  assert.throws(() => assertSafeLocalSql("INSTALL httpfs"), /INSTALL/);

  await withSqlEnv(async ({ paths, accountId, files }) => {
    await writeFile(
      join(files, "a.csv"),
      "region,qty\nnorth,10\nsouth,4\n",
      "utf8",
    );

    // Path refuse via inline tables[] (before DuckDB).
    await assert.rejects(
      () =>
        runSqlQuery({
          args: {
            sql: "SELECT * FROM t",
            tables: [{ name: "t", sourcePath: "../../etc/passwd" }],
          },
          paths,
          accountId,
        }),
      /path escape|bad_params/i,
    );

    __setLocalSqlExecForTests(async (_bin, script, opts) => {
      if (!opts?.csvStdout) return { stdout: "", stderr: "" };
      // Emulate DuckDB CSV for SELECT on loaded table
      assert.match(script, /read_csv_auto/);
      assert.match(script, /SELECT/);
      assert.doesNotMatch(script, /ATTACH|COPY|https?:\/\//i);
      return {
        stdout: "region,qty\nnorth,10\nsouth,4\n",
        stderr: "",
      };
    });

    await runSqlLoad({
      args: { name: "a", sourcePath: "a.csv" },
      paths,
      accountId,
    });

    const out = JSON.parse(
      await runSqlQuery({
        args: { sql: "SELECT * FROM a" },
        paths,
        accountId,
      }),
    );
    assert.match(out.uri, /^output\/tables\//);
    assert.equal(out.rows, 2);
    assert.equal(out.cols, 2);
    const csv = await readFile(
      join(files, out.uri),
      "utf8",
    );
    assert.match(csv, /north/);

    // Refuse corpus still enforced at tool boundary
    await assert.rejects(
      () =>
        runSqlQuery({
          args: { sql: "SELECT * FROM read_csv('x.csv')" },
          paths,
          accountId,
        }),
      /localsql_refused|read_/,
    );

    // Row-cap overflow via exec returning too many rows
    __setLocalSqlExecForTests(async () => {
      const header = "id\n";
      const rows = Array.from({ length: 10_001 }, (_, i) => `${i}\n`).join("");
      return { stdout: header + rows, stderr: "" };
    });
    await assert.rejects(
      () =>
        runSqlQuery({
          args: {
            sql: "SELECT * FROM a",
            tables: [{ name: "a", sourcePath: "a.csv" }],
          },
          paths,
          accountId,
        }),
      /10.?000|exceeds/i,
    );
  });
});

test("V-OFFICE-40: sql_load persists sheetName for sql_query", async () => {
  await withSqlEnv(async ({ paths, accountId, files }) => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const s1 = wb.addWorksheet("Sheet1");
    s1.addRow(["a", "b"]);
    s1.addRow(["wrong", "1"]);
    const s2 = wb.addWorksheet("Sales");
    s2.addRow(["region", "qty"]);
    s2.addRow(["north", "9"]);
    await wb.xlsx.writeFile(join(files, "multi.xlsx"));

    const load = JSON.parse(
      await runSqlLoad({
        args: {
          name: "sales",
          sourcePath: "multi.xlsx",
          sheetName: "Sales",
        },
        paths,
        accountId,
      }),
    );
    assert.equal(load.sheetName, "Sales");

    const regRaw = await readFile(
      join(files, "output/tables/.localsql-registry.json"),
      "utf8",
    );
    const reg = JSON.parse(regRaw) as {
      tables: Array<{ name: string; sheetName?: string }>;
    };
    assert.equal(reg.tables[0]?.sheetName, "Sales");

    __setLocalSqlExecForTests(async (_b, script, opts) => {
      if (!opts?.csvStdout) return { stdout: "", stderr: "" };
      // Preamble must load the Sales sheet materialization (CSV with north).
      assert.match(script, /read_csv_auto/);
      return { stdout: "region,qty\nnorth,9\n", stderr: "" };
    });

    const out = JSON.parse(
      await runSqlQuery({
        args: { sql: "SELECT * FROM sales" },
        paths,
        accountId,
      }),
    );
    assert.equal(out.rows, 1);
    assert.match(out.preview ?? "", /north/);
  });
});

test("V-OFFICE-40/41: builtins + workflow dispatch", async () => {
  assert.ok(BUILTIN_TOOLS.sql_load);
  assert.ok(BUILTIN_TOOLS.sql_query);
  assert.equal(BUILTIN_TOOLS.sql_load.risk, "write");
  assert.equal(BUILTIN_TOOLS.sql_query.grantable, true);

  await withSqlEnv(async ({ paths, accountId, files }) => {
    await writeFile(join(files, "t.csv"), "x,y\n1,2\n", "utf8");
    __setLocalSqlExecForTests(async (_b, _s, opts) => {
      if (!opts?.csvStdout) return { stdout: "", stderr: "" };
      return { stdout: "x,y\n1,2\n", stderr: "" };
    });

    const load = JSON.parse(
      await runExtendedWorkflowTool({
        tool: "sql_load",
        args: { name: "t", sourcePath: "t.csv" },
        skills: { listInstalled: async () => [] } as never,
        channels: { getChannelStatus: () => ({ enabled: false }) } as never,
        paths,
        accountId,
      }),
    );
    assert.equal(load.name, "t");

    const q = JSON.parse(
      await runExtendedWorkflowTool({
        tool: "sql_query",
        args: { sql: "SELECT * FROM t" },
        skills: { listInstalled: async () => [] } as never,
        channels: { getChannelStatus: () => ({ enabled: false }) } as never,
        paths,
        accountId,
      }),
    );
    assert.match(q.uri, /^output\/tables\//);
  });
});
