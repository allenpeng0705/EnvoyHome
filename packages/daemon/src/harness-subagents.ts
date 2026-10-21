/**
 * Design §19.13 P2-E2/E3 — task / spawn_helper via envoy-harness LocalMeshSubmitter.
 * Parent turns use Agent.run (P2-E3); children are depth-1 Agents (no nested mesh).
 */

import { mapBoundedParallel, type SubagentResult } from "@envoymesh/envoy-harness";
import type { TurnOrigin } from "@envoyhome/harness-host";
import {
  homeSubagentInput,
  textFromSubagentResult,
} from "./home-harness-bridge.js";

/** Per `task` call — refuse-all when exceeded (harness F10.2 pattern). */
export const TASK_MAX_SUBAGENTS = 8;
/** Rolling pool concurrency inside one `task` call. */
export const TASK_MAX_PARALLEL = 4;
/** Account-wide in-flight children (`task` + `spawn_helper` share). */
export const TASK_ACCOUNT_CONCURRENCY = 8;

export const TASK_DEFAULT_ALLOW = [
  "read_file",
  "list_dir",
  "search_files",
] as const;

const DENY_CHILD_TOOLS = new Set([
  "spawn_helper",
  "task",
  "exec",
  "ha_call_service",
  "mqtt_publish",
  "browser",
]);

const activeChildrenByAccount = new Map<string, number>();

export function __resetHarnessSubagentsForTests(): void {
  activeChildrenByAccount.clear();
}

export function filterChildAllowTools(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? (raw as unknown[]).filter((t): t is string => typeof t === "string")
    : [...TASK_DEFAULT_ALLOW];
  return list
    .map((t) => t.trim())
    .filter(
      (t) =>
        t &&
        !DENY_CHILD_TOOLS.has(t) &&
        !t.startsWith("ha_") &&
        !t.startsWith("mqtt_"),
    )
    .slice(0, 12);
}

export interface TaskChildSpec {
  objective: string;
  allowTools: string[];
}

/** Parse harness-aligned `task` / legacy `spawn_helper` args into child specs. */
export function parseTaskChildren(args: Record<string, unknown>): TaskChildSpec[] {
  const defaultAllow = filterChildAllowTools(args.allowTools);

  if (Array.isArray(args.tasks) && args.tasks.length > 0) {
    const out: TaskChildSpec[] = [];
    for (const raw of args.tasks) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const objective =
        (typeof row.objective === "string" && row.objective.trim()) ||
        (typeof row.prompt === "string" && row.prompt.trim()) ||
        "";
      if (!objective) continue;
      out.push({
        objective: objective.slice(0, 8000),
        allowTools:
          row.allowTools !== undefined
            ? filterChildAllowTools(row.allowTools)
            : defaultAllow,
      });
    }
    return out;
  }

  const single =
    (typeof args.objective === "string" && args.objective.trim()) ||
    (typeof args.prompt === "string" && args.prompt.trim()) ||
    "";
  if (!single) return [];
  return [{ objective: single.slice(0, 8000), allowTools: defaultAllow }];
}

export type HomeMeshChildRunner = (opts: {
  objective: string;
  allowTools: string[];
  signal?: AbortSignal;
}) => Promise<SubagentResult>;

/**
 * V-P2-AGENT-3 — parallel children via LocalMeshSubmitter (preferred) or complete fallback.
 */
export async function runTaskTool(input: {
  args: Record<string, unknown>;
  accountId: string;
  origin: TurnOrigin;
  helperDepth: number;
  /** Production: LocalMeshSubmitter path. */
  runMeshChild?: HomeMeshChildRunner;
  /** Test / legacy fallback when mesh not wired. */
  complete?: (prompt: string, allowTools: string[]) => Promise<string>;
  signal?: AbortSignal;
  maxSubagents?: number;
  maxParallel?: number;
}): Promise<string> {
  if (input.helperDepth >= 1) {
    throw new Error("envoyhome.bad_params: task depth limit (no nested task/spawn_helper)");
  }

  const children = parseTaskChildren(input.args);
  if (children.length === 0) {
    throw new Error(
      "envoyhome.bad_params: task requires objective|prompt or non-empty tasks[]",
    );
  }

  const maxSub = input.maxSubagents ?? TASK_MAX_SUBAGENTS;
  if (children.length > maxSub) {
    throw new Error(
      `envoyhome.bad_params: task maxSubagents reached: ${children.length} children (cap is ${maxSub}). Refused.`,
    );
  }

  const active = activeChildrenByAccount.get(input.accountId) ?? 0;
  if (active + children.length > TASK_ACCOUNT_CONCURRENCY) {
    throw new Error(
      `envoyhome.bad_params: task account concurrency cap (${TASK_ACCOUNT_CONCURRENCY})`,
    );
  }

  if (!input.runMeshChild && !input.complete) {
    throw new Error("envoyhome.tool_unavailable: task mesh runner not configured");
  }

  void input.origin;
  activeChildrenByAccount.set(input.accountId, active + children.length);

  const maxParallel = input.maxParallel ?? TASK_MAX_PARALLEL;
  try {
    const results = await mapBoundedParallel(
      children,
      maxParallel,
      input.signal,
      async (child) => {
        try {
          if (input.runMeshChild) {
            const result = await input.runMeshChild({
              objective: child.objective,
              allowTools: child.allowTools,
              ...(input.signal ? { signal: input.signal } : {}),
            });
            const reply = textFromSubagentResult(result);
            const ok = result.status === "completed" || result.status === "partial";
            if (!ok) {
              return {
                ok: false as const,
                objective: child.objective.slice(0, 200),
                allowTools: child.allowTools,
                error: (reply || result.status).slice(0, 500),
                via: "local-mesh" as const,
              };
            }
            return {
              ok: true as const,
              objective: child.objective.slice(0, 200),
              allowTools: child.allowTools,
              reply: reply || "(no text)",
              via: "local-mesh" as const,
              status: result.status,
            };
          }
          const reply = await input.complete!(child.objective, child.allowTools);
          return {
            ok: true as const,
            objective: child.objective.slice(0, 200),
            allowTools: child.allowTools,
            reply: reply.slice(0, 16_000),
            via: "complete" as const,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            ok: false as const,
            objective: child.objective.slice(0, 200),
            allowTools: child.allowTools,
            error: message.slice(0, 500),
            via: input.runMeshChild ? ("local-mesh" as const) : ("complete" as const),
          };
        }
      },
    );

    return JSON.stringify({
      ok: results.every((r) => r.ok),
      origin: input.origin,
      count: results.length,
      maxParallel,
      engine: input.runMeshChild ? "local-mesh" : "complete",
      results,
    });
  } finally {
    const n = activeChildrenByAccount.get(input.accountId) ?? children.length;
    const next = Math.max(0, n - children.length);
    if (next === 0) activeChildrenByAccount.delete(input.accountId);
    else activeChildrenByAccount.set(input.accountId, next);
  }
}

/**
 * P2-E `spawn_helper` — thin wrapper over single-child `task`.
 */
export async function runSpawnHelperTool(input: {
  args: Record<string, unknown>;
  accountId: string;
  origin: TurnOrigin;
  helperDepth: number;
  runMeshChild?: HomeMeshChildRunner;
  complete?: (prompt: string, allowTools: string[]) => Promise<string>;
  signal?: AbortSignal;
}): Promise<string> {
  const prompt =
    (typeof input.args.prompt === "string" && input.args.prompt.trim()) ||
    (typeof input.args.objective === "string" && input.args.objective.trim()) ||
    "";
  if (!prompt) {
    throw new Error("envoyhome.bad_params: spawn_helper requires prompt");
  }
  const raw = await runTaskTool({
    ...input,
    args: {
      objective: prompt,
      ...(input.args.allowTools !== undefined
        ? { allowTools: input.args.allowTools }
        : {}),
    },
  });
  const parsed = JSON.parse(raw) as {
    ok: boolean;
    origin: TurnOrigin;
    engine?: string;
    results: Array<{
      ok: boolean;
      allowTools: string[];
      reply?: string;
      error?: string;
      via?: string;
    }>;
  };
  const first = parsed.results[0];
  if (!first?.ok) {
    throw new Error(first?.error ?? "envoyhome.tool_failed: spawn_helper child failed");
  }
  return JSON.stringify({
    ok: true,
    origin: parsed.origin,
    allowTools: first.allowTools,
    reply: first.reply ?? "",
    via: "task",
    engine: parsed.engine ?? first.via ?? "unknown",
  });
}

export { homeSubagentInput };
