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
  readonly objectsJson: string;
  readonly bindingsJson: string;
  readonly channelsJson: string;
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
    objectsJson: join(stateDir, "objects.json"),
    bindingsJson: join(stateDir, "paired-devices", "bindings.json"),
    channelsJson: join(stateDir, "channels.json"),
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
