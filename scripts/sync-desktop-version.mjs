/**
 * One place to set the EnvoyHome **desktop** product version (EnvoyCoder pattern).
 *
 * Source of truth: the `VERSION` file at the repo root (one line, semver).
 * This script writes that number into every place the desktop installer and
 * window must agree on:
 *
 *   - package.json (root — release artifact names)
 *   - apps/desktop/package.json
 *   - apps/desktop/src-tauri/tauri.conf.json
 *   - apps/desktop/src-tauri/Cargo.toml (+ the `envoyhome` entry in Cargo.lock)
 *
 * Usage:
 *   echo 0.1.0 > VERSION && pnpm version:desktop
 *   pnpm version:desktop -- 0.1.0          # write VERSION, then sync
 *   pnpm version:desktop:check             # fail if anything drifted
 *
 * Docs: scripts/README.md (§ Desktop product version).
 * Mobile (`apps/mobile/pubspec.yaml`) is separate — bump that on its own.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION_FILE = path.join(root, "VERSION");
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

const targets = {
  rootPkg: path.join(root, "package.json"),
  desktopPkg: path.join(root, "apps/desktop/package.json"),
  tauriConf: path.join(root, "apps/desktop/src-tauri/tauri.conf.json"),
  cargoToml: path.join(root, "apps/desktop/src-tauri/Cargo.toml"),
  cargoLock: path.join(root, "apps/desktop/src-tauri/Cargo.lock"),
};

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function readVersionFile() {
  if (!existsSync(VERSION_FILE)) {
    fail(
      `VERSION is missing at ${path.relative(root, VERSION_FILE)}. Create it with one semver line (e.g. 0.1.0).`,
    );
  }
  return readFileSync(VERSION_FILE, "utf8").trim();
}

function readJsonVersion(file) {
  return JSON.parse(readFileSync(file, "utf8")).version;
}

function readCargoPackageVersion(file) {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^\[package\]\s*\n(?:[^\n]*\n)*?^version\s*=\s*"([^"]+)"/m);
  if (!match) fail(`${path.relative(root, file)} has no [package] version.`);
  return match[1];
}

function readCargoLockEnvoyhomeVersion(file) {
  const text = readFileSync(file, "utf8");
  const match = text.match(/\[\[package\]\]\nname = "envoyhome"\nversion = "([^"]+)"/);
  if (!match) fail(`${path.relative(root, file)} has no [[package]] name = "envoyhome".`);
  return match[1];
}

function currentMap() {
  return {
    VERSION: readVersionFile(),
    "package.json": readJsonVersion(targets.rootPkg),
    "apps/desktop/package.json": readJsonVersion(targets.desktopPkg),
    "apps/desktop/src-tauri/tauri.conf.json": readJsonVersion(targets.tauriConf),
    "apps/desktop/src-tauri/Cargo.toml": readCargoPackageVersion(targets.cargoToml),
    "apps/desktop/src-tauri/Cargo.lock (envoyhome)": readCargoLockEnvoyhomeVersion(targets.cargoLock),
  };
}

function writeJsonVersion(file, version) {
  const raw = readFileSync(file, "utf8");
  const pkg = JSON.parse(raw);
  if (pkg.version === version) return false;
  pkg.version = version;
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  return true;
}

function writeCargoTomlVersion(file, version) {
  const raw = readFileSync(file, "utf8");
  const next = raw.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
  if (next === raw) return false;
  writeFileSync(file, next);
  return true;
}

function writeCargoLockEnvoyhomeVersion(file, version) {
  const raw = readFileSync(file, "utf8");
  const next = raw.replace(
    /(\[\[package\]\]\nname = "envoyhome"\nversion = ")[^"]+(")/,
    `$1${version}$2`,
  );
  if (next === raw) return false;
  writeFileSync(file, next);
  return true;
}

function sync(version) {
  const touched = [];
  if (writeJsonVersion(targets.rootPkg, version)) touched.push("package.json");
  if (writeJsonVersion(targets.desktopPkg, version)) touched.push("apps/desktop/package.json");
  if (writeJsonVersion(targets.tauriConf, version)) touched.push("apps/desktop/src-tauri/tauri.conf.json");
  if (writeCargoTomlVersion(targets.cargoToml, version)) touched.push("apps/desktop/src-tauri/Cargo.toml");
  if (writeCargoLockEnvoyhomeVersion(targets.cargoLock, version)) {
    touched.push("apps/desktop/src-tauri/Cargo.lock");
  }
  return touched;
}

const args = process.argv.slice(2).filter((a) => a !== "--");
const checkOnly = args.includes("--check");
const positional = args.filter((a) => a !== "--check");

if (positional.length > 1) {
  fail(`usage: node scripts/sync-desktop-version.mjs [semver] [--check]`);
}

if (positional.length === 1) {
  const next = positional[0].trim();
  if (!SEMVER.test(next)) fail(`not a semver: ${JSON.stringify(next)} (expected e.g. 0.1.0)`);
  writeFileSync(VERSION_FILE, `${next}\n`);
  process.stdout.write(`VERSION → ${next}\n`);
}

const version = readVersionFile();
if (!SEMVER.test(version)) {
  fail(`VERSION is not a semver: ${JSON.stringify(version)} (expected e.g. 0.1.0)`);
}

if (checkOnly) {
  const map = currentMap();
  const drift = Object.entries(map).filter(([, v]) => v !== version);
  if (drift.length === 0) {
    process.stdout.write(`desktop version OK — ${version} everywhere\n`);
    process.exit(0);
  }
  process.stderr.write(`desktop version drift (VERSION=${version}):\n`);
  for (const [where, got] of drift) process.stderr.write(`  ${where}: ${got}\n`);
  process.stderr.write(`Fix: pnpm version:desktop\n`);
  process.exit(1);
}

process.stdout.write(`Syncing desktop version → ${version}\n`);
const touched = sync(version);
if (touched.length === 0) {
  process.stdout.write("  (already in sync)\n");
} else {
  for (const file of touched) process.stdout.write(`  updated ${file}\n`);
}
process.stdout.write("Done. Rebuild the desktop app so the installer picks up the new number.\n");
