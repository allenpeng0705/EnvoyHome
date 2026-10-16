import type { WorkflowDef } from "./loader.js";

function isEnabled(w: WorkflowDef): boolean {
  return w.enabled !== false;
}

export function matchKeywordWorkflow(
  text: string,
  workflows: readonly WorkflowDef[],
): WorkflowDef | undefined {
  const lower = text.toLowerCase();
  for (const w of workflows) {
    if (!isEnabled(w)) continue;
    const kws = w.match.keywords ?? [];
    if (kws.some((k) => lower.includes(k.toLowerCase()))) return w;
  }
  return undefined;
}

export function matchEventWorkflow(
  sourceId: string,
  workflows: readonly WorkflowDef[],
): WorkflowDef | undefined {
  return workflows.find(
    (w) => isEnabled(w) && w.match.event?.sourceId === sourceId,
  );
}

export function matchScheduleWorkflows(workflows: readonly WorkflowDef[]): WorkflowDef[] {
  return workflows.filter((w) => isEnabled(w) && typeof w.match.schedule === "string");
}
