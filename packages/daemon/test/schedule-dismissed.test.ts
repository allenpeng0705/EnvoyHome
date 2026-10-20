import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { homePaths } from "../dist/home-paths.js";
import { ScheduleService } from "../dist/schedule/service.js";

test("cancel and expire land in History dismissed", async () => {
  const root = await mkdtemp(join(tmpdir(), "eh-sched-dismiss-"));
  try {
    let now = new Date("2026-10-20T01:00:00.000Z");
    const svc = new ScheduleService({
      paths: homePaths(root),
      now: () => now,
      defaultTimeZone: "Asia/Shanghai",
    });
    const accountId = "allen";
    const proposed = await svc.proposeFromText(accountId, "每周一早上9点提醒我", undefined, {
      message: "新的一周",
      sessionId: "sess-1",
      clientContext: { locale: "zh" },
    });
    assert.ok(!("error" in proposed));
    if ("error" in proposed) return;

    const canceled = await svc.cancelProposal(accountId, proposed.proposalId);
    assert.equal(canceled.status, "canceled");
    assert.match(canceled.resolvedLocal, /09:00/);

    const proposed2 = await svc.proposeFromText(accountId, "明天上午8点提醒我开会");
    assert.ok(!("error" in proposed2));
    if ("error" in proposed2) return;
    now = new Date(Date.parse(proposed2.expiresAt) + 1000);
    await assert.rejects(
      () => svc.confirmProposal(accountId, proposed2.proposalId),
      /expired/,
    );

    const dismissed = await svc.listDismissed(accountId);
    assert.ok(dismissed.some((d) => d.status === "canceled"));
    assert.ok(dismissed.some((d) => d.status === "expired"));
    assert.equal(
      dismissed.every((d) => d.status === "canceled" || d.status === "expired"),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
