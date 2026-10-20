// Attended LLM drafts for Settings workflow authoring (Design §7).
// Draft only — never writes disk. Caller validates + user saves via putWorkflow.

import {
  validateWorkflowYaml,
  workflowToYaml,
  type WorkflowDef,
} from "@envoyhome/workflows";
import { assertWorkflowToolsKnown } from "./workflow-tools.js";

export type DraftChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type DraftComplete = (messages: DraftChatMessage[]) => Promise<string>;

const YAML_FENCE_RE = /```(?:ya?ml)?\s*([\s\S]*?)```/i;

/** Pull YAML out of a model reply (fenced or raw). */
export function extractYamlCandidate(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(YAML_FENCE_RE);
  if (fenced?.[1]) return fenced[1].trim();
  // Drop leading prose lines until a workflow-looking key.
  const lines = trimmed.split(/\r?\n/);
  const start = lines.findIndex((l) => /^(id|match|steps|nodes|enabled)\s*:/.test(l.trim()));
  if (start >= 0) return lines.slice(start).join("\n").trim();
  return trimmed;
}

export function extractPromptCandidate(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  // Prefer a single quoted line if the model wrapped the prompt.
  const oneLine = trimmed.match(/^["']([\s\S]+)["']$/);
  if (oneLine?.[1]) return oneLine[1].trim();
  return trimmed;
}

function buildWorkflowSystemPrompt(toolNames: string[]): string {
  const tools =
    toolNames.length > 0
      ? toolNames.slice(0, 80).join(", ")
      : "write_file, read_file, notify";
  return [
    "You draft EnvoyHome static workflow YAML for a home agent.",
    "Reply with ONLY YAML (optional markdown fence). No commentary.",
    "Rules:",
    "- Exactly one trigger class: match.keywords OR match.schedule (cron) OR match.event — never more than one.",
    "- Node types: llm_fill | llm_summarize | tool only.",
    "- Tool node names MUST be from this catalogue: " + tools,
    "- For branching use nodes: + edges: with optional when: expressions like bucket == 'urgent'.",
    "- For linear flows use steps:.",
    "- Include a stable id (snake_case) and at least one step/node.",
    "- llm_fill / llm_summarize need a prompt string; tool nodes need name and args as needed.",
    "- LLM prompts may use {{step.<id>}} or {{step.<id>.<field>}} from prior outputs (e.g. after extract_document use {{step.extract.text}}).",
    "- Document pipelines: extract_document (sourcePath) → llm_summarize → optional export_document (args_from markdown from the summarize step).",
  ].join("\n");
}

/**
 * NL → validated workflow YAML. Never writes. Fail closed if parse/tools invalid.
 * When `currentYaml` is set, revise that draft instead of creating from scratch.
 */
export async function draftWorkflowFromText(input: {
  text: string;
  toolNames: string[];
  knownTools: Set<string>;
  complete: DraftComplete;
  currentYaml?: string;
}): Promise<{ yaml: string; notes?: string; def: WorkflowDef }> {
  const text = input.text.trim();
  if (!text) {
    throw Object.assign(new Error("envoyhome.bad_params: text required"), {
      code: "bad_params",
    });
  }
  const currentYaml = input.currentYaml?.trim() ?? "";
  const userContent = currentYaml
    ? [
        "Revise this workflow YAML per the instructions below.",
        "Keep a valid EnvoyHome workflow; change only what the instructions require.",
        "Reply with the full revised YAML (not a diff).",
        "",
        "Current YAML:",
        currentYaml,
        "",
        "Instructions:",
        text,
      ].join("\n")
    : `Draft a workflow for:\n${text}`;
  const raw = await input.complete([
    { role: "system", content: buildWorkflowSystemPrompt(input.toolNames) },
    {
      role: "user",
      content: userContent,
    },
  ]);
  const yaml = extractYamlCandidate(raw);
  const checked = validateWorkflowYaml(yaml);
  if (!checked.ok || !checked.def) {
    throw Object.assign(
      new Error(`envoyhome.draft_invalid: ${checked.error ?? "invalid workflow YAML"}`),
      { code: "bad_params" },
    );
  }
  try {
    assertWorkflowToolsKnown(checked.def, input.knownTools);
  } catch (err) {
    throw Object.assign(
      new Error(err instanceof Error ? err.message : String(err)),
      { code: "bad_params" },
    );
  }
  // Re-serialize so layout/shape is canonical for the editor.
  const canonical = workflowToYaml(checked.def);
  return { yaml: canonical, def: checked.def };
}

/**
 * Draft / improve a prompt for an llm_fill or llm_summarize node.
 */
export async function draftWorkflowNodePrompt(input: {
  nodeType: "llm_fill" | "llm_summarize";
  goal?: string;
  currentPrompt?: string;
  complete: DraftComplete;
}): Promise<{ prompt: string }> {
  const system = [
    "You write short prompts for EnvoyHome workflow LLM nodes.",
    "Reply with ONLY the prompt text (no YAML, no quotes, no commentary).",
    input.nodeType === "llm_fill"
      ? "llm_fill: ask for a short structured reply (often a single token or short phrase)."
      : "llm_summarize: ask for a concise summary suitable for household notes.",
  ].join("\n");
  const parts: string[] = [];
  if (input.goal?.trim()) parts.push(`Goal: ${input.goal.trim()}`);
  if (input.currentPrompt?.trim()) {
    parts.push(`Improve this prompt:\n${input.currentPrompt.trim()}`);
  } else if (!input.goal?.trim()) {
    parts.push(
      input.nodeType === "llm_fill"
        ? "Draft a prompt that classifies input as normal or urgent."
        : "Draft a prompt for a one-line morning household brief.",
    );
  }
  const raw = await input.complete([
    { role: "system", content: system },
    { role: "user", content: parts.join("\n\n") },
  ]);
  const prompt = extractPromptCandidate(raw);
  if (!prompt) {
    throw Object.assign(new Error("envoyhome.draft_invalid: empty prompt"), {
      code: "bad_params",
    });
  }
  return { prompt };
}
