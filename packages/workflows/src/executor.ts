import type { WorkflowDef } from "./loader.js";

export interface WorkflowStepResult {
  stepIndex: number;
  type: string;
  ok: boolean;
  detail?: string;
}

export type ToolRunner = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export type LlmRunner = (prompt: string) => Promise<string>;

/**
 * Linear ordered step list (Design §7) — not an edge graph.
 * Tool steps go through the same approval/policy gate the caller supplies.
 */
export async function executeWorkflow(
  def: WorkflowDef,
  deps: { tool: ToolRunner; llm: LlmRunner },
): Promise<WorkflowStepResult[]> {
  const results: WorkflowStepResult[] = [];
  for (let i = 0; i < def.steps.length; i++) {
    const step = def.steps[i]!;
    try {
      if (step.type === "tool") {
        const name = String(step.name ?? "");
        const args = (step.args as Record<string, unknown>) ?? {};
        await deps.tool(name, args);
        results.push({ stepIndex: i, type: step.type, ok: true });
      } else if (step.type === "llm_fill" || step.type === "llm_summarize") {
        const prompt = String(step.prompt ?? "");
        await deps.llm(prompt);
        results.push({ stepIndex: i, type: step.type, ok: true });
      } else {
        results.push({ stepIndex: i, type: step.type, ok: false, detail: "unknown step" });
      }
    } catch (err) {
      results.push({
        stepIndex: i,
        type: step.type,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
      break;
    }
  }
  return results;
}
