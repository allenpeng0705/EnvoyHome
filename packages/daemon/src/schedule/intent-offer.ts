import { honestyDisclaimerLocale } from "@envoyhome/harness-host";
import type { ResolveNlResult } from "./resolve-nl.js";

type OfferLocale = "en" | "zh" | "de" | "fr" | "it" | "ja" | "ko";

/**
 * When the model skips schedule propose, offer only if the resolver already
 * sees a schedule (or a schedule that still needs a time). Not a second LLM.
 */
export function formatScheduleIntentOffer(
  resolved: ResolveNlResult,
  sample: string,
): string | undefined {
  if (!resolved.ok && resolved.reason === "not_schedule") return undefined;
  const loc = honestyDisclaimerLocale(sample);
  if (resolved.ok) {
    return OK_OFFER[loc](resolved.resolvedLocal);
  }
  if (resolved.reason !== "missing_time" && resolved.reason !== "ambiguous") return undefined;
  const extra = resolved.candidates?.length
    ? resolved.candidates.join(" | ")
    : (resolved.detail ?? "");
  return ASK_OFFER[loc](extra);
}

const OK_OFFER: Record<OfferLocale, (when: string) => string> = {
  en: (when) =>
    `This can be scheduled as ${when}. It is not armed yet — say yes if you want it set.`,
  zh: (when) => `可以排成 ${when}。还没有启用 — 如果要设置，请说确认。`,
  de: (when) =>
    `Das kann als ${when} geplant werden. Noch nicht aktiv — sag ja, wenn es gesetzt werden soll.`,
  fr: (when) =>
    `Cela peut être planifié pour ${when}. Ce n'est pas encore armé — dis oui pour le régler.`,
  it: (when) =>
    `Si può pianificare come ${when}. Non è ancora attivo — di' sì se vuoi impostarlo.`,
  ja: (when) => `${when} に予定できます。まだ有効ではありません。設定するなら「はい」と言ってください。`,
  ko: (when) => `${when}(으)로 예약할 수 있습니다. 아직 켜지지 않았습니다. 설정하려면 예라고 말하세요.`,
};

const ASK_OFFER: Record<OfferLocale, (extra: string) => string> = {
  en: (extra) =>
    `This looks like a reminder, but the time is not settled.${extra ? ` ${extra}` : ""}`,
  zh: (extra) => `这像是一个提醒，但时间还不明确。${extra ? ` ${extra}` : ""}`,
  de: (extra) =>
    `Das klingt nach einer Erinnerung, aber die Zeit ist nicht klar.${extra ? ` ${extra}` : ""}`,
  fr: (extra) =>
    `Cela ressemble à un rappel, mais l'heure n'est pas fixée.${extra ? ` ${extra}` : ""}`,
  it: (extra) =>
    `Sembra un promemoria, ma l'orario non è chiaro.${extra ? ` ${extra}` : ""}`,
  ja: (extra) => `リマインダーのようですが、時刻が決まっていません。${extra ? ` ${extra}` : ""}`,
  ko: (extra) => `알림처럼 보이지만 시간이 정해지지 않았습니다.${extra ? ` ${extra}` : ""}`,
};
