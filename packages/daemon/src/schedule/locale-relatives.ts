// Multi-locale relative calendar surface forms (Design §7.4 / 2026-10-19m).
// Same concepts for every product UI locale — not ZH-only.
// UI locale ≠ pack: we match against the utterance; packs are OR'd so mixed
// bilingual messages still work. `preferredLocale` only affects ask-candidate language.

export type ProductLocale = "en" | "zh" | "de" | "fr" | "it" | "ja" | "ko";

export function normalizeProductLocale(raw?: string): ProductLocale {
  if (!raw) return "en";
  const base = raw.trim().toLowerCase().split(/[-_]/)[0] ?? "en";
  if (base === "zh" || base === "cn") return "zh";
  if (base === "de") return "de";
  if (base === "fr") return "fr";
  if (base === "it") return "it";
  if (base === "ja" || base === "jp") return "ja";
  if (base === "ko" || base === "kr") return "ko";
  return "en";
}

/** Fixed day offset from "today" in the account TZ (negative = past). */
export type DayOffsetHit = { days: number };

/** in N calendar units ahead (past units → caller asks / refuses for schedule). */
export type UnitOffsetHit = {
  n: number;
  unit: "day" | "month" | "year";
  direction: "ahead" | "ago";
};

export type MonthYearHit =
  | { kind: "next_month" }
  | { kind: "month_after_next" }
  | { kind: "next_year" }
  | { kind: "year_after_next" }
  | { kind: "year_before_last" };

export type RecurringHit =
  | { kind: "every_day" }
  | { kind: "every_month" }
  | { kind: "every_year" }
  | { kind: "every_weekend" }
  | { kind: "every_weekday"; dow: number }; // 0=Sun … 6=Sat

function any(res: RegExp[]): RegExp {
  // Merge with | — avoid `\b` around non-ASCII (JS `\b` is ASCII-only).
  return new RegExp(res.map((r) => `(?:${r.source})`).join("|"), "iu");
}

/** day±N idioms (大前天…大后天 / day before yesterday / übermorgen / …). */
const DAY_OFFSET: Array<{ days: number; re: RegExp }> = [
  {
    days: -3,
    re: any([
      /大前天/,
      /\bthree\s+days\s+ago\b/i,
      /\bvor\s+drei\s+tagen\b/i,
      /\bil\s+y\s+a\s+trois\s+jours\b/i,
      /\btre\s+giorni\s+fa\b/i,
      /三日前|みっかまえ/i,
      /사흘\s*전/,
    ]),
  },
  {
    days: -2,
    re: any([
      /前天/,
      /\bday\s+before\s+yesterday\b/i,
      /vorgestern/i,
      /avant[- ]?hier/i,
      /l['']altro\s+ieri/i,
      /一昨日|おととい/i,
      /그저께|그제/,
    ]),
  },
  {
    days: 1,
    // DE: bare "morgen" = tomorrow; never steal "am Morgen" / "jeden Morgen"
    // (JS `\b` is ASCII — lookbehind, not trailing `\b` after umlauts).
    re: any([
      /明天|明日/,
      /\btomorrow\b/i,
      /(?<![Jj]eden\s)(?<!\bam\s)\bmorgen\b/i,
      /\bdemain\b/i,
      /\bdomani\b/i,
      /あした|あす/i,
      /내일/,
    ]),
  },
  {
    days: 2,
    re: any([
      /后天|後日/,
      /\bday\s+after\s+tomorrow\b/i,
      /übermorgen/i,
      /après[- ]?demain/i,
      /dopodomani/i,
      /明後日|あさって/i,
      /모레/,
    ]),
  },
  {
    days: 3,
    re: any([
      /大后天/,
      /\bin\s+three\s+days\b/i,
      /\bin\s+drei\s+tagen\b/i,
      /\bdans\s+trois\s+jours\b/i,
      /\btra\s+tre\s+giorni\b/i,
      /明々後|しあさって/i,
      /글피/,
    ]),
  },
];

const UNIT_AHEAD: Array<{ unit: UnitOffsetHit["unit"]; re: RegExp }> = [
  {
    unit: "day",
    re: /(\d+)\s*(?:days?\s+later|days?\s+from\s+now|日後|天后|日内|jours?\s+plus\s+tard|tagen?\s+später|giorni\s+dopo|일\s*후)/iu,
  },
  {
    unit: "month",
    re: /(\d+)\s*(?:months?\s+later|months?\s+from\s+now|个月后|個月後|ヶ月後|mois\s+plus\s+tard|monaten?\s+später|mesi\s+dopo|달\s*후|개월\s*후)/iu,
  },
  {
    unit: "year",
    re: /(\d+)\s*(?:years?\s+later|years?\s+from\s+now|年后|年後|ans?\s+plus\s+tard|jahren?\s+später|anni\s+dopo|년\s*후)/iu,
  },
];

const UNIT_AGO: Array<{ unit: UnitOffsetHit["unit"]; re: RegExp }> = [
  {
    unit: "day",
    re: /(\d+)\s*(?:days?\s+ago|日前|天前|jours?\s+(?:ago|auparavant)|tagen?\s+(?:ago|zuvor)|giorni\s+fa|일\s*전)/iu,
  },
  {
    unit: "month",
    re: /(\d+)\s*(?:months?\s+ago|个月前|個月前|ヶ月前|mois\s+(?:ago|auparavant)|monaten?\s+(?:ago|zuvor)|mesi\s+fa|달\s*전|개월\s*전)/iu,
  },
  {
    unit: "year",
    re: /(\d+)\s*(?:years?\s+ago|年前|ans?\s+(?:ago|auparavant)|jahren?\s+(?:ago|zuvor)|anni\s+fa|년\s*전)/iu,
  },
];

const MONTH_YEAR: Array<{ hit: MonthYearHit; re: RegExp }> = [
  {
    hit: { kind: "month_after_next" },
    re: any([
      /下下个?月|下下個月/,
      /\b(?:the\s+)?month\s+after\s+next\b/i,
      /\bübernächsten?\s+monat\b/i,
      /\bdans\s+deux\s+mois\b/i,
      /\btra\s+due\s+mesi\b/i,
      /再来月|さらいげつ/i,
      /다다음\s*달/,
    ]),
  },
  {
    hit: { kind: "next_month" },
    re: any([
      /下个?月|下個月/,
      /\bnext\s+month\b/i,
      /\bnächsten?\s+monat\b/i,
      /\ble\s+mois\s+prochain\b/i,
      /\bil\s+mese\s+prossimo\b/i,
      /来月|らいげつ/i,
      /다음\s*달/,
    ]),
  },
  {
    hit: { kind: "year_after_next" },
    re: any([
      /后年|後年/,
      /\byear\s+after\s+next\b/i,
      /\bübernächstes?\s+jahr\b/i,
      /\bdans\s+deux\s+ans\b/i,
      /\btra\s+due\s+anni\b/i,
      /再来年|さらいねん/i,
      /후년|내후년/,
    ]),
  },
  {
    hit: { kind: "next_year" },
    re: any([
      /明年|來年/,
      /\bnext\s+year\b/i,
      /\bnächstes?\s+jahr\b/i,
      /\bl['']année\s+prochaine\b/i,
      /\bl['']anno\s+prossimo\b/i,
      /来年|らいねん/i,
      /내년/,
    ]),
  },
  {
    hit: { kind: "year_before_last" },
    re: any([
      /前年/,
      /\byear\s+before\s+last\b/i,
      /\bvorletztes?\s+jahr\b/i,
      /\bavant[- ]?dernière?\s+année\b/i,
      /\bdue\s+anni\s+fa\b/i,
      /一昨年|おととし/i,
      /재작년/,
    ]),
  },
];

const EVERY_DAY = any([
  /每天|每日/,
  /\bevery\s+day\b/i,
  /\bevery\s+morning\b/i,
  /\bjeden\s+tag\b/i,
  /\bjeden\s+morgen\b/i,
  /\btous\s+les\s+jours\b/i,
  /\btous\s+les\s+matins\b/i,
  /\bogni\s+giorno\b/i,
  /\bogni\s+mattina\b/i,
  /毎日|まいにち/i,
  /毎朝/,
  /매일|매일\s*아침/,
]);

const EVERY_MONTH = any([
  /每月|每个月|每個月/,
  /\bevery\s+month\b/i,
  /\bjeden\s+monat\b/i,
  /\btous\s+les\s+mois\b/i,
  /\bchaque\s+mois\b/i,
  /\bogni\s+mese\b/i,
  /毎月|まいつき/i,
  /매월|매달/,
]);

const EVERY_YEAR = any([
  /每年|毎年/,
  /\bevery\s+year\b/i,
  /\bjedes?\s+jahr\b/i,
  /\btous\s+les\s+ans\b/i,
  /\bchaque\s+année\b/i,
  /\bogni\s+anno\b/i,
  /毎年|まいとし/i,
  /매년/,
]);

const EVERY_WEEKEND = any([
  /每周末|每个周末|每個週末/,
  /\bevery\s+weekend\b/i,
  /\bjedes?\s+wochenende\b/i,
  /\bchaque\s+week[- ]?end\b/i,
  /\bogni\s+fine\s+settimana\b/i,
  /毎週末|まいしゅうまつ/i,
  /매주말/,
]);

// Italian weekday names end in accented letters — JS `\b` is ASCII-only, so never
// put `\b` after lunedì/martedì/… (same trap as FR leading-`à`).
const EVERY_DOW: Array<{ dow: number; re: RegExp }> = [
  {
    dow: 1,
    re: any([/每周一|每星期一/, /\bevery\s+monday\b/i, /\bjeden\s+montag\b/i, /\bchaque\s+lundi\b/i, /ogni\s+luned[iì]/i, /毎週月曜/, /매주\s*월요일/]),
  },
  {
    dow: 2,
    re: any([/每周二|每星期二/, /\bevery\s+tuesday\b/i, /\bjeden\s+dienstag\b/i, /\bchaque\s+mardi\b/i, /ogni\s+marted[iì]/i, /毎週火曜/, /매주\s*화요일/]),
  },
  {
    dow: 3,
    re: any([/每周三|每星期三/, /\bevery\s+wednesday\b/i, /\bjeden\s+mittwoch\b/i, /\bchaque\s+mercredi\b/i, /ogni\s+mercoled[iì]/i, /毎週水曜/, /매주\s*수요일/]),
  },
  {
    dow: 4,
    re: any([/每周四|每星期四/, /\bevery\s+thursday\b/i, /\bjeden\s+donnerstag\b/i, /\bchaque\s+jeudi\b/i, /ogni\s+gioved[iì]/i, /毎週木曜/, /매주\s*목요일/]),
  },
  {
    dow: 5,
    re: any([/每周五|每星期五/, /\bevery\s+friday\b/i, /\bjeden\s+freitag\b/i, /\bchaque\s+vendredi\b/i, /ogni\s+venerd[iì]/i, /毎週金曜/, /매주\s*금요일/]),
  },
  {
    dow: 6,
    re: any([/每周六|每星期六/, /\bevery\s+saturday\b/i, /\bjeden\s+samstag\b/i, /\bchaque\s+samedi\b/i, /\bogni\s+sabato\b/i, /毎週土曜/, /매주\s*토요일/]),
  },
  {
    dow: 0,
    re: any([/每周日|每星期日|每周天/, /\bevery\s+sunday\b/i, /\bjeden\s+sonntag\b/i, /\bchaque\s+dimanche\b/i, /\bogni\s+domenica\b/i, /毎週日曜/, /매주\s*일요일/]),
  },
];

export function matchDayOffset(text: string): DayOffsetHit | undefined {
  // Longer / more specific first: ±3 before ±2 before +1 (après-demain before demain).
  const ordered = [
    DAY_OFFSET.find((d) => d.days === -3)!,
    DAY_OFFSET.find((d) => d.days === 3)!,
    DAY_OFFSET.find((d) => d.days === -2)!,
    DAY_OFFSET.find((d) => d.days === 2)!,
    DAY_OFFSET.find((d) => d.days === 1)!,
  ];
  for (const row of ordered) {
    if (row.re.test(text)) return { days: row.days };
  }
  return undefined;
}

export function matchUnitOffset(text: string): UnitOffsetHit | undefined {
  for (const row of UNIT_AHEAD) {
    const m = row.re.exec(text);
    if (m) {
      const n = parseInt(m[1]!, 10);
      if (n > 0 && n <= 3660) return { n, unit: row.unit, direction: "ahead" };
    }
  }
  for (const row of UNIT_AGO) {
    const m = row.re.exec(text);
    if (m) {
      const n = parseInt(m[1]!, 10);
      if (n > 0 && n <= 3660) return { n, unit: row.unit, direction: "ago" };
    }
  }
  return undefined;
}

export function matchMonthYear(text: string): MonthYearHit | undefined {
  for (const row of MONTH_YEAR) {
    if (row.re.test(text)) return row.hit;
  }
  return undefined;
}

export function matchRecurring(text: string): RecurringHit | undefined {
  if (EVERY_WEEKEND.test(text)) return { kind: "every_weekend" };
  if (EVERY_YEAR.test(text)) return { kind: "every_year" };
  if (EVERY_MONTH.test(text)) return { kind: "every_month" };
  if (EVERY_DAY.test(text)) return { kind: "every_day" };
  for (const row of EVERY_DOW) {
    if (row.re.test(text)) return { kind: "every_weekday", dow: row.dow };
  }
  return undefined;
}

/** Ask-candidate labels (prefer caller's locale). */
export function weekendCandidates(locale: ProductLocale): string[] {
  switch (locale) {
    case "zh":
      return ["周六上午10点", "周日上午10点"];
    case "de":
      return ["Samstag um 10 Uhr", "Sonntag um 10 Uhr"];
    case "fr":
      return ["samedi à 10h", "dimanche à 10h"];
    case "it":
      return ["sabato alle 10", "domenica alle 10"];
    case "ja":
      return ["土曜10時", "日曜10時"];
    case "ko":
      return ["토요일 오전 10시", "일요일 오전 10시"];
    default:
      return ["Saturday at 10am", "Sunday at 10am"];
  }
}

function clockHintLocal(locale: ProductLocale, hour: number, minute: number): string {
  const mm = minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`;
  switch (locale) {
    case "zh":
      return minute === 0 ? `${hour}点` : `${hour}点${minute}分`;
    case "ja":
      return minute === 0 ? `${hour}時` : `${hour}時${minute}分`;
    case "ko":
      return minute === 0 ? `${hour}시` : `${hour}시 ${minute}분`;
    case "de":
      return minute === 0 ? `${hour} Uhr` : `${hour}:${String(minute).padStart(2, "0")} Uhr`;
    case "fr":
      return minute === 0 ? `${hour}h` : `${hour}h${String(minute).padStart(2, "0")}`;
    case "it":
      return minute === 0 ? `${hour}` : `${hour}:${String(minute).padStart(2, "0")}`;
    default: {
      const h12 = hour % 12 === 0 ? 12 : hour % 12;
      const ampm = hour < 12 ? "am" : "pm";
      return minute === 0 ? `${h12}${ampm}` : `${h12}${mm}${ampm}`;
    }
  }
}

/** Monthly cron ask candidates — never invent DOM=1. */
export function monthlyCandidates(
  locale: ProductLocale,
  hour: number,
  minute: number,
): string[] {
  const c = clockHintLocal(locale, hour, minute);
  switch (locale) {
    case "zh":
      return [`每月1号${c}`, `每月15号${c}`];
    case "de":
      return [`jeden Monat am 1. um ${c}`, `jeden Monat am 15. um ${c}`];
    case "fr":
      return [`chaque mois le 1er à ${c}`, `chaque mois le 15 à ${c}`];
    case "it":
      return [`ogni mese il 1 alle ${c}`, `ogni mese il 15 alle ${c}`];
    case "ja":
      return [`毎月1日${c}`, `毎月15日${c}`];
    case "ko":
      return [`매월 1일 ${c}`, `매월 15일 ${c}`];
    default:
      return [`every month on the 1st at ${c}`, `every month on the 15th at ${c}`];
  }
}

/** Yearly cron ask candidates — never invent Jan 1. */
export function yearlyCandidates(
  locale: ProductLocale,
  hour: number,
  minute: number,
): string[] {
  const c = clockHintLocal(locale, hour, minute);
  switch (locale) {
    case "zh":
      return [`每年1月1日${c}`, `每年12月31日${c}`];
    case "de":
      return [`jedes Jahr am 1. Januar um ${c}`, `jedes Jahr am 31. Dezember um ${c}`];
    case "fr":
      return [`chaque année le 1er janvier à ${c}`, `chaque année le 31 décembre à ${c}`];
    case "it":
      return [`ogni anno il 1 gennaio alle ${c}`, `ogni anno il 31 dicembre alle ${c}`];
    case "ja":
      return [`毎年1月1日${c}`, `毎年12月31日${c}`];
    case "ko":
      return [`매년 1월 1일 ${c}`, `매년 12월 31일 ${c}`];
    default:
      return [`every year on January 1 at ${c}`, `every year on December 31 at ${c}`];
  }
}

export type ThisNextWeekdayHit = { mode: "this" | "next"; dow: number };

const DOW_NAME_TO_NUM: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  // DE
  sonntag: 0,
  montag: 1,
  dienstag: 2,
  mittwoch: 3,
  donnerstag: 4,
  freitag: 5,
  samstag: 6,
  // FR
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
  // IT
  domenica: 0,
  lunedì: 1,
  lunedi: 1,
  martedì: 2,
  martedi: 2,
  mercoledì: 3,
  mercoledi: 3,
  giovedì: 4,
  giovedi: 4,
  venerdì: 5,
  venerdi: 5,
  sabato: 6,
};

const DOW_ZH: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

const DOW_JA: Record<string, number> = {
  日: 0,
  月: 1,
  火: 2,
  水: 3,
  木: 4,
  金: 5,
  土: 6,
};

const DOW_KO: Record<string, number> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
};

/**
 * this|next <weekday> across product UI locales.
 * "next" = strictly future; "this" = upcoming in current week.
 */
export function matchThisNextWeekday(text: string): ThisNextWeekdayHit | undefined {
  const lower = text.toLowerCase();
  // EN
  const enThis =
    /\bthis\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i.exec(
      lower,
    );
  if (enThis) return { mode: "this", dow: DOW_NAME_TO_NUM[enThis[1]!.toLowerCase()]! };
  const enNext =
    /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i.exec(
      lower,
    );
  if (enNext) return { mode: "next", dow: DOW_NAME_TO_NUM[enNext[1]!.toLowerCase()]! };
  // DE: diesen/nächsten Montag
  const deThis =
    /\bdiesen\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/i.exec(lower);
  if (deThis) return { mode: "this", dow: DOW_NAME_TO_NUM[deThis[1]!.toLowerCase()]! };
  const deNext =
    /\bnächste[nr]?\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/i.exec(lower);
  if (deNext) return { mode: "next", dow: DOW_NAME_TO_NUM[deNext[1]!.toLowerCase()]! };
  // FR: ce lundi / lundi prochain
  const frThis =
    /\bce\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i.exec(lower);
  if (frThis) return { mode: "this", dow: DOW_NAME_TO_NUM[frThis[1]!.toLowerCase()]! };
  const frNext =
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+prochain\b/i.exec(lower);
  if (frNext) return { mode: "next", dow: DOW_NAME_TO_NUM[frNext[1]!.toLowerCase()]! };
  // IT: questo lunedì / prossimo lunedì / lunedì prossimo (no trailing `\b` after accents)
  const itDow = "(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)";
  const itThis = new RegExp(`quest[oa]\\s+${itDow}`, "i").exec(lower);
  if (itThis) {
    const k = itThis[1]!.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    return { mode: "this", dow: DOW_NAME_TO_NUM[k] ?? DOW_NAME_TO_NUM[itThis[1]!.toLowerCase()]! };
  }
  const itNext =
    new RegExp(`prossim[oa]\\s+${itDow}`, "i").exec(lower) ||
    new RegExp(`${itDow}\\s+prossim[oa]`, "i").exec(lower);
  if (itNext) {
    const raw = itNext[1]!.toLowerCase();
    const k = raw.normalize("NFD").replace(/\p{M}/gu, "");
    const dow = DOW_NAME_TO_NUM[k] ?? DOW_NAME_TO_NUM[raw];
    if (dow !== undefined) return { mode: "next", dow };
  }
  // ZH: 这周一 / 下周一 / 下周一天
  const zhThis =
    /这([一二三四五六日天])(?:周)?/.exec(text) || /本周([一二三四五六日天])/.exec(text);
  if (zhThis) return { mode: "this", dow: DOW_ZH[zhThis[1]!] ?? 1 };
  const zhNext =
    /下(一|两|三|四|五|六|日|天)(?:周)?/.exec(text) || /下周([一二三四五六日天])/.exec(text);
  if (zhNext) return { mode: "next", dow: DOW_ZH[zhNext[1]!] ?? 1 };
  // JA: 今週の月曜 / 来週月曜
  const jaThis = /今週\s*(?:の)?\s*([日月火水木金土])/.exec(text);
  if (jaThis) return { mode: "this", dow: DOW_JA[jaThis[1]!] ?? 1 };
  const jaNext = /来週\s*(?:の)?\s*([日月火水木金土])/.exec(text);
  if (jaNext) return { mode: "next", dow: DOW_JA[jaNext[1]!] ?? 1 };
  // KO: 이번 월요일 / 다음 월요일
  const koThis = /이번\s*([월화수목금토일])(?:요일)?/.exec(text);
  if (koThis) return { mode: "this", dow: DOW_KO[koThis[1]!] ?? 1 };
  const koNext = /다음\s*([월화수목금토일])(?:요일)?/.exec(text);
  if (koNext) return { mode: "next", dow: DOW_KO[koNext[1]!] ?? 1 };
  return undefined;
}
