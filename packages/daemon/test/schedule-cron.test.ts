import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextCronExprAfter,
  parseCron,
  zonedParts,
  zonedWallToUtc,
} from "../dist/schedule/cron-next.js";

test("V-CRON: parse 5-field cron", () => {
  const c = parseCron("0 7 * * 1-5");
  assert.ok(c.minute.has(0));
  assert.ok(c.hour.has(7));
  assert.ok(c.dayOfWeek.has(1));
  assert.ok(!c.dayOfWeek.has(0));
  assert.throws(() => parseCron("0 7 *"), /bad_cron/);
});

test("V-CRON: nextCronAfter daily 7:00 America/New_York", () => {
  // 2026-03-08 12:00 UTC = morning in NY (EST)
  const after = new Date("2026-03-08T12:00:00.000Z");
  const next = nextCronExprAfter("0 7 * * *", after, "America/New_York");
  assert.ok(next);
  const p = zonedParts(next!, "America/New_York");
  assert.equal(p.hour, 7);
  assert.equal(p.minute, 0);
  assert.ok(next!.getTime() > after.getTime());
});

test("V-CRON: DST spring-forward — 2:30 America/New_York nonexistent → next valid day", () => {
  // US spring forward 2026-03-08 02:00 → 03:00; 02:30 does not exist that day.
  const after = new Date("2026-03-08T06:00:00.000Z"); // ~1am EST
  const next = nextCronExprAfter("30 2 * * *", after, "America/New_York");
  assert.ok(next);
  assert.ok(next!.getTime() > after.getTime());
  const p = zonedParts(next!, "America/New_York");
  // Must land on a real 02:30 (next day after the gap), not stuck in the hole.
  assert.equal(p.hour, 2);
  assert.equal(p.minute, 30);
  assert.ok(p.day >= 9 || (p.month === 3 && p.day > 8));
});

test("V-CRON-5: DST fall-back America/New_York — next 1:30 after first occurrence advances", () => {
  // 2026-11-01 fall back; after first 01:30 EDT, next should still progress.
  const after = new Date("2026-11-01T05:30:00.000Z"); // ~1:30 EDT
  const next = nextCronExprAfter("30 1 * * *", after, "America/New_York");
  assert.ok(next);
  assert.ok(next!.getTime() > after.getTime());
  const p = zonedParts(next!, "America/New_York");
  assert.equal(p.hour, 1);
  assert.equal(p.minute, 30);
});

test("V-CRON-5: Europe/London spring-forward skips nonexistent 1:30", () => {
  // UK 2026-03-29 01:00 → 02:00; 01:30 does not exist.
  const after = new Date("2026-03-29T00:00:00.000Z");
  const next = nextCronExprAfter("30 1 * * *", after, "Europe/London");
  assert.ok(next);
  assert.ok(next!.getTime() > after.getTime());
  const p = zonedParts(next!, "Europe/London");
  assert.equal(p.hour, 1);
  assert.equal(p.minute, 30);
  assert.ok(p.day >= 30 || p.month > 3);
});

test("V-CRON: zonedWallToUtc DST gap returns undefined", () => {
  // America/New_York 2026-03-08 02:30 nonexistent
  const d = zonedWallToUtc(2026, 3, 8, 2, 30, "America/New_York");
  assert.equal(d, undefined);
});

test("V-CRON: Australia/Sydney next daily progresses across DST", () => {
  const after = new Date("2026-04-04T14:00:00.000Z"); // around autumn transition
  const next = nextCronExprAfter("0 9 * * *", after, "Australia/Sydney");
  assert.ok(next);
  const p = zonedParts(next!, "Australia/Sydney");
  assert.equal(p.hour, 9);
  assert.equal(p.minute, 0);
  assert.ok(next!.getTime() > after.getTime());
});

test("V-CRON: zonedWallToUtc round-trip Asia/Shanghai", () => {
  const d = zonedWallToUtc(2026, 10, 10, 8, 0, "Asia/Shanghai");
  assert.ok(d);
  const p = zonedParts(d!, "Asia/Shanghai");
  assert.equal(p.year, 2026);
  assert.equal(p.month, 10);
  assert.equal(p.day, 10);
  assert.equal(p.hour, 8);
  assert.equal(p.minute, 0);
});
