import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { homePaths } from "../dist/home-paths.js";
import { ScheduleService } from "../dist/schedule/service.js";

async function withService(
  fn: (svc: ScheduleService, clock: { now: Date }) => Promise<void>,
) {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-sched-"));
  const clock = { now: new Date("2026-10-09T06:00:00.000Z") };
  const fires: string[] = [];
  const svc = new ScheduleService({
    paths: homePaths(stateDir),
    now: () => clock.now,
    defaultTimeZone: "Asia/Shanghai",
    onFire: async (job) => {
      fires.push(job.id);
      return { execStatus: "ok", deliveryStatus: "none" };
    },
  });
  try {
    await svc.watchAccount("alice");
    await fn(svc, clock);
    return fires;
  } finally {
    await svc.stop();
    await rm(stateDir, { recursive: true, force: true });
  }
}

test("V-CRON: propose → confirm arms job; fire at due time", async () => {
  await withService(async (svc, clock) => {
    const proposal = await svc.proposeFromText("alice", "Remind me in 5 minutes to stretch");
    assert.ok(!("error" in proposal));
    if ("error" in proposal) return;
    assert.match(proposal.resolvedLocal, /Asia\/Shanghai/);
    const job = await svc.confirmProposal(proposal.proposalId);
    assert.equal(job.enabled, true);
    assert.ok(job.nextRunAt);
    // Not due yet
    let receipts = await svc.tick(clock.now);
    assert.equal(receipts.length, 0);
    // Advance past due
    clock.now = new Date(clock.now.getTime() + 6 * 60_000);
    receipts = await svc.tick(clock.now);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]!.execStatus, "ok");
    const after = await svc.store.getJob("alice", job.id);
    assert.equal(after?.enabled, false); // one-shot done
    assert.equal(after?.nextRunAt, null);
  });
});

test("V-CRON: confirm required — proposal alone does not fire", async () => {
  await withService(async (svc, clock) => {
    await svc.proposeFromText("alice", "Remind me in 1 minutes to x");
    clock.now = new Date(clock.now.getTime() + 120_000);
    const receipts = await svc.tick(clock.now);
    assert.equal(receipts.length, 0);
  });
});

test("V-CRON: grace_catchup past grace advances without firing (no stampede)", async () => {
  await withService(async (svc, clock) => {
    const job = await svc.createJob({
      accountId: "alice",
      name: "remind",
      spec: {
        kind: "cron",
        cronExpr: "0 8 * * *",
        timeZone: "Asia/Shanghai",
      },
      payload: { kind: "notify", message: "hi" },
      missPolicy: "grace_catchup",
    });
    // Due 1 hour ago — beyond RECURRING_GRACE_MS (5 min)
    job.nextRunAt = new Date(clock.now.getTime() - 3600_000).toISOString();
    await svc.store.upsertJob(job);
    const receipts = await svc.tick(clock.now);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]!.execStatus, "skipped");
    assert.equal(receipts[0]!.error, "missed_grace_expired");
    const after = await svc.store.getJob("alice", job.id);
    assert.ok(after?.nextRunAt);
    assert.ok(new Date(after!.nextRunAt!).getTime() > clock.now.getTime());
  });
});

test("V-CRON: one-shot past grace expires without firing", async () => {
  await withService(async (svc, clock) => {
    const job = await svc.createJob({
      accountId: "alice",
      name: "once",
      spec: {
        kind: "at",
        whenInstant: new Date(clock.now.getTime() - 600_000).toISOString(),
        timeZone: "UTC",
      },
      payload: { kind: "notify", message: "late" },
      missPolicy: "grace_catchup",
    });
    job.nextRunAt = job.spec.whenInstant!;
    await svc.store.upsertJob(job);
    const receipts = await svc.tick(clock.now);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]!.execStatus, "skipped");
    assert.equal(receipts[0]!.error, "missed_expired");
    const after = await svc.store.getJob("alice", job.id);
    assert.equal(after?.enabled, false);
    assert.equal(after?.nextRunAt, null);
  });
});

test("V-CRON: workflow sync preserves consecutiveErrors / lastRunAt", async () => {
  await withService(async (svc, clock) => {
    await svc.syncWorkflowSchedules("alice", [
      { id: "morning", schedule: "0 7 * * *", canActuate: false },
    ]);
    const [job] = (await svc.store.listJobs("alice")).filter((j) => j.source === "workflow");
    assert.ok(job);
    job.consecutiveErrors = 3;
    job.lastRunAt = clock.now.toISOString();
    const next = job.nextRunAt;
    await svc.store.upsertJob(job);
    await svc.syncWorkflowSchedules("alice", [
      { id: "morning", schedule: "0 7 * * *", canActuate: false },
    ]);
    const again = await svc.store.getJob("alice", job!.id);
    assert.equal(again?.consecutiveErrors, 3);
    assert.equal(again?.lastRunAt, job!.lastRunAt);
    assert.equal(again?.nextRunAt, next);
  });
});

test("V-CRON: proposal survives store reload (durable)", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-sched-prop-"));
  const clock = { now: new Date("2026-10-09T06:00:00.000Z") };
  const svc = new ScheduleService({
    paths: homePaths(stateDir),
    now: () => clock.now,
    defaultTimeZone: "UTC",
  });
  try {
    await svc.watchAccount("alice");
    const proposal = await svc.proposeFromText("alice", "Remind me in 10 minutes to x");
    assert.ok(!("error" in proposal));
    if ("error" in proposal) return;
    // Simulate restart: new service, same disk
    await svc.stop();
    const svc2 = new ScheduleService({
      paths: homePaths(stateDir),
      now: () => clock.now,
      defaultTimeZone: "UTC",
    });
    await svc2.watchAccount("alice");
    const job = await svc2.confirmProposal(proposal.proposalId);
    assert.equal(job.enabled, true);
    await svc2.stop();
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-CRON: cron recurring advances nextRun at dispatch (no double fire)", async () => {
  const fires: string[] = [];
  await withService(async (svc, clock) => {
    const job = await svc.createJob({
      accountId: "alice",
      name: "daily",
      spec: { kind: "cron", cronExpr: "0 8 * * *", timeZone: "Asia/Shanghai" },
      payload: { kind: "notify", message: "hi" },
      missPolicy: "grace_catchup",
    });
    // Force nextRunAt to now
    job.nextRunAt = clock.now.toISOString();
    await svc.store.upsertJob(job);
    const r1 = await svc.tick(clock.now);
    assert.equal(r1.length, 1);
    const mid = await svc.store.getJob("alice", job.id);
    assert.ok(mid?.nextRunAt);
    assert.ok(new Date(mid!.nextRunAt!).getTime() > clock.now.getTime());
    // Same now again — should not re-fire
    const r2 = await svc.tick(clock.now);
    assert.equal(r2.length, 0);
    fires.push(...r1.map((x) => x.jobId));
  });
  assert.equal(fires.length, 1);
});

test("V-CRON: missPolicy=skip does not catch up overdue admin workflow", async () => {
  await withService(async (svc, clock) => {
    const job = await svc.createJob({
      accountId: "alice",
      name: "unlock",
      spec: { kind: "cron", cronExpr: "0 7 * * *", timeZone: "Asia/Shanghai" },
      payload: { kind: "workflow", workflowId: "unlock_door" },
      missPolicy: "skip",
    });
    // Pretend due 1 hour ago (beyond grace)
    job.nextRunAt = new Date(clock.now.getTime() - 3600_000).toISOString();
    await svc.store.upsertJob(job);
    const receipts = await svc.tick(clock.now);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]!.execStatus, "skipped");
    assert.equal(receipts[0]!.error, "missed_skip");
  });
});

test("V-CRON: workflow sync creates wf: jobs", async () => {
  await withService(async (svc) => {
    await svc.syncWorkflowSchedules("alice", [
      { id: "morning", schedule: "0 7 * * *", canActuate: false },
      { id: "gate", schedule: { cron: "0 6 * * *", timeZone: "Asia/Shanghai" }, canActuate: true },
    ]);
    const jobs = await svc.store.listJobs("alice");
    const wf = jobs.filter((j) => j.source === "workflow");
    const ids = wf.map((j) => j.id).sort();
    assert.deepEqual(ids, ["wf:alice:gate", "wf:alice:morning"]);
    const gate = wf.find((j) => j.id.includes("gate"));
    assert.equal(gate?.missPolicy, "skip");
    assert.equal(gate?.payload.kind, "workflow");
    const consolidate = jobs.find((j) => j.id.startsWith("system:consolidate:"));
    assert.ok(consolidate);
    assert.equal(consolidate?.payload.systemJob, "consolidate");
  });
});

test("V-CRON: parseConsolidateAt + ensureConsolidateJob cron", async () => {
  await withService(async (svc) => {
    const job = await svc.ensureConsolidateJob("alice", { consolidateAt: "4:15" });
    assert.equal(job.spec.cronExpr, "15 4 * * *");
    assert.equal(job.payload.kind, "system");
  });
});

test("V-CRON: auto-disable after consecutive errors", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-sched-err-"));
  let clock = new Date("2026-10-09T06:00:00.000Z");
  const svc = new ScheduleService({
    paths: homePaths(stateDir),
    now: () => clock,
    defaultTimeZone: "UTC",
    onFire: async () => ({ execStatus: "error", deliveryStatus: "none", error: "boom" }),
  });
  try {
    await svc.watchAccount("alice");
    const job = await svc.createJob({
      accountId: "alice",
      name: "flaky",
      spec: { kind: "every", everyMs: 60_000, timeZone: "UTC" },
      payload: { kind: "notify", message: "x" },
    });
    for (let i = 0; i < 5; i++) {
      job.nextRunAt = clock.toISOString();
      await svc.store.upsertJob(job);
      await svc.tick(clock);
      clock = new Date(clock.getTime() + 60_000);
      const j = await svc.store.getJob("alice", job.id);
      Object.assign(job, j);
    }
    const final = await svc.store.getJob("alice", job.id);
    assert.equal(final?.enabled, false);
    assert.match(final?.lastError ?? "", /auto_disabled/);
  } finally {
    await svc.stop();
    await rm(stateDir, { recursive: true, force: true });
  }
});
