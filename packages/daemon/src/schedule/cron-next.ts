// 5-field cron next-fire with IANA timezone (Design §7.4).
// Fields: minute hour day-of-month month day-of-week (0=Sun or 7=Sun).

export type CronField = ReadonlySet<number>;

export interface ParsedCron {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
  expr: string;
}

const DOW_NAMES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function parsePart(part: string, min: number, max: number, names?: Record<string, number>): Set<number> {
  const out = new Set<number>();
  const raw = part.trim().toLowerCase();
  if (raw === "*") {
    for (let i = min; i <= max; i++) out.add(i);
    return out;
  }
  for (const piece of raw.split(",")) {
    const stepMatch = /^([^*]+|\*)\/(\d+)$/.exec(piece.trim());
    let range = piece.trim();
    let step = 1;
    if (stepMatch) {
      range = stepMatch[1]!;
      step = Math.max(1, parseInt(stepMatch[2]!, 10));
    }
    let start: number;
    let end: number;
    if (range === "*") {
      start = min;
      end = max;
    } else if (range.includes("-")) {
      const [a, b] = range.split("-");
      start = resolveToken(a!, min, max, names);
      end = resolveToken(b!, min, max, names);
    } else {
      start = end = resolveToken(range, min, max, names);
    }
    for (let i = start; i <= end; i += step) out.add(i);
  }
  return out;
}

function resolveToken(
  tok: string,
  min: number,
  max: number,
  names?: Record<string, number>,
): number {
  const t = tok.trim().toLowerCase();
  if (names && t in names) return names[t]!;
  const n = parseInt(t, 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`envoyhome.bad_cron: invalid field token ${tok}`);
  }
  return n;
}

export function parseCron(expr: string): ParsedCron {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`envoyhome.bad_cron: expected 5 fields, got ${parts.length}`);
  }
  const minute = parsePart(parts[0]!, 0, 59);
  const hour = parsePart(parts[1]!, 0, 23);
  const dayOfMonth = parsePart(parts[2]!, 1, 31);
  const month = parsePart(parts[3]!, 1, 12);
  const dayOfWeek = parsePart(parts[4]!, 0, 7, DOW_NAMES);
  if (dayOfWeek.has(7)) {
    dayOfWeek.delete(7);
    dayOfWeek.add(0);
  }
  return { minute, hour, dayOfMonth, month, dayOfWeek, expr: expr.trim() };
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dow: number;
}

const DOW_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
    second: parseInt(get("second"), 10),
    dow: DOW_MAP[get("weekday")] ?? 0,
  };
}

function wallCmp(
  p: ZonedParts,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  if (p.year !== year) return p.year - year;
  if (p.month !== month) return p.month - month;
  if (p.day !== day) return p.day - day;
  if (p.hour !== hour) return p.hour - hour;
  if (p.minute !== minute) return p.minute - minute;
  return 0;
}

/**
 * UTC Date for wall time in `timeZone`. Iterative offset correction.
 * On DST gaps returns undefined; on folds returns the earlier offset.
 */
export function zonedWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date | undefined {
  // Initial guess: treat wall as UTC then correct.
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 8; i++) {
    const p = zonedParts(new Date(utc), timeZone);
    const cmp = wallCmp(p, year, month, day, hour, minute);
    if (cmp === 0 && p.second === 0) {
      // Prefer earlier instant on fold: step back 30m and re-seek.
      const earlier = utc - 30 * 60_000;
      const p2 = zonedParts(new Date(earlier), timeZone);
      if (wallCmp(p2, year, month, day, hour, minute) === 0) {
        utc = earlier;
        continue;
      }
      return new Date(utc);
    }
    // Difference in wall minutes approximated
    const wantMin = (((year * 12 + month) * 31 + day) * 24 + hour) * 60 + minute;
    const gotMin = (((p.year * 12 + p.month) * 31 + p.day) * 24 + p.hour) * 60 + p.minute;
    utc += (wantMin - gotMin) * 60_000;
  }
  // Final verify
  const p = zonedParts(new Date(utc), timeZone);
  if (wallCmp(p, year, month, day, hour, minute) === 0) return new Date(utc);
  return undefined;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function matchesDomDow(
  cron: ParsedCron,
  day: number,
  dow: number,
  domRestricted: boolean,
  dowRestricted: boolean,
): boolean {
  const domHit = cron.dayOfMonth.has(day);
  const dowHit = cron.dayOfWeek.has(dow);
  if (domRestricted && dowRestricted) return domHit || dowHit;
  if (domRestricted) return domHit;
  if (dowRestricted) return dowHit;
  return true;
}

/**
 * Next fire strictly after `after` for `cron` in `timeZone`.
 * Day/hour/minute nested scan — not minute-by-minute over years.
 */
export function nextCronAfter(cron: ParsedCron, after: Date, timeZone: string): Date | undefined {
  const domR = cron.dayOfMonth.size < 31;
  const dowR = cron.dayOfWeek.size < 7;
  const start = zonedParts(after, timeZone);
  let year = start.year;
  let month = start.month;
  let day = start.day;

  for (let dayOffset = 0; dayOffset < 400; dayOffset++) {
    if (dayOffset > 0) {
      day += 1;
      const dim = daysInMonth(year, month);
      if (day > dim) {
        day = 1;
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
    }
    if (!cron.month.has(month)) continue;

    // Probe noon to get DOW for this civil date
    const noon = zonedWallToUtc(year, month, day, 12, 0, timeZone);
    if (!noon) continue;
    const dow = zonedParts(noon, timeZone).dow;
    if (!matchesDomDow(cron, day, dow, domR, dowR)) continue;

    const hours = [...cron.hour].sort((a, b) => a - b);
    const minutes = [...cron.minute].sort((a, b) => a - b);
    for (const h of hours) {
      for (const m of minutes) {
        if (dayOffset === 0) {
          if (h < start.hour) continue;
          if (h === start.hour && m <= start.minute) continue;
        }
        const instant = zonedWallToUtc(year, month, day, h, m, timeZone);
        if (instant && instant.getTime() > after.getTime()) return instant;
      }
    }
  }
  return undefined;
}

export function nextCronExprAfter(expr: string, after: Date, timeZone: string): Date | undefined {
  return nextCronAfter(parseCron(expr), after, timeZone);
}
