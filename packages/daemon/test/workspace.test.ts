// Design §4.2.1 / V-SEC-13 / V-SEC-14 / V-SEC-20 — profile workspace root.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PathJailError,
  resolveSandboxPath,
  isFilesystemRoot,
  startDaemon,
  type RunningDaemon,
} from "../dist/index.js";

const daemons: RunningDaemon[] = [];

after(async () => {
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

test("isFilesystemRoot: / and drive roots (POSIX + Windows forms)", () => {
  assert.equal(isFilesystemRoot("/"), true);
  assert.equal(isFilesystemRoot("/Users/allen"), false);
  // Windows drive roots must be recognized from the raw string on any host OS
  // (daemon only sees native paths at runtime; forms still need to classify).
  assert.equal(isFilesystemRoot("C:\\"), true);
  assert.equal(isFilesystemRoot("C:/"), true);
  assert.equal(isFilesystemRoot("C:"), true);
  assert.equal(isFilesystemRoot("D:\\"), true);
  assert.equal(isFilesystemRoot("C:\\Users"), false);
});

test("V-SEC-13: workspace/ jail — unset, traversal, ro write, host root", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-ws-jail-"));
  try {
    const host = join(stateDir, "host");
    await mkdir(host, { recursive: true });
    await writeFile(join(host, "README.md"), "hi", "utf8");
    const accountFiles = join(stateDir, "files");
    await mkdir(accountFiles, { recursive: true });
    const shareRoot = join(stateDir, "share");
    await mkdir(shareRoot, { recursive: true });

    assert.throws(
      () =>
        resolveSandboxPath({
          accountFilesRoot: accountFiles,
          shareRoot,
          path: "workspace/README.md",
          write: false,
        }),
      PathJailError,
    );

    const readOk = resolveSandboxPath({
      accountFilesRoot: accountFiles,
      shareRoot,
      path: "workspace/README.md",
      write: false,
      workspaceRoot: host,
      workspaceMode: "ro",
    });
    assert.equal(readOk.area, "workspace");

    assert.throws(
      () =>
        resolveSandboxPath({
          accountFilesRoot: accountFiles,
          shareRoot,
          path: "workspace/../escape.txt",
          write: false,
          workspaceRoot: host,
          workspaceMode: "ro",
        }),
      PathJailError,
    );

    assert.throws(
      () =>
        resolveSandboxPath({
          accountFilesRoot: accountFiles,
          shareRoot,
          path: "workspace/new.txt",
          write: true,
          workspaceRoot: host,
          workspaceMode: "ro",
        }),
      PathJailError,
    );

    const written = resolveSandboxPath({
      accountFilesRoot: accountFiles,
      shareRoot,
      path: "workspace/new.txt",
      write: true,
      workspaceRoot: host,
      workspaceMode: "rw",
    });
    assert.equal(written.area, "workspace");

    assert.throws(
      () =>
        resolveSandboxPath({
          accountFilesRoot: accountFiles,
          shareRoot,
          path: "/etc/passwd",
          write: false,
          workspaceRoot: "/",
          workspaceMode: "ro",
        }),
      PathJailError,
    );

    // Under `/`, workspace/<rel> stays jailed to that root via safeJoin.
    const underRoot = resolveSandboxPath({
      accountFilesRoot: accountFiles,
      shareRoot,
      path: "workspace/tmp",
      write: false,
      workspaceRoot: "/",
      workspaceMode: "ro",
    });
    assert.equal(underRoot.area, "workspace");
    assert.ok(underRoot.absolute === "/tmp" || underRoot.absolute.endsWith("/tmp"));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-SEC-14/20: setWorkspace Owner-scope; root only for Owner seat", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-ws-rpc-"));
  const host = join(stateDir, "project");
  await mkdir(host, { recursive: true });

  const daemon = await startDaemon({
    config: {
      stateDir,
      wsPort: 0,
      httpPort: 0,
      hatchApiKey: "k",
    },
    packageVersion: "0.0.0-test",
  });
  daemons.push(daemon);

  try {
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    await daemon.household.onAccountCreated("alice");
    await daemon.accounts.create({ accountId: "bob", displayName: "Bob" });
    const ownerId = daemon.household.getOwnerAccountId();
    assert.equal(ownerId, "alice");

    const unset = await daemon.accounts.getWorkspacePublic("alice");
    assert.equal(unset.configured, false);

    const hostReal = realpathSync(host);
    const set = await daemon.accounts.setWorkspace({
      accountId: "alice",
      hostPath: host,
      mode: "rw",
      ownerAccountId: ownerId,
    });
    assert.equal(set.hostPath, hostReal);
    assert.equal(set.mode, "rw");

    const pub = await daemon.accounts.getWorkspacePublic("alice");
    assert.equal(pub.configured, true);
    assert.equal(pub.mode, "rw");
    assert.equal(pub.displayPath, hostReal);
    assert.equal(pub.filesystemRoot, false);

    // Whole-machine root — Owner seat only
    const rootSet = await daemon.accounts.setWorkspace({
      accountId: "alice",
      hostPath: "/",
      mode: "ro",
      ownerAccountId: ownerId,
    });
    assert.ok(isFilesystemRoot(rootSet.hostPath));
    const rootPub = await daemon.accounts.getWorkspacePublic("alice");
    assert.equal(rootPub.filesystemRoot, true);

    await assert.rejects(
      () =>
        daemon.accounts.setWorkspace({
          accountId: "bob",
          hostPath: "/",
          mode: "ro",
          ownerAccountId: ownerId,
        }),
      /workspace_root_owner_only/,
    );

    // Effective workspace nulls illegal roots (runtime R3)
    assert.equal(
      (await daemon.accounts.getWorkspaceEffective("bob", ownerId))?.hostPath,
      undefined,
    );
    // Force-write illegal root then clear via helper
    await writeFile(
      join(stateDir, "accounts", "bob", "workspace.json"),
      JSON.stringify({ hostPath: "/", mode: "ro", updatedAt: new Date().toISOString() }) + "\n",
    );
    assert.equal(await daemon.accounts.getWorkspaceEffective("bob", ownerId), null);
    const cleared = await daemon.accounts.clearNonOwnerFilesystemRoots(ownerId);
    assert.ok(cleared.includes("bob"));
    assert.equal((await daemon.accounts.getWorkspacePublic("bob")).configured, false);

    await daemon.accounts.clearWorkspace("alice");
    assert.equal((await daemon.accounts.getWorkspacePublic("alice")).configured, false);

    const { METHODS } = await import("@envoyhome/protocol");
    assert.equal(METHODS["home.setWorkspace"]?.scope, "owner-scope");
    assert.equal(METHODS["home.clearWorkspace"]?.scope, "owner-scope");
    assert.equal(METHODS["home.getWorkspace"]?.scope, "account-scoped");
    assert.equal(METHODS["home.upsertWorkspaceMount"]?.scope, "owner-scope");
    assert.equal(METHODS["home.removeWorkspaceMount"]?.scope, "owner-scope");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("§4.2.1 multi-folder: mounts + workspace/<id>/ jail", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-ws-multi-"));
  try {
    const hostA = join(stateDir, "proj-a");
    const hostB = join(stateDir, "proj-b");
    await mkdir(hostA, { recursive: true });
    await mkdir(hostB, { recursive: true });
    await writeFile(join(hostA, "a.txt"), "a", "utf8");
    await writeFile(join(hostB, "b.txt"), "b", "utf8");
    const accountFiles = join(stateDir, "files");
    await mkdir(accountFiles, { recursive: true });
    const shareRoot = join(stateDir, "share");
    await mkdir(shareRoot, { recursive: true });

    const mounts = [
      { id: "proj-a", hostPath: hostA, mode: "ro" as const },
      { id: "proj-b", hostPath: hostB, mode: "rw" as const },
    ];

    const a = resolveSandboxPath({
      accountFilesRoot: accountFiles,
      shareRoot,
      path: "workspace/proj-a/a.txt",
      write: false,
      workspaceMounts: mounts,
    });
    assert.equal(a.area, "workspace");
    assert.ok(a.absolute.endsWith("a.txt"));

    assert.throws(
      () =>
        resolveSandboxPath({
          accountFilesRoot: accountFiles,
          shareRoot,
          path: "workspace/proj-a/new.txt",
          write: true,
          workspaceMounts: mounts,
        }),
      PathJailError,
    );

    const written = resolveSandboxPath({
      accountFilesRoot: accountFiles,
      shareRoot,
      path: "workspace/proj-b/new.txt",
      write: true,
      workspaceMounts: mounts,
    });
    assert.equal(written.area, "workspace");

    assert.throws(
      () =>
        resolveSandboxPath({
          accountFilesRoot: accountFiles,
          shareRoot,
          path: "workspace/missing/x",
          write: false,
          workspaceMounts: mounts,
        }),
      /unknown mount id/,
    );

    assert.throws(
      () =>
        resolveSandboxPath({
          accountFilesRoot: accountFiles,
          shareRoot,
          path: "workspace/flat.txt",
          write: false,
          workspaceMounts: mounts,
        }),
      /unknown mount id|requires a mount id/,
    );

    // Single-mount legacy flat path still works.
    const single = resolveSandboxPath({
      accountFilesRoot: accountFiles,
      shareRoot,
      path: "workspace/a.txt",
      write: false,
      workspaceMounts: [mounts[0]!],
    });
    assert.equal(single.area, "workspace");

    const daemon = await startDaemon({
      config: {
        stateDir,
        wsPort: 0,
        httpPort: 0,
        hatchApiKey: "k",
      },
      packageVersion: "0.0.0-test",
    });
    daemons.push(daemon);
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    await daemon.household.onAccountCreated("alice");
    const ownerId = daemon.household.getOwnerAccountId();

    await daemon.accounts.upsertWorkspaceMount({
      accountId: "alice",
      hostPath: hostA,
      mode: "ro",
      ownerAccountId: ownerId,
    });
    await daemon.accounts.upsertWorkspaceMount({
      accountId: "alice",
      hostPath: hostB,
      mode: "rw",
      ownerAccountId: ownerId,
    });
    const pub = await daemon.accounts.getWorkspacePublic("alice", ownerId);
    assert.equal(pub.configured, true);
    assert.equal(pub.mounts.length, 2);
    assert.ok(pub.mounts.every((m) => m.active));

    const removed = await daemon.accounts.removeWorkspaceMount({
      accountId: "alice",
      id: pub.mounts[0]!.id,
    });
    assert.equal(removed.length, 1);

    // Re-adding the same hostPath updates in place (no duplicate mounts).
    await daemon.accounts.upsertWorkspaceMount({
      accountId: "alice",
      hostPath: hostB,
      mode: "ro",
      ownerAccountId: ownerId,
    });
    await daemon.accounts.upsertWorkspaceMount({
      accountId: "alice",
      hostPath: hostB,
      mode: "rw",
      ownerAccountId: ownerId,
    });
    const afterDup = await daemon.accounts.getWorkspaceMounts("alice");
    assert.equal(afterDup.length, 1);
    assert.equal(afterDup[0]!.mode, "rw");
    assert.equal(afterDup[0]!.hostPath, realpathSync(hostB));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
