// B2 acceptance: V-RPC-1, V-RPC-2, V-RPC-5, V-SEC-12 + timeout budget (R5).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { networkInterfaces } from "node:os";
import { WebSocket } from "ws";
import {
  RPC_TIMEOUT_MS,
  RUNTIME_MAX_ATTEMPTS,
  RUNTIME_PER_ATTEMPT_TIMEOUT_MS,
  RUNTIME_RETRY_DELAY_MS,
  readClaim,
  resolveHatchAccount,
  rpcTimeoutExceedsRetryBudget,
  startDaemon,
  type RunningDaemon,
} from "../dist/index.js";

const daemons: RunningDaemon[] = [];

after(async () => {
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

function lanAddress(): string | null {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return null;
}

async function boot(extra: { hatchApiKey?: string; hatchBoundAccounts?: string[] } = {}) {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-b2-"));
  const daemon = await startDaemon({
    config: {
      wsPort: 0,
      httpPort: 0,
      stateDir,
      hatchApiKey: extra.hatchApiKey ?? "test-hatch-key",
    },
    hatchBoundAccounts: extra.hatchBoundAccounts ?? ["alice"],
    packageVersion: "0.0.0-test",
  });
  // httpPort 0 — Node assigns; read the actual port from the server address.
  const addr = daemon.http.address();
  assert.ok(addr && typeof addr === "object");
  daemon.config.httpPort = addr.port;
  daemons.push(daemon);
  return { daemon, stateDir, cleanup: () => rm(stateDir, { recursive: true, force: true }) };
}

async function rpc(
  host: string,
  port: number,
  method: string,
  params: Record<string, unknown> = {},
  token: string | null = null,
): Promise<Record<string, unknown>> {
  const suffix = token === null ? "" : `?token=${encodeURIComponent(token)}`;
  const socket = new WebSocket(`ws://${host}:${port}/ws${suffix}`);
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error(`${method} timed out`));
    }, 5_000);
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw)) as Record<string, unknown>;
      if (message["id"] !== 1) return;
      clearTimeout(timer);
      socket.close();
      resolve(message);
    });
    socket.on("open", () =>
      socket.send(JSON.stringify({ id: 1, method, params })),
    );
    socket.on("error", reject);
  });
}

test("R5: RPC timeout exceeds runtime retry budget", () => {
  assert.equal(
    rpcTimeoutExceedsRetryBudget(
      RPC_TIMEOUT_MS,
      RUNTIME_MAX_ATTEMPTS,
      RUNTIME_RETRY_DELAY_MS,
      RUNTIME_PER_ATTEMPT_TIMEOUT_MS,
    ),
    true,
  );
  assert.equal(RPC_TIMEOUT_MS > RUNTIME_MAX_ATTEMPTS * (RUNTIME_RETRY_DELAY_MS + RUNTIME_PER_ATTEMPT_TIMEOUT_MS), true);
});

test("V-RPC-1: loopback home.hello returns protocolApiVersion + methods[]", async () => {
  const { daemon, stateDir } = await boot();
  const reply = await rpc("127.0.0.1", daemon.config.wsPort, "home.hello", {
    client: { name: "test", version: "0", platform: "darwin", id: "t1" },
  });
  assert.equal(reply["error"], undefined);
  const result = reply["result"] as Record<string, unknown>;
  assert.equal(result["product"], "EnvoyHome");
  assert.equal(result["protocolApiVersion"], 1);
  assert.ok(Array.isArray(result["methods"]));
  assert.ok((result["methods"] as string[]).includes("home.hello"));
  assert.equal((result["mesh"] as { kind: string }).kind, "no-node");

  const claim = await readClaim(stateDir);
  assert.ok(claim);
  assert.equal(claim.instanceId, daemon.config.instanceId);
  assert.equal(claim.port, daemon.config.wsPort);
});

test("V-RPC-1: home.health and home.meshStatus on loopback", async () => {
  const { daemon } = await boot();
  const health = await rpc("127.0.0.1", daemon.config.wsPort, "home.health");
  assert.equal(health["error"], undefined);
  assert.equal((health["result"] as { ok: boolean }).ok, true);

  const mesh = await rpc("127.0.0.1", daemon.config.wsPort, "home.meshStatus");
  assert.equal((mesh["result"] as { mesh: { kind: string } }).mesh.kind, "no-node");
});

test("V-RPC-2: remote without token is refused (UNAUTHORIZED)", async () => {
  const lan = lanAddress();
  if (!lan) {
    // Offline CI: cannot construct a non-loopback peer address.
    assert.equal(lan, null);
    return;
  }
  const { daemon } = await boot();
  const reply = await rpc(lan, daemon.config.wsPort, "home.hello", {
    client: { name: "test", version: "0", platform: "darwin", id: "t1" },
  });
  assert.ok(reply["error"]);
  assert.equal((reply["error"] as { code: string }).code, "UNAUTHORIZED");
});

test("V-RPC-5: on before authentication is refused on remote", async () => {
  const lan = lanAddress();
  if (!lan) {
    assert.equal(lan, null);
    return;
  }
  const { daemon } = await boot();
  const reply = await rpc(lan, daemon.config.wsPort, "on", { event: "home:turn-delta" });
  assert.ok(reply["error"]);
  assert.equal((reply["error"] as { code: string }).code, "UNAUTHORIZED");
});

test("home.subscribe dedupes events on loopback", async () => {
  const { daemon } = await boot();
  const a = await rpc("127.0.0.1", daemon.config.wsPort, "home.subscribe", {
    events: ["home:turn-delta", "home:approval-needed"],
  });
  assert.equal(a["error"], undefined);
  const b = await rpc("127.0.0.1", daemon.config.wsPort, "home.subscribe", {
    events: ["home:turn-delta", "home:turn-finished"],
  });
  assert.equal(b["error"], undefined);
  const listed = daemon.subscriptions.list("loopback-owner");
  assert.deepEqual(listed, ["home:approval-needed", "home:turn-delta", "home:turn-finished"]);
});

test("GET /health on hatch port", async () => {
  const { daemon } = await boot();
  const res = await fetch(`http://127.0.0.1:${daemon.config.httpPort}/health`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean };
  assert.equal(body.ok, true);
});

test("V-SEC-12: hatch resolves account from binding; foreign accountId refused", async () => {
  const { daemon } = await boot({ hatchBoundAccounts: ["alice"] });
  const port = daemon.config.httpPort;

  const bad = await fetch(`http://127.0.0.1:${port}/v1/inbound`, {
    method: "POST",
    headers: {
      authorization: "Bearer test-hatch-key",
      "content-type": "application/json",
    },
    body: JSON.stringify({ accountId: "bob", text: "hi" }),
  });
  assert.equal(bad.status, 403);
  const badBody = (await bad.json()) as { error: { message: string } };
  assert.match(badBody.error.message, /account_not_bound/);

  const ok = await fetch(`http://127.0.0.1:${port}/v1/inbound`, {
    method: "POST",
    headers: {
      authorization: "Bearer test-hatch-key",
      "content-type": "application/json",
    },
    body: JSON.stringify({ accountId: "alice", text: "hi" }),
  });
  assert.equal(ok.status, 200);
  const okBody = (await ok.json()) as { accountId: string; accepted: boolean };
  assert.equal(okBody.accountId, "alice");
  assert.equal(okBody.accepted, true);

  const noAuth = await fetch(`http://127.0.0.1:${port}/v1/inbound`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId: "alice", text: "hi" }),
  });
  assert.equal(noAuth.status, 401);
});

test("resolveHatchAccount unit: omit accountId when singly bound", () => {
  assert.deepEqual(resolveHatchAccount(undefined, ["alice"]), { accountId: "alice" });
  assert.ok("error" in resolveHatchAccount("bob", ["alice"]));
  assert.ok("error" in resolveHatchAccount(undefined, ["alice", "bob"]));
});

test("cleanup state dirs", async () => {
  // Best-effort cleanup of temp dirs created above.
  for (const d of daemons) {
    await rm(d.config.stateDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
