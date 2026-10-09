// On-disk path roots — Design §4.2. Every daemon path resolves through homePaths
// (Plan B3; mirrors EnvoyCoder's coderPaths).

import { join } from "node:path";

export interface HomePaths {
  readonly stateDir: string;
  readonly daemonJson: string;
  readonly accountsDir: string;
  readonly shareDir: string;
  readonly workflowsDir: string;
  readonly skillsDir: string;
  readonly providersDir: string;
  readonly secretsDir: string;
  readonly pairedDevicesDir: string;
  /** APNs/FCM tokens for paired devices — `paired-devices/push-tokens.json`. */
  readonly pushTokensJson: string;
  readonly objectsJson: string;
  readonly bindingsJson: string;
  readonly channelsJson: string;
  /** Local llama.cpp / engine assets (Design §8.5) — never in the app bundle. */
  readonly localEngineDir: string;
  readonly localEngineRuntimeDir: string;
  readonly localEngineModelsDir: string;
  readonly localEngineConfigJson: string;
  /** `accounts/<accountId>/` */
  accountRoot(accountId: string): string;
  /** Sandbox root: `accounts/<accountId>/files/` */
  accountFiles(accountId: string): string;
  /** Per-account workflow overlay: `accounts/<accountId>/workflows/` */
  accountWorkflowsDir(accountId: string): string;
}

/**
 * Resolve every on-disk root under `stateDir` (Design §4.2).
 * Callers MUST NOT `join(stateDir, …)` ad hoc for product layout paths.
 */
export function homePaths(stateDir: string): HomePaths {
  const accountsDir = join(stateDir, "accounts");
  return {
    stateDir,
    daemonJson: join(stateDir, "daemon.json"),
    accountsDir,
    shareDir: join(stateDir, "share"),
    workflowsDir: join(stateDir, "workflows"),
    skillsDir: join(stateDir, "skills"),
    providersDir: join(stateDir, "providers"),
    secretsDir: join(stateDir, "secrets"),
    pairedDevicesDir: join(stateDir, "paired-devices"),
    pushTokensJson: join(stateDir, "paired-devices", "push-tokens.json"),
    objectsJson: join(stateDir, "objects.json"),
    bindingsJson: join(stateDir, "paired-devices", "bindings.json"),
    channelsJson: join(stateDir, "channels.json"),
    localEngineDir: join(stateDir, "local-engine"),
    localEngineRuntimeDir: join(stateDir, "local-engine", "runtime"),
    localEngineModelsDir: join(stateDir, "local-engine", "models"),
    localEngineConfigJson: join(stateDir, "local-engine", "config.json"),
    accountRoot(accountId: string): string {
      return join(accountsDir, accountId);
    },
    accountFiles(accountId: string): string {
      return join(accountsDir, accountId, "files");
    },
    accountWorkflowsDir(accountId: string): string {
      return join(accountsDir, accountId, "workflows");
    },
  };
}
