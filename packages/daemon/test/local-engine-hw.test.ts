import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOME_LOCAL_MODEL_TIER_IDS,
  detectHomeLocalHardware,
  recommendHomeLocalModel,
  buildHomeLocalRecommendation,
  getHomeLocalCatalogModel,
} from "../dist/index.js";

const GB = 1024 * 1024 * 1024;

test("Metal 16 GB recommends 4B with 9B as tight also-fit", () => {
  const hw = detectHomeLocalHardware(
    { os: "darwin", arch: "arm64", accel: "metal" },
    { systemRamBytes: 16 * GB },
  );
  assert.match(hw.summary, /Metal/);
  const rec = recommendHomeLocalModel(hw);
  assert.equal(rec.modelId, HOME_LOCAL_MODEL_TIER_IDS.small);
  assert.ok(rec.alsoRecommendedModelIds.includes(HOME_LOCAL_MODEL_TIER_IDS.medium));
  assert.match(rec.reason, /9B.*may be tight/i);
});

test("Metal 32+ GB and CUDA 24 GB VRAM recommend 9B", () => {
  const metal = detectHomeLocalHardware(
    { os: "darwin", arch: "arm64", accel: "metal" },
    { systemRamBytes: 36 * GB },
  );
  assert.equal(recommendHomeLocalModel(metal).modelId, HOME_LOCAL_MODEL_TIER_IDS.medium);

  const mid = detectHomeLocalHardware(
    { os: "darwin", arch: "arm64", accel: "metal" },
    { systemRamBytes: 24 * GB },
  );
  assert.equal(recommendHomeLocalModel(mid).modelId, HOME_LOCAL_MODEL_TIER_IDS.small);

  const cuda = detectHomeLocalHardware(
    { os: "win32", arch: "x64", accel: "cuda" },
    { systemRamBytes: 64 * GB, gpuVramBytes: 24 * GB },
  );
  assert.equal(recommendHomeLocalModel(cuda).modelId, HOME_LOCAL_MODEL_TIER_IDS.medium);
});

test("CPU never recommends 9B as primary", () => {
  const huge = detectHomeLocalHardware(
    { os: "linux", arch: "x64", accel: "cpu" },
    { systemRamBytes: 128 * GB },
  );
  const rec = recommendHomeLocalModel(huge);
  assert.notEqual(rec.modelId, HOME_LOCAL_MODEL_TIER_IDS.medium);
  assert.equal(rec.modelId, HOME_LOCAL_MODEL_TIER_IDS.small);
});

test("buildHomeLocalRecommendation marks installed files", () => {
  const rec = buildHomeLocalRecommendation(["Qwen3.5-4B-Q4_K_M.gguf"], {
    platform: { os: "darwin", arch: "arm64", accel: "metal" },
    systemRamBytes: 16 * GB,
  });
  assert.equal(rec.primary.id, HOME_LOCAL_MODEL_TIER_IDS.small);
  assert.equal(rec.primary.installed, true);
  assert.ok(getHomeLocalCatalogModel(rec.primary.id));
  assert.ok(rec.also.length >= 1);
});

test("tiny hardware picks 0.8B", () => {
  const hw = detectHomeLocalHardware(
    { os: "darwin", arch: "arm64", accel: "metal" },
    { systemRamBytes: 4 * GB },
  );
  assert.equal(recommendHomeLocalModel(hw).modelId, HOME_LOCAL_MODEL_TIER_IDS.tiny);
});

test("runtime assets: Windows NVIDIA → CUDA + cudart; Linux NVIDIA → Vulkan; else CPU", async () => {
  const { resolveLlamaCppReleaseAssets, HOME_LLAMA_CPP_TAG } = await import(
    "../dist/local-engine/platform.js"
  );
  const winCuda = resolveLlamaCppReleaseAssets({
    os: "win32",
    arch: "x64",
    accel: "cuda",
  });
  assert.match(winCuda.runtimeName, /win-cuda-12\.4/);
  assert.match(winCuda.cudartName ?? "", /cudart.*cuda-12\.4/);
  assert.equal(winCuda.gpuOffload, true);

  const winCpu = resolveLlamaCppReleaseAssets({
    os: "win32",
    arch: "x64",
    accel: "cpu",
  });
  assert.match(winCpu.runtimeName, /win-cpu/);
  assert.equal(winCpu.cudartName, undefined);
  assert.equal(winCpu.gpuOffload, false);

  const linuxGpu = resolveLlamaCppReleaseAssets({
    os: "linux",
    arch: "x64",
    accel: "cuda",
  });
  assert.match(linuxGpu.runtimeName, /ubuntu-vulkan/);
  assert.equal(linuxGpu.gpuOffload, true);

  const linuxCpu = resolveLlamaCppReleaseAssets({
    os: "linux",
    arch: "x64",
    accel: "cpu",
  });
  assert.equal(linuxCpu.runtimeName, `llama-${HOME_LLAMA_CPP_TAG}-bin-ubuntu-x64.tar.gz`);
  assert.equal(linuxCpu.gpuOffload, false);

  const mac = resolveLlamaCppReleaseAssets({
    os: "darwin",
    arch: "arm64",
    accel: "metal",
  });
  assert.match(mac.runtimeName, /macos-arm64/);
  assert.equal(mac.gpuOffload, true);
});

test("buildHomeLlamaServerArgs uses -ngl -1 when gpuOffload", async () => {
  const { buildHomeLlamaServerArgs } = await import("../dist/index.js");
  const gpu = buildHomeLlamaServerArgs({
    modelPath: "/m.gguf",
    modelAlias: "m",
    port: 18792,
    gpuOffload: true,
  });
  assert.equal(gpu[gpu.indexOf("-ngl") + 1], "-1");
  const cpu = buildHomeLlamaServerArgs({
    modelPath: "/m.gguf",
    modelAlias: "m",
    port: 18792,
    gpuOffload: false,
  });
  assert.equal(cpu[cpu.indexOf("-ngl") + 1], "0");
});

test("V-LLM-11: missing accel marker on NVIDIA is a mismatch; Metal unmarked is not", async () => {
  const { mkdtemp, rm, mkdir } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { runtimeAccelMismatch } = await import("../dist/local-engine/download-runtime.js");
  const dir = await mkdtemp(join(tmpdir(), "eh-accel-"));
  try {
    await mkdir(dir, { recursive: true });
    assert.equal(
      await runtimeAccelMismatch(dir, { os: "linux", arch: "x64", accel: "cuda" }),
      true,
    );
    assert.equal(
      await runtimeAccelMismatch(dir, { os: "win32", arch: "x64", accel: "cuda" }),
      true,
    );
    assert.equal(
      await runtimeAccelMismatch(dir, { os: "darwin", arch: "arm64", accel: "metal" }),
      false,
    );
    assert.equal(
      await runtimeAccelMismatch(dir, { os: "linux", arch: "x64", accel: "cpu" }),
      false,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Linux NVIDIA hardware summary says Vulkan not bare CUDA", () => {
  const hw = detectHomeLocalHardware(
    { os: "linux", arch: "x64", accel: "cuda" },
    { systemRamBytes: 32 * GB, gpuVramBytes: 12 * GB },
  );
  assert.match(hw.summary, /Vulkan/);
  assert.doesNotMatch(hw.summary, /^CUDA ·/);
});

test("downloadCuratedGguf writes under models dir (mock fetch)", async () => {
  const { mkdtemp, rm, readFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { downloadCuratedGguf } = await import("../dist/local-engine/download-model.js");
  const { HOME_LOCAL_DEFAULT_MODEL } = await import("../dist/local-engine/catalog.js");
  const dir = await mkdtemp(join(tmpdir(), "eh-gguf-dl-"));
  try {
    const payload = Buffer.alloc(1_500_000, 0x61);
    const fetchImpl = (async () =>
      ({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(payload);
            controller.close();
          },
        }),
      }) as Response) as typeof fetch;
    const out = await downloadCuratedGguf(dir, HOME_LOCAL_DEFAULT_MODEL.id, { fetchImpl });
    assert.equal(out.fileName, HOME_LOCAL_DEFAULT_MODEL.fileName);
    const onDisk = await readFile(out.path);
    assert.equal(onDisk.length, payload.length);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
