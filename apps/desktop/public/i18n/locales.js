/** Same language set as EnvoyMesh Social / EnvoyGo. */
export const SUPPORTED_LOCALES = ["en", "zh", "ko", "ja", "fr", "de", "it"];

export const DEFAULT_LOCALE = "en";

export const LOCALE_OPTIONS = [
  { id: "en", label: "English" },
  { id: "zh", label: "中文" },
  { id: "ko", label: "한국어" },
  { id: "ja", label: "日本語" },
  { id: "fr", label: "Français" },
  { id: "de", label: "Deutsch" },
  { id: "it", label: "Italiano" },
];

export function normalizeLocale(value) {
  const trimmed = value?.trim?.().toLowerCase?.() ?? "";
  const primary = trimmed.split("-")[0];
  if (SUPPORTED_LOCALES.includes(primary)) return primary;
  return DEFAULT_LOCALE;
}

export function detectBrowserLocale() {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  return normalizeLocale(navigator.language);
}
