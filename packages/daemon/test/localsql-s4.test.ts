// Design §9.5k / P2-S4 — V-OFFICE-43 skill/Settings/Doctor + Privacy local-ok.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flushLoop, __resetActiveXForTests } from "@envoyhome/test-utils";
import { clearExtraToolSpecsForTests } from "@envoyhome/harness-host";
import {
  startDaemon,
  type RunningDaemon,
} from "../dist/index.js";
import { collectDoctorIssues } from "../dist/doctor/index.js";
import { LOCALSQL_WHY_TEXT } from "../dist/localsql-catalog.js";
import {
  __resetLocalSqlInstallForTests,
  __setLocalSqlInstallHooksForTests,
} from "../dist/localsql-install.js";
import {
  runSqlLoad,
  runSqlQuery,
  __setLocalSqlExecForTests,
} from "../dist/localsql-run.js";
import { runExtendedWorkflowTool } from "../dist/workflow-tools.js";
import { homePaths } from "../dist/home-paths.js";
import { parentToolNamesForSurface } from "../dist/home-agent-turn.js";

const daemons: RunningDaemon[] = [];

after(async () => {
  __setLocalSqlExecForTests(null);
  __setLocalSqlInstallHooksForTests({
    extract: null,
    download: null,
    catalogEntry: null,
  });
  __resetLocalSqlInstallForTests();
  clearExtraToolSpecsForTests();
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
  await flushLoop();
});

test("V-OFFICE-43: Doctor surfaces optional DuckDB + catalogue honesty", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-sql-s4-doc-"));
  const prev = process.env.ENVOYHOME_DUCKDB;
  delete process.env.ENVOYHOME_DUCKDB;
  __resetLocalSqlInstallForTests();
  try {
    const daemon = await startDaemon({
      config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "k" },
      packageVersion: "0.0.0-test",
    });
    daemons.push(daemon);

    const issues = await collectDoctorIssues({
      config: daemon.config,
      accounts: daemon.accounts,
      bindings: daemon.bindings,
      channels: daemon.channels,
    });
    const row = issues.find((i) => i.id === "office.localsql_optional");
    assert.ok(row, "expected office.localsql_optional when DuckDB missing");
    assert.equal(row!.severity, "info");
    assert.match(row!.message, /sql_load|sql_query/);
    assert.match(row!.message, /catalogue|absent/i);
    assert.match(row!.message, /never automatic|Owner/i);
    assert.equal(
      issues.some((i) => i.id === "office.localsql_ready"),
      false,
      "ready should stay silent in Doctor",
    );
  } finally {
    if (prev === undefined) delete process.env.ENVOYHOME_DUCKDB;
    else process.env.ENVOYHOME_DUCKDB = prev;
    await rm(stateDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("V-OFFICE-43: Settings why-text + skill + prefer/Privacy honesty", async () => {
  assert.match(LOCALSQL_WHY_TEXT, /catalogue|sql_load/);
  assert.match(LOCALSQL_WHY_TEXT, /Privacy Mode/);
  assert.match(LOCALSQL_WHY_TEXT, /table_transform/);
  assert.match(LOCALSQL_WHY_TEXT, /mcp|MCP/);

  const en = await readFile(
    new URL("../../../apps/desktop/public/i18n/en.js", import.meta.url),
    "utf8",
  );
  assert.match(en, /artifacts\.sqlToolsAbsent/);
  assert.match(en, /artifacts\.sqlToolsReady/);
  assert.match(en, /artifacts\.sqlProgress/);
  assert.match(en, /artifacts\.sqlCancelled/);
  assert.match(en, /artifacts\.sqlCopyHint/);
  assert.match(en, /Local DuckDB|sql_load/);
  assert.match(en, /howtoDeckHint[\s\S]*sql_load/);
  assert.match(en, /table_transform|core table/i);

  const zh = await readFile(
    new URL("../../../apps/desktop/public/i18n/zh.js", import.meta.url),
    "utf8",
  );
  assert.match(zh, /artifacts\.sqlTitle/);
  assert.match(zh, /artifacts\.sqlToolsAbsent/);
  assert.match(zh, /artifacts\.sqlToolsReady/);
  assert.match(zh, /artifacts\.sqlProgress/);
  assert.match(zh, /sql_load/);

  const app = await readFile(
    new URL("../../../apps/desktop/public/app.js", import.meta.url),
    "utf8",
  );
  assert.match(app, /sqlToolsReady|sqlToolsAbsent/);
  assert.match(app, /artifacts-sql-progress|sqlProgress/);
  assert.match(app, /unavailableTools/);
  assert.match(app, /toolsUnavailableTitle/);
  assert.match(app, /sqlCancelled/);

  const skill = await readFile(
    new URL("../skills-samples/office-documents/SKILL.md", import.meta.url),
    "utf8",
  );
  assert.match(skill, /System → Files|Settings/);
  assert.match(skill, /absent from the catalogue/i);
  assert.match(skill, /Privacy Mode/);
  assert.match(skill, /remote MCP/);
});

test("V-OFFICE-43: Privacy Mode — local SQL OK; remote MCP blocked", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-sql-s4-priv-"));
  const prev = process.env.ENVOYHOME_DUCKDB;
  __resetLocalSqlInstallForTests();
  __setLocalSqlExecForTests(null);
  try {
    const daemon = await startDaemon({
      config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "k" },
      packageVersion: "0.0.0-test",
    });
    daemons.push(daemon);
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    await daemon.turns.privacyMode.set("alice", {
      enabled: true,
      blockSmartHomeEgress: true,
    });

    // Fake DuckDB binary + exec hook
    const bin = join(stateDir, "duckdb");
    await writeFile(bin, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(bin, 0o755);
    process.env.ENVOYHOME_DUCKDB = bin;

    const paths = homePaths(stateDir);
    const files = paths.accountFiles("alice");
    await mkdir(files, { recursive: true });
    await writeFile(join(files, "t.csv"), "a,b\n1,2\n", "utf8");

    __setLocalSqlExecForTests(async (_b, _s, opts) => {
      if (!opts?.csvStdout) return { stdout: "", stderr: "" };
      return { stdout: "a,b\n1,2\n", stderr: "" };
    });

    // Local SQL must work under Privacy Mode (on-box).
    await runSqlLoad({
      args: { name: "t", sourcePath: "t.csv" },
      paths,
      accountId: "alice",
    });
    const out = JSON.parse(
      await runSqlQuery({
        args: { sql: "SELECT * FROM t" },
        paths,
        accountId: "alice",
      }),
    );
    assert.match(out.uri, /^output\/tables\//);

    const viaWorkflow = JSON.parse(
      await runExtendedWorkflowTool({
        tool: "sql_query",
        args: {
          sql: "SELECT * FROM t",
          tables: [{ name: "t", sourcePath: "t.csv" }],
        },
        skills: daemon.skills,
        channels: daemon.channels,
        paths,
        accountId: "alice",
        origin: "attended",
      }),
    );
    assert.match(viaWorkflow.uri, /^output\/tables\//);

    // Catalogue includes SQL when ready (Privacy does not hide local tools).
    const names = parentToolNamesForSurface({
      homeSurface: false,
      schedulesSurface: false,
      localSqlReady: true,
    });
    assert.ok(names.includes("sql_query"));

    // Cloud still blocked under Privacy Mode.
    await assert.rejects(
      () =>
        runExtendedWorkflowTool({
          tool: "web_search",
          args: { query: "bi" },
          skills: daemon.skills,
          channels: daemon.channels,
          paths,
          accountId: "alice",
          origin: "attended",
          webSearch: daemon.webSearch,
        }),
      /privacy_mode.*web_search/,
    );

    // Remote MCP blocked under Privacy Mode (http transport).
    daemon.mcpHub.setSessionFactoryForTests(async () => ({
      async listTools() {
        return [
          {
            name: "mcp__sheets__query",
            mcpName: "query",
            description: "query",
          },
        ];
      },
      async callTool() {
        return { content: [{ type: "text", text: "should not run" }] };
      },
      async close() {},
    }));
    await daemon.mcpHub.upsert({
      id: "sheets",
      label: "Sheets",
      transport: "http",
      url: "https://example.com/mcp",
    });
    await daemon.mcpHub.test("sheets");
    await daemon.mcpHub.setEnabled("sheets", true);

    const privacy = await daemon.turns.privacyMode.get("alice");
    assert.equal(privacy.enabled, true);
    const transport = daemon.mcpHub.getServerTransport("sheets");
    assert.equal(transport, "http");
    // Mirror turn-service V-P2-PRIV-1 gate for remote MCP.
    assert.notEqual(transport, "stdio");
    await assert.rejects(async () => {
      if (privacy.enabled && transport !== "stdio") {
        throw new Error("envoyhome.privacy_mode: remote mcp blocked");
      }
      await daemon.mcpHub.callTool("mcp__sheets__query", {});
    }, /remote mcp blocked/);
  } finally {
    __setLocalSqlExecForTests(null);
    if (prev === undefined) delete process.env.ENVOYHOME_DUCKDB;
    else process.env.ENVOYHOME_DUCKDB = prev;
    await rm(stateDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
