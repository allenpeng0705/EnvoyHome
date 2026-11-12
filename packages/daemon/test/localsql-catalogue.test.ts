// Design §9.5k / P2-S3 — V-OFFICE-42 catalogue absent-until-ready + prefer order.

import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { homePaths } from "../dist/home-paths.js";
import {
  LocalSqlInstallService,
  __resetLocalSqlInstallForTests,
  isLocalSqlRuntimeReady,
} from "../dist/localsql-install.js";
import { listWorkflowTools } from "../dist/workflow-tools.js";
import { parentToolNamesForSurface } from "../dist/home-agent-turn.js";
import { SkillService } from "../dist/skills.js";
import { ChannelService } from "../dist/channels/service.js";
import { DeviceCredentialStore } from "../dist/auth.js";
import { BindingStore } from "../dist/bindings.js";
import { DaemonLogger } from "../dist/logger.js";
import { clearExtraToolSpecsForTests } from "@envoyhome/harness-host";

test("V-OFFICE-42: sql tools absent from turn catalogue until ready", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-sql-cat-"));
  const prev = process.env.ENVOYHOME_DUCKDB;
  delete process.env.ENVOYHOME_DUCKDB;
  __resetLocalSqlInstallForTests();
  clearExtraToolSpecsForTests();
  try {
    const paths = homePaths(stateDir);
    const svc = new LocalSqlInstallService(paths, {
      ...process.env,
      ENVOYHOME_DUCKDB: "",
    });
    await svc.load();
    assert.equal(isLocalSqlRuntimeReady(process.env), false);

    const absent = parentToolNamesForSurface({
      homeSurface: false,
      schedulesSurface: false,
      localSqlReady: false,
    });
    assert.equal(absent.includes("sql_load"), false);
    assert.equal(absent.includes("sql_query"), false);
    assert.ok(absent.includes("table_transform"));

    const present = parentToolNamesForSurface({
      homeSurface: false,
      schedulesSurface: false,
      localSqlReady: true,
    });
    assert.ok(present.includes("sql_load"));
    assert.ok(present.includes("sql_query"));

    const skills = new SkillService(paths);
    const devices = new DeviceCredentialStore();
    const bindings = new BindingStore(stateDir, devices);
    const channels = new ChannelService({
      stateDir,
      bindings,
      logger: new DaemonLogger(),
      bundledPlugins: [],
    });
    await channels.loadPersisted();

    const toolsMissing = await listWorkflowTools({ skills, channels });
    const load = toolsMissing.find((t) => t.name === "sql_load");
    const query = toolsMissing.find((t) => t.name === "sql_query");
    assert.ok(load);
    assert.ok(query);
    assert.equal(load!.available, false);
    assert.equal(query!.available, false);
    assert.match(load!.unavailableReason ?? "", /DuckDB|Install/i);

    // Ready via env binary → catalogue available.
    const bin = join(stateDir, "duckdb");
    await writeFile(bin, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(bin, 0o755);
    process.env.ENVOYHOME_DUCKDB = bin;
    assert.equal(isLocalSqlRuntimeReady(process.env), true);

    const toolsReady = await listWorkflowTools({ skills, channels });
    assert.equal(toolsReady.find((t) => t.name === "sql_load")?.available, true);
    assert.equal(toolsReady.find((t) => t.name === "sql_query")?.available, true);
  } finally {
    clearExtraToolSpecsForTests();
    __resetLocalSqlInstallForTests();
    if (prev === undefined) delete process.env.ENVOYHOME_DUCKDB;
    else process.env.ENVOYHOME_DUCKDB = prev;
    await rm(stateDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("V-OFFICE-42: fence omits sql_* until allowLocalSql", async () => {
  const { parseAssistantToolCalls } = await import("@envoyhome/harness-host");
  const fence = [
    "```envoyhome-tools",
    JSON.stringify([
      { tool: "sql_query", args: { sql: "SELECT 1" } },
      { tool: "table_transform", args: { op: "normalize", markdown: "|a|\n|-|\n|1|" } },
    ]),
    "```",
  ].join("\n");

  const denied = parseAssistantToolCalls(fence, { allowSandbox: true });
  assert.equal(
    denied.tools.some((t) => t.tool === "sql_query"),
    false,
  );
  assert.ok(denied.tools.some((t) => t.tool === "table_transform"));

  const allowed = parseAssistantToolCalls(fence, {
    allowSandbox: true,
    allowLocalSql: true,
  });
  assert.ok(allowed.tools.some((t) => t.tool === "sql_query"));
  assert.ok(allowed.tools.some((t) => t.tool === "table_transform"));
});

test("V-OFFICE-42: prefer order core → SQL → MCP in skill + docs", async () => {
  const skill = await (
    await import("node:fs/promises")
  ).readFile(
    new URL("../skills-samples/office-documents/SKILL.md", import.meta.url),
    "utf8",
  );
  assert.match(skill, /table_transform|Core/);
  assert.match(skill, /sql_load|sql_query|Local SQL/);
  assert.match(skill, /mcp__/);
  assert.match(skill, /Privacy Mode|Privacy/);
  assert.match(skill, /[Nn]ever invent/);

  // Prefer order appears as Core then Local SQL then MCP (by section numbering).
  const coreAt = skill.search(/\*\*Core\*\*/);
  const sqlAt = skill.search(/\*\*Local SQL\*\*/);
  const mcpAt = skill.search(/\*\*Owner MCP\*\*/);
  assert.ok(coreAt >= 0 && sqlAt > coreAt && mcpAt > sqlAt);

  const docs = await (
    await import("node:fs/promises")
  ).readFile(
    new URL("../../../docs/office-bi-paths.md", import.meta.url),
    "utf8",
  );
  assert.match(docs, /absent from the turn catalogue/i);
  assert.match(docs, /Privacy Mode/);
  assert.match(docs, /table_transform/);
  assert.match(docs, /Local SQL/);
  assert.match(docs, /mcp__/);
});
