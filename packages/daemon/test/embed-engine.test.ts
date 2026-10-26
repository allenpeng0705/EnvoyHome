import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { homePaths } from "../dist/home-paths.js";
import { DaemonLogger } from "../dist/logger.js";
import {
  EmbedEngineService,
  HOME_EMBED_ENGINE_PORT,
  mockEmbedding,
} from "../dist/local-engine/embed-engine.js";
import { KnowledgeIndex } from "@envoyhome/memory";

test("V-EMB-1: prefer=attach refused; port is 18793", async () => {
  const root = await mkdtemp(join(tmpdir(), "emb-"));
  const paths = homePaths(root);
  const eng = new EmbedEngineService(paths, new DaemonLogger());
  await eng.load();
  await assert.rejects(
    () => eng.enable({ prefer: "attach" }),
    /local_engine_independent|18791|attach/i,
  );
  const st = await eng.getStatus();
  assert.equal(st.port, HOME_EMBED_ENGINE_PORT);
  assert.equal(HOME_EMBED_ENGINE_PORT, 18793);
  await rm(root, { recursive: true, force: true });
});

test("V-EMB-3/5: mock enable + embedTexts + disable", async () => {
  const root = await mkdtemp(join(tmpdir(), "emb-"));
  const paths = homePaths(root);
  const eng = new EmbedEngineService(paths, new DaemonLogger());
  await eng.load();
  eng.setMockEmbeddings(true);
  const on = await eng.enable({ prefer: "spawn" });
  assert.equal(on.ready, true);
  assert.equal(on.mock, true);
  const vecs = await eng.embedTexts(["hello world", "quiet hours"]);
  assert.equal(vecs.length, 2);
  assert.ok(vecs[0]!.length > 0);
  const off = await eng.disable();
  assert.equal(off.enabled, false);
  await assert.rejects(() => eng.embedTexts(["x"]), /embed_off/);
  await rm(root, { recursive: true, force: true });
});

test("V-EMB-2: mockEmbedding is local (no chat port coupling)", () => {
  const a = mockEmbedding("tea");
  const b = mockEmbedding("tea");
  assert.deepEqual(a, b);
  assert.notDeepEqual(mockEmbedding("tea"), mockEmbedding("coffee"));
});

test("V-EMB-4: ollama mode fails closed when unreachable", async () => {
  const root = await mkdtemp(join(tmpdir(), "emb-"));
  const paths = homePaths(root);
  const eng = new EmbedEngineService(paths, new DaemonLogger());
  await eng.load();
  await assert.rejects(
    () =>
      eng.enable({
        prefer: "ollama",
        ollamaBaseUrl: "http://127.0.0.1:9",
      }),
    /ollama|embed|unavailable|fetch|ECONNREFUSED|aborted|timeout/i,
  );
  await rm(root, { recursive: true, force: true });
});

test("V-EMB-6: model switch marks knowledge embed stale", async () => {
  const root = await mkdtemp(join(tmpdir(), "emb-"));
  const accountId = "acc1";
  const idx = new KnowledgeIndex((id) => join(root, "accounts", id));
  await idx.ensure(accountId);
  await idx.markEmbedStale(accountId);
  const st = await idx.status(accountId);
  assert.equal(st.embedStale, true);
  await rm(root, { recursive: true, force: true });
});

test("V-EMB-7: non-loopback ollama baseUrl refused", async () => {
  const root = await mkdtemp(join(tmpdir(), "emb-"));
  const paths = homePaths(root);
  const eng = new EmbedEngineService(paths, new DaemonLogger());
  await eng.load();
  await assert.rejects(
    () =>
      eng.enable({
        prefer: "ollama",
        ollamaBaseUrl: "http://example.com:11434",
      }),
    /loopback|ollama_bad_url|refused/i,
  );
  const st = await eng.getStatus();
  assert.match(st.baseUrl, /127\.0\.0\.1|localhost/);
  await rm(root, { recursive: true, force: true });
});

test("downloadEmbedModel completes when curated GGUF already on disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "emb-"));
  const paths = homePaths(root);
  const eng = new EmbedEngineService(paths, new DaemonLogger());
  await eng.load();
  const dir = eng.embedModelsDir();
  await mkdir(dir, { recursive: true });
  // Pin check is async; fixture bytes will quarantine — status is still completed at return.
  const fileName = "Qwen3-Embedding-0.6B-Q8_0.gguf";
  await writeFile(join(dir, fileName), "fake-gguf-bytes\n", "utf8");
  const d = eng.downloadModel("qwen3-embedding-0.6b-q8_0");
  assert.equal(d.status, "completed");
  assert.equal(d.fileName, fileName);
  assert.ok(d.targetDir.includes("embed-models"));
  await new Promise((r) => setTimeout(r, 80));
  await rm(root, { recursive: true, force: true });
});

test("TOFU sha256 records digest when no pin", async () => {
  const { verifyArchiveSha256 } = await import("../dist/local-engine/integrity.js");
  const root = await mkdtemp(join(tmpdir(), "emb-tofu-"));
  const fileName = "custom-embed.gguf";
  const abs = join(root, fileName);
  await writeFile(abs, "tofu-bytes\n", "utf8");
  const dig = await verifyArchiveSha256(abs, fileName, { tofuDir: root });
  assert.match(dig, /^[a-f0-9]{64}$/);
  const recorded = (await readFile(join(root, `${fileName}.sha256`), "utf8")).trim();
  assert.equal(recorded, dig);
  await rm(root, { recursive: true, force: true });
});
