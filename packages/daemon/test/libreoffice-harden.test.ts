// P2-K8 harden: redirects, hash/size, path jail, install race, promote predicate.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { homePaths } from "../dist/home-paths.js";
import {
  LibreOfficeInstallService,
  __downloadLibreOfficeForTests,
  __resetLibreOfficeInstallForTests,
  __setLibreOfficeInstallHooksForTests,
  fetchLibreOfficeAllowingRedirects,
  resolveManagedSofficePath,
} from "../dist/libreoffice-install.js";
import { LIBREOFFICE_CATALOG_VERSION } from "../dist/libreoffice-catalog.js";
import { canPromoteKnowledgePath } from "../dist/promote-paths.js";
import { __resetLibreOfficeForTests } from "../dist/document-export-lo.js";

test("fetchLibreOfficeAllowingRedirects: TDF origin + https mirror hop", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("documentfoundation.org")) {
      return new Response(null, {
        status: 302,
        headers: { Location: "https://mirror.example.org/lo.dmg" },
      });
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  }) as typeof fetch;

  const res = await fetchLibreOfficeAllowingRedirects(
    "https://download.documentfoundation.org/lo.dmg",
    fetchImpl,
    new AbortController().signal,
  );
  assert.equal(res.status, 200);
  assert.deepEqual(calls, [
    "https://download.documentfoundation.org/lo.dmg",
    "https://mirror.example.org/lo.dmg",
  ]);
});

test("fetchLibreOfficeAllowingRedirects: refuses non-TDF origin and http redirect", async () => {
  await assert.rejects(
    () =>
      fetchLibreOfficeAllowingRedirects(
        "https://evil.example/lo.dmg",
        fetch,
        new AbortController().signal,
      ),
    /bad_url|origin/,
  );

  const fetchImpl = (async () =>
    new Response(null, {
      status: 302,
      headers: { Location: "http://mirror.example.org/lo.dmg" },
    })) as typeof fetch;
  await assert.rejects(
    () =>
      fetchLibreOfficeAllowingRedirects(
        "https://download.documentfoundation.org/lo.dmg",
        fetchImpl,
        new AbortController().signal,
      ),
    /https|refused/,
  );
});

test("fetchLibreOfficeAllowingRedirects: refuses private/link-local redirect hosts", async () => {
  for (const target of [
    "https://127.0.0.1/lo.dmg",
    "https://10.0.0.5/lo.dmg",
    "https://192.168.1.1/lo.dmg",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/lo.dmg",
  ]) {
    const fetchImpl = (async () =>
      new Response(null, {
        status: 302,
        headers: { Location: target },
      })) as typeof fetch;
    await assert.rejects(
      () =>
        fetchLibreOfficeAllowingRedirects(
          "https://download.documentfoundation.org/lo.dmg",
          fetchImpl,
          new AbortController().signal,
        ),
      /private|link-local|refused/,
    );
  }
});

test("resolveManagedSofficePath: jails .. and absolute paths", () => {
  const root = "/tmp/eh-lo-runtime";
  assert.equal(
    resolveManagedSofficePath(root, "LibreOffice.app/Contents/MacOS/soffice"),
    join(root, "LibreOffice.app/Contents/MacOS/soffice"),
  );
  assert.throws(() => resolveManagedSofficePath(root, "../etc/passwd"), /bad_path/);
  assert.throws(() => resolveManagedSofficePath(root, "/usr/bin/soffice"), /bad_path/);
  assert.throws(() => resolveManagedSofficePath(root, "C:\\Windows\\soffice.exe"), /bad_path/);
});

test("download verifies sha256 and size cap", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eh-lo-dl-"));
  const payload = Buffer.from("hello-lo-archive");
  const digest = createHash("sha256").update(payload).digest("hex");
  const destOk = join(dir, "ok.dmg");
  const destBad = join(dir, "bad.dmg");
  const destBig = join(dir, "big.dmg");

  const fetchBody = (body: Uint8Array, status = 200) =>
    (async () => new Response(body, { status })) as typeof fetch;

  await __downloadLibreOfficeForTests({
    url: "https://download.documentfoundation.org/ok.dmg",
    destPath: destOk,
    signal: new AbortController().signal,
    maxBytes: 1024,
    expectedSha256: digest,
    onProgress: () => undefined,
    fetchImpl: fetchBody(payload),
  });
  assert.equal(
    createHash("sha256").update(await readFile(destOk)).digest("hex"),
    digest,
  );

  await assert.rejects(
    () =>
      __downloadLibreOfficeForTests({
        url: "https://download.documentfoundation.org/bad.dmg",
        destPath: destBad,
        signal: new AbortController().signal,
        maxBytes: 1024,
        expectedSha256: digest,
        onProgress: () => undefined,
        fetchImpl: fetchBody(Buffer.from("tampered")),
      }),
    /hash_mismatch/,
  );

  const big = Buffer.alloc(64);
  await assert.rejects(
    () =>
      __downloadLibreOfficeForTests({
        url: "https://download.documentfoundation.org/big.dmg",
        destPath: destBig,
        signal: new AbortController().signal,
        maxBytes: 16,
        expectedSha256: createHash("sha256").update(big).digest("hex"),
        onProgress: () => undefined,
        fetchImpl: fetchBody(big),
      }),
    /size cap/,
  );

  await rm(dir, { recursive: true, force: true });
});

test("startInstall sync lock: concurrent calls download once", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-lo-race-"));
  __resetLibreOfficeInstallForTests();
  __resetLibreOfficeForTests();
  const paths = homePaths(stateDir);
  const svc = new LibreOfficeInstallService(paths, {
    ...process.env,
    ENVOYHOME_LIBREOFFICE_AUTO: "0",
    PATH: "",
  });
  await svc.load();
  let downloads = 0;
  try {
    __setLibreOfficeInstallHooksForTests({
      catalogEntry: {
        id: "darwin-arm64",
        version: LIBREOFFICE_CATALOG_VERSION,
        approxBytes: 10,
        fileName: "race.dmg",
        url: "https://download.documentfoundation.org/race.dmg",
        sha256: "f".repeat(64),
        sofficeRelPath: "LibreOffice.app/Contents/MacOS/soffice",
        kind: "dmg",
      },
      download: async ({ onProgress }) => {
        downloads++;
        onProgress(1, 10);
        await new Promise((r) => setTimeout(r, 120));
        onProgress(10, 10);
      },
      extract: async ({ runtimeDir, entry }) => {
        const bin = join(runtimeDir, entry.sofficeRelPath);
        await mkdir(join(bin, ".."), { recursive: true });
        await writeFile(
          bin,
          `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "LibreOffice race"; exit 0; fi\nexit 0\n`,
          "utf8",
        );
        await chmod(bin, 0o755);
        return { sofficeRelPath: entry.sofficeRelPath };
      },
    });
    const a = svc.startInstall();
    const b = svc.startInstall();
    await Promise.all([a, b]);
    for (let i = 0; i < 60; i++) {
      const st = await svc.getStatus();
      if (st.libreOfficeRuntime === "ready" || st.libreOfficeRuntime === "failed") break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(downloads, 1);
    assert.equal((await svc.getStatus()).libreOfficeRuntime, "ready");
  } finally {
    await svc.cancelInstall().catch(() => undefined);
    __setLibreOfficeInstallHooksForTests({
      extract: null,
      download: null,
      catalogEntry: null,
    });
    __resetLibreOfficeInstallForTests();
    __resetLibreOfficeForTests();
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("canPromoteKnowledgePath: shared affordance predicate", () => {
  assert.equal(canPromoteKnowledgePath("output/extracts/a.md"), true);
  assert.equal(canPromoteKnowledgePath("uploads/note.markdown"), true);
  assert.equal(canPromoteKnowledgePath("documents/x.md"), true);
  assert.equal(canPromoteKnowledgePath("output/exports/out.md"), true);
  assert.equal(canPromoteKnowledgePath("uploads/scan.extract.md"), true);
  assert.equal(canPromoteKnowledgePath("knowledge/already.md"), false);
  assert.equal(canPromoteKnowledgePath("output/exports/out.docx"), false);
  assert.equal(canPromoteKnowledgePath("../escape.md"), false);
});

test("extract/install refuses jailed escape via sofficeRelPath", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-lo-jail-"));
  __resetLibreOfficeInstallForTests();
  __resetLibreOfficeForTests();
  const paths = homePaths(stateDir);
  const svc = new LibreOfficeInstallService(paths, {
    ...process.env,
    ENVOYHOME_LIBREOFFICE_AUTO: "0",
    PATH: "",
  });
  await svc.load();
  try {
    __setLibreOfficeInstallHooksForTests({
      catalogEntry: {
        id: "darwin-arm64",
        version: LIBREOFFICE_CATALOG_VERSION,
        approxBytes: 10,
        fileName: "jail.dmg",
        url: "https://download.documentfoundation.org/jail.dmg",
        sha256: "1".repeat(64),
        sofficeRelPath: "LibreOffice.app/Contents/MacOS/soffice",
        kind: "dmg",
      },
      download: async ({ onProgress }) => {
        onProgress(10, 10);
      },
      extract: async () => ({ sofficeRelPath: "../../outside-soffice" }),
    });
    await svc.startInstall();
    for (let i = 0; i < 40; i++) {
      const st = await svc.getStatus();
      if (st.libreOfficeRuntime === "failed" || st.libreOfficeRuntime === "ready") break;
      await new Promise((r) => setTimeout(r, 25));
    }
    const st = await svc.getStatus();
    assert.equal(st.libreOfficeRuntime, "failed");
    assert.match(String(st.lastError), /bad_path|jail/);
  } finally {
    await svc.cancelInstall().catch(() => undefined);
    __setLibreOfficeInstallHooksForTests({
      extract: null,
      download: null,
      catalogEntry: null,
    });
    __resetLibreOfficeInstallForTests();
    __resetLibreOfficeForTests();
    await rm(stateDir, { recursive: true, force: true });
  }
});
