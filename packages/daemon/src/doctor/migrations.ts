// On-disk state migrations — daemon.json stateSchemaVersion + migrations/.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_STATE_SCHEMA_VERSION, type DaemonConfig } from "../config.js";

export interface MigrationResult {
  fromVersion: number;
  toVersion: number;
  applied: string[];
}

type MigrationFn = (stateDir: string) => Promise<void>;

const MIGRATIONS: Record<number, MigrationFn> = {
  1: async (stateDir) => {
    await mkdir(join(stateDir, "migrations"), { recursive: true });
  },
};

export async function runStateMigrations(
  config: DaemonConfig,
): Promise<MigrationResult | null> {
  let version = config.stateSchemaVersion;
  const target = DEFAULT_STATE_SCHEMA_VERSION;
  if (version >= target) return null;

  const applied: string[] = [];
  while (version < target) {
    const next = version + 1;
    const fn = MIGRATIONS[next];
    if (!fn) break;
    await fn(config.stateDir);
    applied.push(`state-v${next}`);
    version = next;
  }

  if (applied.length === 0) return null;

  const daemonJson = join(config.stateDir, "daemon.json");
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(await readFile(daemonJson, "utf8")) as Record<string, unknown>;
  } catch {
    // fresh install — write minimal file on fix
  }
  raw.stateSchemaVersion = version;
  await writeFile(daemonJson, JSON.stringify(raw, null, 2) + "\n", "utf8");
  config.stateSchemaVersion = version;

  return { fromVersion: config.stateSchemaVersion - applied.length, toVersion: version, applied };
}

export function doctorStateSchemaIssue(config: DaemonConfig): import("./issues.js").DoctorIssue | null {
  if (config.stateSchemaVersion >= DEFAULT_STATE_SCHEMA_VERSION) return null;
  return {
    id: "state.schema_outdated",
    severity: "warn",
    message: `stateSchemaVersion ${config.stateSchemaVersion} < ${DEFAULT_STATE_SCHEMA_VERSION}`,
    fixable: true,
  };
}
