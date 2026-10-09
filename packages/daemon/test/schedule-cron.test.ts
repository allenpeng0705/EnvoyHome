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
