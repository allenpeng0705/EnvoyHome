import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { homePaths } from "../dist/home-paths.js";
import {
  extractScheduleMessage,
  scheduleCandidateProposeAttempts,
} from "../dist/schedule/choice-followup.js";
import { ScheduleService } from "../dist/schedule/service.js";
import { zonedParts } from "../dist/schedule/cron-next.js";

const TZ = "Asia/Shanghai";
const REF = new Date("2026-10-09T06:00:00.000Z");

test("V-UX-14: scheduleCandidateProposeAttempts prefers WHEN alone", () => {
  const attempts = scheduleCandidateProposeAttempts(
    "Remind me this weekend to call mom",
    "this Sunday at 10am",
  );
  assert.equal(attempts[0], "this Sunday at 10am");
  assert.ok(attempts.some((a) => /Remind me this Sunday/.test(a)));
  assert.equal(extractScheduleMessage("Remind me this weekend to call mom"), "to call mom");
});

test("V-UX-14: Sunday candidate propose is not shadowed by this weekend", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-choice-fu-"));
  const svc = new ScheduleService({
    paths: homePaths(stateDir),
    now: () => REF,
    defaultTimeZone: TZ,
  });
  try {
    await svc.watchAccount("alice");
    const base = "Remind me this weekend to call mom";
    const when = "this Sunday at 10am";
    const msg = extractScheduleMessage(base);
    let proposed = false;
    for (const text of scheduleCandidateProposeAttempts(base, when)) {
      const proposal = await svc.proposeFromText("alice", text, undefined, {
        ...(msg && msg !== "Reminder" ? { message: msg } : {}),
      });
      if ("error" in proposal) continue;
      const p = zonedParts(new Date(proposal.spec.whenInstant!), TZ);
      assert.equal(p.dow, 0, `expected Sunday, got dow=${p.dow} via ${text}`);
      assert.match(proposal.payload.message ?? "", /call mom/i);
      proposed = true;
      break;
    }
    assert.equal(proposed, true);
  } finally {
    await svc.stop();
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-UX-14: monthly candidate alone proposes after every month ask", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-choice-mo-"));
  const svc = new ScheduleService({
    paths: homePaths(stateDir),
    now: () => REF,
    defaultTimeZone: TZ,
  });
  try {
    await svc.watchAccount("alice");
    const base = "Remind me every month at 9am to pay rent";
    const ask = await svc.proposeFromText("alice", base);
    assert.ok("error" in ask);
    if (!("error" in ask)) return;
    assert.ok(ask.candidates && ask.candidates.length >= 1);
    const when = ask.candidates![0]!;
    const msg = extractScheduleMessage(base);
    let ok = false;
    for (const text of scheduleCandidateProposeAttempts(base, when)) {
      const proposal = await svc.proposeFromText("alice", text, undefined, {
        ...(msg && msg !== "Reminder" ? { message: msg } : {}),
      });
      if ("error" in proposal) continue;
      assert.equal(proposal.spec.kind, "cron");
      assert.match(proposal.payload.message ?? "", /pay rent/i);
      ok = true;
      break;
    }
    assert.equal(ok, true);
  } finally {
    await svc.stop();
    await rm(stateDir, { recursive: true, force: true });
  }
});
