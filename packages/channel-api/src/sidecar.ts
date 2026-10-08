/**
 * Sidecar helper — POST normalized inbound to the daemon hatch (§5.3.4, V-CH-6).
 * Sidecar must present the daemon API key; localhost-only by default.
 */

export interface SidecarInboundRequest {
  accountId?: string;
  text: string;
  sessionId?: string;
  async?: boolean;
  clientTurnId?: string;
  /** Optional channel identity when mirroring the normalized event shape. */
  channel?: string;
  channelAccount?: string;
  senderId?: string;
}

export interface SidecarInboundResponse {
  turnId: string;
  text: string;
  format: "markdown" | "plain" | "link";
  accepted?: boolean;
  accountId?: string;
}

export interface SidecarClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Default true — refuse non-loopback hosts unless explicitly disabled. */
  localhostOnly?: boolean;
}

function assertLocalhost(baseUrl: string, localhostOnly: boolean): void {
  if (!localhostOnly) return;
  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    throw new Error("envoyhome.bad_params: invalid sidecar baseUrl");
  }
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error("envoyhome.auth: sidecar inbound is localhost-only by default");
  }
}

export async function postSidecarInbound(
  options: SidecarClientOptions,
  body: SidecarInboundRequest,
): Promise<SidecarInboundResponse> {
  assertLocalhost(options.baseUrl, options.localhostOnly !== false);
  const url = new URL("/v1/inbound", options.baseUrl.replace(/\/$/, "") + "/");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = payload.error as { message?: string } | undefined;
    throw new Error(err?.message ?? `sidecar inbound failed: HTTP ${res.status}`);
  }
  return payload as unknown as SidecarInboundResponse;
}

/** Stub supervisor hook — health polling lands in doctor (Plan §5.5). */
export interface SidecarSupervisor {
  markUnhealthy(channelId: string, detail: string): void;
  isHealthy(channelId: string): boolean;
}

export function createSidecarSupervisor(): SidecarSupervisor {
  const unhealthy = new Map<string, string>();
  return {
    markUnhealthy(channelId, detail) {
      unhealthy.set(channelId, detail);
    },
    isHealthy(channelId) {
      return !unhealthy.has(channelId);
    },
  };
}
