// Thin-client turn context (Design §7.4 / 2026-10-19m).
// Ephemeral — stamped on the request; location never auto-learns to standing memory.

export type ClientLocation = {
  lat: number;
  lon: number;
  accuracyM?: number;
  /** ISO when the fix was taken on the client. */
  at?: string;
};

export type ClientTurnContext = {
  /** Client wall clock as ISO instant. */
  clientNow?: string;
  /** IANA TZ from the device (may differ from account.timeZone). */
  timeZone?: string;
  /** BCP-47 / product UI locale (en, zh, de, …). */
  locale?: string;
  /** Opt-in GPS; turn inject only. */
  location?: ClientLocation;
};

/** Max |clientNow - host| accepted for NL referenceNow (Design §7.4). */
export const CLIENT_NOW_SKEW_MS = 5 * 60_000;

export function normalizeClientContext(raw: unknown): ClientTurnContext | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: ClientTurnContext = {};
  if (typeof o.clientNow === "string" && o.clientNow.trim() && !Number.isNaN(Date.parse(o.clientNow))) {
    out.clientNow = o.clientNow.trim();
  }
  if (typeof o.timeZone === "string" && o.timeZone.trim()) {
    try {
      Intl.DateTimeFormat("en-US", { timeZone: o.timeZone.trim() }).format(new Date());
      out.timeZone = o.timeZone.trim();
    } catch {
      /* drop unknown TZ */
    }
  }
  if (typeof o.locale === "string" && o.locale.trim()) {
    out.locale = o.locale.trim().slice(0, 32);
  }
  const loc = o.location;
  if (loc && typeof loc === "object" && !Array.isArray(loc)) {
    const L = loc as Record<string, unknown>;
    const lat = typeof L.lat === "number" ? L.lat : Number(L.lat);
    const lon = typeof L.lon === "number" ? L.lon : Number(L.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      const location: ClientLocation = { lat, lon };
      if (typeof L.accuracyM === "number" && Number.isFinite(L.accuracyM) && L.accuracyM >= 0) {
        location.accuracyM = L.accuracyM;
      }
      if (typeof L.at === "string" && L.at.trim() && !Number.isNaN(Date.parse(L.at))) {
        location.at = L.at.trim();
      }
      out.location = location;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Pick NL referenceNow: clientNow when within skew of host, else host.
 * V-CRON-13.
 */
export function resolveReferenceNow(hostNow: Date, client?: ClientTurnContext): Date {
  if (!client?.clientNow) return hostNow;
  const t = Date.parse(client.clientNow);
  if (!Number.isFinite(t)) return hostNow;
  if (Math.abs(t - hostNow.getTime()) > CLIENT_NOW_SKEW_MS) return hostNow;
  return new Date(t);
}

/** Short turn inject (never durable standing). V-CRON-14. */
export function formatClientContextInject(client?: ClientTurnContext): string | undefined {
  if (!client) return undefined;
  const bits: string[] = [];
  if (client.clientNow) bits.push(`clientNow=${client.clientNow}`);
  if (client.timeZone) bits.push(`timeZone=${client.timeZone}`);
  if (client.locale) bits.push(`locale=${client.locale}`);
  if (client.location) {
    const a =
      client.location.accuracyM !== undefined ? `±${Math.round(client.location.accuracyM)}m` : "";
    bits.push(`location=${client.location.lat.toFixed(5)},${client.location.lon.toFixed(5)}${a}`);
  }
  if (!bits.length) return undefined;
  return `[Client context — this turn only]\n${bits.join(" · ")}`;
}
