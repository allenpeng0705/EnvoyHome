// V-DAG-5: schedule trigger fires unattended via ScheduleService.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flushLoop, __resetActiveXForTests } from "@envoyhome/test-utils";
import { startDaemon, type RunningDaemon } from "../dist/index.js";

const daemons: RunningDaemon[] = [];

after(async () => {
  __resetActiveXForTests();
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

test("V-DAG-5: workflow match.schedule syncs and fires unattended", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-sched-dag-"));
  const daemon = await startDaemon({
    config: { wsPort: 0, httpPort: 0, stateDir, hatchApiKey: "k" },
    packageVersion: "0.0.0-test",
  });
  daemons.push(daemon);
  try {
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    await mkdir(join(stateDir, "workflows"), { recursive: true });
    await writeFile(
      join(stateDir, "workflows", "morning.yml"),
      "id: morning\nmatch:\n  schedule: '0 7 * * *'\nsteps: []\n",
    );
    await daemon.workflows.reload();
    await daemon.schedules.watchAccount("alice");
    await daemon.schedules.syncWorkflowSchedules("alice", [
      { id: "morning", schedule: "0 7 * * *", canActuate: false },
    ]);
    const jobs = await daemon.schedules.store.listJobs("alice");
    const wf = jobs.filter((j) => j.source === "workflow");
    assert.equal(wf.length, 1);
    assert.equal(wf[0]!.payload.kind, "workflow");
    assert.equal(wf[0]!.payload.workflowId, "morning");
    assert.ok(jobs.some((j) => j.id.startsWith("system:consolidate:")));

    // Force due and tick (only the workflow job)
    const job = wf[0]!;
    job.nextRunAt = new Date().toISOString();
    await daemon.schedules.store.upsertJob(job);
    const receipts = await daemon.schedules.tick(new Date());
    const wfReceipts = receipts.filter((r) => r.jobId === job.id);
    assert.equal(wfReceipts.length, 1);
    assert.equal(wfReceipts[0]!.execStatus, "ok");
    await flushLoop(20);
  } finally {
    await daemon.stop().catch(() => undefined);
    const idx = daemons.indexOf(daemon);
    if (idx >= 0) daemons.splice(idx, 1);
    await rm(stateDir, { recursive: true, force: true });
  }
});
