/** Probe OpenAI-compat `/v1/models` on loopback. */

export interface ProbeResult {
  ok: boolean;
  baseUrl: string;
  modelIds: string[];
  error?: string;
  latencyMs: number;
}

export async function probeOpenAiModels(
  baseUrl: string,
  opts?: { timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<ProbeResult> {
  const root = baseUrl.replace(/\/+$/, "");
  const url = root.endsWith("/v1") ? `${root}/models` : `${root}/v1/models`;
  const started = Date.now();
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? 2_000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ac.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        ok: false,
        baseUrl: root,
        modelIds: [],
        error: `HTTP ${res.status}`,
        latencyMs,
      };
    }
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    const modelIds = (body.data ?? [])
      .map((d) => d.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    return { ok: true, baseUrl: root, modelIds, latencyMs };
  } catch (err) {
    return {
      ok: false,
      baseUrl: root,
      modelIds: [],
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}
