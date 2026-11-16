/**
 * Maintainer-only helper: apply translation JSON maps onto desktop locale JS +
 * mobile ARB files. **Not a CI step** — review the diff, then run
 * `pnpm i18n:check` before committing.
 *
 * Expects $ENVOYHOME_I18N_FIX_DIR (default /tmp/eh-i18n-fix):
 *   {desktop,mobile}-translated-{locale}.json
 * as flat { key: translatedString } maps (mobile keys are ARB message names).
 *
 * Usage (repo root):
 *   node scripts/i18n-apply-translations.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixDir = process.env.ENVOYHOME_I18N_FIX_DIR || "/tmp/eh-i18n-fix";
const locales = ["zh", "ko", "ja", "fr", "de", "it"];

function escJs(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function loadJson(file) {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

function applyDesktop(locale, translations) {
  const file = path.join(root, "apps/desktop/public/i18n", `${locale}.js`);
  let text = readFileSync(file, "utf8");
  let updated = 0;
  let added = 0;
  for (const [key, value] of Object.entries(translations)) {
    const re = new RegExp(
      `^(\\s*)"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":\\s*"(?:\\\\.|[^"\\\\])*"`,
      "m",
    );
    const line = `"${key}": "${escJs(value)}"`;
    if (re.test(text)) {
      text = text.replace(re, `$1${line}`);
      updated += 1;
    } else {
      // Insert before closing };
      const idx = text.lastIndexOf("};");
      if (idx < 0) throw new Error(`no closing }; in ${file}`);
      const before = text.slice(0, idx).replace(/\s*$/, "");
      const needsComma = /"[^"]*"\s*$/.test(before.split("\n").pop() ?? "");
      text = `${before}${needsComma ? "," : ""}\n  ${line},\n};\n`;
      added += 1;
    }
  }
  writeFileSync(file, text);
  return { updated, added };
}

function applyMobile(locale, translations) {
  const file = path.join(root, "apps/mobile/lib/l10n", `app_${locale}.arb`);
  const enFile = path.join(root, "apps/mobile/lib/l10n", "app_en.arb");
  const data = JSON.parse(readFileSync(file, "utf8"));
  const en = JSON.parse(readFileSync(enFile, "utf8"));
  let updated = 0;
  let added = 0;
  for (const [key, value] of Object.entries(translations)) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      if (data[key] !== value) {
        data[key] = value;
        updated += 1;
      }
    } else {
      data[key] = value;
      added += 1;
      const metaKey = `@${key}`;
      if (en[metaKey] && !data[metaKey]) data[metaKey] = en[metaKey];
    }
  }
  // Keep @@locale first if present
  const ordered = {};
  if (data["@@locale"]) ordered["@@locale"] = data["@@locale"];
  for (const [k, v] of Object.entries(data)) {
    if (k === "@@locale") continue;
    ordered[k] = v;
  }
  writeFileSync(file, `${JSON.stringify(ordered, null, 2)}\n`);
  return { updated, added };
}

let any = false;
for (const locale of locales) {
  const desk = loadJson(path.join(fixDir, `desktop-translated-${locale}.json`));
  const mob = loadJson(path.join(fixDir, `mobile-translated-${locale}.json`));
  if (desk) {
    const r = applyDesktop(locale, desk);
    console.log(`desktop ${locale}: updated=${r.updated} added=${r.added} keys=${Object.keys(desk).length}`);
    any = true;
  } else {
    console.warn(`skip desktop ${locale}: no ${fixDir}/desktop-translated-${locale}.json`);
  }
  if (mob) {
    const r = applyMobile(locale, mob);
    console.log(`mobile ${locale}: updated=${r.updated} added=${r.added} keys=${Object.keys(mob).length}`);
    any = true;
  } else {
    console.warn(`skip mobile ${locale}: no ${fixDir}/mobile-translated-${locale}.json`);
  }
}
if (!any) {
  console.error("No translation maps found.");
  process.exit(1);
}
console.log("Done.");
