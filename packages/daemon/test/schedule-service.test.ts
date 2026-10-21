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

test("V-CRON: account IANA TZ preferred over host default for propose", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-sched-acctz-"));
  const clock = { now: new Date("2026-10-09T06:00:00.000Z") };
  const svc = new ScheduleService({
    paths: homePaths(stateDir),
    now: () => clock.now,
    defaultTimeZone: "UTC",
    accountTimeZone: async (id) => (id === "alice" ? "Asia/Shanghai" : undefined),
  });
  try {
    await svc.watchAccount("alice");
    const proposal = await svc.proposeFromText(
      "alice",
      "Remind me tomorrow at 9:00 to call",
    );
    assert.ok(!("error" in proposal));
    if ("error" in proposal) return;
    assert.match(proposal.resolvedLocal, /Asia\/Shanghai/);
    assert.equal(proposal.spec.timeZone, "Asia/Shanghai");
  } finally {
    await svc.stop();
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-CRON: resolveTimeZone override > account > host", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-sched-tzord-"));
  const clock = { now: new Date("2026-10-09T06:00:00.000Z") };
  const svc = new ScheduleService({
    paths: homePaths(stateDir),
    now: () => clock.now,
    defaultTimeZone: "UTC",
    accountTimeZone: async (id) => (id === "alice" ? "Asia/Shanghai" : undefined),
  });
  try {
    assert.equal(await svc.resolveTimeZone("alice", "America/New_York"), "America/New_York");
    assert.equal(await svc.resolveTimeZone("alice"), "Asia/Shanghai");
    assert.equal(await svc.resolveTimeZone("bob"), "UTC");
    // clientContext.timeZone on propose wins over account
    await svc.watchAccount("alice");
    const proposal = await svc.proposeFromText(
      "alice",
      "Remind me tomorrow at 9:00 to call",
      undefined,
      { clientContext: { timeZone: "America/New_York" } },
    );
    assert.ok(!("error" in proposal));
    if ("error" in proposal) return;
    assert.equal(proposal.spec.timeZone, "America/New_York");
  } finally {
    await svc.stop();
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-CRON: propose → confirm arms job; fire at due time", async () => {
  await withService(async (svc, clock) => {
    const proposal = await svc.proposeFromText("alice", "Remind me in 5 minutes to stretch");
    assert.ok(!("error" in proposal));
    if ("error" in proposal) return;
    assert.match(proposal.resolvedLocal, /Asia\/Shanghai/);
    const job = await svc.confirmProposal("alice", proposal.proposalId);
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

test("confirmProposal payload override replaces notify with workflow", async () => {
  await withService(async (svc) => {
    const proposal = await svc.proposeFromText("alice", "Remind me in 5 minutes to stretch");
    assert.ok(!("error" in proposal));
    if ("error" in proposal) return;
    assert.equal(proposal.payload.kind, "notify");
    const job = await svc.confirmProposal("alice", proposal.proposalId, {
      name: "Morning brief",
      payload: { kind: "workflow", workflowId: "morning_brief", message: "morning_brief" },
    });
    assert.equal(job.payload.kind, "workflow");
    assert.equal(job.payload.workflowId, "morning_brief");
    assert.equal(job.payload.message, "morning_brief");
    assert.equal(job.name, "Morning brief");
    assert.equal(job.missPolicy, "skip");
  });
});

test("normalizeUserSchedulePayload refuses system", async () => {
  const { normalizeUserSchedulePayload, normalizeScheduleSpec } = await import(
    "../dist/schedule/validate-payload.js"
  );
  const sys = normalizeUserSchedulePayload({ kind: "system", systemJob: "consolidate" });
  assert.equal(sys.ok, false);
  const tool = normalizeUserSchedulePayload({ kind: "tool", toolName: "sandbox_read" });
  assert.equal(tool.ok, true);
  if (tool.ok) assert.equal(tool.payload.toolName, "sandbox_read");
  const badAt = normalizeScheduleSpec({ kind: "at", timeZone: "UTC" });
  assert.equal(badAt.ok, false);
  const okCron = normalizeScheduleSpec({
    kind: "cron",
    cronExpr: "0 8 * * *",
    timeZone: "Asia/Shanghai",
  });
  assert.equal(okCron.ok, true);
  const badCron = normalizeScheduleSpec({
    kind: "cron",
    cronExpr: "0 8 *",
    timeZone: "UTC",
  });
  assert.equal(badCron.ok, false);
  const badTz = normalizeScheduleSpec({
    kind: "at",
    whenInstant: "2026-10-10T00:00:00.000Z",
    timeZone: "Not/AZone",
  });
  assert.equal(badTz.ok, false);
});

test("V-CRON: propose includes relativeHint + nextRunAt preview", async () => {
  await withService(async (svc) => {
    const proposal = await svc.proposeFromText("alice", "Remind me in 17 minutes to stretch");
    assert.ok(!("error" in proposal));
    if ("error" in proposal) return;
    assert.ok(proposal.relativeHint);
    assert.match(proposal.relativeHint!, /17 minute/);
    assert.ok(proposal.nextRunAt);
  });
});

test("V-CRON: receipt records latenessMs when fire is late", async () => {
  await withService(async (svc, clock) => {
    const proposal = await svc.proposeFromText("alice", "Remind me in 5 minutes to stretch");
    assert.ok(!("error" in proposal));
    if ("error" in proposal) return;
    await svc.confirmProposal("alice", proposal.proposalId);
    // Jump 10 minutes past due (beyond grace for display — still fires within oneshot grace? 5min due + 10 = 15min late from propose; oneshot grace is 120s)
    // Fire via run-now path: advance just past due so scheduledFor is in the past by ~1min
    clock.now = new Date(clock.now.getTime() + 6 * 60_000);
    const receipts = await svc.tick(clock.now);
    assert.equal(receipts.length, 1);
    assert.ok((receipts[0]!.latenessMs ?? 0) > 0);
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
    const job = await svc2.confirmProposal("alice", proposal.proposalId);
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

test("V-CRON-7: updateJob patches name/spec and recomputes nextRunAt", async () => {
  await withService(async (svc, clock) => {
    const job = await svc.createJob({
      accountId: "alice",
      name: "old",
      spec: {
        kind: "at",
        whenInstant: new Date(clock.now.getTime() + 3600_000).toISOString(),
        timeZone: "UTC",
      },
      payload: { kind: "notify", message: "hi" },
    });
    const prevNext = job.nextRunAt;
    const updated = await svc.updateJob("alice", job.id, {
      name: "new name",
      spec: {
        kind: "at",
        whenInstant: new Date(clock.now.getTime() + 7200_000).toISOString(),
        timeZone: "UTC",
      },
      payload: { kind: "notify", message: "bye" },
    });
    assert.equal(updated.name, "new name");
    assert.equal(updated.payload.message, "bye");
    assert.notEqual(updated.nextRunAt, prevNext);
    assert.ok(updated.nextRunAt);
  });
});

test("V-CRON-7: updateJob refuses workflow-synced name/spec/payload; enable-only", async () => {
  await withService(async (svc) => {
    await svc.syncWorkflowSchedules("alice", [
      { id: "morning", schedule: "0 7 * * *", canActuate: false },
    ]);
    const [wf] = (await svc.store.listJobs("alice")).filter((j) => j.source === "workflow");
    assert.ok(wf);
    await assert.rejects(
      () =>
        svc.updateJob("alice", wf!.id, {
          spec: { kind: "cron", cronExpr: "0 8 * * *", timeZone: "UTC" },
        }),
      /enable-only|workflow-synced/,
    );
    await assert.rejects(
      () =>
        svc.updateJob("alice", wf!.id, {
          payload: { kind: "notify", message: "nope" },
        }),
      /enable-only|workflow-synced/,
    );
    await assert.rejects(
      () => svc.updateJob("alice", wf!.id, { name: "renamed" }),
      /enable-only|workflow-synced/,
    );
    await assert.rejects(() => svc.removeJob("alice", wf!.id), /workflow-synced/);
    // enable-only still ok
    const toggled = await svc.updateJob("alice", wf!.id, { enabled: false });
    assert.equal(toggled.enabled, false);

    const user = await svc.createJob({
      accountId: "alice",
      name: "u",
      spec: { kind: "cron", cronExpr: "0 9 * * *", timeZone: "UTC" },
      payload: { kind: "notify", message: "x" },
    });
    await assert.rejects(
      () =>
        svc.updateJob("alice", user.id, {
          payload: { kind: "system", systemJob: "flush" },
        }),
      /system payload/,
    );
  });
});

test("V-CRON-7: system jobs immutable via update/remove; wrong-account confirm does not arm", async () => {
  await withService(async (svc) => {
    await svc.watchAccount("alice", { reviewEnabled: true });
    const sys = await svc.store.getJob("alice", "system:consolidate:alice");
    assert.ok(sys);
    await assert.rejects(
      () =>
        svc.updateJob("alice", sys!.id, {
          payload: { kind: "notify", message: "hijack" },
        }),
      /daemon-owned|system/,
    );
    await assert.rejects(
      () =>
        svc.updateJob("alice", sys!.id, {
          spec: { kind: "cron", cronExpr: "0 1 * * *", timeZone: "UTC" },
        }),
      /daemon-owned|system/,
    );
    await assert.rejects(() => svc.removeJob("alice", sys!.id), /system/);

    const proposal = await svc.proposeFromText("alice", "Remind me in 5 minutes to stretch");
    assert.ok(!("error" in proposal));
    if ("error" in proposal) return;
    await assert.rejects(
      () => svc.confirmProposal("bob", proposal.proposalId),
      /account mismatch/,
    );
    // Proposal still confirmable by rightful account
    const job = await svc.confirmProposal("alice", proposal.proposalId);
    assert.equal(job.enabled, true);
    assert.equal(job.accountId, "alice");
  });
});

test("V-CRON-11: normalize refuses invented agent WHEN via payload; agentTurn needs prompt", async () => {
  const { normalizeUserSchedulePayload } = await import("../dist/schedule/validate-payload.js");
  const badSys = normalizeUserSchedulePayload({ kind: "system", systemJob: "flush" });
  assert.equal(badSys.ok, false);
  const agentMissing = normalizeUserSchedulePayload({ kind: "agentTurn" });
  assert.equal(agentMissing.ok, false);
  const agentOk = normalizeUserSchedulePayload({
    kind: "agentTurn",
    prompt: "Draft a morning briefing from recent notes",
  });
  assert.equal(agentOk.ok, true);
  if (agentOk.ok) {
    assert.equal(agentOk.payload.kind, "agentTurn");
    assert.equal(agentOk.payload.toolPolicyPreset, "restricted");
    assert.ok((agentOk.payload.maxToolRounds ?? 0) <= 5);
  }
});

test("V-CRON-12: agentTurn job fires with frozen prompt; missPolicy skip", async () => {
  const { isElevatedProfile } = await import("../dist/browser-control.js");
  // Elevated browser never on schedules — personal/remote are elevated; fire path is
  // origin:unattended so V-OUT-9/10 refuse them (managed-only when grant + unattendedEnabled).
  // TurnService also forces browserDefaultProfile=managed for unattended.
  assert.equal(isElevatedProfile("personal"), true);
  assert.equal(isElevatedProfile("remote"), true);
  assert.equal(isElevatedProfile("managed"), false);

  const fires: Array<{ kind: string; prompt?: string; whenInstant?: string }> = [];
  const stateDir = await mkdtemp(join(tmpdir(), "eh-sched-agent-"));
  const clock = { now: new Date("2026-10-09T06:00:00.000Z") };
  const armedWhen = new Date(clock.now.getTime() + 60_000).toISOString();
  const svc = new ScheduleService({
    paths: homePaths(stateDir),
    now: () => clock.now,
    defaultTimeZone: "UTC",
    onFire: async (job) => {
      fires.push({
        kind: job.payload.kind,
        ...(job.payload.prompt ? { prompt: job.payload.prompt } : {}),
        ...(job.spec.whenInstant ? { whenInstant: job.spec.whenInstant } : {}),
      });
      return { execStatus: "ok", deliveryStatus: "none" };
    },
  });
  try {
    await svc.watchAccount("alice");
    const frozen = "Summarize calendar — do not invent a new fire time";
    const job = await svc.createJob({
      accountId: "alice",
      name: "morning agent",
      spec: {
        kind: "at",
        whenInstant: armedWhen,
        timeZone: "UTC",
      },
      payload: {
        kind: "agentTurn",
        prompt: frozen,
        toolPolicyPreset: "restricted",
        maxToolRounds: 3,
      },
    });
    assert.equal(job.missPolicy, "skip");
    clock.now = new Date(clock.now.getTime() + 120_000);
    const receipts = await svc.tick(clock.now);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]!.execStatus, "ok");
    assert.equal(fires.length, 1);
    assert.equal(fires[0]!.kind, "agentTurn");
    assert.equal(fires[0]!.prompt, frozen);
    // Fire uses stored spec — inventing a new WHEN at fire is impossible.
    assert.equal(fires[0]!.whenInstant, armedWhen);
  } finally {
    await svc.stop();
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-CRON-8: receipts capped and listable", async () => {
  await withService(async (svc, clock) => {
    const job = await svc.createJob({
      accountId: "alice",
      name: "once",
      spec: {
        kind: "at",
        whenInstant: new Date(clock.now.getTime() + 60_000).toISOString(),
        timeZone: "UTC",
      },
      payload: { kind: "notify", message: "x" },
    });
    clock.now = new Date(clock.now.getTime() + 120_000);
    const receipts = await svc.tick(clock.now);
    assert.equal(receipts.length, 1);
    const listed = await svc.store.listReceipts("alice", job.id);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]!.jobId, job.id);
    assert.equal(listed[0]!.execStatus, "ok");
  });
});

test("listUserReceipts hides system: consolidate/review rows", async () => {
  await withService(async (svc, clock) => {
    await svc.watchAccount("alice", { reviewEnabled: true });
    const user = await svc.createJob({
      accountId: "alice",
      name: "ping",
      spec: {
        kind: "at",
        whenInstant: new Date(clock.now.getTime() + 60_000).toISOString(),
        timeZone: "UTC",
      },
      payload: { kind: "notify", message: "hi" },
    });
    clock.now = new Date(clock.now.getTime() + 120_000);
    await svc.tick(clock.now);
    // Force a system receipt onto the store (daemon-owned jobs stay in Doctor, not History).
    await svc.store.appendReceipt({
      jobId: "system:consolidate:alice",
      accountId: "alice",
      scheduledFor: clock.now.toISOString(),
      startedAt: clock.now.toISOString(),
      finishedAt: clock.now.toISOString(),
      execStatus: "ok",
      deliveryStatus: "none",
    });
    const all = await svc.store.listReceipts("alice");
    assert.ok(all.some((r) => r.jobId.startsWith("system:")));
    const userFacing = await svc.listUserReceipts("alice");
    assert.equal(userFacing.every((r) => !r.jobId.startsWith("system:")), true);
    assert.ok(userFacing.some((r) => r.jobId === user.id));
  });
});

test("V-CRON-10: ensureReviewJob when reviewEnabled; disable when off", async () => {
  await withService(async (svc) => {
    await svc.watchAccount("alice", { reviewEnabled: true });
    const review = await svc.store.getJob("alice", "system:review:alice");
    assert.ok(review);
    assert.equal(review!.payload.systemJob, "review");
    assert.equal(review!.enabled, true);
    assert.equal(review!.spec.cronExpr, "0 4 * * *");

    await svc.watchAccount("alice", { reviewEnabled: false });
    const off = await svc.store.getJob("alice", "system:review:alice");
    assert.equal(off?.enabled, false);
  });
});

test("V-CRON-10: system flush/review fire stubs invoke onFire", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-sched-sys-"));
  const clock = { now: new Date("2026-10-09T06:00:00.000Z") };
  const fired: string[] = [];
  const svc = new ScheduleService({
    paths: homePaths(stateDir),
    now: () => clock.now,
    defaultTimeZone: "UTC",
    onFire: async (job) => {
      fired.push(job.payload.systemJob ?? job.payload.kind);
      return { execStatus: "ok", deliveryStatus: "none" };
    },
  });
  try {
    await svc.watchAccount("alice", { reviewEnabled: true });
    for (const id of ["system:review:alice", "system:flush:alice"]) {
      const existing = await svc.store.getJob("alice", id);
      const job =
        existing ??
        (await svc.createJob({
          id,
          accountId: "alice",
          name: id,
          spec: { kind: "at", whenInstant: clock.now.toISOString(), timeZone: "UTC" },
          payload: {
            kind: "system",
            systemJob: id.includes("flush") ? "flush" : "review",
          },
        }));
      job.nextRunAt = clock.now.toISOString();
      job.enabled = true;
      await svc.store.upsertJob(job);
    }
    const receipts = await svc.tick(clock.now);
    assert.ok(receipts.length >= 2);
    assert.ok(fired.includes("review"));
    assert.ok(fired.includes("flush"));
  } finally {
    await svc.stop();
    await rm(stateDir, { recursive: true, force: true });
  }
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

test("propose uses account locale for ask-candidates when the client omits one", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-sched-loc-"));
  const zh = new ScheduleService({
    paths: homePaths(stateDir),
    now: () => new Date("2026-10-09T06:00:00.000Z"),
    defaultTimeZone: "Asia/Shanghai",
    accountLocale: async () => "zh",
  });
  const en = new ScheduleService({
    paths: homePaths(stateDir),
    now: () => new Date("2026-10-09T06:00:00.000Z"),
    defaultTimeZone: "Asia/Shanghai",
  });
  try {
    const hit = await zh.proposeFromText("alice", "every month at 9am");
    assert.equal("error" in hit, true);
    if ("error" in hit) assert.match((hit.candidates ?? []).join(" "), /每月/);
    const miss = await en.proposeFromText("alice", "every month at 9am");
    assert.equal("error" in miss, true);
    if ("error" in miss) assert.match((miss.candidates ?? []).join(" "), /every month on the 1st/);
  } finally {
    await zh.stop();
    await en.stop();
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("reschedule confirm updates the same job", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-sched-re-"));
  const svc = new ScheduleService({
    paths: homePaths(stateDir),
    now: () => new Date("2026-10-09T06:00:00.000Z"),
    defaultTimeZone: "Asia/Shanghai",
  });
  try {
    const created = await svc.proposeFromText("alice", "Remind me tomorrow at 9:00 to stretch");
    assert.equal("error" in created, false);
    if ("error" in created) return;
    const job = await svc.confirmProposal("alice", created.proposalId);
    const next = await svc.proposeFromText("alice", "Remind me tomorrow at 18:00", undefined, {
      replacesJobId: job.id,
    });
    assert.equal("error" in next, false);
    if ("error" in next) return;
    assert.equal(next.replacesJobId, job.id);
    const updated = await svc.confirmProposal("alice", next.proposalId);
    assert.equal(updated.id, job.id);
    assert.match(updated.spec.whenInstant ?? "", /T10:00:00.000Z|18:00/);
    const jobs = await svc.store.listJobs("alice");
    assert.equal(jobs.filter((j) => j.payload.kind !== "system").length, 1);
  } finally {
    await svc.stop();
    await rm(stateDir, { recursive: true, force: true });
  }
});
