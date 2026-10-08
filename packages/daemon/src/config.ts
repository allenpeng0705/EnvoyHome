// daemon.json loader — Design §2.4 ports, Plan B2.

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

export interface DaemonConfig {
  instanceId: string;
  label: string;
  stateDir: string;
  wsPort: number;
  httpPort: number;
  publicBaseUrl: string;
  stateSchemaVersion: number;
  /** Bearer key for POST /v1/inbound (Appendix A.8). Empty ⇒ hatch refuses. */
  hatchApiKey: string;
  /**
   * When true, `home.meshStatus` reports `{ kind: "hosting" }` (Plan B4 /
   * V-P2-MESH-1). Default false ⇒ `no-node`.
   */
  meshHostingEnabled: boolean;
  /**
   * Optional attach-to-local-node beside hosting (Design §2.3). Never the phone
   * dial target (V-P2-MESH-2).
   */
  meshAttachEnabled: boolean;
}

export const DEFAULT_WS_PORT = 4780;
export const DEFAULT_HTTP_PORT = 4781;
export const DEFAULT_STATE_SCHEMA_VERSION = 1;

export function defaultConfig(overrides: Partial<DaemonConfig> = {}): DaemonConfig {
  const stateDir = overrides.stateDir ?? join(process.cwd(), ".envoyhome");
  return {
    instanceId: overrides.instanceId ?? randomUUID(),
    label: overrides.label ?? "EnvoyHome",
    stateDir,
    wsPort: overrides.wsPort ?? DEFAULT_WS_PORT,
    httpPort: overrides.httpPort ?? DEFAULT_HTTP_PORT,
    publicBaseUrl: overrides.publicBaseUrl ?? `http://127.0.0.1:${overrides.httpPort ?? DEFAULT_HTTP_PORT}`,
    stateSchemaVersion: overrides.stateSchemaVersion ?? DEFAULT_STATE_SCHEMA_VERSION,
    hatchApiKey: overrides.hatchApiKey ?? "",
    meshHostingEnabled: overrides.meshHostingEnabled ?? false,
    meshAttachEnabled: overrides.meshAttachEnabled ?? false,
  };
}

export async function loadDaemonConfig(path: string): Promise<DaemonConfig> {
  const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  const overrides: Partial<DaemonConfig> = {};
  if (typeof raw.instanceId === "string") overrides.instanceId = raw.instanceId;
  if (typeof raw.label === "string") overrides.label = raw.label;
  if (typeof raw.stateDir === "string") overrides.stateDir = raw.stateDir;
  if (typeof raw.wsPort === "number") overrides.wsPort = raw.wsPort;
  if (typeof raw.httpPort === "number") overrides.httpPort = raw.httpPort;
  if (typeof raw.publicBaseUrl === "string") overrides.publicBaseUrl = raw.publicBaseUrl;
  if (typeof raw.stateSchemaVersion === "number") {
    overrides.stateSchemaVersion = raw.stateSchemaVersion;
  }
  if (typeof raw.hatchApiKey === "string") overrides.hatchApiKey = raw.hatchApiKey;
  if (typeof raw.meshHostingEnabled === "boolean") {
    overrides.meshHostingEnabled = raw.meshHostingEnabled;
  }
  if (typeof raw.meshAttachEnabled === "boolean") {
    overrides.meshAttachEnabled = raw.meshAttachEnabled;
  }
  return defaultConfig(overrides);
}
