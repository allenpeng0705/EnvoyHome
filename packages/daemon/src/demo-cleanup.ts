// Shared demo URL / registry cleanup — used by demo stop and channel config migrate.
// Kept free of ChannelService imports to avoid cycles with demo-ha / demo-mqtt.

import {
  DEMO_DEFAULT_PORT,
  DEMO_ENTITIES,
  demoBaseUrl,
} from "@envoyhome/fake-ha";
import {
  DEMO_MQTT_DEVICES,
  DEMO_MQTT_PORT,
  demoMqttBrokerUrl,
} from "@envoyhome/fake-mqtt";
import type { ObjectRegistry } from "./object-registry.js";

export const DEMO_HA_SOURCE_IDS: readonly string[] = DEMO_ENTITIES.map((e) => e.entity_id);
export const DEMO_MQTT_SOURCE_IDS: readonly string[] = DEMO_MQTT_DEVICES.map((d) => d.topic);

/** True when the URL is the local fake-ha base (any localhost host, demo port). */
export function isDemoHaUrl(url: string): boolean {
  const raw = url.trim().replace(/\/$/, "");
  if (!raw) return false;
  const canonical = demoBaseUrl(DEMO_DEFAULT_PORT).replace(/\/$/, "");
  if (raw === canonical) return true;
  try {
    const u = new URL(raw.includes("://") ? raw : `http://${raw}`);
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    if (port !== String(DEMO_DEFAULT_PORT)) return false;
    const host = u.hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

/** True when the broker URL is the local fake-mqtt broker (demo port). */
export function isDemoMqttBrokerUrl(url: string): boolean {
  const raw = url.trim();
  if (!raw) return false;
  if (raw === demoMqttBrokerUrl(DEMO_MQTT_PORT)) return true;
  try {
    const u = new URL(raw.includes("://") ? raw : `mqtt://${raw}`);
    const port = u.port || "1883";
    if (port !== String(DEMO_MQTT_PORT)) return false;
    const host = u.hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * Channel still points at the demo hub/broker by **URL** (not sticky `demo: true`).
 * Design 2026-10-16o / review: flag alone must not trigger cleanup against a real hub.
 */
export function configPointsAtDemoHa(cfg: Record<string, unknown>): boolean {
  return typeof cfg.baseUrl === "string" && isDemoHaUrl(cfg.baseUrl);
}

export function configPointsAtDemoMqtt(cfg: Record<string, unknown>): boolean {
  return typeof cfg.brokerUrl === "string" && isDemoMqttBrokerUrl(cfg.brokerUrl);
}

export async function removeDemoHaRegistry(objects: ObjectRegistry): Promise<number> {
  return objects.removeSources("homeassistant", DEMO_HA_SOURCE_IDS);
}

export async function removeDemoMqttRegistry(objects: ObjectRegistry): Promise<number> {
  return objects.removeSources("mqtt", DEMO_MQTT_SOURCE_IDS);
}
