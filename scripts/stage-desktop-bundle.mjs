/**
 * Stage what the desktop installer scripts ship beside the Tauri app
 * (EnvoyCoder `stage-desktop-bundle.mjs` pattern, slimmed for EnvoyHome).
 *
 *   * a Node runtime — the shell starts the daemon with this binary
 *   * the packaged daemon (`dist-daemon/` → `resources/daemon/`)
 *
 * Env:
 *   ENVOYHOME_NODE_VERSION   Node runtime to download (default 22.19.0)
 *   FETCH_NODE_SIDECAR=1     re-download Node even if already staged
 *   ENVOYHOME_SKIP_PEERS=1   skip peers:check (local debug only — not for release)
 *   REQUIRE_PUSH_CREDENTIALS  default 1 — fail if push-config.json exists but
 *                             AuthKey / service-account secrets are missing
 *                             (EnvoyMesh stage-tauri-push-credentials pattern).
 *                             Set 0 to allow packaging without push.
 *   ENVOY_HARNESS_DIR         use this checkout instead of cloning the pin
 *   ENVOY_HARNESS_COMMIT      full sha override of scripts/envoy-harness.pin
 *   ENVOY_HARNESS_REPO_URL    clone URL (default allenpeng0705/envoy-harness)
 *   ENVOYHOME_HARNESS_FORCE_PIN=1  re-checkout the pin even if ../envoy-harness exists
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import {
  checkoutHarnessCommit,
  DEFAULT_HARNESS_REPO_URL,
  readHarnessCommit,
} from "./lib/harness-pin.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resources = path.join(root, "apps", "desktop", "src-tauri", "resources");
const nodeVersion = process.env.ENVOYHOME_NODE_VERSION ?? "22.19.0";
const requirePush = (process.env.REQUIRE_PUSH_CREDENTIALS ?? "1").trim() !== "0";
const harnessUrl = process.env.ENVOY_HARNESS_REPO_URL?.trim() || DEFAULT_HARNESS_REPO_URL;

function say(line) {
  process.stdout.write(`${line}\n`);
}

function fail(line) {
  process.stderr.write(`${line}\n`);
  process.exit(1);
}

function whichOnPath(base) {
  if (process.platform === "win32") {
    const result = spawnSync("where.exe", [base], { encoding: "utf8" });
    if (result.status !== 0) return null;
    return (
      (result.stdout ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? null
    );
  }
  const result = spawnSync("sh", ["-c", `command -v ${base}`], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const hit = (result.stdout ?? "").trim();
  return hit.length > 0 ? hit : null;
}

/**
 * Spawn a toolchain command. On Windows, never pass an unquoted
 * `C:\Program Files\...` path to `shell: true` — cmd.exe splits on the space.
 */
function spawnTool(cmd, args, options = {}) {
  const cwd = options.cwd;
  const stdio = options.stdio ?? "inherit";
  const env = options.env;

  if (process.platform !== "win32") {
    return spawnSync(cmd, args, { cwd, stdio, env });
  }

  let resolved = cmd;
  if (!/[\\/]/.test(cmd) && !/\.(cmd|exe|bat)$/i.test(cmd)) {
    resolved = whichOnPath(cmd) ?? cmd;
  }

  const quote = (value) => {
    if (!/[ \t"]/.test(value)) return value;
    return `"${String(value).replace(/"/g, '""')}"`;
  };
  const line = [resolved, ...args].map(quote).join(" ");
  return spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", line], {
    cwd,
    stdio,
    env,
    windowsVerbatimArguments: true,
  });
}

function run(cmd, args, options = {}) {
  const result = spawnTool(cmd, args, options);
  if (result.error) fail(`${cmd} failed to start: ${result.error.message}`);
  if (result.status !== 0) fail(`${cmd} ${args.join(" ")} exited ${result.status}`);
}

function host() {
  const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : "";
  if (!arch) fail(`Unsupported architecture: ${process.arch}`);
  if (process.platform === "darwin") {
    return { platform: "darwin", arch, nodeName: path.join("bin", "node") };
  }
  if (process.platform === "linux") {
    return { platform: "linux", arch, nodeName: path.join("bin", "node") };
  }
  if (process.platform === "win32") {
    return { platform: "win", arch, nodeName: "node.exe" };
  }
  fail(`Unsupported platform: ${process.platform}`);
}

async function download(url, dest) {
  const response = await fetch(url);
  if (!response.ok || !response.body) fail(`Could not download ${url} (${response.status}).`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
}

async function stageNode() {
  const info = host();
  const destDir = path.join(resources, "node-runtime");
  const dest = path.join(destDir, info.nodeName);
  if (existsSync(dest) && process.env.FETCH_NODE_SIDECAR !== "1") {
    say(
      `Node runtime already staged (${execFileSync(dest, ["--version"], { encoding: "utf8" }).trim()}).`,
    );
    return;
  }
  say(`Downloading Node ${nodeVersion}…`);
  // Fresh tree so a prior arch/platform leftover cannot shadow the binary we need.
  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });
  const stamp = path.join(tmpdir(), `envoyhome-node-${nodeVersion}-${info.platform}-${info.arch}`);
  rmSync(stamp, { recursive: true, force: true });
  mkdirSync(stamp, { recursive: true });
  const folder = `node-v${nodeVersion}-${info.platform}-${info.arch}`;
  const archive = info.platform === "win" ? `${folder}.zip` : `${folder}.tar.gz`;
  const file = path.join(stamp, archive);
  await download(`https://nodejs.org/dist/v${nodeVersion}/${archive}`, file);
  // Windows 10+ tar handles .zip; macOS/Linux use .tar.gz.
  run("tar", ["-xf", file, "-C", stamp]);
  const extracted = path.join(stamp, folder, info.nodeName);
  if (!existsSync(extracted)) fail(`The Node archive did not contain ${info.nodeName}.`);
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(extracted, dest);
  if (process.platform !== "win32") chmodSync(dest, 0o755);
  rmSync(stamp, { recursive: true, force: true });
  const ver = execFileSync(dest, ["--version"], { encoding: "utf8" }).trim();
  say(`Node runtime staged at ${path.relative(root, dest)} (${ver}).`);
}

function peersHint() {
  const parent = path.dirname(root);
  return [
    "EnvoyHome still needs a sibling EnvoyMesh checkout (linked @envoymesh/* — not on npm):",
    `  ${parent}/EnvoyMesh`,
    "",
    "envoy-harness is fetched automatically from scripts/envoy-harness.pin when missing.",
    "",
    "Clone EnvoyMesh (QuickStart §1), then re-run:",
    "  export ENVOYHOME_PEERS_GIT_BASE='git@github.com:YOUR_ORG'",
    "  ./scripts/fetch-peers.sh && ./scripts/peers-check.sh",
    "",
    "Or: git clone <url> ../EnvoyMesh   (branch main / ENVOYHOME_PEER_BRANCH)",
  ].join("\n");
}

/**
 * Ensure ../envoy-harness exists at the pinned commit (EnvoyCoder pattern).
 * Packagers do not need to clone harness manually — this does it.
 *
 * @returns {string} absolute path to the envoy-harness repo root
 */
function ensureHarnessCheckout() {
  const overrideDir = (process.env.ENVOY_HARNESS_DIR ?? "").trim();
  const sibling = path.join(root, "..", "envoy-harness");
  const pkgRel = path.join("packages", "envoy-harness", "package.json");

  if (overrideDir) {
    if (!existsSync(path.join(overrideDir, pkgRel))) {
      fail(`ENVOY_HARNESS_DIR is not an envoy-harness checkout: ${overrideDir}`);
    }
    say(`Using ENVOY_HARNESS_DIR=${overrideDir} (not fetching the pin).`);
    return path.resolve(overrideDir);
  }

  let pin;
  try {
    pin = readHarnessCommit();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const forcePin = process.env.ENVOYHOME_HARNESS_FORCE_PIN === "1";
  const siblingOk = existsSync(path.join(sibling, pkgRel));

  if (siblingOk && !forcePin) {
    let head = "";
    try {
      head = execFileSync("git", ["-C", sibling, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
    } catch {
      head = "";
    }
    if (!head) {
      say(`Using existing ../envoy-harness (could not read HEAD; pin is ${pin.commit.slice(0, 12)}…).`);
    } else if (head !== pin.commit) {
      say(
        `⚠ ../envoy-harness is at ${head.slice(0, 12)}… but pin is ${pin.commit.slice(0, 12)}… (${pin.from}).`,
      );
      say("  Installer will embed the sibling tree. Set ENVOYHOME_HARNESS_FORCE_PIN=1 to replace it with the pin.");
    } else {
      say(`Using existing ../envoy-harness @ ${head.slice(0, 12)}… (matches ${pin.from}).`);
    }
    return sibling;
  }

  if (siblingOk && forcePin) {
    say(
      `ENVOYHOME_HARNESS_FORCE_PIN=1 — replacing ../envoy-harness with pin ${pin.commit.slice(0, 12)}…`,
    );
  } else {
    say(
      `Checking out Envoy Harness ${pin.commit} (${pin.from}` +
        `${pin.source === "override" ? " — override" : ""}) into ../envoy-harness…`,
    );
  }
  try {
    checkoutHarnessCommit({ dest: sibling, url: harnessUrl, commit: pin.commit });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  say(`  ✓ envoy-harness @ ${pin.commit.slice(0, 12)} (branch ${process.env.ENVOYHOME_PEER_BRANCH || "main"})`);
  return sibling;
}

function ensurePeers() {
  // Harness first — auto-clone from pin so packagers need not clone it by hand.
  ensureHarnessCheckout();

  if (process.env.ENVOYHOME_SKIP_PEERS === "1") {
    say("ENVOYHOME_SKIP_PEERS=1 — skipping peers:check (not for release builds).");
    return;
  }
  const check = path.join(root, "scripts", "peers-check.sh");
  if (!existsSync(check)) return;
  say("Checking peer checkouts (EnvoyMesh + envoy-harness)…");
  let ok = spawnTool("pnpm", ["run", "peers:check"], { cwd: root, stdio: "inherit" }).status === 0;
  if (!ok) {
    const bash = whichOnPath("bash") ?? "bash";
    ok = spawnSync(bash, [check], { cwd: root, stdio: "inherit" }).status === 0;
  }
  if (ok) return;

  const fetch = path.join(root, "scripts", "fetch-peers.sh");
  if (existsSync(fetch) && (process.env.ENVOYHOME_PEERS_GIT_BASE ?? "").trim()) {
    say("peers:check failed — trying ./scripts/fetch-peers.sh…");
    const bash = whichOnPath("bash") ?? "bash";
    const fetched = spawnSync(bash, [fetch], { cwd: root, stdio: "inherit" });
    if (fetched.status === 0) {
      // Harness may have been missing before fetch; pin checkout already ran.
      ensureHarnessCheckout();
      ok = spawnTool("pnpm", ["run", "peers:check"], { cwd: root, stdio: "inherit" }).status === 0;
      if (ok) return;
    }
  }

  fail(`peers:check failed.\n\n${peersHint()}`);
}

/** Build envoy-harness so esbuild can embed it into the daemon package. */
function ensureHarnessBuilt() {
  const harnessRoot = ensureHarnessCheckout();
  const harnessDist = path.join(harnessRoot, "packages", "envoy-harness", "dist");
  say("Building envoy-harness (embedded into the daemon bundle)…");
  run("pnpm", ["install"], { cwd: harnessRoot });
  run("pnpm", ["-r", "build"], { cwd: harnessRoot });
  if (!existsSync(harnessDist)) {
    fail(`envoy-harness build did not produce ${harnessDist}.`);
  }
  say("  ✓ envoy-harness dist ready");
}

/** EnvoyCoder-style: linked EnvoyMesh must already have dist/ (not auto-built here). */
function ensureMeshBuilt() {
  const meshReuse = path.join(
    root,
    "..",
    "EnvoyMesh",
    "packages",
    "reuse-host",
    "dist",
  );
  if (!existsSync(meshReuse)) {
    fail(
      "EnvoyMesh packages are linked but not built (missing ../EnvoyMesh/packages/reuse-host/dist).\n" +
        "  From the EnvoyMesh sibling (npm workspaces):\n" +
        "    cd ../EnvoyMesh && npm install && npx tsc -b packages/protocol packages/identity packages/network packages/api packages/host-connect packages/reuse-host\n" +
        "  Then re-run staging.",
    );
  }
}

function ensureWorkspaceBuilt() {
  ensureMeshBuilt();
  ensureHarnessBuilt();
  // Daemon + its workspace deps only (not a full `pnpm -r build`).
  say("Building @envoyhome/daemon and workspace dependencies…");
  run("pnpm", ["--filter", "@envoyhome/daemon...", "build"], { cwd: root });
  const daemonBin = path.join(root, "packages", "daemon", "dist", "bin", "envoyhome-daemon.js");
  if (!existsSync(daemonBin)) {
    fail("Daemon build finished, but packages/daemon/dist/bin/envoyhome-daemon.js is missing.");
  }
}

function stageDaemon() {
  ensureWorkspaceBuilt();
  say("Packaging the daemon for the installer…");
  run("pnpm", ["--filter", "@envoyhome/desktop", "run", "daemon:package"], {
    cwd: root,
    env: { ...process.env, ENVOYHOME_DAEMON_PACKAGE: "1" },
  });
  const built = path.join(root, "apps", "desktop", "dist-daemon", "main.mjs");
  if (!existsSync(built)) fail("The daemon bundle was not written (dist-daemon/main.mjs).");
  const text = readFileSync(built, "utf8");
  // Fail closed if workspace imports survived packaging (installer has no checkout).
  if (/from\s+["']@envoyhome\//.test(text) || /from\s+["']@envoymesh\//.test(text) ||
      /import\s*\(\s*["']@envoyhome\//.test(text) || /import\s*\(\s*["']@envoymesh\//.test(text)) {
    fail("The packaged daemon still imports a workspace package. It would not start inside the installer.");
  }
  const destDir = path.join(resources, "daemon");
  rmSync(destDir, { recursive: true, force: true });
  cpSync(path.dirname(built), destDir, { recursive: true, dereference: true });
  if (!existsSync(path.join(destDir, "main.mjs"))) {
    fail("Staged resources/daemon/main.mjs is missing.");
  }
  if (!existsSync(path.join(destDir, "node_modules"))) {
    fail("The packaged daemon has no node_modules beside it.");
  }
  // Drop a stale convenience .js from older staging (ESM as .js needs "type":"module").
  const staleJs = path.join(resources, "envoyhome-daemon.js");
  if (existsSync(staleJs)) rmSync(staleJs, { force: true });
  say(`Daemon staged at ${path.relative(root, path.join(destDir, "main.mjs"))}.`);
}

/**
 * Stage APNs + FCM credentials for the packaged daemon (EnvoyMesh
 * `stage-tauri-push-credentials` pattern).
 *
 * Destination: resources/push/
 *   push-config.json          — paths rewritten to basenames
 *   AuthKey_*.p8              — APNs
 *   serviceAccountKey.json    — FCM
 *
 * At runtime the Tauri shell sets ENVOYHOME_PUSH_CONFIG to the staged
 * push-config.json; the daemon resolves relative key paths against that dir.
 */
function stagePushCredentials() {
  const dest = path.join(resources, "push");
  const candidates = [
    path.join(root, "push-config.json"),
    path.join(homedir(), ".envoyhome", "push-config.json"),
  ];
  const configSrc = candidates.find((p) => existsSync(p));
  if (!configSrc) {
    // Match EnvoyMesh: missing config → skip (CI without secrets still packages).
    // Keep resources/push/ present so tauri.conf.bundle.json globs do not fail.
    say(
      "No push-config.json at repo root or ~/.envoyhome — skipping push credential staging.",
    );
    say("  Drop push-config.json + AuthKey_*.p8 + serviceAccountKey.json at the repo root, then re-run.");
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    writeFileSync(
      path.join(dest, ".keep"),
      "# No push credentials staged (no push-config.json found). Packaging continues without push.\n",
    );
    return;
  }

  /** @type {{ apns?: Record<string, unknown>; fcm?: Record<string, unknown> }} */
  let raw;
  try {
    raw = JSON.parse(readFileSync(configSrc, "utf8"));
  } catch (err) {
    fail(`Could not parse ${configSrc}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const keyRel =
    (typeof raw.apns?.keyPath === "string" && raw.apns.keyPath.trim()) ||
    "AuthKey_LKPCR48WHW.p8";
  const saRel =
    (typeof raw.fcm?.serviceAccountJsonPath === "string" &&
      raw.fcm.serviceAccountJsonPath.trim()) ||
    "serviceAccountKey.json";
  const keyBase = path.basename(keyRel);
  const saBase = path.basename(saRel);
  const configDir = path.dirname(configSrc);

  function resolveSecret(relOrAbs, baseName) {
    if (path.isAbsolute(relOrAbs) && existsSync(relOrAbs)) return relOrAbs;
    const besideConfig = path.join(configDir, baseName);
    if (existsSync(besideConfig)) return besideConfig;
    const atRoot = path.join(root, baseName);
    if (existsSync(atRoot)) return atRoot;
    const firebaseFallback = path.join(root, "firebase-service-account.json");
    if (baseName === saBase && existsSync(firebaseFallback)) return firebaseFallback;
    return null;
  }

  const keySrc = resolveSecret(keyRel, keyBase);
  const saSrc = resolveSecret(saRel, saBase);

  say(`Staging push credentials from ${path.relative(root, configSrc) || configSrc}…`);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  // Rewrite absolute packager paths → basenames so the installed app resolves
  // against resources/push/ (loadPushConfig baseDir = dirname(ENVOYHOME_PUSH_CONFIG)).
  const staged = structuredClone(raw);
  if (!staged.apns) staged.apns = {};
  if (!staged.fcm) staged.fcm = {};
  staged.apns.keyPath = keyBase;
  staged.fcm.serviceAccountJsonPath = saBase;
  staged._comment_staged =
    "Staged by scripts/stage-desktop-bundle.mjs for the desktop installer. Relative paths resolve beside this file.";
  writeFileSync(path.join(dest, "push-config.json"), `${JSON.stringify(staged, null, 2)}\n`);
  say(`  ✓ push-config.json → ${path.relative(root, dest)}/`);

  let missing = 0;
  function copySecret(src, destName, label) {
    if (!src) {
      say(`  ⚠ Missing ${label}`);
      missing += 1;
      return;
    }
    copyFileSync(src, path.join(dest, destName));
    try {
      chmodSync(path.join(dest, destName), 0o600);
    } catch {
      // Windows may ignore mode bits.
    }
    say(`  ✓ ${destName}`);
  }
  copySecret(keySrc, keyBase, `APNs AuthKey (${keyBase})`);
  copySecret(saSrc, saBase, `FCM service account (${saBase})`);

  if (missing > 0) {
    const msg = `push-config.json references secrets that were not found (expected ${keyBase} + ${saBase} beside the config or at the repo root)`;
    if (requirePush) fail(`${msg} (REQUIRE_PUSH_CREDENTIALS=1)`);
    say(`  ⚠ ${msg} — packaged app will not send push until they are present.`);
  } else {
    say("  Push credentials staged (APNs + FCM).");
  }
}

say("Staging the desktop bundle…");
mkdirSync(resources, { recursive: true });
ensurePeers();
await stageNode();
stageDaemon();
stagePushCredentials();
say("Staged. The installer scripts can package the app now.");
