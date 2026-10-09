// Single NL → structured schedule resolver (Design §7.4).
// Uses ONLY `referenceNow` + `timeZone` for relatives — ignores chat history.

import { zonedParts, zonedWallToUtc } from "./cron-next.js";
import type { SchedulePayload, ScheduleSpec } from "./types.js";

export interface ResolveNlInput {
  text: string;
  referenceNow: Date;
  timeZone: string;
}

export type ResolveNlResult =
  | {
      ok: true;
      spec: ScheduleSpec;
      payload: SchedulePayload;
      name: string;
      resolvedLocal: string;
    }
  | { ok: false; reason: "ambiguous" | "missing_time" | "not_schedule"; detail?: string };

function normalize(text: string): string {
  return text.normalize("NFC").trim();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatLocal(d: Date, timeZone: string): string {
  const p = zonedParts(d, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)} ${timeZone}`;
}

function atInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date | undefined {
  return zonedWallToUtc(year, month, day, hour, minute, timeZone);
}

function addDaysWall(ref: Date, timeZone: string, days: number): ZonedPartsLike {
  const p = zonedParts(ref, timeZone);
  // Use UTC date math on a noon anchor to avoid DST edge when shifting days.
  const noon = atInstant(p.year, p.month, p.day, 12, 0, timeZone) ?? ref;
  const shifted = new Date(noon.getTime() + days * 86400_000);
  return zonedParts(shifted, timeZone);
}

type ZonedPartsLike = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dow: number;
};

function parseClock(fragment: string): { hour: number; minute: number } | undefined {
  const s = fragment.trim().toLowerCase();
  let m =
    /^(\d{1,2}):(\d{2})\s*(am|pm)?$/.exec(s) ||
    /^(\d{1,2})\s*(am|pm)$/.exec(s) ||
    /^(\d{1,2})点(\d{1,2})?分?$/.exec(s);
  if (!m) {
    // Chinese: 早上八点 / 晚上8点
    const cn = /^(早上|上午|中午|下午|晚上|凌晨)?\s*(\d{1,2})\s*点\s*(\d{1,2})?/.exec(s);
    if (cn) {
      let hour = parseInt(cn[2]!, 10);
      const minute = cn[3] ? parseInt(cn[3], 10) : 0;
      const tod = cn[1] ?? "";
      if (tod === "下午" || tod === "晚上") {
        if (hour < 12) hour += 12;
      } else if (tod === "中午" && hour < 12) hour = 12;
      else if (tod === "凌晨" && hour === 12) hour = 0;
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return { hour, minute };
    }
    return undefined;
  }
  let hour = parseInt(m[1]!, 10);
  let minute = 0;
  let ampm: string | undefined;
  if (m[2] === "am" || m[2] === "pm") {
    ampm = m[2];
  } else if (m[3] === "am" || m[3] === "pm") {
    minute = parseInt(m[2]!, 10);
    ampm = m[3];
  } else if (m[2] !== undefined && /^\d+$/.test(m[2])) {
    minute = parseInt(m[2], 10);
  }
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return undefined;
  return { hour, minute };
}

function extractMessage(text: string): string {
  let s = text.trim();
  s = s.replace(/^(please\s+)?(can you|could you|would you)\s+/i, "");
  s = s.replace(/^remind\s+me\s+(to\s+)?/i, "");
  s = s.replace(/^(能不能|能否|可不可以|请|麻烦|帮我|记得)?\s*(提醒我|提醒一下)?\s*/u, "");
  // Strip common schedule phrases
  s = s.replace(
    /\b(in\s+\d+\s*(minutes?|mins?|hours?|hrs?|days?)|tomorrow|today|tonight|every\s+\w+|at\s+\d{1,2}(:\d{2})?\s*(am|pm)?)\b/gi,
    "",
  );
  s = s.replace(
    /(明天|后天|今天|今晚|每天|每周|工作日|早上|上午|下午|晚上|凌晨|\d{1,2}\s*点(\d{1,2}\s*分)?|\d+\s*分钟后|\d+\s*小时后)/gu,
    "",
  );
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[，,、.\s]+|[？?！!。.\s]+$/gu, "").trim();
  if (!s || s.length < 1) return "Reminder";
  if (s.length > 120) s = s.slice(0, 120);
  return s;
}

function okAt(
  when: Date,
  timeZone: string,
  message: string,
  source: string,
): Extract<ResolveNlResult, { ok: true }> {
  return {
    ok: true,
    spec: {
      kind: "at",
      whenInstant: when.toISOString(),
      timeZone,
    },
    payload: { kind: "notify", message },
    name: message.slice(0, 80),
    resolvedLocal: formatLocal(when, timeZone),
  };
}

function okCron(
  expr: string,
  timeZone: string,
  message: string,
): Extract<ResolveNlResult, { ok: true }> {
  return {
    ok: true,
    spec: { kind: "cron", cronExpr: expr, timeZone },
    payload: { kind: "notify", message },
    name: message.slice(0, 80),
    resolvedLocal: `cron ${expr} (${timeZone})`,
  };
}

/**
 * Resolve schedule intent from a single utterance.
 * Deterministic regex pack — LLM fill is a separate caller layer when this returns ambiguous.
 */
export function resolveScheduleFromText(input: ResolveNlInput): ResolveNlResult {
  const text = normalize(input.text);
  if (!text) return { ok: false, reason: "not_schedule" };
  const lower = text.toLowerCase();
  const tz = input.timeZone;
  const now = input.referenceNow;
  const msg = extractMessage(text);

  // --- recurring ---
  if (
    /\bevery\s+day\b/i.test(text) ||
    /每天/.test(text) ||
    /\bevery\s+morning\b/i.test(text)
  ) {
    const clock =
      parseClock(lower.match(/at\s+(.+)$/i)?.[1] ?? "") ||
      parseClock(text.match(/(早上|上午|下午|晚上|凌晨)?\s*\d{1,2}\s*点/)?.[0] ?? "") ||
      { hour: 8, minute: 0 };
    if (/morning|早上|上午/.test(text) && !/at\s+\d|点/.test(text)) {
      clock.hour = 8;
      clock.minute = 0;
    }
    return okCron(`${clock.minute} ${clock.hour} * * *`, tz, msg);
  }
  if (/\bevery\s+weekday\b/i.test(text) || /工作日|每个工作日/.test(text)) {
    const clock =
      parseClock(lower.match(/at\s+(.+)$/i)?.[1] ?? "") ||
      parseClock(text.match(/(早上|上午|下午|晚上)?\s*\d{1,2}\s*点/)?.[0] ?? "") ||
      { hour: 9, minute: 0 };
    return okCron(`${clock.minute} ${clock.hour} * * 1-5`, tz, msg);
  }
  const everyWeekday = /\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(
    text,
  );
  if (everyWeekday) {
    const map: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const dow = map[everyWeekday[1]!.toLowerCase()]!;
    const clock = parseClock(lower.match(/at\s+(.+)$/i)?.[1] ?? "") ?? {
      hour: 9,
      minute: 0,
    };
    return okCron(`${clock.minute} ${clock.hour} * * ${dow}`, tz, msg);
  }

  // --- relative minutes / hours ---
  const inMin = /\bin\s+(\d+)\s*(minutes?|mins?)\b/i.exec(text) || /(\d+)\s*分钟后/.exec(text);
  if (inMin) {
    const n = parseInt(inMin[1]!, 10);
    if (n > 0 && n <= 43200) {
      const when = new Date(now.getTime() + n * 60_000);
      return okAt(when, tz, msg, text);
    }
  }
  const inHr = /\bin\s+(\d+)\s*(hours?|hrs?)\b/i.exec(text) || /(\d+)\s*小时后/.exec(text);
  if (inHr) {
    const n = parseInt(inHr[1]!, 10);
    if (n > 0 && n <= 720) {
      const when = new Date(now.getTime() + n * 3600_000);
      return okAt(when, tz, msg, text);
    }
  }

  // --- tomorrow / 明天 ---
  const isTomorrow = /\btomorrow\b/i.test(text) || /明天/.test(text);
  const isDayAfter = /\bday after tomorrow\b/i.test(text) || /后天/.test(text);
  if (isTomorrow || isDayAfter) {
    const days = isDayAfter ? 2 : 1;
    const wall = addDaysWall(now, tz, days);
    let clock = parseClock(lower.match(/at\s+(.+?)(?:\s+to\b|$)/i)?.[1] ?? "");
    if (!clock) {
      const cnClock = text.match(/(早上|上午|中午|下午|晚上|凌晨)?\s*(\d{1,2})\s*点(\d{1,2})?/);
      if (cnClock) clock = parseClock(cnClock[0]!);
    }
    if (!clock && /morning|早上|上午/.test(text)) clock = { hour: 8, minute: 0 };
    if (!clock && /tonight|晚上|evening/.test(text)) clock = { hour: 20, minute: 0 };
    if (!clock) {
      return { ok: false, reason: "missing_time", detail: "day given but no clock time" };
    }
    const when = atInstant(wall.year, wall.month, wall.day, clock.hour, clock.minute, tz);
    if (!when) return { ok: false, reason: "ambiguous", detail: "unresolvable local time" };
    return okAt(when, tz, msg, text);
  }

  // --- today at / 今天 ---
  if (/\btoday\b/i.test(text) || /今天|今晚/.test(text)) {
    const p = zonedParts(now, tz);
    let clock = parseClock(lower.match(/at\s+(.+?)(?:\s+to\b|$)/i)?.[1] ?? "");
    if (!clock) {
      const cnClock = text.match(/(早上|上午|中午|下午|晚上|凌晨)?\s*(\d{1,2})\s*点(\d{1,2})?/);
      if (cnClock) clock = parseClock(cnClock[0]!);
    }
    if (!clock && /今晚|tonight/.test(text)) clock = { hour: 20, minute: 0 };
    if (!clock) return { ok: false, reason: "missing_time" };
    let when = atInstant(p.year, p.month, p.day, clock.hour, clock.minute, tz);
    if (!when) return { ok: false, reason: "ambiguous" };
    if (when.getTime() <= now.getTime()) {
      // Roll to tomorrow if already past.
      const wall = addDaysWall(now, tz, 1);
      when = atInstant(wall.year, wall.month, wall.day, clock.hour, clock.minute, tz);
    }
    if (!when) return { ok: false, reason: "ambiguous" };
    return okAt(when, tz, msg, text);
  }

  // --- bare "at 3pm" / "remind me at 15:00" (today-or-tomorrow) ---
  const atOnly = /\bat\s+(\d{1,2}(:\d{2})?\s*(am|pm)?)\b/i.exec(text);
  if (atOnly && /(remind|提醒)/i.test(text)) {
    const clock = parseClock(atOnly[1]!);
    if (clock) {
      const p = zonedParts(now, tz);
      let when = atInstant(p.year, p.month, p.day, clock.hour, clock.minute, tz);
      if (when && when.getTime() <= now.getTime()) {
        const wall = addDaysWall(now, tz, 1);
        when = atInstant(wall.year, wall.month, wall.day, clock.hour, clock.minute, tz);
      }
      if (when) return okAt(when, tz, msg, text);
    }
  }

  // Scheduling-ish but incomplete
  if (/(remind|提醒|cron|schedule|定时)/i.test(text)) {
    return { ok: false, reason: "missing_time", detail: "schedule intent without resolvable time" };
  }
  return { ok: false, reason: "not_schedule" };
}
