// Doctor fix application — always returns before/after diffs (Plan §5.6).

import type { DoctorIssue } from "./issues.js";
import { runStateMigrations } from "./migrations.js";

export interface DoctorFixDiff {
  issueId: string;
  before: string;
  after: string;
}

export interface DoctorFixResult {
  fixed: string[];
  failed: string[];
  diffs: DoctorFixDiff[];
}

export async function applyDoctorFixes(input: {
  issueIds: string[];
  issues: DoctorIssue[];
  stateDir: string;
  config: { stateSchemaVersion: number; stateDir: string };
}): Promise<DoctorFixResult> {
  const fixed: string[] = [];
  const failed: string[] = [];
  const diffs: DoctorFixDiff[] = [];
  const byId = new Map(input.issues.map((i) => [i.id, i]));

  for (const issueId of input.issueIds) {
    const issue = byId.get(issueId);
    if (!issue) {
      failed.push(issueId);
      continue;
    }
    if (!issue.fixable) {
      failed.push(issueId);
      continue;
    }

    if (issueId === "state.schema_outdated") {
      const before = JSON.stringify({ stateSchemaVersion: input.config.stateSchemaVersion });
      const result = await runStateMigrations({
        instanceId: "",
        label: "",
        stateDir: input.stateDir,
        wsPort: 0,
        httpPort: 0,
        publicBaseUrl: "",
        stateSchemaVersion: input.config.stateSchemaVersion,
        hatchApiKey: "",
        meshHostingEnabled: false,
        meshAttachEnabled: false,
      });
      const after = JSON.stringify({
        stateSchemaVersion: input.config.stateSchemaVersion,
        applied: result?.applied ?? [],
      });
      diffs.push({ issueId, before, after });
      fixed.push(issueId);
      continue;
    }

    failed.push(issueId);
  }

  return { fixed, failed, diffs };
}
