// needClass from turn text (Design §8.3 / locked plan). First match wins.

export type NeedClass = "cheap" | "standard" | "hard";

export interface NeedClassRule {
  needClass: NeedClass;
  /** Substring / word-boundary match after NFC + lowercasing. */
  keywords?: string[];
  /** Match when text length is strictly greater than this (e.g. 4000 → hard). */
  longerThan?: number;
  /** Match when text length is at most this (e.g. 80 → cheap), if no keywords or keyword hits. */
  maxChars?: number;
}

const HARD_KEYWORDS = [
  "prove",
  "step by step",
  "architect",
  "implement",
  "refactor",
  "benchmark",
  "latest news",
  "research",
  "论文",
  "架构",
  "实现",
  "重构",
  "最新",
  "深入研究",
];

const CHEAP_KEYWORDS = [
  "hello",
  "hi",
  "thanks",
  "what time",
  "remind me",
  "你好",
  "谢谢",
  "几点",
  "提醒",
];

/** Bundled starter pack — account rules prepend. */
export const DEFAULT_NEED_CLASS_RULES: NeedClassRule[] = [
  { needClass: "hard", longerThan: 4000 },
  { needClass: "hard", keywords: HARD_KEYWORDS },
  { needClass: "cheap", maxChars: 80 },
  { needClass: "cheap", keywords: CHEAP_KEYWORDS },
];

function normalize(text: string): string {
  return text.normalize("NFC").toLowerCase();
}

/** ASCII single-token keywords use word boundaries; phrases and CJK use substring. */
function keywordHits(normalized: string, keyword: string): boolean {
  const k = keyword.normalize("NFC").toLowerCase();
  if (!k) return false;
  if (/[\u3400-\u9fff]/.test(k) || k.includes(" ")) {
    return normalized.includes(k);
  }
  const re = new RegExp(
    `(?:^|[^a-z0-9_])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9_])`,
  );
  return re.test(normalized);
}

function ruleMatches(normalized: string, rule: NeedClassRule): boolean {
  if (rule.longerThan !== undefined) {
    return normalized.length > rule.longerThan;
  }
  if (rule.keywords?.length) {
    return rule.keywords.some((kw) => keywordHits(normalized, kw));
  }
  if (rule.maxChars !== undefined) {
    return normalized.length <= rule.maxChars;
  }
  return false;
}

/**
 * Classify turn text. `accountRules` prepend (first match wins), then bundled defaults.
 */
export function classifyNeedClass(
  text: string,
  accountRules: NeedClassRule[] = [],
): NeedClass {
  const normalized = normalize(text ?? "");
  const rules = [...accountRules, ...DEFAULT_NEED_CLASS_RULES];
  for (const rule of rules) {
    if (ruleMatches(normalized, rule)) return rule.needClass;
  }
  return "standard";
}
