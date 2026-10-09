#!/usr/bin/env bash
# RPC-side helpers for Design §10.2 smoke (flows 1, 3, 5, 6 partially).
# Requires a running daemon on ENVOYHOME_WS_URL (default ws://127.0.0.1:4780/ws).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
WS_URL="${ENVOYHOME_WS_URL:-ws://127.0.0.1:4780/ws}"

pnpm --filter @envoyhome/daemon build >/dev/null

node --input-type=module <<EOF
import WebSocket from "ws";

const wsUrl = ${JSON.stringify("$WS_URL")};

function rpc(method, params = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error("timeout " + method));
    }, 10_000);
    socket.on("open", () => socket.send(JSON.stringify({ id: 1, method, params })));
    socket.on("message", (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      resolve(msg);
    });
    socket.on("error", reject);
  });
}

function ok(label, msg) {
  if (msg.error) {
    console.error("FAIL", label, msg.error);
    process.exitCode = 1;
    return false;
  }
  console.log("OK  ", label);
  return true;
}

const hello = await rpc("home.hello");
ok("home.hello", hello);

const created = await rpc("home.createAccount", {
  accountId: "smoke_alice",
  displayName: "Smoke Alice",
});
ok("flow1 createAccount", created);

const doctor = await rpc("home.doctor");
ok("bar5 home.doctor", doctor);
if (doctor.result?.issues?.some((i) => i.severity === "error")) {
  console.error("doctor has error-severity issues", doctor.result.issues);
  process.exitCode = 1;
}

const providers = await rpc("home.setProvider", {
  id: "local",
  kind: "local_openai_compat",
  baseUrl: "http://127.0.0.1:9",
  model: "m",
  enabled: true,
});
ok("flow5 setProvider", providers);
const mode = await rpc("home.setModelMode", { accountId: "smoke_alice", mode: "local" });
ok("flow5 setModelMode local", mode);

const session = await rpc("home.openSession", { accountId: "smoke_alice" });
ok("openSession", session);
const sessionId = session.result?.sessionId;

// Flow 6 — propose via memory facade is internal; use compact + listPending if any.
const mem = await rpc("home.listMemory", { accountId: "smoke_alice" });
ok("flow6 listMemory", mem);

const pending = await rpc("home.listPendingLearns", { accountId: "smoke_alice" });
ok("flow6 listPendingLearns", pending);

if (sessionId) {
  const sent = await rpc("home.sendMessage", {
    accountId: "smoke_alice",
    sessionId,
    text: "hello smoke",
  });
  ok("sendMessage (may need model)", sent);
}

console.log(process.exitCode ? "smoke-rpc: FAILED" : "smoke-rpc: OK (partial §10.2)");
process.exit(process.exitCode ?? 0);
EOF
