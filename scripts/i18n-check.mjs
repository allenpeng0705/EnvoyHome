/**
 * Fail if non-English desktop/mobile locale catalogs drift from English keys.
 *
 * Desktop: apps/desktop/public/i18n/{en,zh,…}.js (flat string maps)
 * Mobile:  apps/mobile/lib/l10n/app_{en,zh,…}.arb
 *
 * Usage (repo root): node scripts/i18n-check.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const locales = ["zh", "ko", "ja", "fr", "de", "it"];
let failed = false;

function deskKeys(locale) {
  const file = path.join(root, "apps/desktop/public/i18n", `${locale}.js`);
  const text = readFileSync(file, "utf8");
  const keys = new Set();
  for (const m of text.matchAll(/^\s*"([^"]+)":\s*"/gm)) keys.add(m[1]);
  return keys;
}

function arbKeys(locale) {
  const file = path.join(root, "apps/mobile/lib/l10n", `app_${locale}.arb`);
  if (!existsSync(file)) return new Set();
  const data = JSON.parse(readFileSync(file, "utf8"));
  return new Set(
    Object.keys(data).filter((k) => !k.startsWith("@") && k !== "@@locale"),
  );
}

const enDesk = deskKeys("en");
const enMob = arbKeys("en");
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
    console.log(`desktop ${locale}: OK (${desk.size})`);
  }

  const mob = arbKeys(locale);
  const mobMissing = [...enMob].filter((k) => !mob.has(k)).sort();
  if (mobMissing.length) {
    failed = true;
    console.error(`mobile ${locale}: missing ${mobMissing.length} keys`);
    for (const k of mobMissing.slice(0, 30)) console.error(`  ${k}`);
    if (mobMissing.length > 30) console.error(`  …+${mobMissing.length - 30}`);
  } else {
    console.log(`mobile ${locale}: OK (${mob.size})`);
  }
}

if (failed) {
  console.error("i18n-check FAILED — add translations for missing keys.");
  process.exit(1);
}
console.log("i18n-check OK");
