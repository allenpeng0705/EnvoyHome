/**
 * Fail if non-English desktop/mobile locale catalogs drift from English keys.
 *
 * Desktop: apps/desktop/public/i18n/{en,zh,…}.js (flat string maps)
 * Mobile:  apps/mobile/lib/l10n/app_{en,zh,…}.arb
 *
 * Checks:
 *   - every English key exists in each locale (incl. multiline `"key":\n  "…"`)
 *   - desktop catalogs import as ESM (catches bad escapes like `C:\`)
 *   - ARB message `{placeholder}` names match English (and `@meta` when present)
 *
 * Usage (repo root): node scripts/i18n-check.mjs
 *                    pnpm i18n:check
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const locales = ["zh", "ko", "ja", "fr", "de", "it"];
let failed = false;

/** Keys for both `"k": "v"` and `"k":\n  "v"` forms. */
function deskKeys(locale) {
  const file = path.join(root, "apps/desktop/public/i18n", `${locale}.js`);
  const text = readFileSync(file, "utf8");
  const keys = new Set();
  for (const m of text.matchAll(/^\s*"([^"]+)":\s*(?:"|(?:\r?\n))/gm)) {
    keys.add(m[1]);
  }
  return keys;
}

function arbData(locale) {
  const file = path.join(root, "apps/mobile/lib/l10n", `app_${locale}.arb`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

function arbKeys(data) {
  if (!data) return new Set();
  return new Set(
    Object.keys(data).filter((k) => !k.startsWith("@") && k !== "@@locale"),
  );
}

function placeholdersIn(str) {
  if (typeof str !== "string") return new Set();
  return new Set([...str.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
}

const enDesk = deskKeys("en");
const enMobData = arbData("en");
const enMob = arbKeys(enMobData);
console.log(`i18n-check: desktop en=${enDesk.size} mobile en=${enMob.size}`);

for (const locale of locales) {
  const desk = deskKeys(locale);
  const deskMissing = [...enDesk].filter((k) => !desk.has(k)).sort();
  if (deskMissing.length) {
    failed = true;
    console.error(`desktop ${locale}: missing ${deskMissing.length} keys`);
    for (const k of deskMissing.slice(0, 30)) console.error(`  ${k}`);
    if (deskMissing.length > 30) console.error(`  …+${deskMissing.length - 30}`);
  } else {
    console.log(`desktop ${locale}: OK (${desk.size} keys)`);
  }

  // Load as ESM — catches SyntaxError from bad escapes (e.g. unescaped C:\).
  const deskFile = path.join(root, "apps/desktop/public/i18n", `${locale}.js`);
  try {
    await import(`${pathToFileURL(deskFile).href}?i18ncheck=${Date.now()}-${locale}`);
  } catch (err) {
    failed = true;
    console.error(
      `desktop ${locale}: failed to import (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  const mobData = arbData(locale);
  const mob = arbKeys(mobData);
  const mobMissing = [...enMob].filter((k) => !mob.has(k)).sort();
  if (mobMissing.length) {
    failed = true;
    console.error(`mobile ${locale}: missing ${mobMissing.length} keys`);
    for (const k of mobMissing.slice(0, 30)) console.error(`  ${k}`);
    if (mobMissing.length > 30) console.error(`  …+${mobMissing.length - 30}`);
  } else {
    console.log(`mobile ${locale}: OK (${mob.size} keys)`);
  }

  if (mobData && enMobData) {
    let placeholderIssues = 0;
    for (const key of enMob) {
      if (!(key in mobData)) continue;
      const enPh = placeholdersIn(enMobData[key]);
      const locPh = placeholdersIn(mobData[key]);
      for (const p of enPh) {
        if (!locPh.has(p)) {
          if (placeholderIssues < 20) {
            console.error(`mobile ${locale}: ${key} missing {${p}}`);
          }
          placeholderIssues += 1;
        }
      }
      const metaKey = `@${key}`;
      if (enMobData[metaKey] && !mobData[metaKey]) {
        if (placeholderIssues < 20) {
          console.error(`mobile ${locale}: missing ${metaKey} metadata`);
        }
        placeholderIssues += 1;
      }
    }
    if (placeholderIssues > 0) {
      failed = true;
      if (placeholderIssues > 20) {
        console.error(`mobile ${locale}: …+${placeholderIssues - 20} placeholder/meta issues`);
      }
    }
  }
}

if (failed) {
  console.error("i18n-check FAILED — add translations for missing keys.");
  process.exit(1);
}
console.log("i18n-check OK");
