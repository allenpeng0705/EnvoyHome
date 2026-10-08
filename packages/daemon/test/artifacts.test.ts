// B11 — V-OUT-1 artifact URLs + serve handler.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
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
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
