#!/usr/bin/env node
/**
 * Demo HA smoke — exercise fake-ha like a real HA instance:
 * startDemoHa → phrase → Approvals Allow → assert entity state.
 *
 * Requires a running daemon (pnpm desktop:dev / envoyhome-daemon) with claim at
 * ~/.envoyhome/daemon.claim.json (or ENVOYHOME_STATE_DIR).
 *
 * Usage: pnpm demo:ha-smoke
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import WebSocket from "ws";

const stateDir = process.env.ENVOYHOME_STATE_DIR || join(homedir(), ".envoyhome");
const accountId = process.env.ENVOYHOME_DEMO_ACCOUNT || "allen";
const token = "envoyhome-demo";

const STEPS = [
  { text: "打开卧室灯", entityId: "light.bedroom", expect: "on" },
  { text: "关闭厨房灯", entityId: "light.kitchen", expect: "off" },
  { text: "turn on the living room light", entityId: "light.living_room", expect: "on" },
];

function claimPath() {
  return join(stateDir, "daemon.claim.json");
}

async function loadClaim() {
  const raw = await readFile(claimPath(), "utf8");
  return JSON.parse(raw);
}

function openSock(port) {
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const t = setTimeout(() => reject(new Error("ws open timeout")), 8000);
    sock.on("open", () => {
      clearTimeout(t);
      resolve(sock);
    });
    sock.on("error", reject);
  });
}

function rpc(sock, method, params = {}, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const t = setTimeout(() => reject(new Error(`timeout ${method}`)), timeoutMs);
    const onMsg = (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.id !== id) return;
      clearTimeout(t);
      sock.off("message", onMsg);
      resolve(msg);
    };
    sock.on("message", onMsg);
    sock.send(JSON.stringify({ id, method, params }));
  });
}

async function getState(baseUrl, entityId) {
  const res = await fetch(`${baseUrl}/api/states/${entityId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET ${entityId} → ${res.status}`);
  return res.json();
}

async function waitApproval(sock, accountId, events, ms = 15_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const fromEvent = events.find((e) => e.event === "home:approval-needed");
    if (fromEvent?.data?.id) return fromEvent.data;
    const listed = await rpc(sock, "home.listApprovals", { accountId, status: "pending" });
    const row = listed.result?.approvals?.[0];
    if (row?.id) return row;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

async function main() {
  const claim = await loadClaim();
  console.log(`[demo-ha-smoke] daemon ws=${claim.port} account=${accountId}`);
  const sock = await openSock(claim.port);
  const events = [];
  sock.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    const name = msg.event || msg.method;
    if (typeof name === "string" && name.startsWith("home:")) {
      events.push({ event: name, data: msg.params ?? msg.data });
    }
  });

  await rpc(sock, "home.subscribe", {
    events: ["home:approval-needed", "home:turn-finished", "home:turn-delta"],
  });
  await rpc(sock, "on", { event: "home:approval-needed" }).catch(() => undefined);

  const started = await rpc(sock, "home.startDemoHa", { accountId });
  if (started.error) {
    console.error("startDemoHa failed:", started.error);
    process.exit(1);
  }
  const baseUrl = started.result.baseUrl;
  console.log(`[demo-ha-smoke] fake-ha ${baseUrl} bound=${started.result.bound?.length ?? "?"}`);

  const opened = await rpc(sock, "home.openSession", {
    accountId,
    purpose: "home",
    title: "demo-ha-smoke",
  });
  if (opened.error) {
    console.error("openSession failed:", opened.error);
    process.exit(1);
  }
  const sessionId = opened.result.sessionId;

  let failed = 0;
  for (const step of STEPS) {
    events.length = 0;
    console.log(`\n→ "${step.text}"`);
    const sendP = rpc(sock, "home.sendMessage", {
      accountId,
      sessionId,
      text: step.text,
    });
    const approval = await waitApproval(sock, accountId, events);
    if (!approval) {
      console.error("  FAIL: no Approvals card (phrase may not have planned ha_call_service)");
      failed++;
      await sendP.catch(() => undefined);
      continue;
    }
    console.log(`  approval ${approval.tool}: ${approval.summary || approval.id}`);
    await rpc(sock, "home.answerApproval", {
      id: approval.id,
      decision: "allow",
      argsDigest: approval.argsDigest,
    });
    await sendP;
    await new Promise((r) => setTimeout(r, 400));
    const state = await getState(baseUrl, step.entityId);
    if (state.state === step.expect) {
      console.log(`  OK ${step.entityId} → ${state.state}`);
    } else {
      console.error(`  FAIL ${step.entityId} expected ${step.expect} got ${state.state}`);
      failed++;
    }
  }

  sock.close();
  if (failed) {
    console.error(`\n[demo-ha-smoke] ${failed} step(s) failed`);
    process.exit(1);
  }
  console.log("\n[demo-ha-smoke] all steps passed — demo HA behaves like a gated real HA");
}

main().catch((err) => {
  console.error(err);
  console.error("\nIs the daemon running? Try: pnpm desktop:dev");
  process.exit(1);
});
