// Home Assistant REST client — Design §5.7 / B14. Live listServices for C.4 registry diff.

export interface HaClientConfig {
  baseUrl: string;
  token: string;
  /** Optional fetch override (tests). */
  fetchImpl?: typeof fetch;
}

export interface HaEntityState {
  entityId: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface HaClient {
  listEntities(): Promise<HaEntityState[]>;
  getState(entityId: string): Promise<HaEntityState | undefined>;
  listServices(): Promise<Array<{ domain: string; services: string[] }>>;
  callService(domain: string, service: string, data: Record<string, unknown>): Promise<void>;
  /** Probe: GET /api/ — read credential should succeed; used for V-HA-15 style checks. */
  probe(): Promise<{ ok: boolean; message: string }>;
}

import { parseHaServicesApi } from "./ha-registry-diff.js";

function rootUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function createHaClient(config: HaClientConfig): HaClient {
  const fetchFn = config.fetchImpl ?? fetch;
  const base = rootUrl(config.baseUrl);

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchFn(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HA ${path} → ${res.status}: ${body.slice(0, 200)}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    async probe() {
      try {
        const data = await api<{ message?: string }>("/api/");
        return { ok: true, message: data?.message ?? "ok" };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async listEntities() {
      const rows = await api<Array<{ entity_id: string; state: string; attributes: Record<string, unknown> }>>(
        "/api/states",
      );
      return rows.map((r) => ({
        entityId: r.entity_id,
        state: r.state,
        attributes: r.attributes ?? {},
      }));
    },

    async getState(entityId) {
      try {
        const r = await api<{ entity_id: string; state: string; attributes: Record<string, unknown> }>(
          `/api/states/${encodeURIComponent(entityId)}`,
        );
        return {
          entityId: r.entity_id,
          state: r.state,
          attributes: r.attributes ?? {},
        };
      } catch {
        return undefined;
      }
    },

    async listServices() {
      const json = await api<unknown>("/api/services");
      return parseHaServicesApi(json);
    },

    async callService(domain, service, data) {
      await api(`/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
  };
}
