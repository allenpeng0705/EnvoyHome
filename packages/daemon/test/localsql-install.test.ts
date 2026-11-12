// Design §9.5k / P2-S1 — V-OFFICE-39 managed DuckDB install (Owner-explicit).

import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { homePaths } from "../dist/home-paths.js";
import {
  LocalSqlInstallService,
  __resetLocalSqlInstallForTests,
  __setLocalSqlInstallHooksForTests,
} from "../dist/localsql-install.js";
import { LOCALSQL_CATALOG_VERSION } from "../dist/localsql-catalog.js";

async function withService(
  env: NodeJS.ProcessEnv,
  fn: (svc: LocalSqlInstallService, paths: ReturnType<typeof homePaths>) => Promise<void>,
): Promise<void> {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-sql-inst-"));
  __resetLocalSqlInstallForTests();
  const paths = homePaths(stateDir);
  const svc = new LocalSqlInstallService(paths, env);
  await svc.load();
  try {
    await fn(svc, paths);
  } finally {
    await svc.cancelInstall().catch(() => undefined);
    __setLocalSqlInstallHooksForTests({
      extract: null,
      download: null,
      catalogEntry: null,
    });
    __resetLocalSqlInstallForTests();
    await rm(stateDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

test("V-OFFICE-39: no silent auto — missing until Owner install", async () => {
  await withService({ ...process.env, ENVOYHOME_DUCKDB: "", PATH: "" }, async (svc) => {
    // There is intentionally no maybeAutoInstall on LocalSqlInstallService.
    assert.equal(typeof (svc as { maybeAutoInstall?: unknown }).maybeAutoInstall, "undefined");
    const st = svc.getStatus();
    assert.equal(st.localSqlRuntime, "missing");
    assert.equal(st.autoInstallEnabled, false);
    assert.equal(st.installSource, "none");
    assert.match(st.whyText, /DuckDB|local/i);
  });
});

test("V-OFFICE-39: Owner install via hooks reaches ready", async () => {
  await withService({ ...process.env, ENVOYHOME_DUCKDB: "" }, async (svc) => {
    __setLocalSqlInstallHooksForTests({
      catalogEntry: {
        id: "darwin-arm64",
        version: LOCALSQL_CATALOG_VERSION,
        approxBytes: 1000,
        fileName: "fake.tar.gz",
        url: "https://github.com/duckdb/duckdb/releases/download/v2.0.0/fake.tar.gz",
        sha256: "a".repeat(64),
        binaryRelPath: "duckdb",
        kind: "tar.gz",
      },
      download: async ({ onProgress }) => {
        onProgress(10, 1000);
        onProgress(1000, 1000);
      },
      extract: async ({ runtimeDir, entry }) => {
        const bin = join(runtimeDir, entry.binaryRelPath);
        await mkdir(runtimeDir, { recursive: true });
        await writeFile(bin, "#!/bin/sh\necho duckdb\n", "utf8");
        await chmod(bin, 0o755);
        return { binaryRelPath: entry.binaryRelPath };
      },
    });

    const st = await svc.startInstall();
    assert.equal(st.localSqlRuntime, "ready");
    assert.equal(st.installSource, "managed");
    assert.equal(st.autoInstallEnabled, false);
    assert.ok(st.managedPath);
    assert.equal(svc.resolveBinaryPath(), st.managedPath);
  });
});

test("V-OFFICE-39: ENVOYHOME_DUCKDB env wins without download", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-sql-env-"));
  try {
    const bin = join(stateDir, "duckdb");
    await writeFile(bin, "#!/bin/sh\necho ok\n", "utf8");
    await chmod(bin, 0o755);
    await withService(
      { ...process.env, ENVOYHOME_DUCKDB: bin },
      async (svc) => {
        const st = svc.getStatus();
        assert.equal(st.localSqlRuntime, "ready");
        assert.equal(st.installSource, "env");
        assert.equal(st.managedPath, bin);
      },
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OFFICE-39: cancel marks failed", async () => {
  await withService({ ...process.env, ENVOYHOME_DUCKDB: "" }, async (svc) => {
    let unblock: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      unblock = r;
    });
    __setLocalSqlInstallHooksForTests({
      catalogEntry: {
        id: "linux-x64",
        version: LOCALSQL_CATALOG_VERSION,
        approxBytes: 1000,
        fileName: "fake.tar.gz",
        url: "https://github.com/duckdb/duckdb/releases/download/v2.0.0/fake.tar.gz",
        sha256: "b".repeat(64),
        binaryRelPath: "duckdb",
        kind: "tar.gz",
      },
      download: async ({ signal }) => {
        await gate;
        if (signal.aborted) throw new Error("aborted");
      },
    });
    const p = svc.startInstall();
    await new Promise((r) => setTimeout(r, 20));
    const mid = svc.getStatus();
    assert.equal(mid.localSqlRuntime, "downloading");
    await svc.cancelInstall();
    unblock();
    await p.catch(() => undefined);
    const st = svc.getStatus();
    assert.ok(
      st.localSqlRuntime === "failed" || st.localSqlRuntime === "missing",
      st.localSqlRuntime,
    );
  });
});
