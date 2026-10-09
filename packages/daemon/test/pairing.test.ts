// B4 acceptance: V-RPC-3, V-RPC-4, V-SEC-7, V-P2-MESH-1/2 + artifact HMAC helper.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import {
  checkPairingCode,
  canonicalJson,
  createMeshHost,
  doctorMeshRelayDebugIssue,
  hasCircuitRelayDebug,
  resolveMeshStatus,
  signArtifactToken,
  startDaemon,
  verifyArtifactToken,
  type RunningDaemon,
} from "../dist/index.js";

const daemons: RunningDaemon[] = [];

after(async () => {
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

async function boot(extra: {
  meshHostingEnabled?: boolean;
  meshAttachEnabled?: boolean;
} = {}) {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-b4-"));
  const daemon = await startDaemon({
    config: {
      wsPort: 0,
      httpPort: 0,
      stateDir,
      hatchApiKey: "test-hatch-key",
      meshHostingEnabled: extra.meshHostingEnabled ?? false,
      meshAttachEnabled: extra.meshAttachEnabled ?? false,
    },
    packageVersion: "0.0.0-test",
  });
  const addr = daemon.http.address();
  assert.ok(addr && typeof addr === "object");
  daemon.config.httpPort = addr.port;
  daemons.push(daemon);
  return { daemon, stateDir };
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
    socket.on("open", () => socket.send(JSON.stringify({ id: 1, method, params })));
    socket.on("error", reject);
  });
}

/** Keep a WS open and send multiple RPCs on the same socket (V-RPC-3 live drop). */
async function openRpcSession(
  host: string,
  port: number,
  token: string,
): Promise<{
  call: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  close: () => void;
}> {
  const socket = new WebSocket(`ws://${host}:${port}/ws?token=${encodeURIComponent(token)}`);
  let nextId = 1;
  let closed = false;
  await new Promise<void>((resolve, reject) => {
    socket.on("open", () => resolve());
    socket.on("error", reject);
  });
  socket.on("close", () => {
    closed = true;
  });

  return {
    call(method, params = {}) {
      if (closed || socket.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error("socket closed"));
      }
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error(`${method} timed out`));
        }, 5_000);
        const onMessage = (raw: WebSocket.RawData) => {
          const message = JSON.parse(String(raw)) as Record<string, unknown>;
          if (message["id"] !== id) return;
          cleanup();
          resolve(message);
        };
        const onClose = () => {
          cleanup();
          reject(new Error("socket closed"));
        };
        const cleanup = () => {
          clearTimeout(timer);
          socket.off("message", onMessage);
          socket.off("close", onClose);
        };
        socket.on("message", onMessage);
        socket.on("close", onClose);
        try {
          socket.send(JSON.stringify({ id, method, params }));
        } catch (err) {
          cleanup();
          reject(err);
        }
      });
    },
    close() {
      socket.close();
    },
  };
}

test("V-RPC-4: pairing code minted by another product is refused at pair time", () => {
  // Mint-shaped URI with app=EnvoyDev — EnvoyHome must refuse via pairingAppMismatch.
  const foreign =
    "envoy://pair?wsUrl=" +
    encodeURIComponent("ws://127.0.0.1:4780/ws") +
    "&token=abc&ownerPublicKey=pk&ownerId=oid&app=EnvoyDev";
  const check = checkPairingCode(foreign);
  assert.equal(check.ok, false);
  if (!check.ok) {
    assert.equal(check.reason, "pairing_app_mismatch");
    assert.match(check.message, /EnvoyDev/);
    assert.match(check.message, /EnvoyHome/);
  }

  // Same URI with app=EnvoyHome is accepted.
  const ours = foreign.replace("app=EnvoyDev", "app=EnvoyHome");
  const ok = checkPairingCode(ours);
  assert.equal(ok.ok, true);
});

test("home.mintPairing: app=EnvoyHome in URI; token hash persisted (not raw token)", async () => {
  const { daemon, stateDir } = await boot();
  daemon.pairing.__resetMintRateForTests();

  await rpc("127.0.0.1", daemon.config.wsPort, "home.createAccount", {
    accountId: "alice",
    displayName: "Alice",
  });

  const reply = await rpc("127.0.0.1", daemon.config.wsPort, "home.mintPairing", {
    deviceLabel: "Alice iPhone",
    host: "127.0.0.1",
    lanHost: "127.0.0.1",
    accountIds: ["alice"],
  });
  assert.equal(reply["error"], undefined);
  const result = reply["result"] as {
    uri: string;
    device: { deviceId: string; accountIds: string[] };
  };
  assert.match(result.uri, /^envoy:\/\/pair\?/);
  assert.match(result.uri, /app=EnvoyHome/);
  assert.deepEqual(result.device.accountIds, ["alice"]);

  const parsed = checkPairingCode(result.uri);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const rawToken = parsed.token;

  // Durably stored file must contain the hash, never the raw token.
  const devicesFile = join(stateDir, "paired-devices", "devices.json");
  const body = await readFile(devicesFile, "utf8");
  assert.equal(body.includes(rawToken), false);
  assert.equal(body.includes('"tokenHash"'), true);

  // Presented token still authenticates.
  const hello = await rpc(
    "127.0.0.1",
    daemon.config.wsPort,
    "home.hello",
    { client: { name: "phone", version: "0", platform: "ios", id: "p1" } },
    rawToken,
  );
  assert.equal(hello["error"], undefined);
});

test("V-RPC-3: revoke drops the live paired connection", async () => {
  const { daemon } = await boot();
  daemon.pairing.__resetMintRateForTests();

  const mint = await rpc("127.0.0.1", daemon.config.wsPort, "home.mintPairing", {
    deviceLabel: "Phone",
    host: "127.0.0.1",
    lanHost: "127.0.0.1",
  });
  assert.equal(mint["error"], undefined);
  const uri = (mint["result"] as { uri: string }).uri;
  const deviceId = (mint["result"] as { device: { deviceId: string } }).device.deviceId;
  const parsed = checkPairingCode(uri);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;

  const session = await openRpcSession("127.0.0.1", daemon.config.wsPort, parsed.token);
  const before = await session.call("home.health");
  assert.equal(before["error"], undefined);

  // Revoke from loopback — must drop the live socket (V-RPC-3).
  const revoked = await rpc("127.0.0.1", daemon.config.wsPort, "home.revokePairedDevice", {
    deviceId,
  });
  assert.equal(revoked["error"], undefined);

  // Next message on the old socket should fail or the socket closes.
  let nextFailed = false;
  try {
    const next = await session.call("home.health");
    if (next["error"]) nextFailed = true;
  } catch {
    nextFailed = true;
  }
  session.close();
  assert.equal(nextFailed, true);

  // A fresh dial with the same token is refused.
  const after = await rpc(
    "127.0.0.1",
    daemon.config.wsPort,
    "home.hello",
    { client: { name: "phone", version: "0", platform: "ios", id: "p1" } },
    parsed.token,
  );
  assert.ok(after["error"]);
  assert.equal((after["error"] as { code: string }).code, "UNAUTHORIZED");
});

test("V-SEC-7: alice device cannot act for bob; zero-binding allow-list", async () => {
  const { daemon } = await boot();
  daemon.pairing.__resetMintRateForTests();

  await rpc("127.0.0.1", daemon.config.wsPort, "home.createAccount", {
    accountId: "alice",
    displayName: "Alice",
  });
  await rpc("127.0.0.1", daemon.config.wsPort, "home.createAccount", {
    accountId: "bob",
    displayName: "Bob",
  });

  // Alice-bound device.
  const aliceMint = await rpc("127.0.0.1", daemon.config.wsPort, "home.mintPairing", {
    deviceLabel: "Alice phone",
    host: "127.0.0.1",
    lanHost: "127.0.0.1",
    accountIds: ["alice"],
  });
  assert.equal(aliceMint["error"], undefined);
  const aliceUri = (aliceMint["result"] as { uri: string }).uri;
  const aliceParsed = checkPairingCode(aliceUri);
  assert.ok(aliceParsed.ok);
  if (!aliceParsed.ok) return;

  // Acting for bob → account_not_bound.
  const forBob = await rpc(
    "127.0.0.1",
    daemon.config.wsPort,
    "home.openSession",
    { accountId: "bob" },
    aliceParsed.token,
  );
  assert.ok(forBob["error"]);
  assert.match((forBob["error"] as { message: string }).message, /account_not_bound/);

  // Acting for alice passes the binding gate (B6 openSession).
  const forAlice = await rpc(
    "127.0.0.1",
    daemon.config.wsPort,
    "home.openSession",
    { accountId: "alice" },
    aliceParsed.token,
  );
  assert.equal(forAlice["error"], undefined);
  assert.ok((forAlice["result"] as { sessionId: string }).sessionId);

  // Zero-binding device.
  daemon.pairing.__resetMintRateForTests();
  const unboundMint = await rpc("127.0.0.1", daemon.config.wsPort, "home.mintPairing", {
    deviceLabel: "Unbound",
    host: "127.0.0.1",
    lanHost: "127.0.0.1",
  });
  assert.equal(unboundMint["error"], undefined);
  const unboundUri = (unboundMint["result"] as { uri: string }).uri;
  const unboundParsed = checkPairingCode(unboundUri);
  assert.ok(unboundParsed.ok);
  if (!unboundParsed.ok) return;

  // Allow-list methods work.
  const health = await rpc(
    "127.0.0.1",
    daemon.config.wsPort,
    "home.health",
    {},
    unboundParsed.token,
  );
  assert.equal(health["error"], undefined);
  const mesh = await rpc(
    "127.0.0.1",
    daemon.config.wsPort,
    "home.meshStatus",
    {},
    unboundParsed.token,
  );
  assert.equal(mesh["error"], undefined);

  // Outside allow-list → account_not_bound.
  const denied = await rpc(
    "127.0.0.1",
    daemon.config.wsPort,
    "home.openSession",
    { accountId: "alice" },
    unboundParsed.token,
  );
  assert.ok(denied["error"]);
  assert.match((denied["error"] as { message: string }).message, /account_not_bound/);

  // listAccounts is owner-scope / not on zero-binding allow-list.
  const listDenied = await rpc(
    "127.0.0.1",
    daemon.config.wsPort,
    "home.listAccounts",
    {},
    unboundParsed.token,
  );
  assert.ok(listDenied["error"]);
});

test("home.setDeviceAccounts: rebind without re-pair; empty → zero-binding", async () => {
  const { daemon } = await boot();
  daemon.pairing.__resetMintRateForTests();

  await rpc("127.0.0.1", daemon.config.wsPort, "home.createAccount", {
    accountId: "alice",
    displayName: "Alice",
  });
  await rpc("127.0.0.1", daemon.config.wsPort, "home.createAccount", {
    accountId: "bob",
    displayName: "Bob",
  });

  const mint = await rpc("127.0.0.1", daemon.config.wsPort, "home.mintPairing", {
    deviceLabel: "Shared tablet",
    host: "127.0.0.1",
    lanHost: "127.0.0.1",
    accountIds: ["alice"],
  });
  const deviceId = (mint["result"] as { device: { deviceId: string } }).device.deviceId;
  const uri = (mint["result"] as { uri: string }).uri;
  const token = (checkPairingCode(uri) as { ok: true; token: string }).token;

  const rebind = await rpc("127.0.0.1", daemon.config.wsPort, "home.setDeviceAccounts", {
    deviceId,
    accountIds: ["bob"],
  });
  assert.equal(rebind["error"], undefined);
  assert.deepEqual(
    (rebind["result"] as { device: { accountIds: string[] } }).device.accountIds,
    ["bob"],
  );

  const forAlice = await rpc(
    "127.0.0.1",
    daemon.config.wsPort,
    "home.sendMessage",
    { accountId: "alice", sessionId: "s1", text: "hi" },
    token,
  );
  assert.match((forAlice["error"] as { message: string }).message, /account_not_bound/);

  const clear = await rpc("127.0.0.1", daemon.config.wsPort, "home.setDeviceAccounts", {
    deviceId,
    accountIds: [],
  });
  assert.equal(clear["error"], undefined);
  assert.deepEqual(
    (clear["result"] as { device: { accountIds: string[] } }).device.accountIds,
    [],
  );
});

test("V-P2-MESH-1: hosting-only status when meshHostingEnabled", async () => {
  const { daemon } = await boot({ meshHostingEnabled: true });
  const mesh = await rpc("127.0.0.1", daemon.config.wsPort, "home.meshStatus");
  assert.equal((mesh["result"] as { mesh: { kind: string } }).mesh.kind, "hosting");

  const hello = await rpc("127.0.0.1", daemon.config.wsPort, "home.hello", {
    client: { name: "test", version: "0", platform: "darwin", id: "t1" },
  });
  assert.equal((hello["result"] as { mesh: { kind: string } }).mesh.kind, "hosting");
});

test("V-P2-MESH-2: dual-mode keeps dial target as hosting; notes dual contention", () => {
  const status = resolveMeshStatus({
    hostingEnabled: true,
    attachEnabled: true,
    listenPort: 4790,
    disableDuplicateMdns: true,
  });
  assert.equal(status.kind, "hosting");

  const handle = createMeshHost({
    config: {
      hostingEnabled: true,
      attachEnabled: true,
      listenPort: 4790,
      disableDuplicateMdns: true,
    },
  });
  const notes = handle.dualModeNotes();
  assert.ok(notes.some((n) => /V-P2-MESH-2/.test(n)));
  assert.ok(typeof handle.createTransport === "function");
});

test("doctor-mesh: flags missing DEBUG=libp2p:circuit-relay* in production", () => {
  assert.equal(hasCircuitRelayDebug(undefined), false);
  assert.equal(hasCircuitRelayDebug("libp2p:circuit-relay*"), true);
  assert.equal(hasCircuitRelayDebug("libp2p:*"), true);

  const issue = doctorMeshRelayDebugIssue({
    env: { NODE_ENV: "production" },
    production: true,
  });
  assert.ok(issue);
  assert.equal(issue?.id, "mesh.relay_debug_missing");

  const ok = doctorMeshRelayDebugIssue({
    env: { NODE_ENV: "production", DEBUG: "libp2p:circuit-relay*" },
    production: true,
  });
  assert.equal(ok, null);
});

test("artifact-signer: HMAC over canonical JSON (Design §4.1b / §4.4)", () => {
  // Keys sorted by UTF-16 ⇒ accountId, expUnix, path
  assert.equal(
    canonicalJson({ path: "/a", accountId: "alice", expUnix: 100 }),
    '{"accountId":"alice","expUnix":100,"path":"/a"}',
  );

  const secret = "test-artifact-secret";
  const token = signArtifactToken(secret, {
    accountId: "alice",
    expUnix: Math.floor(Date.now() / 1000) + 3600,
    path: "output/report.md",
  });
  assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

  const verified = verifyArtifactToken(secret, token);
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.payload.accountId, "alice");
    assert.equal(verified.payload.path, "output/report.md");
  }

  const bad = verifyArtifactToken("other-secret", token);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.reason, "bad_sig");

  const expired = signArtifactToken(secret, {
    accountId: "alice",
    expUnix: 1,
    path: "output/old.md",
  });
  const expiredCheck = verifyArtifactToken(secret, expired, 100);
  assert.equal(expiredCheck.ok, false);
  if (!expiredCheck.ok) assert.equal(expiredCheck.reason, "expired");
});

test("home.mintPairing: unused QR codes are pruned (no stack on re-mint)", async () => {
  const { daemon } = await boot();
  daemon.pairing.__resetMintRateForTests();

  const first = await rpc("127.0.0.1", daemon.config.wsPort, "home.mintPairing", {
    deviceLabel: "Phone",
  });
  assert.equal(first["error"], undefined);
  const firstId = (first["result"] as { device: { deviceId: string } }).device.deviceId;

  daemon.pairing.__resetMintRateForTests();
  const second = await rpc("127.0.0.1", daemon.config.wsPort, "home.mintPairing", {
    deviceLabel: "Phone",
  });
  assert.equal(second["error"], undefined);
  const secondId = (second["result"] as { device: { deviceId: string } }).device.deviceId;
  assert.notEqual(firstId, secondId);

  const listed = await rpc("127.0.0.1", daemon.config.wsPort, "home.listPairedDevices", {});
  const devices = (listed["result"] as { devices: Array<{ deviceId: string; lastSeenAt?: string; revoked: boolean }> })
    .devices;
  const unused = devices.filter((d) => !d.revoked && !d.lastSeenAt);
  assert.equal(unused.length, 1);
  assert.equal(unused[0]?.deviceId, secondId);
});

test("home.mintPairing: omit host (LAN/loopback fill) + short user token", async () => {
  const { daemon } = await boot();
  daemon.pairing.__resetMintRateForTests();

  const qr = await rpc("127.0.0.1", daemon.config.wsPort, "home.mintPairing", {
    deviceLabel: "Phone",
  });
  assert.equal(qr["error"], undefined);
  const qrUri = (qr["result"] as { uri: string }).uri;
  assert.match(qrUri, /^envoy:\/\/pair\?/);

  daemon.pairing.__resetMintRateForTests();
  const badLen = await rpc("127.0.0.1", daemon.config.wsPort, "home.mintPairing", {
    deviceLabel: "Phone",
    host: "203.0.113.7",
    token: "short",
  });
  assert.ok(badLen["error"]);

  daemon.pairing.__resetMintRateForTests();
  const typed = await rpc("127.0.0.1", daemon.config.wsPort, "home.mintPairing", {
    deviceLabel: "Phone",
    host: "203.0.113.7:4780",
    token: "abcd1234",
  });
  assert.equal(typed["error"], undefined);
  const typedUri = (typed["result"] as { uri: string }).uri;
  assert.match(typedUri, /203\.0\.113\.7/);
  assert.match(typedUri, /token=abcd1234/);
});

test("cleanup b4 state dirs", async () => {
  for (const d of daemons) {
    await rm(d.config.stateDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
