// B3 acceptance: V-SEC-1, V-SEC-2, V-SEC-3, V-SEC-4 (Design §4.5 + Appendix C.3).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  APPENDIX_C3_REQUIRED_IDS,
  PATH_TRAVERSAL_CORPUS,
  PathJailError,
  AccountStore,
  BindingStore,
  DeviceCredentialStore,
  DaemonLogger,
  SubscriptionRegistry,
  defaultConfig,
  dispatchForTest,
  hashDeviceToken,
  homePaths,
  PairingStore,
  resolveSandboxPath,
  safeJoin,
  type HomeSession,
  type RouterDeps,
  type RunningDaemon,
  startDaemon,
} from "../dist/index.js";
import { ActuationService } from "../dist/actuation-service.js";
import { MemoryFacade } from "@envoyhome/memory";
import { ChannelService } from "../dist/channels/service.js";
import { WorkflowStore } from "../dist/workflows.js";
import { SkillService } from "../dist/skills.js";
import { ArtifactService } from "../dist/artifacts.js";

const daemons: RunningDaemon[] = [];

after(async () => {
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

async function tempState(): Promise<string> {
  return mkdtemp(join(tmpdir(), "envoyhome-b3-"));
}

function memberSession(accountIds: string[], deviceId = "dev-member"): HomeSession {
  return {
    scopeKey: deviceId,
    ownerId: deviceId,
    isOwnerScope: false,
    deviceId,
    caller: {
      kind: "device",
      deviceId,
      accountIds,
      ownerTrusted: false,
    },
  };
}

function routerDeps(stateDir: string, devices = new DeviceCredentialStore()): RouterDeps {
  const accounts = new AccountStore(stateDir);
  const bindings = new BindingStore(stateDir, devices);
  const pairing = new PairingStore(stateDir, devices, bindings);
  const logger = new DaemonLogger();
  const channels = new ChannelService({ stateDir, bindings, logger });
  const paths = homePaths(stateDir);
  return {
    config: defaultConfig({ stateDir, wsPort: 0, httpPort: 0 }),
    startedAt: new Date(),
    logger,
    subscriptions: new SubscriptionRegistry(),
    connections: () => 0,
    activeTurns: () => 0,
    onShutdown: () => undefined,
    packageVersion: "0.0.0-test",
    accounts,
    bindings,
    pairing,
    memory: new MemoryFacade({ stateDir }),
    channels,
    turns: {} as RouterDeps["turns"],
    providers: {} as RouterDeps["providers"],
    harnesses: {} as RouterDeps["harnesses"],
    workflows: new WorkflowStore(paths),
    skills: new SkillService(paths),
    artifacts: new ArtifactService(paths, () => "http://127.0.0.1:1"),
    actuations: new ActuationService(paths),
    meshStatus: () => ({ kind: "no-node" as const }),
  };
}

/* ------------------------------------------------------------------ V-SEC-2 */

test("V-SEC-2: Appendix C.3 required ids are present in the corpus fixture", () => {
  const ids = new Set(PATH_TRAVERSAL_CORPUS.map((c) => c.id));
  for (const required of APPENDIX_C3_REQUIRED_IDS) {
    assert.ok(ids.has(required), `missing corpus row ${required}`);
  }
});

test("V-SEC-2: path-traversal corpus (Appendix C.3)", async () => {
  const stateDir = await tempState();
  try {
    const paths = homePaths(stateDir);
    const accountFiles = paths.accountFiles("a");
    await mkdir(join(accountFiles, "documents"), { recursive: true });
    await mkdir(join(accountFiles, "output", "reports"), { recursive: true });
    await mkdir(join(accountFiles, "knowledge"), { recursive: true });
    // Sibling account root used by ../b escapes.
    await mkdir(paths.accountFiles("b"), { recursive: true });
    await mkdir(paths.shareDir, { recursive: true });

    for (const row of PATH_TRAVERSAL_CORPUS) {
      let threw = false;
      let result = "";
      try {
        result = safeJoin(accountFiles, row.path);
      } catch (err) {
        threw = true;
        assert.ok(err instanceof PathJailError, `${row.id}: expected PathJailError`);
      }
      if (row.expect === "deny") {
        assert.equal(threw, true, `${row.id}: expected deny for ${JSON.stringify(row.path)}`);
      } else {
        assert.equal(threw, false, `${row.id}: expected allow for ${JSON.stringify(row.path)}`);
        assert.ok(
          result.startsWith(accountFiles),
          `${row.id}: result must stay under account files`,
        );
      }
    }
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-SEC-2: symlink escape out of jail is refused", async () => {
  const stateDir = await tempState();
  try {
    const paths = homePaths(stateDir);
    const accountFiles = paths.accountFiles("a");
    const documents = join(accountFiles, "documents");
    await mkdir(documents, { recursive: true });
    const outside = join(stateDir, "outside-secret.txt");
    await writeFile(outside, "secret\n", "utf8");
    const linkPath = join(documents, "escape");
    await symlink(outside, linkPath);

    assert.throws(() => safeJoin(accountFiles, "documents/escape"), PathJailError);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ V-SEC-1 */

test("V-SEC-1: account B cannot read A's profile via account store", async () => {
  const stateDir = await tempState();
  try {
    const store = new AccountStore(stateDir);
    await store.ensureLayout();
    await store.create({ accountId: "alice", displayName: "Alice" });
    await store.create({ accountId: "bob", displayName: "Bob" });

    const bob = memberSession(["bob"]).caller;
    await assert.rejects(
      () => store.readAccountFile(bob, "alice", "profile.json"),
      (err: unknown) =>
        err instanceof Error && /account_not_bound/.test(err.message),
    );

    const alice = memberSession(["alice"]).caller;
    const profile = await store.readAccountFile(alice, "alice", "profile.json");
    assert.match(profile, /"displayName": "Alice"/);

    // Loopback owner may read any account.
    const owner = {
      kind: "loopback-owner" as const,
      accountIds: [] as string[],
      ownerTrusted: true,
    };
    const asOwner = await store.readAccountFile(owner, "alice", "profile.json");
    assert.match(asOwner, /Alice/);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-SEC-1: member device cannot call owner-scope account mutate", async () => {
  const stateDir = await tempState();
  try {
    const deps = routerDeps(stateDir);
    await deps.accounts.ensureLayout();
    await deps.accounts.create({ accountId: "alice", displayName: "Alice" });

    const denied = await dispatchForTest(
      deps,
      "home.updateAccount",
      { accountId: "alice", displayName: "Hacked" },
      memberSession(["alice"]),
    );
    assert.ok("error" in denied);
    assert.equal(denied.error.code, "UNAUTHORIZED");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ V-SEC-3 */

test("V-SEC-3: unknown channel identity → deny, never an account", async () => {
  const stateDir = await tempState();
  try {
    const devices = new DeviceCredentialStore();
    const bindings = new BindingStore(stateDir, devices);
    const accounts = new AccountStore(stateDir);
    await accounts.ensureLayout();
    await accounts.create({ accountId: "alice", displayName: "Alice" });

    const unknown = await bindings.resolveSender("telegram", "bot_main", "telegram_999");
    assert.equal(unknown, null);

    // After an explicit owner bind, resolve succeeds.
    await bindings.set(
      {
        channel: "telegram",
        channelAccount: "bot_main",
        senderId: "telegram_12345",
        accountId: "alice",
      },
      { kind: "loopback-owner", accountIds: [], ownerTrusted: true },
    );
    const known = await bindings.resolveSender("telegram", "bot_main", "telegram_12345");
    assert.ok(known);
    assert.equal(known.accountId, "alice");
    assert.equal(known.machine, false);
    assert.equal(known.trustedChannel, false);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-SEC-3 / bindings: cannot silently redirect accountId", async () => {
  const stateDir = await tempState();
  try {
    const devices = new DeviceCredentialStore();
    const bindings = new BindingStore(stateDir, devices);
    const accounts = new AccountStore(stateDir);
    await accounts.ensureLayout();
    await accounts.create({ accountId: "alice", displayName: "Alice" });
    await accounts.create({ accountId: "bob", displayName: "Bob" });
    const owner = { kind: "loopback-owner" as const, accountIds: [] as string[], ownerTrusted: true };

    await bindings.set(
      {
        channel: "telegram",
        channelAccount: "bot_main",
        senderId: "telegram_1",
        accountId: "alice",
      },
      owner,
    );

    await assert.rejects(
      () =>
        bindings.set(
          {
            channel: "telegram",
            channelAccount: "bot_main",
            senderId: "telegram_1",
            accountId: "bob",
          },
          owner,
        ),
      (err: unknown) =>
        err instanceof Error && /already maps to account alice/.test(err.message),
    );

    const still = await bindings.resolveSender("telegram", "bot_main", "telegram_1");
    assert.equal(still?.accountId, "alice");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ V-SEC-4 */

test("V-SEC-4: only share/ is cross-account writable with explicit policy", async () => {
  const stateDir = await tempState();
  try {
    const paths = homePaths(stateDir);
    await mkdir(paths.accountFiles("alice"), { recursive: true });
    await mkdir(paths.accountFiles("bob"), { recursive: true });
    await mkdir(paths.shareDir, { recursive: true });

    // Account-private write OK under own files.
    const own = resolveSandboxPath({
      accountFilesRoot: paths.accountFiles("alice"),
      shareRoot: paths.shareDir,
      path: "documents/note.txt",
      write: true,
    });
    assert.equal(own.area, "account");
    assert.ok(own.absolute.startsWith(paths.accountFiles("alice")));

    // share/ write without policy → deny.
    assert.throws(
      () =>
        resolveSandboxPath({
          accountFilesRoot: paths.accountFiles("alice"),
          shareRoot: paths.shareDir,
          path: "share/family.txt",
          write: true,
        }),
      PathJailError,
    );

    // share/ write with explicit policy → allow.
    const shared = resolveSandboxPath({
      accountFilesRoot: paths.accountFiles("alice"),
      shareRoot: paths.shareDir,
      path: "share/family.txt",
      write: true,
      shareWrite: true,
    });
    assert.equal(shared.area, "share");
    assert.ok(shared.absolute.startsWith(paths.shareDir));

    // Traversal from share back into another account → deny.
    assert.throws(
      () =>
        resolveSandboxPath({
          accountFilesRoot: paths.accountFiles("alice"),
          shareRoot: paths.shareDir,
          path: "share/../accounts/bob/files/x",
          write: true,
          shareWrite: true,
        }),
      PathJailError,
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------- RPC integration */

test("B3 RPC: create/list/update/delete accounts + sender/device bindings", async () => {
  const stateDir = await tempState();
  const daemon = await startDaemon({
    config: { stateDir, wsPort: 0, httpPort: 0, hatchApiKey: "k" },
    packageVersion: "0.0.0-test",
  });
  daemons.push(daemon);

  const deps: RouterDeps = {
    config: daemon.config,
    startedAt: daemon.startedAt,
    logger: daemon.logger,
    subscriptions: daemon.subscriptions,
    connections: () => 0,
    activeTurns: () => 0,
    onShutdown: () => undefined,
    packageVersion: "0.0.0-test",
    accounts: daemon.accounts,
    bindings: daemon.bindings,
    pairing: daemon.pairing,
    memory: daemon.memory,
    channels: daemon.channels,
    turns: daemon.turns,
    providers: daemon.providers,
    harnesses: daemon.harnesses,
    workflows: daemon.workflows,
    skills: daemon.skills,
    artifacts: daemon.artifacts,
    actuations: daemon.actuations,
    meshStatus: () => ({ kind: "no-node" as const }),
  };

  const created = await dispatchForTest(deps, "home.createAccount", {
    accountId: "alice",
    displayName: "Alice",
    locale: "en",
  });
  assert.ok("result" in created);
  const account = (created.result as { account: { accountId: string } }).account;
  assert.equal(account.accountId, "alice");

  const paths = homePaths(stateDir);
  const root = paths.accountRoot("alice");
  // Skeleton dirs from Design §4.2 / Plan B3.
  for (const rel of [
    "memory",
    "learns",
    "sessions",
    "files/documents",
    "files/output",
    "files/knowledge",
    "skills",
    "approvals",
    "grants",
    "MEMORY.md",
    "COMPACT.md",
    "profile.json",
  ]) {
    const { access } = await import("node:fs/promises");
    await access(join(root, rel));
  }

  await dispatchForTest(deps, "home.createAccount", {
    accountId: "bob",
    displayName: "Bob",
  });

  const listed = await dispatchForTest(deps, "home.listAccounts", {});
  assert.ok("result" in listed);
  const accounts = (listed.result as { accounts: { accountId: string }[] }).accounts;
  assert.deepEqual(
    accounts.map((a) => a.accountId).sort(),
    ["alice", "bob"],
  );

  // Sender binding
  const senderBind = await dispatchForTest(deps, "home.setBinding", {
    channel: "telegram",
    channelAccount: "bot_main",
    senderId: "telegram_1",
    accountId: "alice",
    machine: false,
    trustedChannel: true,
  });
  assert.ok("result" in senderBind);
  const sb = senderBind.result as {
    bindingId: string;
    binding: { trustedChannel: boolean; accountId: string };
  };
  assert.equal(sb.binding.accountId, "alice");
  assert.equal(sb.binding.trustedChannel, true);

  // Device binding — register device first, then bind.
  daemon.devices.put({
    deviceId: "phone-alice",
    tokenHash: hashDeviceToken("tok-alice"),
    accountIds: [],
    ownerTrusted: false,
    revoked: false,
    label: "Alice phone",
    createdAt: new Date().toISOString(),
  });
  const deviceBind = await dispatchForTest(deps, "home.setBinding", {
    deviceId: "phone-alice",
    accountId: "alice",
    ownerTrusted: true,
  });
  assert.ok("result" in deviceBind);
  assert.equal(daemon.devices.getById("phone-alice")?.accountIds.includes("alice"), true);
  assert.equal(daemon.devices.getById("phone-alice")?.ownerTrusted, true);

  const bindings = await dispatchForTest(deps, "home.listBindings", { accountId: "alice" });
  assert.ok("result" in bindings);
  assert.equal((bindings.result as { bindings: unknown[] }).bindings.length, 2);

  const removed = await dispatchForTest(deps, "home.removeBinding", {
    bindingId: sb.bindingId,
  });
  assert.ok("result" in removed);

  const del = await dispatchForTest(deps, "home.deleteAccount", {
    accountId: "bob",
    confirm: true,
  });
  assert.ok("result" in del);
});

test("homePaths exposes Design §4.2 roots", async () => {
  const stateDir = await tempState();
  try {
    const p = homePaths(stateDir);
    assert.equal(p.accountsDir, join(stateDir, "accounts"));
    assert.equal(p.shareDir, join(stateDir, "share"));
    assert.equal(p.pairedDevicesDir, join(stateDir, "paired-devices"));
    assert.equal(p.secretsDir, join(stateDir, "secrets"));
    assert.equal(p.objectsJson, join(stateDir, "objects.json"));
    assert.equal(p.accountRoot("alice"), join(stateDir, "accounts", "alice"));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
