import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_NOW_SKEW_MS,
  formatClientContextInject,
  normalizeClientContext,
  resolveReferenceNow,
} from "../dist/client-context.js";
import { resolveScheduleFromText } from "../dist/schedule/resolve-nl.js";
import { zonedParts } from "../dist/schedule/cron-next.js";

const TZ = "Asia/Shanghai";
const REF = new Date("2026-10-09T06:00:00.000Z"); // Fri 14:00 Shanghai

test("V-CRON-13: clientNow within skew is used", () => {
  const host = new Date("2026-10-09T06:00:00.000Z");
  const client = normalizeClientContext({
    clientNow: new Date(host.getTime() + 60_000).toISOString(),
  });
  const ref = resolveReferenceNow(host, client);
  assert.equal(ref.getTime(), host.getTime() + 60_000);
});

test("V-CRON-13: clientNow beyond skew falls back to host", () => {
  const host = new Date("2026-10-09T06:00:00.000Z");
  const client = normalizeClientContext({
    clientNow: new Date(host.getTime() + CLIENT_NOW_SKEW_MS + 1).toISOString(),
  });
  const ref = resolveReferenceNow(host, client);
  assert.equal(ref.getTime(), host.getTime());
});

test("V-CRON-14: location inject is turn-only string", () => {
  const s = formatClientContextInject({
    clientNow: "2026-10-09T06:00:00.000Z",
    timeZone: "Asia/Shanghai",
    locale: "zh",
    location: { lat: 31.23, lon: 121.47, accuracyM: 50 },
  });
  assert.ok(s);
  assert.match(s!, /Client context/);
  assert.match(s!, /31\.23000/);
  assert.match(s!, /this turn only/i);
});

test("V-CRON-2 multi-locale: day-after-tomorrow / 后天 / übermorgen same instant", () => {
  const variants = [
    "Remind me day after tomorrow at 9am to call",
    "提醒我后天早上九点打电话",
    "Erinnere mich übermorgen um 9 Uhr anrufen",
    "Rappelle-moi après-demain à 9h d'appeler",
    "Ricordami dopodomani alle 9 di chiamare",
    "あさっての朝9時に電話をかけてとリマインドして",
    "모레 오전 9시에 전화하라고 알려줘",
  ];
  const instants = variants.map((text) => {
    const r = resolveScheduleFromText({ text, referenceNow: REF, timeZone: TZ, locale: "en" });
    assert.equal(r.ok, true, text);
    if (!r.ok) throw new Error("unreachable");
    return r.spec.whenInstant;
  });
  for (let i = 1; i < instants.length; i++) {
    assert.equal(instants[i], instants[0], variants[i]);
  }
  const p = zonedParts(new Date(instants[0]!), TZ);
  assert.equal(p.day, 11); // Fri 9 → +2 = Sun 11
  assert.equal(p.hour, 9);
});

test("V-CRON-2 multi-locale: 大后天 / in three days", () => {
  const zh = resolveScheduleFromText({
    text: "提醒我大后天早上八点开会",
    referenceNow: REF,
    timeZone: TZ,
    locale: "zh",
  });
  const en = resolveScheduleFromText({
    text: "Remind me in three days at 8am to meet",
    referenceNow: REF,
    timeZone: TZ,
    locale: "en",
  });
  assert.ok(zh.ok && en.ok);
  if (!zh.ok || !en.ok) return;
  assert.equal(zh.spec.whenInstant, en.spec.whenInstant);
  assert.equal(zonedParts(new Date(zh.spec.whenInstant!), TZ).day, 12);
});

test("multi-locale: every Monday / 每周一 / jeden Montag", () => {
  for (const text of [
    "Remind me every Monday at 9am to stand",
    "每周一早上九点提醒我站起来",
    "Erinnere mich jeden Montag um 9 Uhr aufstehen",
    "Rappelle-moi chaque lundi à 9h de me lever",
    "Ricordami ogni lunedì alle 9 di alzarmi",
    "毎週月曜9時に立ち上がるようリマインドして",
    "매주 월요일 오전 9시에 일어나라고 알려줘",
  ]) {
    const r = resolveScheduleFromText({ text, referenceNow: REF, timeZone: TZ });
    assert.ok(r.ok, text);
    if (!r.ok) continue;
    assert.equal(r.spec.kind, "cron");
    assert.equal(r.spec.cronExpr, "0 9 * * 1");
  }
});

test("DE: morgen=tomorrow; am Morgen / jeden Morgen are not tomorrow", () => {
  const tomorrow = resolveScheduleFromText({
    text: "Erinnere mich morgen um 9 Uhr anrufen",
    referenceNow: REF,
    timeZone: TZ,
  });
  assert.ok(tomorrow.ok);
  if (tomorrow.ok) {
    assert.equal(tomorrow.spec.kind, "at");
    assert.equal(zonedParts(new Date(tomorrow.spec.whenInstant!), TZ).day, 10);
  }
  // REF is 14:00 — use a still-future clock so today-or-next stays on day 9.
  const amMorgen = resolveScheduleFromText({
    text: "Erinnere mich am Morgen um 16 Uhr anrufen",
    referenceNow: REF,
    timeZone: TZ,
  });
  // Period-of-day + clock → today (not forced +1 via bare "morgen").
  assert.ok(amMorgen.ok, JSON.stringify(amMorgen));
  if (amMorgen.ok) {
    assert.equal(amMorgen.spec.kind, "at");
    const p = zonedParts(new Date(amMorgen.spec.whenInstant!), TZ);
    assert.equal(p.day, 9, "am Morgen must stay today when clock is still ahead");
    assert.equal(p.hour, 16);
  }
  const jeden = resolveScheduleFromText({
    text: "Erinnere mich jeden Morgen um 9 Uhr aufstehen",
    referenceNow: REF,
    timeZone: TZ,
  });
  assert.ok(jeden.ok, JSON.stringify(jeden));
  if (jeden.ok) {
    assert.equal(jeden.spec.kind, "cron");
    assert.equal(jeden.spec.cronExpr, "0 9 * * *");
  }
});

test("V-CRON-2 multi-locale: tomorrow / 明天 / morgen / demain same instant", () => {
  const variants = [
    "Remind me tomorrow at 9am to call",
    "提醒我明天早上九点打电话",
    "Erinnere mich morgen um 9 Uhr anrufen",
    "Rappelle-moi demain à 9h d'appeler",
    "Ricordami domani alle 9 di chiamare",
    "明日の朝9時に電話をかけてとリマインドして",
    "내일 오전 9시에 전화하라고 알려줘",
  ];
  const instants = variants.map((text) => {
    const r = resolveScheduleFromText({ text, referenceNow: REF, timeZone: TZ });
    assert.equal(r.ok, true, `${text} → ${JSON.stringify(r)}`);
    if (!r.ok) throw new Error("unreachable");
    return r.spec.whenInstant;
  });
  for (let i = 1; i < instants.length; i++) {
    assert.equal(instants[i], instants[0], variants[i]);
  }
  assert.equal(zonedParts(new Date(instants[0]!), TZ).day, 10);
});

test("V-CRON-2 multi-locale: every month on the 15th", () => {
  for (const text of [
    "Remind me every month on the 15th at 9am to pay",
    "每月15号上午9点提醒我交费",
    "Erinnere mich jeden Monat am 15. um 9 Uhr zahlen",
    "Rappelle-moi chaque mois le 15 à 9h de payer",
    "Ricordami ogni mese il 15 alle 9 di pagare",
    "毎月15日9時に支払いをリマインドして",
    "매월 15일 오전 9시에 납부하라고 알려줘",
  ]) {
    const r = resolveScheduleFromText({ text, referenceNow: REF, timeZone: TZ });
    assert.ok(r.ok, `${text} → ${JSON.stringify(r)}`);
    if (!r.ok) continue;
    assert.equal(r.spec.cronExpr, "0 9 15 * *", text);
  }
});

test("V-CRON-2 multi-locale: every year on Jan 1", () => {
  for (const text of [
    "Remind me every year on January 1 at 9am to renew",
    "每年1月1日上午9点提醒我续费",
    "Erinnere mich jedes Jahr am 1. Januar um 9 Uhr erneuern",
    "Rappelle-moi chaque année le 1er janvier à 9h de renouveler",
    "Ricordami ogni anno il 1 gennaio alle 9 di rinnovare",
    "毎年1月1日9時に更新をリマインドして",
    "매년 1월 1일 오전 9시에 갱신하라고 알려줘",
  ]) {
    const r = resolveScheduleFromText({ text, referenceNow: REF, timeZone: TZ });
    assert.ok(r.ok, `${text} → ${JSON.stringify(r)}`);
    if (!r.ok) continue;
    assert.equal(r.spec.cronExpr, "0 9 1 1 *", text);
  }
});

test("multi-locale: next weekday — nächster Montag / lundi prochain", () => {
  // REF = Friday 2026-10-09 → next Monday = 2026-10-12
  for (const text of [
    "Remind me next Monday at 9am to stand",
    "下周一早上九点提醒我站起来",
    "Erinnere mich nächsten Montag um 9 Uhr aufstehen",
    "Rappelle-moi lundi prochain à 9h de me lever",
    "Ricordami prossimo lunedì alle 9 di alzarmi",
    "来週月曜9時に立ち上がるようリマインドして",
    "다음 월요일 오전 9시에 일어나라고 알려줘",
  ]) {
    const r = resolveScheduleFromText({ text, referenceNow: REF, timeZone: TZ });
    assert.ok(r.ok, `${text} → ${JSON.stringify(r)}`);
    if (!r.ok) continue;
    const p = zonedParts(new Date(r.spec.whenInstant!), TZ);
    assert.equal(p.day, 12, text);
    assert.equal(p.hour, 9, text);
  }
});

test("multi-locale: monthly ask candidates follow locale", () => {
  const de = resolveScheduleFromText({
    text: "Erinnere mich jeden Monat um 9 Uhr zahlen",
    referenceNow: REF,
    timeZone: TZ,
    locale: "de",
  });
  assert.equal(de.ok, false);
  if (!de.ok) {
    assert.ok(de.candidates?.some((c) => /am 1\./.test(c)));
  }
  const zh = resolveScheduleFromText({
    text: "每月上午九点提醒我交费",
    referenceNow: REF,
    timeZone: TZ,
    locale: "zh",
  });
  assert.equal(zh.ok, false);
  if (!zh.ok) {
    assert.ok(zh.candidates?.some((c) => /每月1号/.test(c)));
  }
});

test("multi-locale: past day (前天) asks", () => {
  const r = resolveScheduleFromText({
    text: "提醒我前天早上九点开会",
    referenceNow: REF,
    timeZone: TZ,
    locale: "zh",
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "missing_time");
});

test("multi-locale: next month needs clock", () => {
  const r = resolveScheduleFromText({
    text: "Remind me next month to renew",
    referenceNow: REF,
    timeZone: TZ,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "missing_time");
});

test("multi-locale: next month with clock", () => {
  const r = resolveScheduleFromText({
    text: "Remind me next month at 10am to renew",
    referenceNow: REF,
    timeZone: TZ,
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  const p = zonedParts(new Date(r.spec.whenInstant!), TZ);
  assert.equal(p.month, 11);
  assert.equal(p.day, 9);
  assert.equal(p.hour, 10);
});
