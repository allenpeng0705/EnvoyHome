/** Loopback-only allow-list for Ollama / local OpenAI-compat probes (SSRF harden). */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function assertLocalEngineBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw Object.assign(new Error("envoyhome.ollama_bad_url: empty baseUrl"), {
      code: "ollama_bad_url",
    });
  }
  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`);
  } catch {
    throw Object.assign(new Error(`envoyhome.ollama_bad_url: invalid URL ${trimmed}`), {
      code: "ollama_bad_url",
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw Object.assign(
      new Error(`envoyhome.ollama_bad_url: only http(s) allowed, got ${url.protocol}`),
      { code: "ollama_bad_url" },
    );
  }
  const host = url.hostname.toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) {
    throw Object.assign(
      new Error(
        `envoyhome.ollama_bad_url: host ${host} refused — only loopback (127.0.0.1 / localhost / ::1)`,
      ),
      { code: "ollama_bad_url" },
    );
  }
  let path = url.pathname.replace(/\/+$/, "");
  if (!path.endsWith("/v1")) {
    path = path === "" || path === "/" ? "/v1" : `${path}/v1`;
  }
  const port = url.port ? `:${url.port}` : "";
  return `${url.protocol}//${host}${port}${path}`;
}
