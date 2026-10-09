// Diff Home Assistant `/api/services` against our deny list + recognised domains.
// Pre-B14 / §21 harden: prove C.4 coverage vs a live or fixture registry.

import { INDIRECTION_DOMAINS, SERVICE_DENY } from "./safety-class.js";

export interface HaServiceDomain {
  domain: string;
  services: string[];
}

export interface RegistryDiffReport {
  /** domain.service from SERVICE_DENY that appear in the HA registry (good — we cover real services). */
  denyListPresentInHa: string[];
  /** domain.service from SERVICE_DENY not found in HA (HA version may differ — warn, not fail). */
  denyListMissingFromHa: string[];
  /**
   * HA services that look high-risk (name match) but are not in SERVICE_DENY.
   * Fail closed for release harden: these need a Normative + C.4 row.
   */
  haServicesMissingFromDenyList: string[];
  /** Domains in HA that are not in our recognised/indirection sets (unknown ⇒ safety-class). */
  unrecognisedHaDomains: string[];
  ok: boolean;
  summary: string;
}

/** Service *names* that always deserve deny-list coverage when seen under any domain. */
const HIGH_RISK_SERVICE_NAMES = new Set([
  "unlock",
  "open",
  "open_cover",
  "open_valve",
  "alarm_disarm",
  "alarm_arm_night",
  "alarm_arm_away",
  "set_cover_position",
  "set_cover_tilt_position",
  "toggle_cover_tilt",
  "stop_cover",
  // Future / vendor drift — not yet in SERVICE_DENY; live HA exposing these fails the diff.
  "unlatch",
]);

const KNOWN_DOMAINS = new Set([
  "light",
  "switch",
  "cover",
  "lock",
  "valve",
  "alarm_control_panel",
  "climate",
  "fan",
  "media_player",
  "vacuum",
  "humidifier",
  "water_heater",
  "script",
  "scene",
  "button",
  "input_button",
  "automation",
  "mqtt",
  "camera",
  "update",
  "homeassistant",
  "persistent_notification",
  "system_log",
  "recorder",
  "frontend",
  "logger",
  "person",
  "zone",
  "device_tracker",
  "notify",
  "tts",
  "conversation",
  "assist_pipeline",
  "todo",
  "calendar",
  "weather",
  "sun",
  "input_boolean",
  "input_number",
  "input_select",
  "input_text",
  "input_datetime",
  "timer",
  "counter",
  "group",
  "shell_command",
  "rest_command",
  "template",
]);

/** Parse SERVICE_DENY entries into domain.service pairs where possible. */
export function denyListAsDomainServices(): Array<{ domain: string; service: string; raw: string }> {
  const out: Array<{ domain: string; service: string; raw: string }> = [];
  for (const raw of SERVICE_DENY) {
    if (raw.includes(".")) {
      const [domain, service] = raw.split(".", 2) as [string, string];
      out.push({ domain, service, raw });
    }
  }
  return out;
}

export function indexHaServices(
  registry: HaServiceDomain[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const d of registry) {
    map.set(d.domain, new Set(d.services));
  }
  return map;
}

/**
 * Compare a HA service registry snapshot to SERVICE_DENY / domain vocabulary.
 * `ok` is false when HA exposes a high-risk service name we do not deny-list.
 */
export function diffHaServiceRegistry(registry: HaServiceDomain[]): RegistryDiffReport {
  const index = indexHaServices(registry);
  const denyListPresentInHa: string[] = [];
  const denyListMissingFromHa: string[] = [];

  for (const { domain, service, raw } of denyListAsDomainServices()) {
    const services = index.get(domain);
    if (services?.has(service)) denyListPresentInHa.push(raw);
    else denyListMissingFromHa.push(raw);
  }

  const haServicesMissingFromDenyList: string[] = [];
  for (const [domain, services] of index) {
    for (const service of services) {
      if (!HIGH_RISK_SERVICE_NAMES.has(service)) continue;
      const dotted = `${domain}.${service}`;
      if (SERVICE_DENY.has(service) || SERVICE_DENY.has(dotted)) continue;
      // Indirection domains are already safety-class without being in SERVICE_DENY.
      if (INDIRECTION_DOMAINS.has(domain)) continue;
      haServicesMissingFromDenyList.push(dotted);
    }
  }

  const unrecognisedHaDomains: string[] = [];
  for (const domain of index.keys()) {
    if (!KNOWN_DOMAINS.has(domain) && !INDIRECTION_DOMAINS.has(domain)) {
      unrecognisedHaDomains.push(domain);
    }
  }
  unrecognisedHaDomains.sort();

  const ok = haServicesMissingFromDenyList.length === 0;
  const summary = ok
    ? `HA registry diff OK: ${denyListPresentInHa.length} deny-list services present; ${denyListMissingFromHa.length} absent (HA version drift); ${unrecognisedHaDomains.length} unrecognised domains (fail-closed as safety-class).`
    : `HA registry diff FAIL: ${haServicesMissingFromDenyList.length} high-risk HA service(s) not in SERVICE_DENY: ${haServicesMissingFromDenyList.slice(0, 8).join(", ")}`;

  return {
    denyListPresentInHa,
    denyListMissingFromHa,
    haServicesMissingFromDenyList,
    unrecognisedHaDomains,
    ok,
    summary,
  };
}

/** Normalise HA `/api/services` JSON (array of {domain, services: {name: …}}). */
export function parseHaServicesApi(json: unknown): HaServiceDomain[] {
  if (!Array.isArray(json)) {
    throw new TypeError("HA /api/services: expected array");
  }
  const out: HaServiceDomain[] = [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const domain = (row as { domain?: unknown }).domain;
    const services = (row as { services?: unknown }).services;
    if (typeof domain !== "string") continue;
    const names: string[] = [];
    if (services && typeof services === "object" && !Array.isArray(services)) {
      names.push(...Object.keys(services as Record<string, unknown>));
    } else if (Array.isArray(services)) {
      for (const s of services) {
        if (typeof s === "string") names.push(s);
        else if (s && typeof s === "object" && typeof (s as { name?: unknown }).name === "string") {
          names.push((s as { name: string }).name);
        }
      }
    }
    out.push({ domain, services: names });
  }
  return out;
}
