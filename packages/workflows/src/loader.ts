import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type TriggerClass = "keywords" | "schedule" | "event";

export type WorkflowStepType = "llm_fill" | "tool" | "llm_summarize";

export interface WorkflowNode {
  id: string;
  type: WorkflowStepType;
  /** Tool catalogue name (`name` or Design-sketch `tool`). */
  name?: string;
  args?: Record<string, unknown>;
  /** Map of arg → prior output ref (`step.<id>` / `step.<id>.<out>` / bare key). */
  args_from?: Record<string, unknown>;
  prompt?: string;
  /** Optional output key for conditions / args_from. */
  out?: string;
  /** Fan-in: run when any inbound edge fires (default) or after all parents finish. */
  join?: "any" | "all";
  [k: string]: unknown;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  /** Optional static condition over prior outputs, e.g. `bucket == 'urgent'`. */
  when?: string;
}

export interface WorkflowDef {
  id: string;
  match: {
    keywords?: string[];
    schedule?: string;
    event?: { sourceId: string; from?: string; to?: string };
  };
  /** Default true when omitted. */
  enabled: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  entry: string;
  /**
   * All nodes in a stable order (legacy linear `steps` or node list).
   * Kept so callers can iterate tools via `def.steps` without knowing DAG shape.
   */
  steps: WorkflowNode[];
}

export function triggerClasses(def: Pick<WorkflowDef, "match">): TriggerClass[] {
  const out: TriggerClass[] = [];
  if (def.match.keywords?.length) out.push("keywords");
  if (def.match.schedule) out.push("schedule");
  if (def.match.event) out.push("event");
  return out;
}

export function assertSingleTriggerClass(def: Pick<WorkflowDef, "match">): void {
  if (triggerClasses(def).length > 1) {
    throw new Error("workflow.trigger_ambiguous: more than one trigger class");
  }
}

function asStepType(raw: unknown): WorkflowStepType | undefined {
  const v = raw === "llm_fill" || raw === "tool" || raw === "llm_summarize" ? raw : undefined;
  return v;
}

function normalizeNode(raw: Record<string, unknown>, fallbackId: string): WorkflowNode {
  const type = asStepType(raw.type) ?? asStepType(raw.kind);
  if (!type) {
    throw new Error(`workflow.invalid: unknown step type on ${fallbackId}`);
  }
  const id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : fallbackId;
  const name =
    typeof raw.name === "string"
      ? raw.name
      : typeof raw.tool === "string"
        ? raw.tool
        : undefined;
  const join = raw.join === "all" || raw.join === "any" ? raw.join : undefined;
  const node: WorkflowNode = { id, type };
  if (name !== undefined) node.name = name;
  if (raw.args && typeof raw.args === "object" && !Array.isArray(raw.args)) {
    node.args = raw.args as Record<string, unknown>;
  }
  if (typeof raw.prompt === "string") node.prompt = raw.prompt;
  else if (typeof raw.prompt_ref === "string") node.prompt = raw.prompt_ref;
  if (typeof raw.out === "string") node.out = raw.out;
  if (join !== undefined) node.join = join;
  if (raw.args_from && typeof raw.args_from === "object" && !Array.isArray(raw.args_from)) {
    node.args_from = raw.args_from as Record<string, unknown>;
  }
  for (const [k, v] of Object.entries(raw)) {
    if (
      k === "id" ||
      k === "type" ||
      k === "kind" ||
      k === "name" ||
      k === "tool" ||
      k === "args" ||
      k === "args_from" ||
      k === "prompt" ||
      k === "prompt_ref" ||
      k === "out" ||
      k === "join"
    ) {
      continue;
    }
    node[k] = v;
  }
  return node;
}

/** Same grammar as executor `evalWhen` — reject bad expressions at load. */
const WHEN_LOAD_RE = /^\s*([A-Za-z_][\w.]*)\s*(==|!=)\s*(?:'([^']*)'|"([^"]*)")\s*$/;

export function assertValidWhen(when: string | undefined): void {
  if (when === undefined) return;
  const t = when.trim();
  if (t === "" || t === "true" || t === "false") return;
  if (!WHEN_LOAD_RE.test(when)) {
    throw new Error(`workflow.invalid_when: ${when}`);
  }
}

function assertAcyclic(nodes: WorkflowNode[], edges: WorkflowEdge[]): void {
  const ids = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) {
      throw new Error(`workflow.invalid: edge ${e.from}→${e.to} references unknown node`);
    }
    assertValidWhen(e.when);
  }
  const outs = new Map<string, string[]>();
  for (const n of nodes) outs.set(n.id, []);
  for (const e of edges) outs.get(e.from)!.push(e.to);

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`workflow.cycle: cycle involving ${id}`);
    }
    visiting.add(id);
    for (const next of outs.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const n of nodes) visit(n.id);
}

/**
 * Compile legacy linear `steps[]` or explicit `nodes`+`edges` into a canonical DAG.
 */
export function compileWorkflowGraph(raw: {
  id: string;
  match: WorkflowDef["match"];
  enabled?: boolean;
  steps?: unknown[];
  nodes?: unknown[];
  edges?: unknown[];
  entry?: string;
}): WorkflowDef {
  assertSingleTriggerClass(raw);

  let nodes: WorkflowNode[];
  let edges: WorkflowEdge[];
  let entry: string;

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : undefined;
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : undefined;
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : undefined;

  if (rawNodes && rawNodes.length > 0) {
    nodes = rawNodes.map((n, i) => {
      if (!n || typeof n !== "object") throw new Error(`workflow.invalid: bad node at ${i}`);
      return normalizeNode(n as Record<string, unknown>, `node_${i}`);
    });
    const seen = new Set<string>();
    for (const n of nodes) {
      if (seen.has(n.id)) throw new Error(`workflow.invalid: duplicate node id ${n.id}`);
      seen.add(n.id);
    }
    edges = (rawEdges ?? []).map((e, i) => {
      if (!e || typeof e !== "object") throw new Error(`workflow.invalid: bad edge at ${i}`);
      const row = e as Record<string, unknown>;
      if (typeof row.from !== "string" || typeof row.to !== "string") {
        throw new Error(`workflow.invalid: edge ${i} needs from/to`);
      }
      const edge: WorkflowEdge = { from: row.from, to: row.to };
      if (typeof row.when === "string" && row.when.length > 0) edge.when = row.when;
      return edge;
    });
    if (edges.length === 0 && nodes.length > 1) {
      throw new Error("workflow.invalid: multi-node graph needs edges (or use linear steps)");
    }
    if (nodes.length > 0) assertAcyclic(nodes, edges);
    if (typeof raw.entry === "string" && raw.entry.length > 0) {
      entry = raw.entry;
      if (!seen.has(entry)) throw new Error(`workflow.invalid: entry ${entry} not in nodes`);
    } else {
      const inbound = new Set(edges.map((e) => e.to));
      const roots = nodes.filter((n) => !inbound.has(n.id));
      if (roots.length !== 1) {
        throw new Error(
          `workflow.invalid: need exactly one entry (found ${roots.length}); set entry:`,
        );
      }
      entry = roots[0]!.id;
    }
  } else if (rawSteps) {
    nodes = rawSteps.map((s, i) => {
      if (!s || typeof s !== "object") throw new Error(`workflow.invalid: bad step at ${i}`);
      return normalizeNode(s as Record<string, unknown>, `step_${i}`);
    });
    const seen = new Set<string>();
    for (const n of nodes) {
      if (seen.has(n.id)) throw new Error(`workflow.invalid: duplicate step id ${n.id}`);
      seen.add(n.id);
    }
    edges = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({ from: nodes[i]!.id, to: nodes[i + 1]!.id });
    }
    entry = nodes[0]?.id ?? "";
    if (nodes.length === 0) {
      // Empty workflow is valid (schedule stub).
      entry = "";
    }
  } else {
    throw new Error("workflow.invalid: need steps[] or nodes[]");
  }

  if (nodes.length > 0 && rawSteps) assertAcyclic(nodes, edges);

  return {
    id: raw.id,
    match: raw.match,
    enabled: raw.enabled !== false,
    nodes,
    edges,
    entry,
    steps: nodes,
  };
}

export function parseWorkflowFile(name: string, text: string): WorkflowDef {
  const raw = (
    name.endsWith(".json") ? JSON.parse(text) : parseYaml(text)
  ) as Record<string, unknown>;
  if (typeof raw.id !== "string" || !raw.match || typeof raw.match !== "object") {
    throw new Error(`workflow.invalid: ${name}`);
  }
  try {
    const input: {
      id: string;
      match: WorkflowDef["match"];
      enabled?: boolean;
      steps?: unknown[];
      nodes?: unknown[];
      edges?: unknown[];
      entry?: string;
    } = {
      id: raw.id,
      match: raw.match as WorkflowDef["match"],
    };
    if (typeof raw.enabled === "boolean") input.enabled = raw.enabled;
    if (Array.isArray(raw.steps)) input.steps = raw.steps;
    if (Array.isArray(raw.nodes)) input.nodes = raw.nodes;
    if (Array.isArray(raw.edges)) input.edges = raw.edges;
    if (typeof raw.entry === "string") input.entry = raw.entry;
    return compileWorkflowGraph(input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${msg} (${name})`);
  }
}

/** Validate YAML/JSON text without requiring a filename. */
export function validateWorkflowYaml(text: string): {
  ok: boolean;
  id?: string;
  error?: string;
  def?: WorkflowDef;
} {
  try {
    const def = parseWorkflowFile("inline.yml", text);
    return { ok: true, id: def.id, def };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
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
  const body: Record<string, unknown> = {
    id: def.id,
    match: def.match,
  };
  if (def.enabled === false) body.enabled = false;
  // Prefer explicit graph form when there is branching; else emit linear steps.
  const isLinear =
    def.edges.length === Math.max(0, def.nodes.length - 1) &&
    def.edges.every((e, i) => e.from === def.nodes[i]?.id && e.to === def.nodes[i + 1]?.id) &&
    def.edges.every((e) => e.when === undefined);
  if (isLinear || def.nodes.length === 0) {
    body.steps = def.nodes.map(({ id, type, name, args, args_from, prompt, out, join, ...rest }) => {
      const step: Record<string, unknown> = { id, type };
      if (name !== undefined) step.name = name;
      if (args !== undefined) step.args = args;
      if (args_from !== undefined) step.args_from = args_from;
      if (prompt !== undefined) step.prompt = prompt;
      if (out !== undefined) step.out = out;
      if (join !== undefined) step.join = join;
      Object.assign(step, rest);
      return step;
    });
  } else {
    body.entry = def.entry;
    body.nodes = def.nodes;
    body.edges = def.edges;
  }
  return stringifyYaml(body, { lineWidth: 0 });
}

/** Global first, then per-account overlay (same id replaces). */
export function mergeWorkflows(global: WorkflowDef[], overlay: WorkflowDef[]): WorkflowDef[] {
  const map = new Map<string, WorkflowDef>();
  for (const w of global) map.set(w.id, w);
  for (const w of overlay) map.set(w.id, w);
  return [...map.values()];
}

export function workflowCanActuate(def: WorkflowDef): boolean {
  return def.steps.some(
    (s) =>
      s.type === "tool" && (s.name === "ha_call_service" || s.name === "mqtt_publish"),
  );
}
