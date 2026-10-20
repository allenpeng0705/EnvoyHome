import assert from "node:assert/strict";
import test from "node:test";
import { isScheduleAffirmation, isScheduleDenial } from "../dist/schedule/affirm.js";
import { formatSchedulesChatCard } from "../dist/schedule/chat-card.js";
import { formatScheduleIntentOffer } from "../dist/schedule/intent-offer.js";
import { formatProposeFailure } from "../dist/schedule/service.js";
import { resolveScheduleFromText } from "../dist/schedule/resolve-nl.js";
import type { ScheduleJob } from "../dist/schedule/types.js";

function job(partial: Partial<ScheduleJob> & Pick<ScheduleJob, "name" | "payload">): ScheduleJob {
  return {
    id: "j1",
    accountId: "a",
    enabled: true,
    spec: { kind: "cron", cronExpr: "0 9 * * *", timeZone: "Asia/Shanghai" },
    missPolicy: "skip",
    nextRunAt: "2026-10-21T01:00:00.000Z",
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    consecutiveErrors: 0,
    createdAt: "2026-10-20T00:00:00.000Z",
    updatedAt: "2026-10-20T00:00:00.000Z",
    source: "user",
    ...partial,
  };
}

test("formatSchedulesChatCard hides system jobs and forbids invented WHEN", () => {
  const text = formatSchedulesChatCard([
    job({ name: "Trash", payload: { kind: "notify", message: "out" } }),
    job({
      name: "flush",
      payload: { kind: "system", systemJob: "flush" },
      source: "user",
    }),
  ]);
  assert.match(text, /Trash/);
  assert.match(text, /daily at 09:00/);
  assert.doesNotMatch(text, /0 9 \* \* \*/);
  assert.doesNotMatch(text, /flush/);
  assert.match(text, /Do not invent whenInstant/);
  assert.match(text, /reschedule/);
});

test("propose failure keeps candidates, and a skipped propose still offers", () => {
  const detail = formatProposeFailure({
    reason: "missing_time",
    error: "monthly needs a day of month",
    candidates: ["每月1号9:00", "每月15号9:00"],
  });
  assert.match(detail, /每月1号9:00/);
  const resolved = resolveScheduleFromText({
    text: "Remind me tomorrow at 9:00 to stretch",
    referenceNow: new Date("2026-10-09T06:00:00.000Z"),
    timeZone: "Asia/Shanghai",
    locale: "en",
  });
  const offer = formatScheduleIntentOffer(resolved, "Remind me tomorrow at 9:00");
  assert.match(offer ?? "", /not armed yet/);
  const quiet = formatScheduleIntentOffer(
    { ok: false, reason: "not_schedule" },
    "what is the weather",
  );
  assert.equal(quiet, undefined);
  assert.equal(isScheduleAffirmation("请设置"), true);
  assert.equal(isScheduleAffirmation("yes"), true);
  assert.equal(isScheduleAffirmation("每周一早上9点提醒我"), false);
  assert.equal(isScheduleDenial("取消"), true);
});
