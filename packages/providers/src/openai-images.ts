// OpenAI Images API — Design §19.12 D2 image_generate (Adapt openai-compat cloud).

import { joinProviderUrl } from "./url.js";
import type { ProviderSecretStore } from "./provider.js";

export interface OpenAIImageGenerateOpts {
  baseUrl: string;
  secret?: string;
  /** Default gpt-image-1 / dall-e-3 style model id. */
  model?: string;
  prompt: string;
  size?: "1024x1024" | "512x512" | "256x256";
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface OpenAIImageGenerateResult {
  bytes: Buffer;
  mimeType: string;
  ext: string;
  model: string;
}

/**
 * POST /v1/images/generations — returns first image as bytes (b64_json preferred).
 * Fail closed on HTTP / empty / oversized payloads.
 */
export async function generateOpenAIImage(
  opts: OpenAIImageGenerateOpts,
): Promise<OpenAIImageGenerateResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const model = opts.model?.trim() || "dall-e-3";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.secret) headers.authorization = `Bearer ${opts.secret}`;
  const init: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      prompt: opts.prompt.slice(0, 2000),
      n: 1,
      size: opts.size ?? "1024x1024",
      response_format: "b64_json",
    }),
  };
  if (opts.signal !== undefined) init.signal = opts.signal;
  const res = await fetchImpl(joinProviderUrl(opts.baseUrl, "/v1/images/generations"), init);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `image_generate HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }
  const body = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const row = body.data?.[0];
  if (!row) {
    throw new Error("image_generate: empty response");
  }
  if (typeof row.b64_json === "string" && row.b64_json.length > 0) {
    const bytes = Buffer.from(row.b64_json, "base64");
    if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) {
      throw new Error("image_generate: image empty or exceeds 8 MiB");
    }
    return { bytes, mimeType: "image/png", ext: "png", model };
  }
  if (typeof row.url === "string" && row.url.startsWith("https://")) {
    const imgRes = await fetchImpl(row.url, opts.signal ? { signal: opts.signal } : undefined);
    if (!imgRes.ok) {
      throw new Error(`image_generate download HTTP ${imgRes.status}`);
    }
    const ab = await imgRes.arrayBuffer();
    const bytes = Buffer.from(ab);
    if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) {
      throw new Error("image_generate: downloaded image empty or exceeds 8 MiB");
    }
    const ct = imgRes.headers.get("content-type") || "image/png";
    const mimeType = ct.split(";")[0]!.trim() || "image/png";
    const ext = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : "png";
    return { bytes, mimeType, ext, model };
  }
  throw new Error("image_generate: no b64_json or https url in response");
}

/** Resolve secret for a provider id from the store (never echo). */
export function peekProviderSecret(
  secrets: ProviderSecretStore,
  providerId: string,
): string | undefined {
  return secrets.get(providerId);
}
