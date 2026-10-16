/** Pure llama-server argv builder (Adapt EnvoyMesh envoy-local-server-args). */

export function buildHomeLlamaServerArgs(opts: {
  modelPath: string;
  modelAlias: string;
  port: number;
  /** -1 = all GPU layers (Metal/CUDA/Vulkan), 0 = CPU. */
  nGpuLayers?: number;
  /** When set and `nGpuLayers` omitted: GPU → -1, else 0. */
  gpuOffload?: boolean;
  ctxSize?: number;
  parallel?: number;
  /** e.g. `gemma` for Gemma 4 catalog entries. */
  chatTemplate?: string;
}): string[] {
  const ngl =
    opts.nGpuLayers ??
    (opts.gpuOffload === true
      ? -1
      : opts.gpuOffload === false
        ? 0
        : process.platform === "darwin"
          ? -1
          : 0);
  const args = [
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
  if (opts.chatTemplate?.trim()) {
    args.push("--chat-template", opts.chatTemplate.trim());
  }
  return args;
}
