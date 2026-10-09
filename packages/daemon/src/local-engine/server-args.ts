/** Pure llama-server argv builder (Adapt EnvoyMesh envoy-local-server-args). */

export function buildHomeLlamaServerArgs(opts: {
  modelPath: string;
  modelAlias: string;
  port: number;
  /** -1 = all GPU layers (Metal/CUDA), 0 = CPU. */
  nGpuLayers?: number;
  ctxSize?: number;
  parallel?: number;
}): string[] {
  const ngl = opts.nGpuLayers ?? (process.platform === "darwin" ? -1 : 0);
  return [
    "-m",
    opts.modelPath,
    "-a",
    opts.modelAlias,
    "--host",
    "127.0.0.1",
    "--port",
    String(opts.port),
    "-c",
    String(opts.ctxSize ?? 4096),
    "-ngl",
    String(ngl),
    "--parallel",
    String(opts.parallel ?? 1),
  ];
}
