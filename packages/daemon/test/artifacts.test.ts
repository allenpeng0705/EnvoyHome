// B11 — V-OUT-1 artifact URLs + serve handler.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon, type RunningDaemon } from "../dist/index.js";
import { signArtifactToken, verifyArtifactToken } from "../dist/artifact-signer.js";
import { parseArtifactRequest } from "../dist/artifact-handler.js";
import { __resetActiveXForTests } from "@envoyhome/test-utils";

const daemons: RunningDaemon[] = [];

after(async () => {
  __resetActiveXForTests();
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

test("V-OUT-1: expired token rejected; valid token serves file", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-art-"));
  const daemon = await startDaemon({
    config: {
      stateDir,
      wsPort: 0,
      httpPort: 0,
      hatchApiKey: "k",
      publicBaseUrl: "http://127.0.0.1:4781",
    },
    packageVersion: "0.0.0-test",
  });
  daemons.push(daemon);

  try {
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
    const outDir = join(stateDir, "accounts", "alice", "files", "output");
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "report.txt"), "hello artifact", "utf8");

    const minted = await daemon.artifacts.mintUrl({
      accountId: "alice",
      path: "output/report.txt",
      ttlSec: 3600,
    });
    assert.ok(minted.url.includes("/artifacts/alice/"));

    const secret = await daemon.artifacts.ensureSecret();
    const token = minted.url.split("/artifacts/alice/")[1]!;
    const expired = signArtifactToken(secret, {
      accountId: "alice",
      expUnix: Math.floor(Date.now() / 1000) - 10,
      path: "output/report.txt",
    });
    assert.equal(verifyArtifactToken(secret, expired).ok, false);

    const parsed = parseArtifactRequest(`/artifacts/alice/${token}`);
    assert.ok(parsed);

    const port = daemon.config.httpPort;
    const live = await fetch(`http://127.0.0.1:${port}/artifacts/alice/${token}`);
    assert.equal(live.status, 200);
    assert.equal(await live.text(), "hello artifact");

    const stale = await fetch(`http://127.0.0.1:${port}/artifacts/alice/${expired}`);
    assert.equal(stale.status, 403);

    // Mesh-first open (no publicBaseUrl required).
    const body = await daemon.artifacts.getContent("alice", "output/report.txt");
    assert.equal(body.encoding, "utf8");
    assert.equal(body.text, "hello artifact");
    assert.equal(body.mimeType, "text/plain");

    const written = await daemon.artifacts.writeText(
      "alice",
      "output/replies/turn-1.md",
      "# Long reply\n\nbody",
    );
    assert.equal(written, "output/replies/turn-1.md");
    const md = await daemon.artifacts.getContent("alice", written);
    assert.equal(md.mimeType, "text/markdown");
    assert.equal(md.text, "# Long reply\n\nbody");

    // Nested exports appear in listArtifacts (Design §9.5d).
    const exportsDir = join(outDir, "exports");
    await mkdir(exportsDir, { recursive: true });
    await writeFile(join(exportsDir, "brief.docx"), Buffer.from("PK\x03\x04fake"));
    const listed = await daemon.artifacts.listArtifacts("alice");
    const paths = listed.map((r) => r.path);
    assert.ok(paths.includes("output/exports/brief.docx"));
    assert.ok(paths.includes("output/replies/turn-1.md"));
    const bin = await daemon.artifacts.getContent("alice", "output/exports/brief.docx");
    assert.equal(bin.encoding, "base64");
    assert.match(bin.mimeType, /wordprocessingml/);

    // V-OUT-2: workspace/… open-by-path; not listed in Shared files.
    const hostDir = await mkdtemp(join(tmpdir(), "envoyhome-ws-"));
    await writeFile(join(hostDir, "desk-note.md"), "# from host\n", "utf8");
    await daemon.accounts.setWorkspace({
      accountId: "alice",
      hostPath: hostDir,
      mode: "ro",
      ownerAccountId: "alice",
    });
    const wsBody = await daemon.artifacts.getContent("alice", "workspace/desk-note.md");
    assert.equal(wsBody.encoding, "utf8");
    assert.equal(wsBody.text, "# from host\n");
    const listedAfter = await daemon.artifacts.listArtifacts("alice");
    assert.ok(!listedAfter.some((r) => r.path.startsWith("workspace/")));
    await assert.rejects(
      () => daemon.artifacts.mintUrl({ accountId: "alice", path: "workspace/desk-note.md" }),
      /mesh-open only|workspace/,
    );
    await assert.rejects(
      () => daemon.artifacts.getContent("alice", "workspace/../etc/passwd"),
      /bad_params|PathJail|refused|escape|jail/i,
    );

    // share/ open deferred (Design §4.2 / 2026-10-18ac).
    await assert.rejects(
      () => daemon.artifacts.getContent("alice", "share/note.md"),
      /share\/|deferred|bad_params/i,
    );

    // Cap checked via stat before read (refuse oversized without loading).
    const bigPath = join(outDir, "too-big.bin");
    const fh = await open(bigPath, "w");
    try {
      await fh.truncate(8 * 1024 * 1024 + 1);
    } finally {
      await fh.close();
    }
    await assert.rejects(
      () => daemon.artifacts.getContent("alice", "output/too-big.bin"),
      /8 MiB|exceeds/,
    );

    // Directory is not a regular file.
    await assert.rejects(
      () => daemon.artifacts.getContent("alice", "output/exports"),
      /not a regular file|bad_params/i,
    );

    // V-OUT-2 / R3: stale filesystem-root workspace on non-Owner seat fails closed.
    await daemon.accounts.create({ accountId: "bob", displayName: "Bob" });
    const bobWs = join(stateDir, "accounts", "bob", "workspace.json");
    await mkdir(join(stateDir, "accounts", "bob"), { recursive: true });
    await writeFile(
      bobWs,
      JSON.stringify({
        hostPath: process.platform === "win32" ? "C:\\" : "/",
        mode: "ro",
        updatedAt: new Date().toISOString(),
      }),
      "utf8",
    );
    await assert.rejects(
      () => daemon.artifacts.getContent("bob", "workspace/etc/hosts"),
      /workspace root unset|bad_params|refused/i,
    );

    // V-OUT-4: File Explore listSandboxEntries.
    const rootsListing = await daemon.artifacts.listSandboxEntries("alice");
    assert.equal(rootsListing.path, "");
    assert.ok(rootsListing.roots.includes("documents"));
    assert.ok(rootsListing.roots.includes("workspace"));
    assert.ok(rootsListing.entries.every((e) => e.kind === "dir"));
    assert.ok(rootsListing.entries.some((e) => e.path === "workspace"));

    const docsDir = join(stateDir, "accounts", "alice", "files", "documents");
    await mkdir(docsDir, { recursive: true });
    await writeFile(join(docsDir, "note.md"), "hi", "utf8");
    await mkdir(join(docsDir, "subdir"), { recursive: true });
    const docsListing = await daemon.artifacts.listSandboxEntries("alice", "documents");
    assert.equal(docsListing.path, "documents");
    assert.equal(docsListing.parent, "");
    assert.ok(docsListing.entries.some((e) => e.path === "documents/note.md" && e.kind === "file"));
    assert.ok(docsListing.entries.some((e) => e.path === "documents/subdir" && e.kind === "dir"));

    const wsListing = await daemon.artifacts.listSandboxEntries("alice", "workspace");
    assert.equal(wsListing.path, "workspace");
    assert.ok(wsListing.entries.some((e) => e.path === "workspace/desk-note.md"));

    await assert.rejects(
      () => daemon.artifacts.listSandboxEntries("alice", "share"),
      /share\/|deferred|bad_params/i,
    );
    await assert.rejects(
      () => daemon.artifacts.listSandboxEntries("bob", "workspace"),
      /workspace root unset|bad_params|refused/i,
    );
    const bobRoots = await daemon.artifacts.listSandboxEntries("bob");
    assert.ok(!bobRoots.roots.includes("workspace"));

    await rm(hostDir, { recursive: true, force: true });
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
