// Hugging Face browse + URL download allow-list (Design §8.5 / 2026-10-12q).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertHuggingFaceGgufUrl,
  downloadHuggingFaceGgufUrl,
  hfResolveUrl,
  listHuggingFaceGgufFiles,
  searchHuggingFaceGgufRepos,
} from "../dist/index.js";

test("assertHuggingFaceGgufUrl accepts resolve + normalizes blob file pages", () => {
  const ok = assertHuggingFaceGgufUrl(
    "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf",
  );
  assert.equal(ok.fileName, "Qwen3.5-0.8B-Q4_K_M.gguf");
  const fromBlob = assertHuggingFaceGgufUrl(
    "https://huggingface.co/org/repo/blob/main/weights/a.gguf?download=true",
  );
  assert.equal(fromBlob.fileName, "a.gguf");
  assert.match(fromBlob.url.pathname, /\/resolve\/main\/weights\/a\.gguf$/);
  assert.throws(() => assertHuggingFaceGgufUrl("https://evil.example/x.gguf"), /bad_url/);
  assert.throws(() => assertHuggingFaceGgufUrl("http://huggingface.co/a/b.gguf"), /bad_url/);
  assert.throws(
    () => assertHuggingFaceGgufUrl("https://huggingface.co/org/repo/resolve/main/model.bin"),
    /bad_url/,
  );
  assert.throws(
    () => assertHuggingFaceGgufUrl("https://huggingface.co/org/repo"),
    /file URL|bad_url/,
  );
});

test("searchHuggingFaceGgufRepos uses Hub API + filter=gguf", async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string | URL) => {
    calls.push(String(url));
    return new Response(
      JSON.stringify([
        { id: "unsloth/Qwen3.5-0.8B-GGUF", downloads: 10, gated: false },
        { id: "bartowski/gemma-gguf", downloads: 5, gated: "auto" },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const hits = await searchHuggingFaceGgufRepos("qwen", { fetchImpl: fetchImpl as typeof fetch });
  assert.match(calls[0]!, /filter=gguf/);
  assert.match(calls[0]!, /search=qwen/);
  assert.equal(hits.length, 2);
  assert.equal(hits[1]!.gated, true);
});

test("listHuggingFaceGgufFiles uses model siblings and sorts smaller first", async () => {
  const fetchImpl = async (url: string | URL) => {
    assert.match(String(url), /\/api\/models\/org\/repo$/);
    return new Response(
      JSON.stringify({
        id: "org/repo",
        siblings: [
          { rfilename: "README.md", size: 10 },
          { rfilename: "model-Q8.gguf", size: 2_000_000_000 },
          { rfilename: "model-Q4_K_M.gguf", size: 1_000_000_000 },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const files = await listHuggingFaceGgufFiles("org/repo", {
    fetchImpl: fetchImpl as typeof fetch,
  });
  assert.equal(files.length, 2);
  assert.equal(files[0]!.path, "model-Q4_K_M.gguf");
  assert.equal(files[1]!.path, "model-Q8.gguf");
  assert.equal(files[0]!.url, hfResolveUrl("org/repo", "model-Q4_K_M.gguf"));
});

test("downloadHuggingFaceGgufUrl refuses non-HF redirect hops", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-hf-redir-"));
  try {
    const modelsDir = join(stateDir, "models");
    const fetchImpl = async () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://evil.example/steal.gguf" },
      });
    await assert.rejects(
      () =>
        downloadHuggingFaceGgufUrl(
          modelsDir,
          "https://huggingface.co/org/repo/resolve/main/a.gguf",
          { fetchImpl: fetchImpl as typeof fetch },
        ),
      /bad_url|refused/,
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("downloadHuggingFaceGgufUrl writes .gguf under modelsDir", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-hf-dl-"));
  try {
    const modelsDir = join(stateDir, "models");
    const payload = Buffer.alloc(1_100_000, 7);
    const fetchImpl = async () =>
      new Response(payload, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });
    const result = await downloadHuggingFaceGgufUrl(
      modelsDir,
      "https://huggingface.co/org/repo/resolve/main/pick-me.gguf",
      { fetchImpl: fetchImpl as typeof fetch },
    );
    assert.equal(result.fileName, "pick-me.gguf");
    assert.equal(result.bytes, payload.length);
    const onDisk = await readFile(join(modelsDir, "pick-me.gguf"));
    assert.equal(onDisk.length, payload.length);
    // Second call is a no-op hit on existing file.
    const again = await downloadHuggingFaceGgufUrl(
      modelsDir,
      "https://huggingface.co/org/repo/resolve/main/pick-me.gguf",
      { fetchImpl: fetchImpl as typeof fetch },
    );
    assert.equal(again.bytes, payload.length);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
