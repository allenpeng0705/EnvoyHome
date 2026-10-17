/** Appearance: system | light | dark — persisted like locale. */

export const THEME_OPTIONS = [
  { id: "system", labelKey: "app.themeSystem" },
  { id: "light", labelKey: "app.themeLight" },
  { id: "dark", labelKey: "app.themeDark" },
];

const STORAGE_KEY = "envoyhome.theme";
const listeners = new Set();

/** @type {"system" | "light" | "dark"} */
let preference = "system";
/** @type {MediaQueryList | null} */
let mediaQuery = null;

function normalizeTheme(raw) {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

function systemResolved() {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/** Resolved light|dark applied to the document. */
export function resolvedTheme() {
  return preference === "system" ? systemResolved() : preference;
}

export function getThemePreference() {
  return preference;
}

function applyDom() {
  const resolved = resolvedTheme();
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
}

function onSystemChange() {
  if (preference !== "system") return;
  applyDom();
  for (const fn of listeners) fn(preference, resolvedTheme());
}

export function initTheme() {
  try {
    preference = normalizeTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    preference = "system";
  }
  applyDom();
  try {
    mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    mediaQuery.addEventListener("change", onSystemChange);
  } catch {
    mediaQuery = null;
  }
  return preference;
}

export function setThemePreference(next) {
  preference = normalizeTheme(next);
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    /* ignore */
  }
  applyDom();
  for (const fn of listeners) fn(preference, resolvedTheme());
}

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
