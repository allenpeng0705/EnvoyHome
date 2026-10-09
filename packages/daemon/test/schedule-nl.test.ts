import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveScheduleFromText } from "../dist/schedule/resolve-nl.js";
import { zonedParts } from "../dist/schedule/cron-next.js";

const TZ = "Asia/Shanghai";
/** Fixed reference: 2026-10-09 14:00 Asia/Shanghai (UTC+8) = 06:00Z */
const REF = new Date("2026-10-09T06:00:00.000Z");

function at(text: string) {
  return resolveScheduleFromText({ text, referenceNow: REF, timeZone: TZ });
}

test("V-CRON-NL: paraphrase corpus → same whenInstant (EN)", () => {
  const variants = [
    "Remind me tomorrow at 8:00 to take out trash",
    "please remind me tomorrow at 8am to take out trash",
    "Could you remind me tomorrow at 08:00 to take out trash?",
  ];
  const instants = variants.map((v) => {
    const r = at(v);
    assert.equal(r.ok, true, v);
    if (!r.ok) throw new Error("unreachable");
    assert.equal(r.spec.kind, "at");
    return r.spec.whenInstant;
  });
  assert.equal(instants[0], instants[1]);
  assert.equal(instants[1], instants[2]);
  const r = at(variants[0]!);
  assert.ok(r.ok);
  if (!r.ok) return;
  const p = zonedParts(new Date(r.spec.whenInstant!), TZ);
  assert.equal(p.year, 2026);
  assert.equal(p.month, 10);
  assert.equal(p.day, 10); // tomorrow from Oct 9
  assert.equal(p.hour, 8);
  assert.equal(p.minute, 0);
});

test("V-CRON-NL: paraphrase corpus → same whenInstant (ZH)", () => {
  const variants = [
    "提醒我明天早上八点倒垃圾",
    "请提醒我明天早上8点倒垃圾",
    "帮我提醒一下明天早上八点倒垃圾",
  ];
  const instants = variants.map((v) => {
    const r = at(v);
    assert.equal(r.ok, true, `${v} → ${JSON.stringify(r)}`);
    if (!r.ok) throw new Error("unreachable");
    return r.spec.whenInstant;
  });
  assert.equal(instants[0], instants[1]);
  assert.equal(instants[1], instants[2]);
  assert.equal(instants[0], at("Remind me tomorrow at 8:00 to take out trash").ok
    ? (at("Remind me tomorrow at 8:00 to take out trash") as { spec: { whenInstant?: string } }).spec
        .whenInstant
    : null);
});

test("V-CRON-NL: in N minutes is relative to referenceNow only", () => {
  const a = at("Remind me in 20 minutes to check the oven");
  const b = at("remind me in 20 mins to check the oven");
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assert.equal(a.spec.whenInstant, b.spec.whenInstant);
  const when = new Date(a.spec.whenInstant!);
  assert.equal(when.getTime(), REF.getTime() + 20 * 60_000);
});

test("V-CRON-NL: missing time asks — does not guess", () => {
  const r = at("Remind me to call mom");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "missing_time");
});

test("V-CRON-NL: every weekday cron", () => {
  const r = at("Remind me every weekday at 9:00 to stand up");
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.spec.kind, "cron");
  assert.equal(r.spec.cronExpr, "0 9 * * 1-5");
});

test("V-CRON-NL: 每天早上 does not use chat history (only referenceNow)", () => {
  const r = resolveScheduleFromText({
    text: "每天早上提醒我喝水",
    referenceNow: REF,
    timeZone: TZ,
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.spec.kind, "cron");
  assert.equal(r.spec.cronExpr, "0 8 * * *");
});
