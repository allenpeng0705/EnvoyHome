import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyDoctorFixes,
  collectDoctorIssues,
  planHomeClawMigrate,
  DOCTOR_MIGRATE_HOMECLAW_PLAN_ID,
} from "../dist/doctor/index.js";
import { defaultConfig, dispatchForTest, loopbackSession, startDaemon } from "../dist/index.js";

test("B13: doctor fix returns before/after diff", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-doc-"));
  try {
    const config = defaultConfig({ stateDir, stateSchemaVersion: 0 });
    const issues = [
      {
        id: "state.schema_outdated",
        severity: "warn" as const,
        message: "outdated",
        fixable: true,
      },
    ];
    const result = await applyDoctorFixes({
      issueIds: ["state.schema_outdated"],
      issues,
      stateDir,
      config,
    });
    assert.equal(result.fixed.includes("state.schema_outdated"), true);
    assert.equal(result.diffs.length, 1);
    assert.notEqual(result.diffs[0]!.before, result.diffs[0]!.after);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("B13: HomeClaw migrate dry-run reports absent sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-hc-"));
  const target = await mkdtemp(join(tmpdir(), "eh-target-"));
  try {
    await mkdir(join(root, "config"), { recursive: true });
    await writeFile(join(root, "config", "core.yml"), "homeclaw_root: /tmp/hc\n", "utf8");
    const plan = await planHomeClawMigrate({
      homeClawRoot: root,
      targetStateDir: target,
      importChat: false,
    });
    assert.ok(plan);
    assert.ok(plan!.absent.includes("database/users.json"));
    assert.equal(plan!.importChat, false);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test("home.doctor includes migrate.homeclaw.plan when ENVOYHOME_HOMECLAW_ROOT set", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-doc-rpc-"));
  const hc = await mkdtemp(join(tmpdir(), "eh-hc2-"));
  const prev = process.env["ENVOYHOME_HOMECLAW_ROOT"];
  process.env["ENVOYHOME_HOMECLAW_ROOT"] = hc;
  try {
    await mkdir(join(hc, "database"), { recursive: true });
    await writeFile(join(hc, "database", "users.json"), "[]", "utf8");
    const daemon = await startDaemon({
      config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "k" },
      packageVersion: "0.0.0-test",
    });
    const resp = await dispatchForTest(
      {
        config: daemon.config,
        startedAt: daemon.startedAt,
        logger: daemon.logger,
        subscriptions: daemon.subscriptions,
        connections: () => 0,
        activeTurns: () => 0,
        onShutdown: () => undefined,
        packageVersion: "0.0.0-test",
        accounts: daemon.accounts,
        bindings: daemon.bindings,
        pairing: daemon.pairing,
        memory: daemon.memory,
        channels: daemon.channels,
        turns: daemon.turns,
        providers: daemon.providers,
        harnesses: daemon.harnesses,
        workflows: daemon.workflows,
        skills: daemon.skills,
        artifacts: daemon.artifacts,
        actuations: daemon.actuations,
        meshStatus: () => ({ kind: "no-node" as const }),
      },
      "home.doctor",
      {},
      loopbackSession(),
    );
    assert.ok("result" in resp);
    const issues = (resp.result as { issues: Array<{ id: string }> }).issues;
    assert.ok(issues.some((i) => i.id === DOCTOR_MIGRATE_HOMECLAW_PLAN_ID));
    await daemon.stop();
  } finally {
    if (prev === undefined) delete process.env["ENVOYHOME_HOMECLAW_ROOT"];
    else process.env["ENVOYHOME_HOMECLAW_ROOT"] = prev;
    await rm(stateDir, { recursive: true, force: true });
    await rm(hc, { recursive: true, force: true });
  }
});

test("fresh install doctor ok", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-doc-clean-"));
  try {
    const daemon = await startDaemon({
      config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "k" },
      packageVersion: "0.0.0-test",
    });
    const issues = await collectDoctorIssues({
      config: daemon.config,
      accounts: daemon.accounts,
      bindings: daemon.bindings,
      channels: daemon.channels,
    });
    assert.equal(
      issues.every((i) => i.severity !== "error"),
      true,
    );
    await daemon.stop();
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
