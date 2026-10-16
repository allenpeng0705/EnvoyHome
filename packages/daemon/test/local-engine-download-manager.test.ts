// Resumable GGUF downloads: progress, Stop (.partial), Continue (Range 206).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelDownloadManager } from "../dist/local-engine/download-manager.js";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function streamFromChunks(
  chunks: Uint8Array[],
  pauseMs = 0,
): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      if (pauseMs > 0) await delay(pauseMs);
      controller.enqueue(chunks[i]!);
      i += 1;
    },
  });
}

/** ReadableStream that emits one chunk then waits until AbortSignal aborts. */
function streamThenHang(chunk: Uint8Array, signal: AbortSignal): ReadableStream<Uint8Array> {
  let sent = false;
  return new ReadableStream({
    async pull(controller) {
      if (!sent) {
        sent = true;
        controller.enqueue(chunk);
        return;
      }
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      try {
        controller.error(Object.assign(new Error("aborted"), { name: "AbortError" }));
      } catch {
        // already closed
      }
    },
    cancel() {
      // ok
    },
  });
}

test("ModelDownloadManager emits progress and completes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eh-dlm-ok-"));
  try {
    const mgr = new ModelDownloadManager(dir);
    const events: string[] = [];
    mgr.setProgressEmit((j) => events.push(`${j.status}:${j.bytesReceived}`));
    const payload = Buffer.alloc(1_200_000, 0x61);
    const fetchImpl = (async () =>
      ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-length": String(payload.length) }),
        body: streamFromChunks([payload]),
      }) as Response) as typeof fetch;
    const snap = mgr.start({
      url: "https://huggingface.co/org/repo/resolve/main/demo.gguf",
      fileName: "demo.gguf",
      modelId: "org/demo",
      approxBytes: payload.length,
      fetchImpl,
    });
    assert.equal(snap.status, "downloading");
    for (let i = 0; i < 50; i++) {
      const job = mgr.get("demo.gguf");
      if (job?.status === "completed") break;
      await delay(50);
    }
    const done = mgr.get("demo.gguf");
    assert.equal(done?.status, "completed");
    assert.ok((done?.bytesReceived ?? 0) >= 1_000_000);
    assert.ok(events.some((e) => e.startsWith("completed:")));
    const st = await stat(join(dir, "demo.gguf"));
    assert.ok(st.size >= 1_000_000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Stop keeps .partial; Continue resumes with Range 206", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eh-dlm-resume-"));
  try {
    const mgr = new ModelDownloadManager(dir);
    const total = 1_500_000;
    const part1 = Buffer.alloc(600_000, 0x61);
    const part2 = Buffer.alloc(total - 600_000, 0x62);
    let rangeCalls = 0;

    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      const signal = init?.signal;
      const rawHeaders = init?.headers;
      const range =
        rawHeaders && typeof rawHeaders === "object" && !Array.isArray(rawHeaders)
          ? "Range" in rawHeaders
            ? String((rawHeaders as Record<string, string>).Range || "")
            : rawHeaders instanceof Headers
              ? rawHeaders.get("Range") || ""
              : ""
          : "";
      if (range) {
        rangeCalls += 1;
        assert.match(range, /^bytes=600000-/);
        return {
          ok: true,
          status: 206,
          headers: new Headers({
            "content-length": String(part2.length),
            "content-range": `bytes 600000-${total - 1}/${total}`,
          }),
          body: streamFromChunks([part2]),
        } as Response;
      }
      const hangSignal = signal ?? new AbortController().signal;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-length": String(total) }),
        body: streamThenHang(part1, hangSignal),
      } as Response;
    }) as typeof fetch;

    mgr.start({
      url: "https://huggingface.co/org/repo/resolve/main/resume.gguf",
      fileName: "resume.gguf",
      approxBytes: total,
      fetchImpl,
    });

    for (let i = 0; i < 40; i++) {
      const j = mgr.get("resume.gguf");
      if ((j?.bytesReceived ?? 0) >= 600_000) break;
      await delay(50);
    }
    assert.ok((mgr.get("resume.gguf")?.bytesReceived ?? 0) >= 600_000);

    const paused = await mgr.cancel("resume.gguf");
    assert.equal(paused.status, "paused");
    const partialSt = await stat(join(dir, "resume.gguf.partial"));
    assert.equal(partialSt.size, 600_000);

    mgr.start({
      url: "https://huggingface.co/org/repo/resolve/main/resume.gguf",
      fileName: "resume.gguf",
      approxBytes: total,
      fetchImpl,
    });

    for (let i = 0; i < 80; i++) {
      if (mgr.get("resume.gguf")?.status === "completed") break;
      await delay(50);
    }
    assert.equal(mgr.get("resume.gguf")?.status, "completed");
    assert.ok(rangeCalls >= 1);
    const final = await readFile(join(dir, "resume.gguf"));
    assert.equal(final.length, total);
    assert.equal(final[0], 0x61);
    assert.equal(final[600_000], 0x62);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("hydratePartials surfaces paused jobs after reboot", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eh-dlm-hydrate-"));
  try {
    const fileName = "boot.gguf";
    await writeFile(join(dir, `${fileName}.partial`), Buffer.alloc(12_000, 0x63));
    await writeFile(
      join(dir, `${fileName}.partial.meta.json`),
      JSON.stringify({
        url: "https://huggingface.co/org/repo/resolve/main/boot.gguf",
        modelId: "org/boot",
        approxBytes: 2_000_000,
      }),
    );
    const mgr = new ModelDownloadManager(dir);
    await mgr.hydratePartials();
    const job = mgr.get(fileName);
    assert.equal(job?.status, "paused");
    assert.equal(job?.bytesReceived, 12_000);
    assert.equal(job?.bytesTotal, 2_000_000);
    assert.equal(job?.modelId, "org/boot");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
