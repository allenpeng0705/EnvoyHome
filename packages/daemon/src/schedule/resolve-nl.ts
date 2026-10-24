// Single NL → structured schedule resolver (Design §7.4).
// Uses ONLY `referenceNow` + `timeZone` for relatives — ignores chat history.
// Missing / ambiguous clock → ask (never invent ISO or silent 08:00/09:00).
// NL packs: all product UI locales (en/zh/de/fr/it/ja/ko) — Design §7.4 / 2026-10-19m.

import { zonedParts, zonedWallToUtc } from "./cron-next.js";
import { humanCronLabel } from "./chat-card.js";
import {
  matchBareWeekday,
  matchDayOffset,
  matchMonthYear,
  matchRecurring,
  matchThisNextWeekday,
  formatRelativeDayClock,
  fuzzyOffsetMinutes,
  matchDurationOffset,
  matchFuzzyWhenKind,
  matchUnitOffset,
  monthlyCandidates,
  normalizeProductLocale,
  weekendCandidates,
  yearlyCandidates,
  type FuzzyWhenKind,
  type ProductLocale,
} from "./locale-relatives.js";
import type { SchedulePayload, ScheduleSpec } from "./types.js";

export interface ResolveNlInput {
  text: string;
  referenceNow: Date;
  timeZone: string;
  /** Product UI locale for ask-candidate language (packs match all locales). */
  locale?: string;
}

export type ResolveNlResult =
  | {
      ok: true;
      spec: ScheduleSpec;
      payload: SchedulePayload;
      name: string;
      resolvedLocal: string;
    }
  | {
      ok: false;
      reason: "ambiguous" | "missing_time" | "not_schedule";
      detail?: string;
      /** Short ask options for the agent (near-miss / weekend / etc.). */
      candidates?: string[];
    };

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

function formatClockHint(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "am" : "pm";
  if (minute === 0) return `${h12}${ampm}`;
  return `${h12}:${pad2(minute)}${ampm}`;
}

/** Explicit day-of-month for monthly cron — never invent 1. All UI locales. */
function parseDayOfMonth(text: string, lower: string): number | undefined {
  const en =
    /\bon\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(lower) ||
    /\b(?:day|dom)\s+(\d{1,2})\b/i.exec(lower);
  if (en) {
    const d = parseInt(en[1]!, 10);
    if (d >= 1 && d <= 31) return d;
  }
  // DE: am 15. / am 15ten
  const de = /\bam\s+(\d{1,2})\.?(?:ten|sten|en)?\b/i.exec(lower);
  if (de) {
    const d = parseInt(de[1]!, 10);
    if (d >= 1 && d <= 31) return d;
  }
  // FR: le 15 / le 1er
  const fr = /\ble\s+(\d{1,2})(?:er|e|ème|eme)?\b/i.exec(lower);
  if (fr) {
    const d = parseInt(fr[1]!, 10);
    if (d >= 1 && d <= 31) return d;
  }
  // IT: il 15 / il giorno 15
  const it = /\bil\s+(?:giorno\s+)?(\d{1,2})\b/i.exec(lower);
  if (it) {
    const d = parseInt(it[1]!, 10);
    if (d >= 1 && d <= 31) return d;
  }
  // ZH / JA numeric day
  const zh = /(\d{1,2})\s*号/.exec(text) || /每(?:个|個)?月\s*(\d{1,2})\s*日/.exec(text);
  if (zh) {
    const d = parseInt(zh[1]!, 10);
    if (d >= 1 && d <= 31) return d;
  }
  const ja = /毎月\s*(\d{1,2})\s*日/.exec(text);
  if (ja) {
    const d = parseInt(ja[1]!, 10);
    if (d >= 1 && d <= 31) return d;
  }
  const ko = /매(?:월|달)\s*(\d{1,2})\s*일/.exec(text);
  if (ko) {
    const d = parseInt(ko[1]!, 10);
    if (d >= 1 && d <= 31) return d;
  }
  return undefined;
}

const MONTH_NAME_TO_NUM: Record<string, number> = {
  // EN (+ shared latin stems)
  jan: 1,
  january: 1,
  januar: 1,
  janvier: 1,
  gennaio: 1,
  feb: 2,
  february: 2,
  februar: 2,
  fevrier: 2,
  febbraio: 2,
  mar: 3,
  march: 3,
  marz: 3,
  mars: 3,
  marzo: 3,
  apr: 4,
  april: 4,
  avril: 4,
  aprile: 4,
  may: 5,
  mai: 5,
  maggio: 5,
  jun: 6,
  june: 6,
  juni: 6,
  juin: 6,
  giugno: 6,
  jul: 7,
  july: 7,
  juli: 7,
  juillet: 7,
  luglio: 7,
  aug: 8,
  august: 8,
  aout: 8,
  agosto: 8,
  sep: 9,
  sept: 9,
  september: 9,
  septembre: 9,
  settembre: 9,
  oct: 10,
  october: 10,
  oktober: 10,
  octobre: 10,
  ottobre: 10,
  nov: 11,
  november: 11,
  novembre: 11,
  dec: 12,
  december: 12,
  dezember: 12,
  decembre: 12,
  dicembre: 12,
};

function lookupMonthName(raw: string): number | undefined {
  const key = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return MONTH_NAME_TO_NUM[raw.toLowerCase()] ?? MONTH_NAME_TO_NUM[key];
}

/** Explicit month+day for yearly cron — never invent Jan 1. All UI locales. */
function parseMonthDay(
  text: string,
  lower: string,
): { month: number; day: number } | undefined {
  const en =
    /\bon\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(
      lower,
    );
  if (en) {
    const month = lookupMonthName(en[1]!);
    const day = parseInt(en[2]!, 10);
    if (month && day >= 1 && day <= 31) return { month, day };
  }
  // DE: am 1. Januar / am 15. Dezember
  const de =
    /\bam\s+(\d{1,2})\.?\s+(januar|februar|märz|marz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/i.exec(
      lower,
    );
  if (de) {
    const day = parseInt(de[1]!, 10);
    const month = lookupMonthName(de[2]!);
    if (month && day >= 1 && day <= 31) return { month, day };
  }
  // FR: le 1er janvier / le 15 décembre
  const fr =
    /\ble\s+(\d{1,2})(?:er|e|ème|eme)?\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\b/i.exec(
      lower,
    );
  if (fr) {
    const day = parseInt(fr[1]!, 10);
    const month = lookupMonthName(fr[2]!);
    if (month && day >= 1 && day <= 31) return { month, day };
  }
  // IT: il 1 gennaio / il 15 dicembre
  const it =
    /\bil\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b/i.exec(
      lower,
    );
  if (it) {
    const day = parseInt(it[1]!, 10);
    const month = lookupMonthName(it[2]!);
    if (month && day >= 1 && day <= 31) return { month, day };
  }
  // ZH / JA: 1月1日
  const cjk = /(\d{1,2})\s*月\s*(\d{1,2})\s*日?/.exec(text);
  if (cjk) {
    const month = parseInt(cjk[1]!, 10);
    const day = parseInt(cjk[2]!, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }
  // KO: 1월 1일
  const ko = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(text);
  if (ko) {
    const month = parseInt(ko[1]!, 10);
    const day = parseInt(ko[2]!, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }
  return undefined;
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

function addMonthsWall(ref: Date, timeZone: string, months: number): ZonedPartsLike {
  const p = zonedParts(ref, timeZone);
  const idx = p.year * 12 + (p.month - 1) + months;
  const year = Math.floor(idx / 12);
  const month = (idx % 12) + 1;
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(p.day, dim);
  return { year, month, day, hour: p.hour, minute: p.minute, dow: 0 };
}

function addYearsWall(ref: Date, timeZone: string, years: number): ZonedPartsLike {
  return addMonthsWall(ref, timeZone, years * 12);
}

type ZonedPartsLike = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dow: number;
};

/** Parse Arabic or Chinese numerals used in clock phrases (八点 / 十一 / 25). */
function parseCnNum(raw: string): number | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const map: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (s === "十") return 10;
  if (s.startsWith("十") && s.length === 2) {
    const ones = map[s[1]!];
    return ones !== undefined ? 10 + ones : undefined;
  }
  const tens = /^([一二两三四五六七八九])十([一二三四五六七八九])?$/.exec(s);
  if (tens) {
    const t = map[tens[1]!]!;
    const o = tens[2] ? map[tens[2]!]! : 0;
    return t * 10 + o;
  }
  return map[s];
}

/** Match 早上九点 / 八点半 / 下午3点 (Arabic or Chinese digits). */
const CN_CLOCK_RE =
  /(早上|上午|中午|下午|晚上|凌晨)?\s*((?:\d{1,2})|[零〇一二两三四五六七八九十]+)\s*点\s*(半|一刻|((?:\d{1,2})|[零〇一二三四五六七八九十]+))?/;

function parseCnClockMatch(
  cn: RegExpExecArray,
): { hour: number; minute: number } | undefined {
  const hour = parseCnNum(cn[2]!);
  if (hour === undefined) return undefined;
  let h = hour;
  let minute = 0;
  if (cn[3] === "半") minute = 30;
  else if (cn[3] === "一刻") minute = 15;
  else if (cn[4]) minute = parseCnNum(cn[4]) ?? 0;
  const tod = cn[1] ?? "";
  if (tod === "下午" || tod === "晚上") {
    if (h < 12) h += 12;
  } else if (tod === "中午" && h < 12) h = 12;
  else if (tod === "凌晨" && h === 12) h = 0;
  if (h >= 0 && h <= 23 && minute >= 0 && minute <= 59) return { hour: h, minute };
  return undefined;
}

/** 差一刻四点 → 15:45 (quarter to). */
function parseCnQuarterTo(text: string): { hour: number; minute: number } | undefined {
  const m =
    /(早上|上午|中午|下午|晚上|凌晨)?\s*差一刻\s*((?:\d{1,2})|[零〇一二两三四五六七八九十]+)\s*点/.exec(
      text,
    );
  if (!m) return undefined;
  const hour = parseCnNum(m[2]!);
  if (hour === undefined) return undefined;
  let h = hour;
  const tod = m[1] ?? "";
  if (tod === "下午" || tod === "晚上") {
    if (h < 12) h += 12;
  } else if (tod === "中午" && h < 12) h = 12;
  else if (tod === "凌晨" && h === 12) h = 0;
  // quarter to H → (H-1):45
  let outH = h - 1;
  if (outH < 0) outH = 23;
  return { hour: outH, minute: 45 };
}

function parseClock(fragment: string): { hour: number; minute: number } | undefined {
  const s = fragment.trim().toLowerCase();
  if (/^noon$/.test(s)) return { hour: 12, minute: 0 };
  if (/^midnight$/.test(s)) return { hour: 0, minute: 0 };

  // half past 3 / quarter past 3 / quarter to 4
  const halfPast = /^half\s+past\s+(\d{1,2})\s*(am|pm)?$/.exec(s);
  if (halfPast) {
    let hour = parseInt(halfPast[1]!, 10);
    const ampm = halfPast[2];
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    if (hour > 23) return undefined;
    return { hour, minute: 30 };
  }
  const qPast = /^quarter\s+past\s+(\d{1,2})\s*(am|pm)?$/.exec(s);
  if (qPast) {
    let hour = parseInt(qPast[1]!, 10);
    const ampm = qPast[2];
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    if (hour > 23) return undefined;
    return { hour, minute: 15 };
  }
  const qTo = /^quarter\s+to\s+(\d{1,2})\s*(am|pm)?$/.exec(s);
  if (qTo) {
    let hour = parseInt(qTo[1]!, 10);
    const ampm = qTo[2];
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    hour = hour - 1;
    if (hour < 0) hour = 23;
    return { hour, minute: 45 };
  }

  let m =
    /^(\d{1,2}):(\d{2})\s*(am|pm)?$/.exec(s) ||
    /^(\d{1,2})\s*(am|pm)$/.exec(s) ||
    /^(\d{1,2})点(\d{1,2})?分?$/.exec(s) ||
    /^(\d{1,2})点半$/.exec(s);
  if (!m) {
    const cn = new RegExp(`^${CN_CLOCK_RE.source}`).exec(s);
    if (cn) return parseCnClockMatch(cn);
    return undefined;
  }
  if (/点半$/.test(s) && m[1]) {
    let hour = parseInt(m[1]!, 10);
    if (hour > 23) return undefined;
    return { hour, minute: 30 };
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

/**
 * Explicit clock or recognized period-of-day (morning/tonight/noon).
 * Period words are user-supplied WHEN — not silent invent of a bare day.
 * Bare day/weekday/recurring without clock or period → undefined (caller → missing_time).
 */
function resolveClock(text: string, lower: string): { hour: number; minute: number } | undefined {
  const atFrag = lower.match(/at\s+(.+?)(?:\s+to\b|$)/i)?.[1] ?? "";
  let clock = parseClock(atFrag);
  // Quarter-to before bare 「N点」 so 「差一刻四点」 is not stolen as 4:00.
  if (!clock) clock = parseCnQuarterTo(text);
  if (!clock) {
    const cn = CN_CLOCK_RE.exec(text);
    if (cn) clock = parseCnClockMatch(cn);
  }
  if (!clock && /\bat\s+noon\b|\bnoon\b/i.test(text) && !/\bafter\s+noon\b/i.test(text)) {
    clock = { hour: 12, minute: 0 };
  }
  if (!clock && /\bat\s+midnight\b|\bmidnight\b/i.test(text)) {
    clock = { hour: 0, minute: 0 };
  }
  // half/quarter BEFORE bare "3pm" — otherwise "quarter past 3pm" collapses to 3pm.
  if (!clock) {
    const hp = /\bhalf\s+past\s+(\d{1,2})\s*(am|pm)?\b/i.exec(lower);
    if (hp) clock = parseClock(`half past ${hp[1]}${hp[2] ? ` ${hp[2]}` : ""}`);
  }
  if (!clock) {
    const qp = /\bquarter\s+past\s+(\d{1,2})\s*(am|pm)?\b/i.exec(lower);
    if (qp) clock = parseClock(`quarter past ${qp[1]}${qp[2] ? ` ${qp[2]}` : ""}`);
  }
  if (!clock) {
    const qt = /\bquarter\s+to\s+(\d{1,2})\s*(am|pm)?\b/i.exec(lower);
    if (qt) clock = parseClock(`quarter to ${qt[1]}${qt[2] ? ` ${qt[2]}` : ""}`);
  }
  // Bare "9 am" / "9:30pm" / "9am" (before/by/around without "at").
  if (!clock) {
    const bare =
      /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(lower) ||
      /\b(\d{1,2}):(\d{2})\b/.exec(lower);
    if (bare) {
      const frag =
        bare[3] !== undefined
          ? `${bare[1]}${bare[2] ? `:${bare[2]}` : ""}${bare[3]}`
          : `${bare[1]}:${bare[2]}`;
      clock = parseClock(frag);
    }
  }
  // Multi-locale short clocks (product UI locales).
  if (!clock) {
    const de =
      /\bum\s+(\d{1,2})(?:[:.](\d{2}))?\s*uhr\b/i.exec(lower) ||
      /\b(\d{1,2})(?:[:.](\d{2}))?\s*uhr\b/i.exec(lower);
    if (de) {
      const hour = parseInt(de[1]!, 10);
      const minute = de[2] ? parseInt(de[2], 10) : 0;
      if (hour >= 0 && hour <= 23 && minute <= 59) clock = { hour, minute };
    }
  }
  if (!clock) {
    // No leading `\b` — `à` is non-ASCII and JS `\b` is ASCII-only.
    // Prefer explicit `à Nh`. Bare `Nh` only when a soft/fuzzy cue is present —
    // otherwise "dans 2h" / random "5h" fragments steal clocks from durations.
    const frA =
      /à\s+(\d{1,2})\s*h(?:eurs?)?(?:(\d{2}))?\b/i.exec(lower);
    const frBare =
      !frA &&
      /\b(?:avant|vers|après|apres|entre|environ|d['']ici|autour)\b/i.test(lower)
        ? /\b(\d{1,2})\s*h(?:eurs?)?(?:(\d{2}))?\b/i.exec(lower)
        : null;
    const fr = frA ?? frBare;
    if (fr) {
      const hour = parseInt(fr[1]!, 10);
      const minute = fr[2] ? parseInt(fr[2], 10) : 0;
      if (hour >= 0 && hour <= 23 && minute <= 59) clock = { hour, minute };
    }
  }
  if (!clock) {
    const it = /\balle\s+(\d{1,2})\b/i.exec(lower);
    if (it) {
      const hour = parseInt(it[1]!, 10);
      if (hour >= 0 && hour <= 23) clock = { hour, minute: 0 };
    }
  }
  if (!clock) {
    const ja = /(\d{1,2})\s*時/.exec(text);
    if (ja) {
      let hour = parseInt(ja[1]!, 10);
      if (/午後|夕方/.test(text) && hour < 12) hour += 12;
      if (/朝|午前/.test(text) && hour === 12) hour = 0;
      if (hour >= 0 && hour <= 23) clock = { hour, minute: 0 };
    }
  }
  if (!clock) {
    const koAm = /오전\s*(\d{1,2})\s*시/.exec(text);
    const koPm = /오후\s*(\d{1,2})\s*시/.exec(text);
    if (koAm) {
      let hour = parseInt(koAm[1]!, 10);
      if (hour === 12) hour = 0;
      clock = { hour, minute: 0 };
    } else if (koPm) {
      let hour = parseInt(koPm[1]!, 10);
      if (hour < 12) hour += 12;
      clock = { hour, minute: 0 };
    }
  }
  // Period-of-day without a numeric clock (Normative: user named the period).
  if (
    !clock &&
    /morning|早上|上午|朝|오전|\bam\s+morgen\b|morgens\b|\bmatin\b|\bmattina\b/.test(text)
  ) {
    clock = { hour: 8, minute: 0 };
  }
  if (!clock && /tonight|晚上|evening|夕方|저녁/.test(text)) clock = { hour: 20, minute: 0 };
  if (!clock && /中午|正午/.test(text)) clock = { hour: 12, minute: 0 };
  return clock;
}

/** Strip WHEN phrases so a candidate pick can re-attach the notify body. */
export function extractScheduleMessage(text: string): string {
  return extractMessage(text);
}

function extractMessage(text: string): string {
  let s = text.trim();
  s = s.replace(/^(please\s+)?(can you|could you|would you)\s+/i, "");
  s = s.replace(/^remind\s+me\s+(to\s+)?/i, "");
  s = s.replace(/^(能不能|能否|可不可以|请|麻烦|帮我|记得)?\s*(提醒我|提醒一下)?\s*/u, "");
  s = s.replace(
    /\b((?:in|after|within)\s+(?:a|an|one|two|three|four|five|\d+)\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|d(?:ays?|yas?))|in\s+half\s+(?:an?\s+)?(?:minute|hour)|after\s+half\s+(?:an?\s+)?(?:minute|hour)|half\s+(?:an?\s+)?(?:minute|hour)|tomorrow|today|tonight|every\s+\w+|next\s+\w+|this\s+\w+|week after next\s+\w+|at\s+\d{1,2}(:\d{2})?\s*(am|pm)?|at\s+noon|at\s+midnight|half\s+past\s+\d+|quarter\s+(past|to)\s+\d+|this weekend|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2})\b/gi,
    "",
  );
  s = s.replace(
    /(明天|后天|今天|今晚|每天|每周|工作日|下下周[一二三四五六日天]?|下周[一二三四五六日天]?|下[一二三四五六日天](?:周)?|这个周末|本周末|早上|上午|中午|下午|晚上|凌晨|差一刻|一刻|过?半\s*(?:个|個)?\s*(?:分钟|小时)|((?:\d{1,2})|[零〇一二两三四五六七八九十]+)\s*点(半|一刻)?|(?:\d+|[一二两三兩四五六七八九十]+)\s*(?:秒(?:钟|鐘)?|分钟|分鐘|小时|小時|天)\s*后|\d{1,2}\s*月\s*\d{1,2}\s*日?)/gu,
    "",
  );
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[，,、.\s]+|[？?！!。.\s]+$/gu, "").trim();
  if (!s || s.length < 1) return "Reminder";
  if (s.length > 120) s = s.slice(0, 120);
  return s;
}

/**
 * Fuzzy WHEN → ask. Candidates are full today/tomorrow+clock phrases that
 * resolve alone (V-UX-14). Skip offsets that land in the past.
 */
function resolveFuzzyWhenAsk(input: {
  kind: FuzzyWhenKind;
  text: string;
  lower: string;
  now: Date;
  tz: string;
  locale: ProductLocale;
  msg: string;
}): Extract<ResolveNlResult, { ok: false }> {
  const { kind, text, lower, now, tz, locale } = input;
  const detailFor = (d: string): Extract<ResolveNlResult, { ok: false }> => ({
    ok: false,
    reason: "ambiguous",
    detail: d,
  });

  if (kind === "between") {
    const clocks = extractBetweenClocks(text, lower);
    if (clocks.length < 2) {
      return {
        ok: false,
        reason: "missing_time",
        detail: "between/from–to needs two clock times",
      };
    }
    const [a, b] = clocks;
    const midMin = Math.round((a!.hour * 60 + a!.minute + b!.hour * 60 + b!.minute) / 2);
    const mid = { hour: Math.floor(midMin / 60) % 24, minute: midMin % 60 };
    const candidates = uniqueCandidates(
      [a!, mid, b!].map((c) => candidateForClock(c, now, tz, locale)),
    );
    return {
      ok: false,
      reason: "ambiguous",
      detail: "time range — pick one fire time",
      candidates,
    };
  }

  const clock = resolveClock(text, lower);
  if (!clock) {
    return {
      ok: false,
      reason: "missing_time",
      detail:
        kind === "before"
          ? "before/by needs a clock (and how early — 15/30/60 min)"
          : kind === "after"
            ? "after needs a clock (and how late)"
            : "around/about needs a clock",
    };
  }

  const anchorWhen = nextOccurrenceOfClock(clock, now, tz);
  if (!anchorWhen) {
    return detailFor("could not resolve that clock in this time zone");
  }

  const candidates = uniqueCandidates(
    fuzzyOffsetMinutes(kind).map((mins) => {
      const t = new Date(anchorWhen.getTime() + mins * 60_000);
      if (t.getTime() <= now.getTime()) return "";
      const p = zonedParts(t, tz);
      const today = zonedParts(now, tz);
      const isToday =
        p.year === today.year && p.month === today.month && p.day === today.day;
      return formatRelativeDayClock(
        locale,
        isToday ? "today" : "tomorrow",
        p.hour,
        p.minute,
      );
    }),
  );

  if (candidates.length === 0) {
    return detailFor("that soft time is already past — pick another clock");
  }

  const detail =
    kind === "before"
      ? "before/by is a deadline — pick how early (or exactly on the hour)"
      : kind === "after"
        ? "after is open-ended — pick how late after the clock"
        : "around/about is approximate — pick a concrete time";

  return {
    ok: false,
    reason: "ambiguous",
    detail,
    candidates,
  };
}

function uniqueCandidates(rows: string[]): string[] {
  return [...new Set(rows.filter(Boolean))];
}

/** Next occurrence of hour:minute at/after `now` (today if still ahead, else tomorrow). */
function nextOccurrenceOfClock(
  clock: { hour: number; minute: number },
  now: Date,
  tz: string,
  dayShift = 0,
): Date | undefined {
  const base = addDaysWall(now, tz, dayShift);
  let when = atInstant(base.year, base.month, base.day, clock.hour, clock.minute, tz);
  if (!when) return undefined;
  if (dayShift === 0 && when.getTime() <= now.getTime()) {
    const tom = addDaysWall(now, tz, 1);
    when = atInstant(tom.year, tom.month, tom.day, clock.hour, clock.minute, tz);
  }
  return when ?? undefined;
}

function candidateForClock(
  clock: { hour: number; minute: number },
  now: Date,
  tz: string,
  locale: ProductLocale,
): string {
  const when = nextOccurrenceOfClock(clock, now, tz);
  if (!when || when.getTime() <= now.getTime()) return "";
  const p = zonedParts(when, tz);
  const today = zonedParts(now, tz);
  const isToday =
    p.year === today.year && p.month === today.month && p.day === today.day;
  return formatRelativeDayClock(
    locale,
    isToday ? "today" : "tomorrow",
    p.hour,
    p.minute,
  );
}

/** Pull two clocks out of between/from–to / A至B style ranges. */
function extractBetweenClocks(
  text: string,
  lower: string,
): Array<{ hour: number; minute: number }> {
  const out: Array<{ hour: number; minute: number }> = [];
  const en =
    /\bbetween\s+(.+?)\s+and\s+(.+?)(?:\s+to\b|$)/i.exec(lower) ||
    /\bfrom\s+(.+?)\s+to\s+(.+?)(?:\s+to\b|$)/i.exec(lower);
  if (en) {
    for (const frag of [en[1]!, en[2]!]) {
      const c = resolveClock(frag, frag.toLowerCase()) ?? parseClock(frag.trim());
      if (c) out.push(c);
    }
    return out;
  }
  const zh = /((?:\d{1,2})|[零〇一二两三四五六七八九十]+)\s*点(?:半)?\s*(?:到|至)\s*((?:\d{1,2})|[零〇一二两三四五六七八九十]+)\s*点(?:半)?/.exec(
    text,
  );
  if (zh) {
    for (const frag of [`${zh[1]}点`, `${zh[2]}点`]) {
      const c = resolveClock(frag, frag.toLowerCase());
      if (c) out.push(c);
    }
  }
  return out;
}

function okAt(
  when: Date,
  timeZone: string,
  message: string,
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
  locale: ProductLocale,
): Extract<ResolveNlResult, { ok: true }> {
  return {
    ok: true,
    spec: { kind: "cron", cronExpr: expr, timeZone },
    payload: { kind: "notify", message },
    name: message.slice(0, 80),
    resolvedLocal: `${humanCronLabel(expr, locale)} (${timeZone})`,
  };
}

function civilHole(): Extract<ResolveNlResult, { ok: false }> {
  return {
    ok: false,
    reason: "ambiguous",
    detail: "that local time does not exist (DST gap) — pick another time",
  };
}

const DOW_EN: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const DOW_EN_NAME: string[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DOW_ZH: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  两: 2,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

const MONTH_EN: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/**
 * Resolve schedule intent from a single utterance.
 * Deterministic only — on ambiguous / missing_time the agent MUST ask; never invent WHEN.
 */
export function resolveScheduleFromText(input: ResolveNlInput): ResolveNlResult {
  const text = normalize(input.text);
  if (!text) return { ok: false, reason: "not_schedule" };
  const lower = text.toLowerCase();
  const tz = input.timeZone;
  const now = input.referenceNow;
  const msg = extractMessage(text);
  const locale: ProductLocale = normalizeProductLocale(input.locale);

  // --- multi-locale recurring (every day/month/year/weekend/weekday) ---
  const recurring = matchRecurring(text);
  if (recurring) {
    if (recurring.kind === "every_weekend") {
      // Never invent Sat vs Sun — ask even when a clock is present.
      return {
        ok: false,
        reason: "ambiguous",
        detail: "weekend needs Saturday or Sunday",
        candidates: weekendCandidates(locale),
      };
    }
    const clock = resolveClock(text, lower);
    if (!clock) {
      return {
        ok: false,
        reason: "missing_time",
        detail: "recurring schedule needs a clock time",
      };
    }
    if (recurring.kind === "every_day") {
      return okCron(`${clock.minute} ${clock.hour} * * *`, tz, msg, locale);
    }
    if (recurring.kind === "every_month") {
      const dom = parseDayOfMonth(text, lower);
      if (!dom) {
        return {
          ok: false,
          reason: "missing_time",
          detail: "monthly needs a day of month (e.g. every month on the 1st at 9am)",
          candidates: monthlyCandidates(locale, clock.hour, clock.minute),
        };
      }
      return okCron(`${clock.minute} ${clock.hour} ${dom} * *`, tz, msg, locale);
    }
    if (recurring.kind === "every_year") {
      const ymd = parseMonthDay(text, lower);
      if (!ymd) {
        return {
          ok: false,
          reason: "missing_time",
          detail: "yearly needs a month and day (e.g. every year on Jan 1 at 9am)",
          candidates: yearlyCandidates(locale, clock.hour, clock.minute),
        };
      }
      return okCron(
        `${clock.minute} ${clock.hour} ${ymd.day} ${ymd.month} *`,
        tz,
        msg,
        locale,
      );
    }
    if (recurring.kind === "every_weekday") {
      return okCron(`${clock.minute} ${clock.hour} * * ${recurring.dow}`, tz, msg, locale);
    }
  }

  // --- multi-locale day±N (大前天…大后天 / day after tomorrow / übermorgen / …) ---
  const dayOff = matchDayOffset(text);
  if (dayOff) {
    if (dayOff.days < 0) {
      return {
        ok: false,
        reason: "missing_time",
        detail: "that day is in the past — pick a future time",
      };
    }
    const clock = resolveClock(text, lower);
    if (!clock) {
      return { ok: false, reason: "missing_time", detail: "day given but no clock time" };
    }
    const wall = addDaysWall(now, tz, dayOff.days);
    const when = atInstant(wall.year, wall.month, wall.day, clock.hour, clock.minute, tz);
    if (!when) return civilHole();
    return okAt(when, tz, msg);
  }

  // --- relative seconds / minutes / hours (all UI locales) BEFORE calendar offsets ---
  // So "in 2 hours" is never confused with day/month packs; "in 2 days" stays calendar.
  const durationEarly = matchDurationOffset(text);
  if (durationEarly) {
    return okAt(new Date(now.getTime() + durationEarly.ms), tz, msg);
  }

  // --- fuzzy / soft WHEN (before / by / around / after+clock / between) ---
  // Never invent lead time — ask with self-resolving today/tomorrow candidates.
  const fuzzy = matchFuzzyWhenKind(text);
  if (fuzzy) {
    const fuzzyAsk = resolveFuzzyWhenAsk({
      kind: fuzzy,
      text,
      lower,
      now,
      tz,
      locale,
      msg,
    });
    if (fuzzyAsk) return fuzzyAsk;
  }

  // --- multi-locale in N days/months/years (ahead) / ago (refuse) ---
  const unitOff = matchUnitOffset(text);
  if (unitOff) {
    if (unitOff.direction === "ago") {
      return {
        ok: false,
        reason: "missing_time",
        detail: "past relative time — pick a future reminder",
      };
    }
    if (unitOff.unit === "day") {
      // Prefer existing "in N days" path below when English; still handle here for ZH/JA/KO.
      const clock = resolveClock(text, lower);
      if (!clock) {
        return {
          ok: false,
          reason: "missing_time",
          detail: "in N days needs a clock time",
        };
      }
      const wall = addDaysWall(now, tz, unitOff.n);
      const when = atInstant(wall.year, wall.month, wall.day, clock.hour, clock.minute, tz);
      if (!when) return civilHole();
      return okAt(when, tz, msg);
    }
    const clock = resolveClock(text, lower);
    if (!clock) {
      return {
        ok: false,
        reason: "missing_time",
        detail: `${unitOff.unit} offset needs a clock time (and day-of-month may be assumed as today)`,
      };
    }
    const wall =
      unitOff.unit === "month"
        ? addMonthsWall(now, tz, unitOff.n)
        : addYearsWall(now, tz, unitOff.n);
    const when = atInstant(wall.year, wall.month, wall.day, clock.hour, clock.minute, tz);
    if (!when) return civilHole();
    if (when.getTime() <= now.getTime()) {
      return {
        ok: false,
        reason: "missing_time",
        detail: "that time already passed — pick another",
      };
    }
    return okAt(when, tz, msg);
  }

  // --- next / after-next month|year ---
  const my = matchMonthYear(text);
  if (my) {
    if (my.kind === "year_before_last") {
      return {
        ok: false,
        reason: "missing_time",
        detail: "that year is in the past — pick a future date",
      };
    }
    const clock = resolveClock(text, lower);
    if (!clock) {
      return {
        ok: false,
        reason: "missing_time",
        detail: "month/year needs a clock time (day defaults to today-of-month)",
      };
    }
    let wall: ZonedPartsLike;
    if (my.kind === "next_month") wall = addMonthsWall(now, tz, 1);
    else if (my.kind === "month_after_next") wall = addMonthsWall(now, tz, 2);
    else if (my.kind === "next_year") wall = addYearsWall(now, tz, 1);
    else wall = addYearsWall(now, tz, 2);
    const when = atInstant(wall.year, wall.month, wall.day, clock.hour, clock.minute, tz);
    if (!when) return civilHole();
    if (when.getTime() <= now.getTime()) {
      return {
        ok: false,
        reason: "missing_time",
        detail: "that time already passed — pick another day",
      };
    }
    return okAt(when, tz, msg);
  }

  // --- recurring (legacy EN/ZH paths; every morning) ---
  if (
    /\bevery\s+day\b/i.test(text) ||
    /每天/.test(text) ||
    /\bevery\s+morning\b/i.test(text)
  ) {
    const clock = resolveClock(text, lower);
    if (!clock) {
      return {
        ok: false,
        reason: "missing_time",
        detail: "recurring day needs a clock time (e.g. every day at 8am)",
      };
    }
    return okCron(`${clock.minute} ${clock.hour} * * *`, tz, msg, locale);
  }
  if (/\bevery\s+weekday\b/i.test(text) || /工作日|每个工作日/.test(text)) {
    const clock = resolveClock(text, lower);
    if (!clock) {
      return {
        ok: false,
        reason: "missing_time",
        detail: "weekday recurrence needs a clock time",
      };
    }
    return okCron(`${clock.minute} ${clock.hour} * * 1-5`, tz, msg, locale);
  }
  // every other <weekday> — ask (biweekly needs explicit confirm; no silent invent)
  const everyOther =
    /\bevery\s+other\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(
      text,
    ) || /每隔一周/.test(text);
  if (everyOther) {
    const clock = resolveClock(text, lower);
    const clockHint = clock ? formatClockHint(clock.hour, clock.minute) : "9am";
    const dowName =
      typeof everyOther === "object" && everyOther[1]
        ? everyOther[1]!.toLowerCase()
        : "monday";
    return {
      ok: false,
      reason: "ambiguous",
      detail: "every-other-week needs an explicit choice — weekly cron or specific dates",
      candidates: [
        `every ${dowName} at ${clockHint}`,
        `next ${dowName} at ${clockHint}`,
      ],
    };
  }
  const everyWeekday = /\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(
    text,
  );
  if (everyWeekday) {
    const dow = DOW_EN[everyWeekday[1]!.toLowerCase()]!;
    const clock = resolveClock(text, lower);
    if (!clock) {
      return {
        ok: false,
        reason: "missing_time",
        detail: "weekly recurrence needs a clock time",
      };
    }
    return okCron(`${clock.minute} ${clock.hour} * * ${dow}`, tz, msg, locale);
  }

  // Duration (sec/min/hr) handled earlier via matchDurationOffset.
  // Calendar "in N days" handled earlier via matchUnitOffset (needs a clock).

  // --- calendar date + time (EN Oct 20 / ZH 10月20日) ---
  const dateEn =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i.exec(
      text,
    );
  const dateZh = /(\d{1,2})\s*月\s*(\d{1,2})\s*日?(?:\s*(\d{4})\s*年)?/.exec(text);
  const dateIso = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(text);
  if (dateEn || dateZh || dateIso) {
    const clock = resolveClock(text, lower);
    if (!clock) {
      return {
        ok: false,
        reason: "missing_time",
        detail: "date needs a clock time (e.g. Oct 20 at 3pm)",
      };
    }
    const p = zonedParts(now, tz);
    let year = p.year;
    let month = p.month;
    let day = p.day;
    if (dateIso) {
      year = parseInt(dateIso[1]!, 10);
      month = parseInt(dateIso[2]!, 10);
      day = parseInt(dateIso[3]!, 10);
    } else if (dateEn) {
      month = MONTH_EN[dateEn[1]!.toLowerCase()] ?? p.month;
      day = parseInt(dateEn[2]!, 10);
      if (dateEn[3]) year = parseInt(dateEn[3], 10);
      else {
        // If date already passed this year, roll to next year.
        const probe = atInstant(year, month, day, clock.hour, clock.minute, tz);
        if (probe && probe.getTime() <= now.getTime()) year += 1;
      }
    } else if (dateZh) {
      month = parseInt(dateZh[1]!, 10);
      day = parseInt(dateZh[2]!, 10);
      if (dateZh[3]) year = parseInt(dateZh[3], 10);
      else {
        const probe = atInstant(year, month, day, clock.hour, clock.minute, tz);
        if (probe && probe.getTime() <= now.getTime()) year += 1;
      }
    }
    const when = atInstant(year, month, day, clock.hour, clock.minute, tz);
    if (!when) return civilHole();
    if (when.getTime() <= now.getTime()) {
      return {
        ok: false,
        reason: "missing_time",
        detail: "that date/time already passed — pick a future time",
      };
    }
    return okAt(when, tz, msg);
  }

  // --- this weekend / 这个周末 ---
  if (/\bthis weekend\b/i.test(text) || /这个周末|本周末/.test(text)) {
    const clock = resolveClock(text, lower);
    if (!clock) {
      return {
        ok: false,
        reason: "missing_time",
        detail: "weekend needs a day and clock — Saturday or Sunday?",
        candidates: weekendCandidates(locale),
      };
    }
    const p = zonedParts(now, tz);
    // Prefer Saturday; if past → Sunday; if both past → next Saturday.
    const atDow = (targetDow: number, forceNextWeek: boolean): Date | undefined => {
      let delta = (targetDow - p.dow + 7) % 7;
      if (forceNextWeek) delta = delta === 0 ? 7 : delta + 7;
      const wall = addDaysWall(now, tz, delta);
      return atInstant(wall.year, wall.month, wall.day, clock.hour, clock.minute, tz);
    };
    let when = atDow(6, false);
    if (!when || when.getTime() <= now.getTime()) when = atDow(0, false);
    if (!when || when.getTime() <= now.getTime()) when = atDow(6, true);
    if (!when) return civilHole();
    return okAt(when, tz, msg);
  }

  // --- week after next / 下下周 <weekday> ---
  const weekAfterEn =
    /\b(?:week after next|next next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(
      text,
    );
  const weekAfterZh =
    /下下周([一二三四五六日天])/.exec(text) || /下下([一二三四五六日天])(?:周)?/.exec(text);
  if (weekAfterEn || weekAfterZh) {
    let targetDow = 1;
    if (weekAfterEn) targetDow = DOW_EN[weekAfterEn[1]!.toLowerCase()]!;
    else if (weekAfterZh) targetDow = DOW_ZH[weekAfterZh[1]!] ?? 1;
    const p = zonedParts(now, tz);
    let delta = (targetDow - p.dow + 7) % 7;
    if (delta === 0) delta = 7;
    delta += 7; // week after next
    const wall = addDaysWall(now, tz, delta);
    const clock = resolveClock(text, lower);
    if (!clock) {
      return {
        ok: false,
        reason: "missing_time",
        detail: "weekday needs a clock time",
      };
    }
    const when = atInstant(wall.year, wall.month, wall.day, clock.hour, clock.minute, tz);
    if (!when) return civilHole();
    return okAt(when, tz, msg);
  }

  // --- "<weekday> week" (British: that weekday + 7 from next occurrence) ---
  const dowWeek =
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+week\b/i.exec(text);
  if (dowWeek) {
    const targetDow = DOW_EN[dowWeek[1]!.toLowerCase()]!;
    const p = zonedParts(now, tz);
    let delta = (targetDow - p.dow + 7) % 7;
    if (delta === 0) delta = 7;
    delta += 7;
    const wall = addDaysWall(now, tz, delta);
    const clock = resolveClock(text, lower);
    if (!clock) {
      return {
        ok: false,
        reason: "missing_time",
        detail: "weekday needs a clock time",
      };
    }
    const when = atInstant(wall.year, wall.month, wall.day, clock.hour, clock.minute, tz);
    if (!when) return civilHole();
    return okAt(when, tz, msg);
  }

  // --- this|next|<bare> <weekday> (all UI locales) ---
  // Normative: "next X" = strictly future weekday; "this X" / bare = upcoming in current week
  // (same day allowed if clock still ahead; if past → missing_time + candidates).
  const thisNext = matchThisNextWeekday(text) ?? matchBareWeekday(text);
  if (thisNext) {
    const targetDow = thisNext.dow;
    const mode = thisNext.mode;
    const p = zonedParts(now, tz);
    let delta = (targetDow - p.dow + 7) % 7;
    if (mode === "next" && delta === 0) delta = 7;
    const wall = addDaysWall(now, tz, delta);
    const clock = resolveClock(text, lower);
    if (!clock) {
      return {
        ok: false,
        reason: "missing_time",
        detail: "weekday needs a clock time (e.g. next Monday at 9am)",
      };
    }
    let when = atInstant(wall.year, wall.month, wall.day, clock.hour, clock.minute, tz);
    if (!when) return civilHole();
    if (mode === "this" && when.getTime() <= now.getTime()) {
      const clockHint = formatClockHint(clock.hour, clock.minute);
      const name = DOW_EN_NAME[targetDow]!;
      return {
        ok: false,
        reason: "missing_time",
        detail: "that time already passed — say next <weekday> or pick another time",
        candidates: [
          `next ${name} at ${clockHint}`,
          `this ${name} at 8pm`,
        ],
      };
    }
    return okAt(when, tz, msg);
  }

  // tomorrow / day-after handled earlier via matchDayOffset (all UI locales).

  // --- today / heute / aujourd'hui / oggi / 今天 / am Morgen (period today) ---
  if (
    /\btoday\b/i.test(text) ||
    /今天|今晚|今日/.test(text) ||
    /오늘/.test(text) ||
    /\bheute\b/i.test(text) ||
    /\baujourd['']hui\b/i.test(text) ||
    /\boggi\b/i.test(text) ||
    /\bam\s+morgen\b/i.test(text) ||
    /\bce\s+matin\b/i.test(text) ||
    /\bstamattina\b/i.test(text)
  ) {
    const p = zonedParts(now, tz);
    const clock = resolveClock(text, lower);
    if (!clock) return { ok: false, reason: "missing_time" };
    let when = atInstant(p.year, p.month, p.day, clock.hour, clock.minute, tz);
    if (!when) return civilHole();
    if (when.getTime() <= now.getTime()) {
      const wall = addDaysWall(now, tz, 1);
      when = atInstant(wall.year, wall.month, wall.day, clock.hour, clock.minute, tz);
    }
    if (!when) return civilHole();
    return okAt(when, tz, msg);
  }

  // --- bare clock + remind verb (today-or-tomorrow) — all UI locales ---
  if (/(remind|erinner|rappel|ricord|提醒|リマインド|알려)/i.test(text)) {
    const clock = resolveClock(text, lower);
    if (clock) {
      const p = zonedParts(now, tz);
      let when = atInstant(p.year, p.month, p.day, clock.hour, clock.minute, tz);
      if (!when) return civilHole();
      if (when.getTime() <= now.getTime()) {
        const wall = addDaysWall(now, tz, 1);
        when = atInstant(wall.year, wall.month, wall.day, clock.hour, clock.minute, tz);
      }
      if (!when) return civilHole();
      return okAt(when, tz, msg);
    }
  }

  if (/(remind|提醒|cron|schedule|定时)/i.test(text)) {
    return { ok: false, reason: "missing_time", detail: "schedule intent without resolvable time" };
  }
  return { ok: false, reason: "not_schedule" };
}
