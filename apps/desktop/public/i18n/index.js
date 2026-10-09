import {
  DEFAULT_LOCALE,
  LOCALE_OPTIONS,
  SUPPORTED_LOCALES,
  detectBrowserLocale,
  normalizeLocale,
} from "./locales.js";
import en from "./en.js";
import zh from "./zh.js";
import ko from "./ko.js";
import ja from "./ja.js";
import fr from "./fr.js";
import de from "./de.js";
import it from "./it.js";

const CATALOGS = { en, zh, ko, ja, fr, de, it };
const STORAGE_KEY = "envoyhome.locale";

let locale = DEFAULT_LOCALE;
const listeners = new Set();

function readStoredLocale() {
  try {
    return normalizeLocale(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function initLocale() {
  const stored = (() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  })();
  locale = stored ? normalizeLocale(stored) : detectBrowserLocale();
  document.documentElement.lang = locale;
  return locale;
}

export function getLocale() {
  return locale;
}

export function setLocale(next) {
  locale = normalizeLocale(next);
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = locale;
  for (const fn of listeners) fn(locale);
}

export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Translate key; supports `{name}` interpolation. Falls back to English, then key. */
export function t(key, vars) {
  const table = CATALOGS[locale] || en;
  let msg = table[key] ?? en[key] ?? key;
  if (vars && typeof msg === "string") {
    msg = msg.replace(/\{(\w+)\}/g, (_, name) =>
      vars[name] != null ? String(vars[name]) : `{${name}}`,
    );
  }
  return msg;
}

/** Apply data-i18n / data-i18n-placeholder on a root element. */
export function applyDomI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key && "placeholder" in el) el.placeholder = t(key);
  });
  root.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (key) el.setAttribute("aria-label", t(key));
  });
}

export {
  DEFAULT_LOCALE,
  LOCALE_OPTIONS,
  SUPPORTED_LOCALES,
  detectBrowserLocale,
  normalizeLocale,
  readStoredLocale,
};
