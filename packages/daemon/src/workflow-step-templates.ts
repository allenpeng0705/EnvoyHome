// Reusable LLM step templates for Settings Add step ▾ (Design §7).
// Runtime stays the closed set llm_fill | llm_summarize | tool — templates only
// pre-fill prompt / out / label when adding a node.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { HomePaths } from "./home-paths.js";

export type LlmStepNodeType = "llm_fill" | "llm_summarize";

export interface WorkflowStepTemplate {
  id: string;
  label: string;
  nodeType: LlmStepNodeType;
  prompt: string;
  out?: string;
  source: "global" | "account";
  accountId?: string;
}

type StoredTemplate = {
  id: string;
  label: string;
  nodeType: LlmStepNodeType;
  prompt: string;
  out?: string;
};

const ID_RE = /^[a-z][a-z0-9_]{0,63}$/;

function isNodeType(v: unknown): v is LlmStepNodeType {
  return v === "llm_fill" || v === "llm_summarize";
}

function normalizeId(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  if (slug && ID_RE.test(slug)) return slug;
  // Non-Latin labels (e.g. 提取 JSON) — stable ascii id from the raw string.
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `step_${hash.toString(36)}`.slice(0, 64);
}

function parseFile(raw: string): StoredTemplate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { templates?: unknown }).templates)) {
    return [];
  }
  const out: StoredTemplate[] = [];
  for (const row of (parsed as { templates: unknown[] }).templates) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string" || !ID_RE.test(r.id)) continue;
    if (typeof r.label !== "string" || !r.label.trim()) continue;
    if (!isNodeType(r.nodeType)) continue;
    if (typeof r.prompt !== "string" || !r.prompt.trim()) continue;
    const item: StoredTemplate = {
      id: r.id,
      label: r.label.trim(),
      nodeType: r.nodeType,
      prompt: r.prompt,
    };
    if (typeof r.out === "string" && r.out.trim()) item.out = r.out.trim();
    out.push(item);
  }
  return out;
}

async function readTemplates(path: string): Promise<StoredTemplate[]> {
  try {
    const raw = await readFile(path, "utf8");
    return parseFile(raw);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return [];
    throw err;
  }
}

async function writeTemplates(path: string, templates: StoredTemplate[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const body = `${JSON.stringify({ templates }, null, 2)}\n`;
  await writeFile(path, body, "utf8");
}

export class WorkflowStepTemplateStore {
  constructor(private readonly paths: HomePaths) {}

  private globalPath(): string {
    return this.paths.workflowStepTemplatesJson;
  }

  private accountPath(accountId: string): string {
    return this.paths.accountWorkflowStepTemplatesJson(accountId);
  }

  async list(accountId?: string): Promise<WorkflowStepTemplate[]> {
    const globalRows = await readTemplates(this.globalPath());
    const byId = new Map<string, WorkflowStepTemplate>();
    for (const t of globalRows) {
      byId.set(t.id, { ...t, source: "global" });
    }
    if (accountId) {
      const accountRows = await readTemplates(this.accountPath(accountId));
      for (const t of accountRows) {
        byId.set(t.id, { ...t, source: "account", accountId });
      }
    }
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  async put(input: {
    id?: string;
    label: string;
    nodeType: LlmStepNodeType;
    prompt: string;
    out?: string;
    accountId?: string;
  }): Promise<WorkflowStepTemplate> {
    const label = input.label.trim();
    const prompt = input.prompt.trim();
    if (!label) {
      throw Object.assign(new Error("envoyhome.bad_params: label required"), { code: "bad_params" });
    }
    if (!prompt) {
      throw Object.assign(new Error("envoyhome.bad_params: prompt required"), { code: "bad_params" });
    }
    if (!isNodeType(input.nodeType)) {
      throw Object.assign(new Error("envoyhome.bad_params: nodeType"), { code: "bad_params" });
    }
    const id = normalizeId(input.id?.trim() || label);
    if (!ID_RE.test(id)) {
      throw Object.assign(new Error("envoyhome.bad_params: invalid id"), { code: "bad_params" });
    }
    const stored: StoredTemplate = {
      id,
      label,
      nodeType: input.nodeType,
      prompt,
      ...(input.out?.trim() ? { out: input.out.trim() } : {}),
    };
    const accountId = input.accountId;
    if (accountId) {
      const rows = await readTemplates(this.accountPath(accountId));
      const next = rows.filter((r) => r.id !== id);
      next.push(stored);
      next.sort((a, b) => a.id.localeCompare(b.id));
      await writeTemplates(this.accountPath(accountId), next);
      return { ...stored, source: "account", accountId };
    }
    const rows = await readTemplates(this.globalPath());
    const next = rows.filter((r) => r.id !== id);
    next.push(stored);
    next.sort((a, b) => a.id.localeCompare(b.id));
    await writeTemplates(this.globalPath(), next);
    return { ...stored, source: "global" };
  }

  async remove(id: string, accountId?: string): Promise<boolean> {
    if (!ID_RE.test(id)) return false;
    if (accountId) {
      const rows = await readTemplates(this.accountPath(accountId));
      const next = rows.filter((r) => r.id !== id);
      if (next.length === rows.length) return false;
      await writeTemplates(this.accountPath(accountId), next);
      return true;
    }
    const rows = await readTemplates(this.globalPath());
    const next = rows.filter((r) => r.id !== id);
    if (next.length === rows.length) return false;
    await writeTemplates(this.globalPath(), next);
    return true;
  }
}
