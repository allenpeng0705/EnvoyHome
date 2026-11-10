// Design §9.5b / P2-K8 — managed LibreOffice auto-install.

import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { homePaths } from "../dist/home-paths.js";
import {
  LibreOfficeInstallService,
  __resetLibreOfficeInstallForTests,
  __setLibreOfficeInstallHooksForTests,
} from "../dist/libreoffice-install.js";
import { LIBREOFFICE_CATALOG_VERSION } from "../dist/libreoffice-catalog.js";
import { exportDocument } from "../dist/document-export.js";
import {
  clearLibreOfficeProbeCache,
  __resetLibreOfficeForTests,
} from "../dist/document-export-lo.js";

const SAMPLE_MD = `# Hello\n\nPrint me.\n`;

async function withService(
  env: NodeJS.ProcessEnv,
  fn: (svc: LibreOfficeInstallService, paths: ReturnType<typeof homePaths>) => Promise<void>,
): Promise<void> {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-lo-inst-"));
  __resetLibreOfficeInstallForTests();
  __resetLibreOfficeForTests();
  clearLibreOfficeProbeCache();
  const paths = homePaths(stateDir);
  const svc = new LibreOfficeInstallService(paths, env);
  await svc.load();
  try {
    await fn(svc, paths);
  } finally {
    await svc.cancelInstall().catch(() => undefined);
    __setLibreOfficeInstallHooksForTests({
      extract: null,
      download: null,
      catalogEntry: null,
    });
    __resetLibreOfficeInstallForTests();
    __resetLibreOfficeForTests();
    await rm(stateDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

test("V-OFFICE-13: ENVOYHOME_LIBREOFFICE_AUTO=0 skips silent auto", async () => {
  await withService(
    { ...process.env, ENVOYHOME_LIBREOFFICE_AUTO: "0", ENVOYHOME_LIBREOFFICE: "/no/such/soffice" },
    async (svc) => {
      await svc.maybeAutoInstall();
      const st = await svc.getStatus();
      assert.equal(st.autoInstall.enabled, false);
      assert.equal(st.libreOfficeRuntime, "missing");
      assert.equal(st.autoInstall.attempted, false);
    },
  );
});

test("V-OFFICE-12: silent auto starts download; export stays JS during download", async () => {
  let downloadStarted = false;
  await withService(
    { ...process.env, ENVOYHOME_LIBREOFFICE_AUTO: "1", ENVOYHOME_LIBREOFFICE: "/no/such/soffice", PATH: "" },
    async (svc) => {
      __setLibreOfficeInstallHooksForTests({
        catalogEntry: {
          id: "darwin-arm64",
          version: LIBREOFFICE_CATALOG_VERSION,
          approxBytes: 1000,
          fileName: "fake.dmg",
          url: "https://download.documentfoundation.org/fake.dmg",
          sha256: "a".repeat(64),
          sofficeRelPath: "LibreOffice.app/Contents/MacOS/soffice",
          kind: "dmg",
        },
        download: async ({ onProgress, signal }) => {
          downloadStarted = true;
          onProgress(10, 1000);
          await new Promise((r) => setTimeout(r, 80));
          if (signal.aborted) throw new Error("aborted");
          onProgress(1000, 1000);
        },
        extract: async ({ runtimeDir, entry }) => {
          const bin = join(runtimeDir, entry.sofficeRelPath);
          await mkdir(join(bin, ".."), { recursive: true });
          await writeFile(
            bin,
            `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "LibreOffice ${LIBREOFFICE_CATALOG_VERSION} managed"; exit 0; fi\nexit 0\n`,
            "utf8",
          );
          await chmod(bin, 0o755);
          return { sofficeRelPath: entry.sofficeRelPath };
        },
      });

      await svc.maybeAutoInstall();
      // Yield so download hook can mark started.
      await new Promise((r) => setTimeout(r, 20));
      let st = await svc.getStatus();
      assert.ok(
        st.libreOfficeRuntime === "downloading" || st.libreOfficeRuntime === "ready",
        `unexpected runtime ${st.libreOfficeRuntime}`,
      );
      if (st.libreOfficeRuntime === "downloading") {
        assert.ok(downloadStarted);
        const exp = await exportDocument("pdf", SAMPLE_MD, {
          engine: "auto",
          env: { ENVOYHOME_LIBREOFFICE: "/no/such/soffice", PATH: "" },
        });
        assert.equal(exp.engine, "js");
        assert.equal(exp.buffer.subarray(0, 4).toString("utf8"), "%PDF");
      }

      // Wait for install to finish.
      for (let i = 0; i < 80; i++) {
        st = await svc.getStatus();
        if (st.libreOfficeRuntime === "ready" || st.libreOfficeRuntime === "failed") break;
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.equal(st.libreOfficeRuntime, "ready");
      assert.equal(st.installSource, "managed");
      assert.ok(st.autoInstall.attempted);
      assert.ok(downloadStarted);
    },
  );
});

test("V-OFFICE-13: failed persists; decline stops auto; Install retries", async () => {
  await withService(
    { ...process.env, ENVOYHOME_LIBREOFFICE_AUTO: "1", ENVOYHOME_LIBREOFFICE: "/no/such/soffice", PATH: "" },
    async (svc, paths) => {
      __setLibreOfficeInstallHooksForTests({
        catalogEntry: {
          id: "darwin-arm64",
          version: LIBREOFFICE_CATALOG_VERSION,
          approxBytes: 100,
          fileName: "fail.dmg",
          url: "https://download.documentfoundation.org/fail.dmg",
          sha256: "b".repeat(64),
          sofficeRelPath: "x",
          kind: "dmg",
        },
        download: async () => {
          throw new Error("envoyhome.libreoffice_download_failed: network");
        },
      });
      await svc.maybeAutoInstall();
      for (let i = 0; i < 40; i++) {
        const st = await svc.getStatus();
        if (st.libreOfficeRuntime === "failed") break;
        await new Promise((r) => setTimeout(r, 25));
      }
      let st = await svc.getStatus();
      assert.equal(st.libreOfficeRuntime, "failed");
      assert.match(String(st.lastError), /download_failed|network/);

      // Silent must not retry on second maybeAutoInstall.
      let downloads = 0;
      __setLibreOfficeInstallHooksForTests({
        catalogEntry: {
          id: "darwin-arm64",
          version: LIBREOFFICE_CATALOG_VERSION,
          approxBytes: 100,
          fileName: "ok.dmg",
          url: "https://download.documentfoundation.org/ok.dmg",
          sha256: "c".repeat(64),
          sofficeRelPath: "LibreOffice.app/Contents/MacOS/soffice",
          kind: "dmg",
        },
        download: async ({ onProgress }) => {
          downloads++;
          onProgress(100, 100);
        },
        extract: async ({ runtimeDir, entry }) => {
          const bin = join(runtimeDir, entry.sofficeRelPath);
          await mkdir(join(bin, ".."), { recursive: true });
          await writeFile(
            bin,
            `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "LibreOffice managed"; exit 0; fi\nexit 0\n`,
            "utf8",
          );
          await chmod(bin, 0o755);
          return { sofficeRelPath: entry.sofficeRelPath };
        },
      });
      await svc.maybeAutoInstall();
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(downloads, 0);

      // Owner Install retries.
      await svc.startInstall();
      for (let i = 0; i < 40; i++) {
        st = await svc.getStatus();
        if (st.libreOfficeRuntime === "ready") break;
        await new Promise((r) => setTimeout(r, 25));
      }
      assert.equal(st.libreOfficeRuntime, "ready");
      assert.ok(downloads >= 1);

      // Decline preference
      await svc.setPreference({ declined: true, auto: false });
      st = await svc.getStatus();
      assert.equal(st.autoInstall.declined, true);
      assert.equal(st.autoInstall.enabled, false);

      const raw = JSON.parse(await readFile(paths.libreOfficeInstallJson, "utf8"));
      assert.equal(raw.declined, true);
    },
  );
});

test("V-OFFICE-14: managed ready → export engine libreoffice", async () => {
  await withService(
    { ...process.env, ENVOYHOME_LIBREOFFICE_AUTO: "0", PATH: "/bin:/usr/bin" },
    async (svc) => {
      __setLibreOfficeInstallHooksForTests({
        catalogEntry: {
          id: "darwin-arm64",
          version: LIBREOFFICE_CATALOG_VERSION,
          approxBytes: 50,
          fileName: "print.dmg",
          url: "https://download.documentfoundation.org/print.dmg",
          sha256: "d".repeat(64),
          sofficeRelPath: "LibreOffice.app/Contents/MacOS/soffice",
          kind: "dmg",
        },
        download: async ({ destPath, onProgress }) => {
          onProgress(50, 50);
          await writeFile(destPath, "fake-archive", "utf8");
        },
        extract: async ({ runtimeDir, entry }) => {
          const bin = join(runtimeDir, entry.sofficeRelPath);
          await mkdir(join(bin, ".."), { recursive: true });
          // Fake soffice: --version + convert-to writes magic pdf
          await writeFile(
            bin,
            `#!/bin/sh
set -e
if [ "$1" = "--version" ]; then
  echo "LibreOffice ${LIBREOFFICE_CATALOG_VERSION} managed"
  exit 0
fi
outdir=""
convert=""
infile=""
while [ $# -gt 0 ]; do
  case "$1" in
    --outdir) outdir="$2"; shift 2 ;;
    --convert-to) convert="$2"; shift 2 ;;
    --headless|--norestore|--nolockcheck|--nodefault|--nofirststartwizard) shift ;;
    -env:UserInstallation=*) shift ;;
    *) infile="$1"; shift ;;
  esac
done
ext=$(echo "$convert" | cut -d: -f1)
base=$(basename "$infile")
stem=\${base%.*}
out="$outdir/$stem.$ext"
printf '%%PDF-1.4 managed' > "$out"
exit 0
`,
            "utf8",
          );
          await chmod(bin, 0o755);
          return { sofficeRelPath: entry.sofficeRelPath };
        },
      });

      await svc.startInstall();
      let st = await svc.getStatus();
      for (let i = 0; i < 40; i++) {
        st = await svc.getStatus();
        if (st.libreOfficeRuntime === "ready") break;
        await new Promise((r) => setTimeout(r, 25));
      }
      assert.equal(st.libreOfficeRuntime, "ready");
      const managed = svc.managedSofficePath();
      assert.ok(managed);

      clearLibreOfficeProbeCache();
      const exp = await exportDocument("pdf", SAMPLE_MD, {
        engine: "auto",
        env: { ENVOYHOME_LIBREOFFICE: managed!, PATH: "/bin:/usr/bin" },
      });
      assert.equal(exp.engine, "libreoffice");
      assert.match(exp.buffer.toString("utf8"), /%PDF/);
    },
  );
});
