// Client-side workflow YAML ↔ graph model for the Diagram editor.
// Daemon remains authoritative on put/validate; this is for UI round-trip only.

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/**
 * @typedef {{ id: string, type: string, name?: string, label?: string, prompt?: string, out?: string, join?: string, args?: Record<string, unknown>, args_from?: Record<string, unknown>, x?: number, y?: number }} WfNode
 * @typedef {{ from: string, to: string, when?: string }} WfEdge
 * @typedef {{ id: string, match: Record<string, unknown>, enabled: boolean, entry: string, nodes: WfNode[], edges: WfEdge[] }} WfGraph
 */

/**
 * @param {string} yamlText
 * @returns {{ ok: true, graph: WfGraph } | { ok: false, error: string }}
 */
export function yamlToGraph(yamlText) {
  try {
    const raw = parseYaml(yamlText);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "workflow.invalid: expected a mapping" };
    }
    const id = typeof raw.id === "string" ? raw.id : "";
    if (!id) return { ok: false, error: "workflow.invalid: missing id" };
    if (!raw.match || typeof raw.match !== "object") {
      return { ok: false, error: "workflow.invalid: missing match" };
    }
    /** @type {WfNode[]} */
    let nodes = [];
    /** @type {WfEdge[]} */
    let edges = [];
    if (Array.isArray(raw.nodes) && raw.nodes.length) {
      nodes = raw.nodes.map((n, i) => normalizeNode(n, `n${i + 1}`));
      edges = Array.isArray(raw.edges)
        ? raw.edges.map((e) => ({
            from: String(e.from ?? ""),
            to: String(e.to ?? ""),
            ...(typeof e.when === "string" && e.when ? { when: e.when } : {}),
          }))
        : [];
    } else if (Array.isArray(raw.steps)) {
      nodes = raw.steps.map((n, i) => normalizeNode(n, `step${i + 1}`));
      for (let i = 0; i < nodes.length - 1; i++) {
        edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
      }
    }
    const entry =
      typeof raw.entry === "string" && raw.entry
        ? raw.entry
        : nodes[0]?.id || "";
    autoLayout(nodes);
    return {
      ok: true,
      graph: {
        id,
        match: raw.match,
        enabled: raw.enabled === false ? false : true,
        entry,
        nodes,
        edges,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * @param {WfGraph} graph
 * @returns {string}
 */
export function graphToYaml(graph) {
  const body = {
    id: graph.id,
    match: graph.match,
  };
  if (graph.enabled === false) body.enabled = false;

  const isLinear =
    graph.edges.length === Math.max(0, graph.nodes.length - 1) &&
    graph.edges.every(
      (e, i) =>
        e.from === graph.nodes[i]?.id &&
        e.to === graph.nodes[i + 1]?.id &&
        e.when === undefined,
    );

  if (isLinear || graph.nodes.length === 0) {
    body.steps = graph.nodes.map(nodeToYamlObj);
  } else {
    if (graph.entry) body.entry = graph.entry;
    body.nodes = graph.nodes.map(nodeToYamlObj);
    body.edges = graph.edges.map((e) => {
      const out = { from: e.from, to: e.to };
      if (e.when) out.when = e.when;
      return out;
    });
  }
  return stringifyYaml(body, { lineWidth: 0 });
}

/** @param {unknown} raw @param {string} fallbackId */
function normalizeNode(raw, fallbackId) {
  if (!raw || typeof raw !== "object") {
    return { id: fallbackId, type: "llm_summarize", prompt: "" };
  }
  const r = /** @type {Record<string, unknown>} */ (raw);
  const type =
    r.type === "llm_fill" || r.type === "llm_summarize" || r.type === "tool"
      ? r.type
      : r.kind === "llm_fill" || r.kind === "llm_summarize" || r.kind === "tool"
        ? r.kind
        : "llm_summarize";
  const id = typeof r.id === "string" && r.id ? r.id : fallbackId;
  /** @type {WfNode} */
  const node = { id, type };
  if (typeof r.name === "string") node.name = r.name;
  else if (typeof r.tool === "string") node.name = r.tool;
  if (typeof r.label === "string" && r.label.trim()) node.label = r.label.trim();
  if (typeof r.prompt === "string") node.prompt = r.prompt;
  if (typeof r.out === "string") node.out = r.out;
  if (r.join === "all" || r.join === "any") node.join = r.join;
  if (r.args && typeof r.args === "object" && !Array.isArray(r.args)) {
    node.args = /** @type {Record<string, unknown>} */ (r.args);
  }
  if (r.args_from && typeof r.args_from === "object" && !Array.isArray(r.args_from)) {
    node.args_from = /** @type {Record<string, unknown>} */ (r.args_from);
  }
  if (typeof r.x === "number" && Number.isFinite(r.x)) node.x = r.x;
  if (typeof r.y === "number" && Number.isFinite(r.y)) node.y = r.y;
  return node;
}

/** @param {WfNode} n */
function nodeToYamlObj(n) {
  const step = { id: n.id, type: n.type };
  if (n.name !== undefined) step.name = n.name;
  if (n.label !== undefined) step.label = n.label;
  if (n.args !== undefined) step.args = n.args;
  if (n.args_from !== undefined) step.args_from = n.args_from;
  if (n.prompt !== undefined) step.prompt = n.prompt;
  if (n.out !== undefined) step.out = n.out;
  if (n.join !== undefined) step.join = n.join;
  if (typeof n.x === "number") step.x = Math.round(n.x);
  if (typeof n.y === "number") step.y = Math.round(n.y);
  return step;
}

/** Fill missing x/y with a simple layered layout. @param {WfNode[]} nodes */
export function autoLayout(nodes) {
  const gapX = 220;
  const gapY = 110;
  const originX = 40;
  const originY = 40;
  nodes.forEach((n, i) => {
    if (typeof n.x !== "number" || typeof n.y !== "number") {
      n.x = originX + (i % 3) * gapX;
      n.y = originY + Math.floor(i / 3) * gapY;
    }
  });
}

/**
 * @param {string} prefix
 * @param {WfNode[]} nodes
 */
export function uniqueNodeId(prefix, nodes) {
  const used = new Set(nodes.map((n) => n.id));
  const base = String(prefix || "step").replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "step";
  if (!used.has(base)) return base;
  let i = 2;
  let id = `${base}_${i}`;
  while (used.has(id)) {
    i += 1;
    id = `${base}_${i}`;
  }
  return id;
}
