#!/usr/bin/env node
// Mint pairing from a temp daemon and dial with Dart thin client (V-P2-MOB-1).
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function whichDart() {
  try {
    const { execFileSync } = require("node:child_process");
    return execFileSync("which", ["dart"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function loadWs() {
  try {
    return (await import("ws")).default;
  } catch {
    // Prefer daemon's installed copy when run from repo root.
    const { createRequire } = await import("node:module");
    const req = createRequire(join(root, "packages/daemon/package.json"));
    return req("ws");
  }
}

async function rpc(port, method, params = {}) {
  const WebSocket = await loadWs();
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const id = 1;
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`rpc timeout: ${method}`));
    }, 10000);
    ws.on("open", () => {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
    ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.id !== id) return;
      clearTimeout(timer);
      ws.close();
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

const dart = whichDart();
if (!dart) {
  console.log("mobile-live-smoke: dart not on PATH — skip");
  process.exit(0);
}

const { startDaemon } = await import(
  pathToFileURL(join(root, "packages/daemon/dist/index.js")).href
);

const stateDir = await mkdtemp(join(tmpdir(), "eh-mobile-live-"));
const daemon = await startDaemon({
  config: {
    stateDir,
    wsPort: 0,
    httpPort: 0,
    hatchApiKey: "mobile-live",
    meshHostingEnabled: true,
  },
  packageVersion: "0.0.0-mobile",
});

try {
  await rpc(daemon.config.wsPort, "home.createAccount", {
    displayName: "Mobile",
    accountId: "mobile1",
  });
  const minted = await rpc(daemon.config.wsPort, "home.mintPairing", {
    deviceLabel: "dart-smoke",
    host: "127.0.0.1",
    lanHost: "127.0.0.1",
    accountIds: ["mobile1"],
  });
  const uri = minted.uri;
  if (!uri || !String(uri).includes("app=EnvoyHome")) {
    throw new Error(`unexpected pairing URI: ${uri}`);
  }

  await new Promise((resolve, reject) => {
    const child = spawn(
      dart,
      ["test", "test/home_session_live_test.dart"],
      {
        cwd: join(root, "packages/mobile-client"),
        env: { ...process.env, ENVOYHOME_PAIR_URI: uri },
        stdio: "inherit",
      },
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`dart test exit ${code}`));
    });
  });
  console.log("mobile-live-smoke: OK");
} finally {
  await daemon.stop();
  await rm(stateDir, { recursive: true, force: true });
}
