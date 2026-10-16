import type { WorkflowDef, WorkflowEdge, WorkflowNode } from "./loader.js";

export interface WorkflowStepResult {
  /** Node id (preferred) or legacy index string. */
  nodeId: string;
  stepIndex: number;
  type: string;
  ok: boolean;
  detail?: string;
  output?: string;
}

export type ToolRunner = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export type LlmRunner = (prompt: string) => Promise<string>;

const WHEN_RE = /^\s*([A-Za-z_][\w.]*)\s*(==|!=)\s*(?:'([^']*)'|"([^"]*)")\s*$/;

/**
 * Strip model reasoning blocks and normalize llm_fill to a short token so
 * `when:` conditions (`bucket == 'normal'`) match. Handles closed and unclosed
 * `<think>` tags used by several local models.
 */
export function normalizeLlmOutput(raw: string, mode: "fill" | "summarize"): string {
  let text = String(raw ?? "");
  text = text.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "");
  // Unclosed think: drop from the tag through end-of-string.
  text = text.replace(/<think\b[^>]*>[\s\S]*$/gi, "");
  text = text.replace(/<\/?think\b[^>]*>/gi, "").trim();

  if (mode === "summarize") return text;

  const line =
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";
  const unquoted = line.replace(/^["'`]+|["'`]+$/g, "").trim();
  const token = (unquoted.split(/\s+/)[0] ?? "").replace(/[.,;:!?]+$/g, "");
  if (token) return token;

  // Reasoning-only replies: recover a short classification label if present.
  const fromRaw = /\b(normal|urgent|chores|guest)\b/i.exec(String(raw ?? ""));
  return fromRaw ? fromRaw[1]!.toLowerCase() : "";
}

/** Evaluate a static edge condition against prior node outputs. */
export function evalWhen(when: string | undefined, outputs: ReadonlyMap<string, string>): boolean {
  if (when === undefined || when.trim() === "" || when.trim() === "true") return true;
  if (when.trim() === "false") return false;
  const m = WHEN_RE.exec(when);
  if (!m) {
    throw new Error(`workflow.invalid_when: ${when}`);
  }
  const key = m[1]!;
  const op = m[2]!;
  const expected = m[3] ?? m[4] ?? "";
  const actual = outputs.get(key) ?? "";
  return op === "==" ? actual === expected : actual !== expected;
}

function edgeKey(e: WorkflowEdge): string {
  return `${e.from}->${e.to}`;
}

/**
 * Resolve Design-sketch refs like `step.extract_place.place` or a bare `out` key
 * against prior node outputs.
 */
export function resolveArgsFrom(
  argsFrom: Record<string, unknown> | undefined,
  outputs: ReadonlyMap<string, string>,
): Record<string, unknown> {
  if (!argsFrom) return {};
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(argsFrom)) {
    if (typeof raw !== "string") {
      out[key] = raw;
      continue;
    }
    const ref = raw.trim();
    const stepMatch = /^step\.([A-Za-z_][\w]*)(?:\.([A-Za-z_][\w]*))?$/.exec(ref);
    if (stepMatch) {
      const nodeId = stepMatch[1]!;
      const field = stepMatch[2];
      if (field) {
        out[key] = outputs.get(field) ?? outputs.get(`${nodeId}.${field}`) ?? outputs.get(nodeId) ?? "";
      } else {
        out[key] = outputs.get(nodeId) ?? "";
      }
      continue;
    }
    out[key] = outputs.has(ref) ? outputs.get(ref)! : ref;
  }
  return out;
}

async function runNode(
  node: WorkflowNode,
  deps: { tool: ToolRunner; llm: LlmRunner },
  outputs: Map<string, string>,
): Promise<{ ok: boolean; detail?: string; output?: string }> {
  if (node.type === "tool") {
    const name = String(node.name ?? "");
    const from = resolveArgsFrom(
      node.args_from as Record<string, unknown> | undefined,
      outputs,
    );
    const args = { ...(node.args ?? {}), ...from };
    const result = await deps.tool(name, args);
    const output =
      result === undefined || result === null
        ? "ok"
        : typeof result === "string"
          ? result
          : JSON.stringify(result);
    outputs.set(node.id, output);
    if (node.out) outputs.set(node.out, output);
    return { ok: true, output };
  }
  if (node.type === "llm_fill" || node.type === "llm_summarize") {
    const prompt = String(node.prompt ?? "");
    const raw = await deps.llm(prompt);
    const text = normalizeLlmOutput(raw, node.type === "llm_fill" ? "fill" : "summarize");
    if (node.type === "llm_fill" && !text) {
      return {
        ok: false,
        detail: "llm_fill empty after stripping model reasoning",
        output: String(raw ?? "").slice(0, 200),
      };
    }
    outputs.set(node.id, text);
    if (node.out) outputs.set(node.out, text);
    return { ok: true, output: text };
  }
  return { ok: false, detail: "unknown step" };
}

function isReady(
  id: string,
  entry: string,
  node: WorkflowNode,
  inbound: WorkflowEdge[],
  completed: ReadonlySet<string>,
  satisfied: ReadonlySet<string>,
): boolean {
  if (completed.has(id)) return false;
  if (id === entry) return true;
  if (inbound.length === 0) return false;
  const join = node.join === "all" ? "all" : "any";
  const fired = inbound.filter((e) => satisfied.has(edgeKey(e)));
  if (fired.length === 0) return false;
  if (join === "any") return true;
  return inbound.every((e) => completed.has(e.from));
}

export type WorkflowStepPhase = "started" | "finished";

export type WorkflowStepHook = (ev: {
  phase: WorkflowStepPhase;
  nodeId: string;
  type: string;
  ok?: boolean;
  detail?: string;
  output?: string;
}) => void | Promise<void>;

/**
 * DAG executor (Design §7). Linear `steps[]` compiles to a single path.
 * Tool nodes go through the caller's policy gate.
 */
export async function executeWorkflow(
  def: WorkflowDef,
  deps: { tool: ToolRunner; llm: LlmRunner; onStep?: WorkflowStepHook },
): Promise<WorkflowStepResult[]> {
  const nodes = def.nodes;
  const edges = def.edges;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outs = new Map<string, WorkflowEdge[]>();
  const ins = new Map<string, WorkflowEdge[]>();
  for (const n of nodes) {
    outs.set(n.id, []);
    ins.set(n.id, []);
  }
  for (const e of edges) {
    outs.get(e.from)?.push(e);
    ins.get(e.to)?.push(e);
  }

  const results: WorkflowStepResult[] = [];
  const outputs = new Map<string, string>();
  const completed = new Set<string>();
  const satisfied = new Set<string>();
  const pending = new Set<string>();
  const indexOf = new Map(nodes.map((n, i) => [n.id, i]));

  if (nodes.length === 0) return results;
  if (!def.entry || !byId.has(def.entry)) {
    throw new Error("workflow.invalid: missing entry");
  }
  pending.add(def.entry);

  while (pending.size > 0) {
    let progressed = false;
    for (const id of [...pending]) {
      const node = byId.get(id);
      if (!node) {
        pending.delete(id);
        continue;
      }
      const inbound = ins.get(id) ?? [];
      if (!isReady(id, def.entry, node, inbound, completed, satisfied)) continue;

      pending.delete(id);
      progressed = true;
      const stepIndex = indexOf.get(id) ?? results.length;
      try {
        await deps.onStep?.({ phase: "started", nodeId: id, type: node.type });
        const ran = await runNode(node, deps, outputs);
        results.push({
          nodeId: id,
          stepIndex,
          type: node.type,
          ok: ran.ok,
          ...(ran.detail !== undefined ? { detail: ran.detail } : {}),
          ...(ran.output !== undefined ? { output: ran.output } : {}),
        });
        await deps.onStep?.({
          phase: "finished",
          nodeId: id,
          type: node.type,
          ok: ran.ok,
          ...(ran.detail !== undefined ? { detail: ran.detail } : {}),
          ...(ran.output !== undefined ? { output: ran.output } : {}),
        });
        if (!ran.ok) return results;
        completed.add(id);
        for (const e of outs.get(id) ?? []) {
          if (!evalWhen(e.when, outputs)) continue;
          satisfied.add(edgeKey(e));
          if (!completed.has(e.to)) pending.add(e.to);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        results.push({
          nodeId: id,
          stepIndex,
          type: node.type,
          ok: false,
          detail,
        });
        await deps.onStep?.({
          phase: "finished",
          nodeId: id,
          type: node.type,
          ok: false,
          detail,
        });
        return results;
      }
    }
    if (!progressed) break;
  }

  return results;
}
