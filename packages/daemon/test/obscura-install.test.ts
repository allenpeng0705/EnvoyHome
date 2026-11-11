// Design §9.5f Stage D — managed Obscura auto-install + resolve order.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homePaths } from "../dist/home-paths.js";
import {
  ObscuraInstallService,
  promoteObscuraLayoutSync,
  __resetObscuraInstallForTests,
  __setObscuraInstallHooksForTests,
} from "../dist/obscura-install.js";
import { OBSCURA_CATALOG_VERSION, OBSCURA_CATALOG } from "../dist/obscura-catalog.js";
import {
  resolveObscuraBinary,
  obscuraInstallHint,
} from "../dist/web-extract-obscura.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

async function withService(
  env: NodeJS.ProcessEnv,
  fn: (svc: ObscuraInstallService, paths: ReturnType<typeof homePaths>) => Promise<void>,
): Promise<void> {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-obscura-inst-"));
  __resetObscuraInstallForTests();
  const paths = homePaths(stateDir);
  const prev = { ...process.env };
  Object.assign(process.env, env);
  const svc = new ObscuraInstallService(paths, env);
  await svc.load();
  try {
    await fn(svc, paths);
  } finally {
    for (const k of Object.keys(process.env)) {
      if (!(k in prev)) delete process.env[k];
    }
    Object.assign(process.env, prev);
    __setObscuraInstallHooksForTests({
      extract: null,
      download: null,
      catalogEntry: null,
    });
    __resetObscuraInstallForTests();
    await rm(stateDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

test("V-OUT-33: homePaths exposes obscura runtime dirs", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-obscura-paths-"));
  try {
    const p = homePaths(stateDir);
    assert.ok(p.obscuraDir.endsWith("obscura"));
    assert.ok(p.obscuraRuntimeDir.includes("runtime"));
    assert.ok(p.obscuraInstallJson.endsWith("install.json"));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-33: catalog covers all release platforms with sha256", () => {
  assert.equal(OBSCURA_CATALOG_VERSION, "0.2.6");
  const ids = OBSCURA_CATALOG.map((e) => e.id).sort();
  assert.deepEqual(ids, [
    "darwin-arm64",
    "darwin-x64",
    "linux-arm64",
    "linux-x64",
    "win32-x64",
  ]);
  for (const e of OBSCURA_CATALOG) {
    assert.match(e.sha256, /^[a-f0-9]{64}$/);
    assert.ok(e.url.startsWith("https://github.com/h4ckf0r0day/obscura/"));
    assert.ok(!e.fileName.includes("stealth"));
  }
});

test("V-OUT-33: fetch-obscura.mjs pin stays in sync with obscura-catalog.ts", () => {
  const fetchSrc = readFileSync(join(repoRoot, "scripts/fetch-obscura.mjs"), "utf8");
  assert.match(
    fetchSrc,
    new RegExp(`OBSCURA_CATALOG_VERSION = "${OBSCURA_CATALOG_VERSION}"`),
  );
  for (const e of OBSCURA_CATALOG) {
    assert.ok(
      fetchSrc.includes(e.sha256),
      `fetch-obscura.mjs missing sha256 for ${e.id}`,
    );
    assert.ok(
      fetchSrc.includes(e.fileName),
      `fetch-obscura.mjs missing fileName for ${e.id}`,
    );
  }
  assert.ok(!/stealth/i.test(fetchSrc));
});

test("V-OUT-33: promoteObscuraLayoutSync flattens nested CLI + worker (+ DLL)", async () => {
  const runtimeDir = await mkdtemp(join(tmpdir(), "eh-obscura-promote-"));
  try {
    const nested = join(runtimeDir, "obscura-v0.2.6", "bin");
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, "obscura"), "#!/bin/sh\n", { mode: 0o755 });
    await writeFile(join(nested, "obscura-worker"), "worker", { mode: 0o755 });
    await writeFile(join(nested, "obscura_native.dll"), "dll");
    const promoted = promoteObscuraLayoutSync(runtimeDir, "obscura");
    assert.ok(promoted);
    assert.equal(promoted, join(runtimeDir, "obscura"));
    assert.ok(existsSync(join(runtimeDir, "obscura")));
    assert.ok(existsSync(join(runtimeDir, "obscura-worker")));
    assert.ok(existsSync(join(runtimeDir, "obscura_native.dll")));
  } finally {
    await rm(runtimeDir, { recursive: true, force: true });
  }
});

test("V-OUT-33: ENVOYHOME_OBSCURA_AUTO=0 skips silent auto", async () => {
  await withService(
    { ...process.env, ENVOYHOME_OBSCURA_AUTO: "0", ENVOYHOME_OBSCURA: "", PATH: "/empty" },
    async (svc) => {
      await svc.maybeAutoInstall();
      const st = svc.getStatus();
      assert.equal(st.autoInstall.enabled, false);
      assert.equal(st.obscuraRuntime, "missing");
      assert.equal(st.autoInstall.attempted, false);
    },
  );
});

test("V-OUT-33: silent auto installs managed binary once", async () => {
  await withService(
    { ...process.env, ENVOYHOME_OBSCURA_AUTO: "1", ENVOYHOME_OBSCURA: "", PATH: "/empty" },
    async (svc, paths) => {
      __setObscuraInstallHooksForTests({
        catalogEntry: {
          id: "darwin-arm64",
          version: OBSCURA_CATALOG_VERSION,
          approxBytes: 1000,
          fileName: "fake.tar.gz",
          url: "https://github.com/h4ckf0r0day/obscura/releases/download/v0.2.6/fake.tar.gz",
          sha256: "a".repeat(64),
          binaryRelPath: "obscura",
          kind: "tar.gz",
        },
        download: async () => {
          /* noop */
        },
        extract: async ({ runtimeDir, entry }) => {
          const bin = join(runtimeDir, entry.binaryRelPath);
          await mkdir(runtimeDir, { recursive: true });
          await writeFile(bin, "#!/bin/sh\necho obscura\n", "utf8");
          await chmod(bin, 0o755);
          return { binaryRelPath: entry.binaryRelPath };
        },
      });

      await svc.maybeAutoInstall();
      const st = svc.getStatus();
      assert.equal(st.obscuraRuntime, "ready");
      assert.ok(st.managedPath?.includes(paths.obscuraRuntimeDir));
      assert.equal(st.autoInstall.attempted, true);

      // Second silent must not re-download when ready.
      let downloads = 0;
      __setObscuraInstallHooksForTests({
        download: async () => {
          downloads += 1;
        },
      });
      await svc.maybeAutoInstall();
      assert.equal(downloads, 0);
    },
  );
});

test("V-OUT-33: resolve prefers ENVOYHOME_OBSCURA then BUNDLE then managed", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-obscura-res-"));
  const paths = homePaths(stateDir);
  __resetObscuraInstallForTests();
  const prevObscura = process.env.ENVOYHOME_OBSCURA;
  const prevBundle = process.env.ENVOYHOME_OBSCURA_BUNDLE;
  try {
    const owner = join(stateDir, "owner-obscura");
    const bundle = join(stateDir, "bundle-obscura");
    await writeFile(owner, "x", "utf8");
    await chmod(owner, 0o755);
    await writeFile(bundle, "y", "utf8");
    await chmod(bundle, 0o755);

    process.env.ENVOYHOME_OBSCURA = owner;
    process.env.ENVOYHOME_OBSCURA_BUNDLE = bundle;
    assert.equal(await resolveObscuraBinary(), owner);

    delete process.env.ENVOYHOME_OBSCURA;
    assert.equal(await resolveObscuraBinary(), bundle);

    delete process.env.ENVOYHOME_OBSCURA_BUNDLE;
    const svc = new ObscuraInstallService(paths, process.env);
    await svc.load();
    __setObscuraInstallHooksForTests({
      catalogEntry: {
        id: "darwin-arm64",
        version: OBSCURA_CATALOG_VERSION,
        approxBytes: 1,
        fileName: "f.tar.gz",
        url: "https://github.com/h4ckf0r0day/obscura/releases/download/v0.2.6/f.tar.gz",
        sha256: "b".repeat(64),
        binaryRelPath: "obscura",
        kind: "tar.gz",
      },
      download: async () => {},
      extract: async ({ runtimeDir, entry }) => {
        await mkdir(runtimeDir, { recursive: true });
        const bin = join(runtimeDir, entry.binaryRelPath);
        await writeFile(bin, "z", "utf8");
        await chmod(bin, 0o755);
        return { binaryRelPath: entry.binaryRelPath };
      },
    });
    await svc.startInstall();
    const managed = svc.managedBinaryPath();
    assert.ok(managed);
    assert.equal(await resolveObscuraBinary(), managed);
  } finally {
    if (prevObscura === undefined) delete process.env.ENVOYHOME_OBSCURA;
    else process.env.ENVOYHOME_OBSCURA = prevObscura;
    if (prevBundle === undefined) delete process.env.ENVOYHOME_OBSCURA_BUNDLE;
    else process.env.ENVOYHOME_OBSCURA_BUNDLE = prevBundle;
    __setObscuraInstallHooksForTests({ extract: null, download: null, catalogEntry: null });
    __resetObscuraInstallForTests();
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("V-OUT-33: install hint mentions auto-install / bundle", () => {
  const hint = obscuraInstallHint().toLowerCase();
  assert.ok(hint.includes("auto") || hint.includes("desktop") || hint.includes("boot"));
});
