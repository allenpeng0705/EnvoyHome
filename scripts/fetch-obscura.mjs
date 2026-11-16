/**
 * Fetch + verify + extract pinned Obscura binaries for packaging / all platforms.
 *
 * Usage (from EnvoyHome root):
 *   node scripts/fetch-obscura.mjs              # host platform → apps/desktop/src-tauri/resources/obscura/
 *   node scripts/fetch-obscura.mjs --all         # every catalog platform → vendor/obscura/<id>/
 *   node scripts/fetch-obscura.mjs --platform darwin-arm64
 *
 * Env:
 *   ENVOYHOME_OBSCURA_FORCE=1     re-download even if binary already present
 *   ENVOYHOME_OBSCURA_OUT=dir     override output root (single-platform mode)
 *   ENVOYHOME_OBSCURA_ARCHIVE=    use a local .zip/.tar.gz (sha256 still checked)
 *   ENVOYHOME_OBSCURA_MIRRORS=    csv of mirror prefixes (empty = GitHub only)
 *
 * Catalog source of truth: packages/daemon/src/obscura-catalog.ts (duplicated
 * pin below so packagers need not compile the daemon first).
 */

import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Keep in sync with packages/daemon/src/obscura-catalog.ts */
const OBSCURA_CATALOG_VERSION = "0.2.6";
const TAG = `v${OBSCURA_CATALOG_VERSION}`;
const BASE = `https://github.com/h4ckf0r0day/obscura/releases/download/${TAG}`;

const CATALOG = [
  {
    id: "darwin-arm64",
    fileName: "obscura-aarch64-macos.tar.gz",
    url: `${BASE}/obscura-aarch64-macos.tar.gz`,
    sha256: "19faa248ac762f466ddb822dbb03ed4f097312d10d1a4d5b2143e6040a9bebd0",
    binaryRelPath: "obscura",
    kind: "tar.gz",
  },
  {
    id: "darwin-x64",
    fileName: "obscura-x86_64-macos.tar.gz",
    url: `${BASE}/obscura-x86_64-macos.tar.gz`,
    sha256: "897f03df4e3d704f946c5e14c6a90a34e0d4e4ef898c4b3201771712962cd7fb",
    binaryRelPath: "obscura",
    kind: "tar.gz",
  },
  {
    id: "linux-x64",
    fileName: "obscura-x86_64-linux.tar.gz",
    url: `${BASE}/obscura-x86_64-linux.tar.gz`,
    sha256: "eed986e478c5ec5439f531f2d7fb6b0e36a356f1df7a6c44a8e8fd4f2486bd76",
    binaryRelPath: "obscura",
    kind: "tar.gz",
  },
  {
    id: "linux-arm64",
    fileName: "obscura-aarch64-linux.tar.gz",
    url: `${BASE}/obscura-aarch64-linux.tar.gz`,
    sha256: "e12aff8bbe40326386a471060083e9cec5255b67048996b84f649efef10cac39",
    binaryRelPath: "obscura",
    kind: "tar.gz",
  },
  {
    id: "win32-x64",
    fileName: "obscura-x86_64-windows.zip",
    url: `${BASE}/obscura-x86_64-windows.zip`,
    sha256: "0a110d0693753a252ed7ffd61e682363e8622caf79697f564c529099a31a6242",
    binaryRelPath: "obscura.exe",
    kind: "zip",
  },
];

function say(line) {
  process.stdout.write(`${line}\n`);
}

function fail(line) {
  process.stderr.write(`${line}\n`);
  process.exit(1);
}

function hostId() {
  const arch = process.arch;
  if (process.platform === "darwin") {
    return arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  }
  if (process.platform === "linux") {
    if (arch === "arm64") return "linux-arm64";
    if (arch === "x64") return "linux-x64";
  }
  if (process.platform === "win32" && arch === "x64") return "win32-x64";
  fail(`Unsupported host platform: ${process.platform}/${process.arch}`);
}

/** Prefer curl.exe when present (progress + resume-friendly); fall back to fetch. */
function curlBin() {
  // On Windows, spawn "curl" can still resolve; prefer curl.exe to avoid quirks.
  if (process.platform === "win32") {
    const probe = spawnSync("curl.exe", ["--version"], { stdio: "ignore" });
    if (probe.status === 0) return "curl.exe";
  }
  const probe = spawnSync("curl", ["--version"], { stdio: "ignore" });
  return probe.status === 0 ? "curl" : null;
}

/**
 * Timeouts:
 * - Mirrors that hang under VPN must fail fast (probe).
 * - Real downloads (~66 MB) need several minutes on a slow VPN — 90s was too short
 *   and is a common "VPN on but still failed" cause.
 */
const DOWNLOAD_CONNECT_SEC = 15;
const DOWNLOAD_PROBE_SEC = 45;
const DOWNLOAD_FULL_SEC = 600;

function downloadWithCurl(url, dest, timeoutSec) {
  const bin = curlBin();
  if (!bin) return false;
  const result = spawnSync(
    bin,
    [
      "-L",
      "--fail",
      "--retry",
      "2",
      "--retry-delay",
      "1",
      "--connect-timeout",
      String(DOWNLOAD_CONNECT_SEC),
      "--max-time",
      String(timeoutSec),
      "-o",
      dest,
      url,
    ],
    { stdio: ["ignore", "inherit", "inherit"], shell: false },
  );
  return result.status === 0 && existsSync(dest);
}

async function downloadOnce(url, dest, timeoutMs) {
  if (curlBin()) {
    if (downloadWithCurl(url, dest, Math.ceil(timeoutMs / 1000))) return;
    throw new Error(`curl failed / timed out for ${url}`);
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
}

function isCanonicalGithubUrl(url) {
  return /^https:\/\/github\.com\//i.test(url);
}

function isLikelyFastMirror(url) {
  return /ghfast\.top/i.test(url);
}

/** Longer budget for GitHub + ghfast; short probe for flaky proxies. */
function timeoutForUrl(url) {
  if (isCanonicalGithubUrl(url) || isLikelyFastMirror(url)) {
    return DOWNLOAD_FULL_SEC * 1000;
  }
  return DOWNLOAD_PROBE_SEC * 1000;
}

/**
 * Candidate URLs for one GitHub release asset.
 *
 * Default: ghfast (often works in CN) → GitHub (long timeout) → other proxies.
 * Offline/local archives are tried before any of these (see stageEntry).
 *
 * Override:
 *   ENVOYHOME_OBSCURA_MIRRORS=          → GitHub only
 *   ENVOYHOME_OBSCURA_MIRRORS=csv       → custom list
 *   ENVOYHOME_OBSCURA_GITHUB_FIRST=1    → GitHub before mirrors (VPN TUN mode)
 */
function downloadCandidates(githubUrl) {
  const raw = process.env.ENVOYHOME_OBSCURA_MIRRORS;
  const ghfast = `https://ghfast.top/${githubUrl}`;
  const otherMirrors = [
    `https://ghproxy.net/${githubUrl}`,
    `https://mirror.ghproxy.com/${githubUrl}`,
  ];
  let mirrors;
  if (raw === undefined) {
    mirrors =
      process.env.ENVOYHOME_OBSCURA_GITHUB_FIRST === "1"
        ? [githubUrl, ghfast, ...otherMirrors]
        : [ghfast, githubUrl, ...otherMirrors];
  } else {
    mirrors = String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((prefix) =>
        prefix.includes("://github.com/") || prefix.includes("/github.com/")
          ? prefix
          : `${prefix.replace(/\/$/, "")}/${githubUrl}`,
      );
  }
  if (!mirrors.includes(githubUrl)) mirrors.push(githubUrl);
  return mirrors;
}

/**
 * Download until sha256 matches. Bad mirrors often return 200 + HTML — those
 * must not abort the whole fetch (previous bug: sha256 fail exited immediately).
 */
async function downloadVerified(url, dest, expectedSha256, minBytes = 8 * 1024 * 1024) {
  const candidates = downloadCandidates(url);
  const errors = [];
  for (const candidate of candidates) {
    const budgetMs = timeoutForUrl(candidate);
    try {
      say(`  ↓ ${candidate}  (budget ${Math.round(budgetMs / 1000)}s)`);
      await downloadOnce(candidate, dest, budgetMs);
      const size = existsSync(dest) ? statSync(dest).size : 0;
      if (size < minBytes) {
        throw new Error(`file too small (${size} bytes) — likely an HTML/error page`);
      }
      const digest = sha256File(dest);
      if (digest !== expectedSha256) {
        throw new Error(`sha256 mismatch: expected ${expectedSha256}, got ${digest}`);
      }
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${candidate}: ${msg}`);
      try {
        rmSync(dest, { force: true });
      } catch {
        /* ignore */
      }
    }
  }
  fail(
    `Obscura download failed after ${candidates.length} attempt(s).\n` +
      errors.map((e) => `  - ${e}`).join("\n") +
      `\n  Offline (recommended when GitHub is flaky):\n` +
      `    1) Copy vendor/obscura/win32-x64/ from a machine that already fetched it, or\n` +
      `    2) $env:ENVOYHOME_OBSCURA_ARCHIVE="D:\\path\\obscura-x86_64-windows.zip"\n` +
      `       (zip also auto-used from vendor/obscura/archives/ if present)\n` +
      `  VPN TUN + GitHub only: $env:ENVOYHOME_OBSCURA_MIRRORS=""\n` +
      `  Skip (debug only): $env:ENVOYHOME_SKIP_OBSCURA="1"`,
  );
}

function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

function extractArchive(archivePath, destDir, kind) {
  mkdirSync(destDir, { recursive: true });
  const args =
    kind === "tar.gz"
      ? ["-xzf", archivePath, "-C", destDir]
      : ["-xf", archivePath, "-C", destDir];
  const tar = spawnSync("tar", args, { encoding: "utf8" });
  if (tar.status === 0) return;

  // Windows zip fallback: PowerShell Expand-Archive (tar sometimes missing/old).
  if (kind === "zip" && process.platform === "win32") {
    say("  tar extract failed — trying Expand-Archive…");
    const ps = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { encoding: "utf8" },
    );
    if (ps.status === 0) return;
    fail(
      `zip extract failed (tar + Expand-Archive).\n` +
        `  tar: ${tar.stderr || tar.stdout || tar.status}\n` +
        `  Expand-Archive: ${ps.stderr || ps.stdout || ps.status}`,
    );
  }

  fail(`tar extract failed: ${tar.stderr || tar.stdout || tar.status}`);
}

/** Reuse vendor/obscura/<id> or an already-good outDir without re-downloading. */
function tryReuseStaged(entry, outDir) {
  const force = process.env.ENVOYHOME_OBSCURA_FORCE === "1";
  if (force) return null;
  const binaryDest = path.join(outDir, entry.binaryRelPath);
  const stampPath = path.join(outDir, "OBSCURA_VERSION");
  const stampedVersion = existsSync(stampPath)
    ? readFileSync(stampPath, "utf8").split(/\r?\n/)[0]?.trim()
    : "";
  if (existsSync(binaryDest) && stampedVersion === OBSCURA_CATALOG_VERSION) {
    return binaryDest;
  }
  const vendorDir = path.join(root, "vendor", "obscura", entry.id);
  const vendorBin = path.join(vendorDir, entry.binaryRelPath);
  const vendorStamp = path.join(vendorDir, "OBSCURA_VERSION");
  const vendorVer = existsSync(vendorStamp)
    ? readFileSync(vendorStamp, "utf8").split(/\r?\n/)[0]?.trim()
    : "";
  if (!existsSync(vendorBin) || vendorVer !== OBSCURA_CATALOG_VERSION) return null;
  say(`Reusing vendor/obscura/${entry.id} → ${path.relative(root, outDir)}/`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(vendorDir)) {
    copyFileSync(path.join(vendorDir, name), path.join(outDir, name));
  }
  return existsSync(binaryDest) ? binaryDest : null;
}

/** Walk a few levels for `name` (Obscura archives sometimes nest one folder). */
function findNamedFile(rootDir, name, maxDepth = 4) {
  const queue = [[rootDir, 0]];
  while (queue.length) {
    const [dir, depth] = queue.shift();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isFile() && ent.name === name) return full;
      if (ent.isDirectory() && depth < maxDepth && ent.name !== "." && ent.name !== "..") {
        queue.push([full, depth + 1]);
      }
    }
  }
  return null;
}

/**
 * Ensure CLI (+ worker / DLL sidecars) sit at `outDir` root.
 * Archives that nest `obscura/` or similar are flattened in place.
 */
function promoteObscuraLayout(outDir, binaryRelPath) {
  const dest = path.join(outDir, binaryRelPath);
  if (existsSync(dest)) return dest;
  const found = findNamedFile(outDir, path.basename(binaryRelPath));
  if (!found) return null;
  const srcDir = path.dirname(found);
  if (path.resolve(srcDir) === path.resolve(outDir)) return found;
  for (const name of readdirSync(srcDir)) {
    if (
      name === binaryRelPath ||
      name === path.basename(binaryRelPath) ||
      /^obscura-worker(\.exe)?$/i.test(name) ||
      /\.dll$/i.test(name)
    ) {
      const from = path.join(srcDir, name);
      const to = path.join(outDir, name === path.basename(binaryRelPath) ? binaryRelPath : name);
      if (path.resolve(from) === path.resolve(to)) continue;
      if (existsSync(to)) rmSync(to, { force: true });
      renameSync(from, to);
    }
  }
  return existsSync(dest) ? dest : null;
}

async function stageEntry(entry, outDir) {
  const binaryDest = path.join(outDir, entry.binaryRelPath);
  const stampPath = path.join(outDir, "OBSCURA_VERSION");
  const reused = tryReuseStaged(entry, outDir);
  if (reused) {
    say(`Obscura ${entry.id} already staged (${OBSCURA_CATALOG_VERSION}).`);
    return reused;
  }

  say(`Fetching Obscura ${entry.id} (${entry.fileName})…`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const stamp = path.join(tmpdir(), `envoyhome-obscura-${entry.id}-${Date.now()}`);
  mkdirSync(stamp, { recursive: true });
  const archive = path.join(stamp, entry.fileName);
  try {
    const envArchive = (process.env.ENVOYHOME_OBSCURA_ARCHIVE ?? "").trim();
    const vendorArchive = path.join(root, "vendor", "obscura", "archives", entry.fileName);
    const localArchive = envArchive || (existsSync(vendorArchive) ? vendorArchive : "");
    if (localArchive) {
      if (!existsSync(localArchive)) {
        fail(`ENVOYHOME_OBSCURA_ARCHIVE not found: ${localArchive}`);
      }
      say(`  ← local archive ${localArchive}`);
      copyFileSync(localArchive, archive);
      const digest = sha256File(archive);
      if (digest !== entry.sha256) {
        fail(
          `sha256 mismatch for local archive: expected ${entry.sha256}, got ${digest}`,
        );
      }
    } else {
      await downloadVerified(entry.url, archive, entry.sha256);
      // Keep a copy so the next Windows/macOS build can go offline.
      try {
        const archivesDir = path.join(root, "vendor", "obscura", "archives");
        mkdirSync(archivesDir, { recursive: true });
        copyFileSync(archive, path.join(archivesDir, entry.fileName));
        say(`  ↳ cached ${path.relative(root, path.join(archivesDir, entry.fileName))}`);
      } catch {
        /* non-fatal */
      }
    }
    extractArchive(archive, outDir, entry.kind);
    const promoted = promoteObscuraLayout(outDir, entry.binaryRelPath);
    if (!promoted || !existsSync(binaryDest)) {
      fail(
        `Archive did not contain ${entry.binaryRelPath} under ${outDir} (after flatten).`,
      );
    }
    if (process.platform !== "win32" && !entry.binaryRelPath.endsWith(".exe")) {
      chmodSync(binaryDest, 0o755);
      for (const side of ["obscura-worker"]) {
        const sidePath = path.join(outDir, side);
        if (existsSync(sidePath)) chmodSync(sidePath, 0o755);
      }
    }
    writeFileSync(
      stampPath,
      `${OBSCURA_CATALOG_VERSION}\n# ${entry.id} ${entry.fileName}\n# sha256:${entry.sha256}\n`,
    );
    // Keep a copy of the archive digest for auditors.
    writeFileSync(path.join(outDir, "SHA256"), `${entry.sha256}  ${entry.fileName}\n`);
    say(`  ✓ ${path.relative(root, binaryDest)}`);
    return binaryDest;
  } finally {
    rmSync(stamp, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const all = argv.includes("--all");
  const idx = argv.indexOf("--platform");
  const platform = idx >= 0 ? argv[idx + 1] : null;
  return { all, platform };
}

const args = parseArgs(process.argv.slice(2));
const defaultDesktop = path.join(
  root,
  "apps",
  "desktop",
  "src-tauri",
  "resources",
  "obscura",
);

async function main() {
  if (args.all) {
    const vendorRoot = path.join(root, "vendor", "obscura");
    say(
      `Staging Obscura ${OBSCURA_CATALOG_VERSION} for all platforms → ${path.relative(root, vendorRoot)}/`,
    );
    for (const entry of CATALOG) {
      await stageEntry(entry, path.join(vendorRoot, entry.id));
    }
    // Also copy host into desktop resources for convenience.
    const host = CATALOG.find((e) => e.id === hostId());
    if (host) {
      const from = path.join(vendorRoot, host.id);
      rmSync(defaultDesktop, { recursive: true, force: true });
      mkdirSync(defaultDesktop, { recursive: true });
      for (const name of [
        host.binaryRelPath,
        "OBSCURA_VERSION",
        "SHA256",
        "obscura-worker",
        "obscura-worker.exe",
      ]) {
        const src = path.join(from, name);
        if (existsSync(src)) copyFileSync(src, path.join(defaultDesktop, name));
      }
      // copy any sibling DLLs on Windows
      if (host.id === "win32-x64") {
        const { readdirSync } = await import("node:fs");
        for (const name of readdirSync(from)) {
          if (/\.dll$/i.test(name)) {
            copyFileSync(path.join(from, name), path.join(defaultDesktop, name));
          }
        }
      }
      say(`Host copy → ${path.relative(root, defaultDesktop)}/`);
    }
    say("Done (all platforms).");
    return;
  }

  const id = args.platform || hostId();
  const entry = CATALOG.find((e) => e.id === id);
  if (!entry) fail(`Unknown platform id: ${id}`);
  const out = (process.env.ENVOYHOME_OBSCURA_OUT ?? "").trim() || defaultDesktop;
  await stageEntry(entry, out);
  say("Done.");
}

try {
  await main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  fail(`Obscura fetch failed: ${msg}`);
}
