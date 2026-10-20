import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveScheduleFromText } from "../dist/schedule/resolve-nl.js";
import { zonedParts } from "../dist/schedule/cron-next.js";

const TZ = "Asia/Shanghai";
/** Fixed reference: 2026-10-09 14:00 Asia/Shanghai (UTC+8) = 06:00Z — Friday */
const REF = new Date("2026-10-09T06:00:00.000Z");

function at(text: string, timeZone = TZ) {
  return resolveScheduleFromText({ text, referenceNow: REF, timeZone });
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
  assert.equal(p.day, 10);
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
  const en = at("Remind me tomorrow at 8:00 to take out trash");
  assert.ok(en.ok);
  if (!en.ok) return;
  assert.equal(instants[0], en.spec.whenInstant);
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

test("V-CRON-NL: clock-less recurring / weekday asks — never invent 08:00/09:00", () => {
  for (const text of [
    "Remind me every day to drink water",
    "每天提醒我喝水",
    "Remind me every weekday to stand up",
    "Remind me every Monday to review inbox",
    "Remind me next Monday to review inbox",
  ]) {
    const r = at(text);
    assert.equal(r.ok, false, text);
    if (r.ok) continue;
    assert.equal(r.reason, "missing_time", text);
  }
});

test("V-CRON-NL: every weekday cron with explicit clock", () => {
  const r = at("Remind me every weekday at 9:00 to stand up");
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.spec.kind, "cron");
  assert.equal(r.spec.cronExpr, "0 9 * * 1-5");
});

test("V-CRON-NL: 每天早上 period-of-day is user WHEN (not silent invent)", () => {
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

test("V-CRON-2: next Monday / 下周一 same weekday under fixed ref", () => {
  // REF = Fri 2026-10-09 → next Monday = 2026-10-12
  const en = at("Remind me next Monday at 9:00 to review inbox");
  const zh = at("提醒我下周一早上九点看邮件");
  assert.ok(en.ok && zh.ok);
  if (!en.ok || !zh.ok) return;
  assert.equal(en.spec.kind, "at");
  assert.equal(zh.spec.kind, "at");
  const pe = zonedParts(new Date(en.spec.whenInstant!), TZ);
  const pz = zonedParts(new Date(zh.spec.whenInstant!), TZ);
  assert.equal(pe.year, 2026);
  assert.equal(pe.month, 10);
  assert.equal(pe.day, 12);
  assert.equal(pe.hour, 9);
  assert.equal(pz.day, 12);
  assert.equal(pz.hour, 9);
});

test("V-CRON-NL: this Friday vs next Friday", () => {
  // REF = Friday 2026-10-09 14:00 local — this Friday 20:00 is still ahead
  const thisFri = at("Remind me this Friday at 8pm to movie night");
  assert.ok(thisFri.ok);
  if (!thisFri.ok) return;
  const p = zonedParts(new Date(thisFri.spec.whenInstant!), TZ);
  assert.equal(p.day, 9);
  assert.equal(p.hour, 20);

  // this Friday 9am already past → ask
  const past = at("Remind me this Friday at 9am to stretch");
  assert.equal(past.ok, false);
  if (!past.ok) assert.equal(past.reason, "missing_time");

  // next Friday = +7 from today (strictly next week)
  const nextFri = at("Remind me next Friday at 9am to stretch");
  assert.ok(nextFri.ok);
  if (!nextFri.ok) return;
  const pn = zonedParts(new Date(nextFri.spec.whenInstant!), TZ);
  assert.equal(pn.day, 16);
  assert.equal(pn.hour, 9);
});

test("V-CRON-NL: in N hours relative", () => {
  const r = at("Remind me in 2 hours to stretch");
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(new Date(r.spec.whenInstant!).getTime(), REF.getTime() + 2 * 3600_000);
});

test("V-CRON-NL: in N days with clock", () => {
  const r = at("Remind me in 3 days at 10:00 to follow up");
  assert.ok(r.ok);
  if (!r.ok) return;
  const p = zonedParts(new Date(r.spec.whenInstant!), TZ);
  assert.equal(p.day, 12);
  assert.equal(p.hour, 10);
});

test("V-CRON-NL: in N days without clock asks", () => {
  const r = at("Remind me in 3 days to follow up");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "missing_time");
});

test("V-CRON-NL: 八点半 half-hour", () => {
  const r = at("提醒我明天早上八点半倒垃圾");
  assert.ok(r.ok);
  if (!r.ok) return;
  const p = zonedParts(new Date(r.spec.whenInstant!), TZ);
  assert.equal(p.hour, 8);
  assert.equal(p.minute, 30);
});

test("V-CRON-NL: noon / midnight", () => {
  const noon = at("Remind me tomorrow at noon to eat");
  assert.ok(noon.ok);
  if (!noon.ok) return;
  assert.equal(zonedParts(new Date(noon.spec.whenInstant!), TZ).hour, 12);

  const mid = at("Remind me tomorrow at midnight to log");
  assert.ok(mid.ok);
  if (!mid.ok) return;
  assert.equal(zonedParts(new Date(mid.spec.whenInstant!), TZ).hour, 0);
});

test("V-CRON-NL: account TZ changes wall clock (same utterance)", () => {
  // REF = 2026-10-09T06:00Z → Shanghai 14:00; LA 2026-10-08 23:00
  const sh = at("Remind me tomorrow at 9:00 to call", "Asia/Shanghai");
  const la = at("Remind me tomorrow at 9:00 to call", "America/Los_Angeles");
  assert.ok(sh.ok && la.ok);
  if (!sh.ok || !la.ok) return;
  assert.notEqual(sh.spec.whenInstant, la.spec.whenInstant);
  assert.match(sh.resolvedLocal, /Asia\/Shanghai/);
  assert.match(la.resolvedLocal, /America\/Los_Angeles/);
});

test("V-CRON-NL EN: quarter past / half past / quarter to", () => {
  const qp = at("Remind me tomorrow at quarter past 3pm to stretch");
  assert.ok(qp.ok);
  if (!qp.ok) return;
  const p = zonedParts(new Date(qp.spec.whenInstant!), TZ);
  assert.equal(p.hour, 15);
  assert.equal(p.minute, 15);

  const hp = at("Remind me tomorrow at half past 8am to stretch");
  assert.ok(hp.ok);
  if (!hp.ok) return;
  assert.equal(zonedParts(new Date(hp.spec.whenInstant!), TZ).minute, 30);

  const qt = at("Remind me tomorrow at quarter to 4pm to stretch");
  assert.ok(qt.ok);
  if (!qt.ok) return;
  const pq = zonedParts(new Date(qt.spec.whenInstant!), TZ);
  assert.equal(pq.hour, 15);
  assert.equal(pq.minute, 45);
});

test("V-CRON-NL ZH: 一刻 / 差一刻", () => {
  const yi = at("提醒我明天下午三点一刻喝水");
  assert.ok(yi.ok);
  if (!yi.ok) return;
  const p = zonedParts(new Date(yi.spec.whenInstant!), TZ);
  assert.equal(p.hour, 15);
  assert.equal(p.minute, 15);

  const cha = at("提醒我明天下午差一刻四点喝水");
  assert.ok(cha.ok);
  if (!cha.ok) return;
  const pc = zonedParts(new Date(cha.spec.whenInstant!), TZ);
  assert.equal(pc.hour, 15);
  assert.equal(pc.minute, 45);
});

test("V-CRON-NL: 下下周一 / week after next Monday", () => {
  // REF Fri 2026-10-09 → next Mon 10-12 → week after = 10-19
  const zh = at("提醒我下下周一早上九点开会");
  const en = at("Remind me week after next Monday at 9am to meet");
  assert.ok(zh.ok && en.ok);
  if (!zh.ok || !en.ok) return;
  assert.equal(zonedParts(new Date(zh.spec.whenInstant!), TZ).day, 19);
  assert.equal(zonedParts(new Date(en.spec.whenInstant!), TZ).day, 19);
});

test("V-CRON-NL: Friday week", () => {
  // next Friday = 10-16; Friday week = +7 → 10-23
  const r = at("Remind me Friday week at 10am to ship");
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(zonedParts(new Date(r.spec.whenInstant!), TZ).day, 23);
});

test("V-CRON-NL: Oct 20 at 3pm / 10月20日", () => {
  const en = at("Remind me Oct 20 at 3pm to call");
  const zh = at("提醒我10月20日下午3点打电话");
  assert.ok(en.ok && zh.ok);
  if (!en.ok || !zh.ok) return;
  const pe = zonedParts(new Date(en.spec.whenInstant!), TZ);
  const pz = zonedParts(new Date(zh.spec.whenInstant!), TZ);
  assert.equal(pe.month, 10);
  assert.equal(pe.day, 20);
  assert.equal(pe.hour, 15);
  assert.equal(pz.day, 20);
  assert.equal(pz.hour, 15);
});

test("V-CRON-NL: this weekend asks without clock; resolves with clock", () => {
  const ask = at("Remind me this weekend to relax");
  assert.equal(ask.ok, false);
  if (!ask.ok) {
    assert.equal(ask.reason, "missing_time");
    assert.ok(ask.candidates && ask.candidates.length >= 2);
  }
  const ok = at("Remind me this weekend at 10am to relax");
  assert.ok(ok.ok);
  if (!ok.ok) return;
  // REF = Friday → Saturday 10-10
  assert.equal(zonedParts(new Date(ok.spec.whenInstant!), TZ).day, 10);
  assert.equal(zonedParts(new Date(ok.spec.whenInstant!), TZ).dow, 6);
});

test("V-CRON-NL: past this Friday returns candidates", () => {
  const past = at("Remind me this Friday at 9am to stretch");
  assert.equal(past.ok, false);
  if (!past.ok) {
    assert.equal(past.reason, "missing_time");
    assert.ok(past.candidates?.some((c) => /next Friday/i.test(c)));
  }
});

test("V-CRON-NL: every other Monday → ambiguous with candidates", () => {
  const r = at("Remind me every other Monday at 9am to sync");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "ambiguous");
    assert.ok(r.candidates && r.candidates.length >= 1);
  }
});

test("V-CRON-NL: every month/year without day asks (never invent 1st)", () => {
  const monthAsk = at("Remind me every month at 9am to pay rent");
  assert.equal(monthAsk.ok, false);
  if (!monthAsk.ok) {
    assert.equal(monthAsk.reason, "missing_time");
    assert.match(monthAsk.detail ?? "", /day of month/i);
    assert.ok(monthAsk.candidates?.some((c) => /on the 1st/i.test(c)));
  }
  const monthOk = at("Remind me every month on the 15th at 9am to pay rent");
  assert.ok(monthOk.ok);
  if (monthOk.ok) {
    assert.equal(monthOk.spec.kind, "cron");
    assert.match(String(monthOk.spec.cronExpr ?? ""), /^0 9 15 \* \*$/);
  }
  const yearAsk = at("Remind me every year at 9am to renew");
  assert.equal(yearAsk.ok, false);
  if (!yearAsk.ok) {
    assert.equal(yearAsk.reason, "missing_time");
    assert.match(yearAsk.detail ?? "", /month and day/i);
  }
  const yearOk = at("Remind me every year on January 1 at 9am to renew");
  assert.ok(yearOk.ok);
  if (yearOk.ok) {
    assert.equal(yearOk.spec.kind, "cron");
    assert.match(String(yearOk.spec.cronExpr ?? ""), /^0 9 1 1 \*$/);
  }
  const zhMonth = at("每月15号上午9点提醒我交房租");
  assert.ok(zhMonth.ok);
  if (zhMonth.ok) {
    assert.match(String(zhMonth.spec.cronExpr ?? ""), /15 \* \*$/);
  }
});

test("V-CRON-NL: Monday morning cron is a human label", () => {
  const r = resolveScheduleFromText({
    text: "每周一早上9点，提醒我新的一周开始了",
    referenceNow: REF,
    timeZone: TZ,
    locale: "zh",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.spec.kind, "cron");
  assert.equal(r.spec.cronExpr, "0 9 * * 1");
  assert.match(r.resolvedLocal, /每周一 09:00/);
  assert.doesNotMatch(r.resolvedLocal, /cron /);
});

test("V-CRON-NL: DST spring gap civil time → ambiguous", () => {
  // 2026-03-08 America/New_York springs forward; 2:30 does not exist.
  const ref = new Date("2026-03-07T12:00:00.000Z");
  const r = resolveScheduleFromText({
    text: "Remind me tomorrow at 2:30am to check",
    referenceNow: ref,
    timeZone: "America/New_York",
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "ambiguous");
    assert.match(r.detail ?? "", /DST/i);
  }
});
