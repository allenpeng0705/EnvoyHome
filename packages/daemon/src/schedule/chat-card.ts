import { normalizeProductLocale, type ProductLocale } from "./locale-relatives.js";
import type { ScheduleJob, ScheduleSpec } from "./types.js";

/** Readable WHEN for the model and for list output. No raw cron or millisecond interval. */
export function describeScheduleSpec(spec: ScheduleSpec): string {
  if (spec.kind === "at") {
    return spec.whenInstant
      ? `once at ${spec.whenInstant} ${spec.timeZone}`
      : `once (${spec.timeZone})`;
  }
  if (spec.kind === "every") {
    return `every ${humanEvery(spec.everyMs)} (${spec.timeZone})`;
  }
  if (spec.kind === "cron" && spec.cronExpr) {
    return `${describeCron(spec.cronExpr)} (${spec.timeZone})`;
  }
  return `${spec.kind} (${spec.timeZone})`;
}

function humanEvery(ms: number | undefined): string {
  if (!ms || ms <= 0) return "interval";
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr} hour${hr === 1 ? "" : "s"}`;
  const day = Math.max(1, Math.round(hr / 24));
  return `${day} day${day === 1 ? "" : "s"}`;
}

function clockLabel(hour: string, minute: string): string {
  if (!/^\d+$/.test(hour) || !/^\d+$/.test(minute)) return `${hour}:${minute}`;
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

const DOW_LABEL: Record<ProductLocale, Record<string, string>> = {
  en: { "0": "Sunday", "7": "Sunday", "1": "Monday", "2": "Tuesday", "3": "Wednesday", "4": "Thursday", "5": "Friday", "6": "Saturday", "1-5": "weekdays" },
  zh: { "0": "周日", "7": "周日", "1": "周一", "2": "周二", "3": "周三", "4": "周四", "5": "周五", "6": "周六", "1-5": "工作日" },
  de: { "0": "Sonntag", "7": "Sonntag", "1": "Montag", "2": "Dienstag", "3": "Mittwoch", "4": "Donnerstag", "5": "Freitag", "6": "Samstag", "1-5": "Werktage" },
  fr: { "0": "dimanche", "7": "dimanche", "1": "lundi", "2": "mardi", "3": "mercredi", "4": "jeudi", "5": "vendredi", "6": "samedi", "1-5": "jours ouvrés" },
  it: { "0": "domenica", "7": "domenica", "1": "lunedì", "2": "martedì", "3": "mercoledì", "4": "giovedì", "5": "venerdì", "6": "sabato", "1-5": "feriali" },
  ja: { "0": "日曜", "7": "日曜", "1": "月曜", "2": "火曜", "3": "水曜", "4": "木曜", "5": "金曜", "6": "土曜", "1-5": "平日" },
  ko: { "0": "일요일", "7": "일요일", "1": "월요일", "2": "화요일", "3": "수요일", "4": "목요일", "5": "금요일", "6": "토요일", "1-5": "평일" },
};

/** Human WHEN for a 5-field cron. Never the raw expression. */
export function humanCronLabel(expr: string, locale?: string): string {
  const loc = normalizeProductLocale(locale);
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return expr;
  const [minute, hour, dom, month, dow] = parts;
  const hm = clockLabel(hour ?? "*", minute ?? "*");
  const day = DOW_LABEL[loc][dow ?? ""] ?? dow;
  if (dom === "*" && month === "*" && dow === "*") {
    if (loc === "zh") return `每天 ${hm}`;
    if (loc === "ja") return `毎日 ${hm}`;
    if (loc === "ko") return `매일 ${hm}`;
    if (loc === "de") return `täglich um ${hm}`;
    if (loc === "fr") return `tous les jours à ${hm}`;
    if (loc === "it") return `ogni giorno alle ${hm}`;
    return `daily at ${hm}`;
  }
  if (dom === "*" && month === "*" && dow && dow !== "*") {
    if (loc === "zh") return `每${day} ${hm}`;
    if (loc === "ja") return `毎${day} ${hm}`;
    if (loc === "ko") return `매주 ${day} ${hm}`;
    if (loc === "de") return `jeden ${day} um ${hm}`;
    if (loc === "fr") return `chaque ${day} à ${hm}`;
    if (loc === "it") return `ogni ${day} alle ${hm}`;
    return `every ${day} at ${hm}`;
  }
  if (dom && dom !== "*" && month === "*" && dow === "*") {
    if (loc === "zh") return `每月${dom}日 ${hm}`;
    if (loc === "ja") return `毎月${dom}日 ${hm}`;
    if (loc === "ko") return `매월 ${dom}일 ${hm}`;
    return `monthly on day ${dom} at ${hm}`;
  }
  if (dom && dom !== "*" && month && month !== "*" && dow === "*") {
    if (loc === "zh") return `每年${month}月${dom}日 ${hm}`;
    if (loc === "ja") return `毎年${month}月${dom}日 ${hm}`;
    if (loc === "ko") return `매년 ${month}월 ${dom}일 ${hm}`;
    return `yearly on month ${month} day ${dom} at ${hm}`;
  }
  return expr;
}

function describeCron(expr: string): string {
  return humanCronLabel(expr, "en");
}

/**
 * Standing inject for `purpose: "schedules"` turns.
 * Lists user jobs so the model can change them; WHEN stays on the resolver.
 */
export function formatSchedulesChatCard(jobs: readonly ScheduleJob[]): string {
  const visible = jobs.filter((j) => j.payload.kind !== "system").slice(0, 24);
  const lines = visible.map((j) => {
    const state = j.enabled ? "on" : "off";
    const synced = j.source === "workflow" ? " workflow-synced" : "";
    return `- id=${j.id} ${j.name}: ${describeScheduleSpec(j.spec)} ${state}${synced} next=${j.nextRunAt ?? "—"}`;
  });
  const more =
    jobs.filter((j) => j.payload.kind !== "system").length > visible.length
      ? "\n- (more jobs exist — call schedule list)"
      : "";
  return `## Schedules chat
This session is only for reminders and schedules. The only tool here is \`schedule\`.
- New reminder: \`action: "propose"\` with the user's WHEN words in \`text\`. Then \`confirm\` with \`proposalId\` only after they agree.
- Change WHEN: \`action: "reschedule"\` with \`jobId\` and the user's WHEN words in \`text\`. Then \`confirm\`. That updates the same job.
- Pause or resume: \`action: "enable"\` with \`jobId\` and \`enabled\` true or false.
- Delete: \`action: "remove"\` with \`jobId\`. Workflow-synced jobs cannot be deleted.
- Rename: \`action: "rename"\` with \`jobId\` and \`name\`.
- Do not invent whenInstant, cronExpr, or everyMs. Quote resolvedLocal before asking them to confirm.
- Current jobs (system maintenance hidden):
${lines.length ? lines.join("\n") : "(none)"}${more}`;
}
