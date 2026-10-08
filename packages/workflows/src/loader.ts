import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type TriggerClass = "keywords" | "schedule" | "event";

export interface WorkflowDef {
  id: string;
  match: {
    keywords?: string[];
    schedule?: string;
    event?: { sourceId: string };
  };
  steps: Array<{ type: "llm_fill" | "tool" | "llm_summarize"; [k: string]: unknown }>;
}

export function triggerClasses(def: WorkflowDef): TriggerClass[] {
  const out: TriggerClass[] = [];
  if (def.match.keywords?.length) out.push("keywords");
  if (def.match.schedule) out.push("schedule");
  if (def.match.event) out.push("event");
  return out;
}

export function assertSingleTriggerClass(def: WorkflowDef): void {
  if (triggerClasses(def).length > 1) {
    throw new Error("workflow.trigger_ambiguous: more than one trigger class");
  }
}

export function parseWorkflowFile(name: string, text: string): WorkflowDef {
  const raw = (
    name.endsWith(".json")
      ? JSON.parse(text)
      : parseYaml(text)
  ) as WorkflowDef;
  if (typeof raw.id !== "string" || !raw.match || !Array.isArray(raw.steps)) {
    throw new Error(`workflow.invalid: ${name}`);
  }
  assertSingleTriggerClass(raw);
  return raw;
}

export async function loadWorkflows(dir: string): Promise<WorkflowDef[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: WorkflowDef[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") && !name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
    const text = await readFile(join(dir, name), "utf8");
    out.push(parseWorkflowFile(name, text));
  }
  return out;
}

/** Serialize a workflow for `home.getWorkflow` (YAML wire field). */
export function workflowToYaml(def: WorkflowDef): string {
  return stringifyYaml(def, { lineWidth: 0 });
}

/** Global first, then per-account overlay (same id replaces). */
export function mergeWorkflows(global: WorkflowDef[], overlay: WorkflowDef[]): WorkflowDef[] {
  const map = new Map<string, WorkflowDef>();
  for (const w of global) map.set(w.id, w);
  for (const w of overlay) map.set(w.id, w);
  return [...map.values()];
}
