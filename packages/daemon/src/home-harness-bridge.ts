/**
 * Design §19.13 P2-E2/E3 — bridge EnvoyHome turn deps ↔ envoy-harness Agent/LocalMeshSubmitter.
 * Children (E2) and parent (E3) share HomeModelAdapter + jail ToolRegistry.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  Agent,
  DEFAULT_RETRY_POLICY,
  HookRegistry,
  InMemorySession,
  LocalMeshSubmitter,
  ToolRegistry,
  newSessionId,
  type ContentBlock,
  type CompleteInput,
  type Message,
  type ModelAdapter,
  type ModelResponse,
  type SubagentInput,
  type SubagentResult,
  type Tool,
} from "@envoymesh/envoy-harness";
import { parseAssistantToolCalls, type ProviderHandle } from "@envoyhome/harness-host";
import type { ChatMessage } from "@envoyhome/providers";

const HOME_CHILD_COST_USD = 1;
const HOME_CHILD_DEADLINE_MS = 120_000;
const HOME_CHILD_MAX_ITERATIONS = 4;
/**
 * Parent Agent.run bound (Design §19.13 P2-E3).
 * Harness default is 50; home chat often needs multi-step tool rounds
 * (list → get_state → actuate / schedule / memory). 12 was too tight and
 * surfaced as "agent loop exceeded max iterations (12)" on ordinary turns.
 * Override with ENVOYHOME_PARENT_MAX_ITERATIONS (clamped 8…80).
 */
function resolveParentMaxIterations(): number {
  const raw = (process.env.ENVOYHOME_PARENT_MAX_ITERATIONS ?? "").trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 8 && n <= 80) return Math.floor(n);
  }
  return 32;
}
const HOME_PARENT_MAX_ITERATIONS = resolveParentMaxIterations();

/** Flexible args — Home tools validate further inside dispatch. */
const FlexibleArgs = z.record(z.string(), z.unknown()).default({});

function messageToText(msg: Message): string {
  const parts: string[] = [];
  for (const b of msg.content) {
    if (b.type === "text") parts.push(b.text);
    else if (b.type === "tool_call") {
      parts.push(`[tool_call ${b.name} ${JSON.stringify(b.args)}]`);
    } else if (b.type === "tool_result") {
      parts.push(
        `[tool_result ${b.toolCallId}${b.isError ? " ERROR" : ""}: ${typeof b.content === "string" ? b.content : JSON.stringify(b.content)}]`,
      );
    }
  }
  return parts.join("\n").trim();
}

function toChatMessages(messages: ReadonlyArray<Message>): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    const text = messageToText(m);
    if (!text) continue;
    if (m.role === "system") {
      out.push({ role: "system", content: text });
    } else if (m.role === "assistant") {
      out.push({ role: "assistant", content: text });
    } else {
      // user + tool results → user channel for text-only providers
      out.push({ role: "user", content: text });
    }
  }
  return out;
}

/**
 * Map Home fence `task` args → harness TaskInput (capability_tag / cost / deadline).
 */
export function homeTaskArgsToHarness(args: Record<string, unknown>): Record<string, unknown> {
  const cap = "home-helper";
  const cost = HOME_CHILD_COST_USD;
  const deadline = HOME_CHILD_DEADLINE_MS;

  if (Array.isArray(args.tasks) && args.tasks.length > 0) {
    const tasks = args.tasks
      .map((raw) => {
        if (!raw || typeof raw !== "object") return null;
        const row = raw as Record<string, unknown>;
        const objective =
          (typeof row.objective === "string" && row.objective.trim()) ||
          (typeof row.prompt === "string" && row.prompt.trim()) ||
          "";
        if (!objective) return null;
        return {
          objective: objective.slice(0, 8000),
          capability_tag: cap,
          cost_ceiling_usd: cost,
          deadline_ms: deadline,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);
    if (tasks.length > 0) {
      return {
        capability_tag: cap,
        cost_ceiling_usd: cost,
        deadline_ms: deadline,
        tasks,
      };
    }
  }

  const objective =
    (typeof args.objective === "string" && args.objective.trim()) ||
    (typeof args.prompt === "string" && args.prompt.trim()) ||
    "";
  if (
    typeof args.capability_tag === "string" &&
    typeof args.cost_ceiling_usd === "number" &&
    typeof args.deadline_ms === "number" &&
    (objective || args.tasks)
  ) {
    return args;
  }
  if (!objective) return args;
  return {
    objective: objective.slice(0, 8000),
    capability_tag: cap,
    cost_ceiling_usd: cost,
    deadline_ms: deadline,
  };
}

export interface HomeModelAdapterOptions {
  allowSandbox?: boolean;
  allowSmartHome?: boolean;
  schedulesOnly?: boolean;
  /** Rewrite Home-style task fences into harness TaskInput. */
  normalizeTaskArgs?: boolean;
}

/**
 * ProviderHandle → ModelAdapter. Parses envoyhome-tools fences into Agent tool_use.
 */
export class HomeModelAdapter implements ModelAdapter {
  constructor(
    private readonly completeText: (messages: ChatMessage[]) => Promise<string>,
    private readonly opts: HomeModelAdapterOptions = {},
  ) {}

  static fromProviderHandle(
    handle: ProviderHandle,
    opts?: HomeModelAdapterOptions,
  ): HomeModelAdapter {
    return new HomeModelAdapter(async (messages) => {
      const out = await handle.complete({ messages, maxTokens: 2048 });
      return out.text ?? "";
    }, opts);
  }

  async complete(input: CompleteInput): Promise<ModelResponse> {
    const chat = toChatMessages(input.messages);
    const raw = await this.completeText(chat);
    const allowed = new Set(input.tools.map((t) => t.name));
    const { tools, replyText } = parseAssistantToolCalls(raw, {
      allowSandbox: this.opts.allowSandbox !== false,
      allowSmartHome: this.opts.allowSmartHome === true,
      schedulesOnly: this.opts.schedulesOnly === true,
    });
    const calls = tools.filter((t) => allowed.has(t.tool));
    if (calls.length > 0) {
      const content: ContentBlock[] = [];
      if (replyText.trim()) content.push({ type: "text", text: replyText.trim() });
      for (const c of calls.slice(0, 6)) {
        let args = c.args;
        if (
          this.opts.normalizeTaskArgs &&
          c.tool === "task" &&
          args &&
          typeof args === "object" &&
          !Array.isArray(args)
        ) {
          args = homeTaskArgsToHarness(args as Record<string, unknown>);
        }
        content.push({
          type: "tool_call",
          id: `home-${randomUUID().slice(0, 8)}`,
          name: c.tool,
          args,
        });
      }
      return { content, stopReason: "tool_use" };
    }
    return {
      content: [{ type: "text", text: raw || "(empty)" }],
      stopReason: "end_turn",
    };
  }
}

export type HomeChildDispatch = (
  tool: string,
  args: Record<string, unknown>,
) => Promise<string>;

/** Register Home jail tools only (never harness BUILTIN_TOOLS / process.cwd). */
export function buildHomeChildToolRegistry(
  allowTools: string[],
  dispatch: HomeChildDispatch,
): ToolRegistry {
  const registry = new ToolRegistry();
  // Caller MUST pass an already-filtered allow-list (no task/spawn/exec/ha_/mqtt_/browser).
  for (const name of allowTools) {
    if (!name.trim()) continue;
    const tool: Tool<typeof FlexibleArgs> = {
      name,
      description: `EnvoyHome sandboxed tool \`${name}\` (account jail).`,
      parameters: FlexibleArgs,
      async execute(args) {
        try {
          const raw =
            args && typeof args === "object" && !Array.isArray(args)
              ? (args as Record<string, unknown>)
              : {};
          const output = await dispatch(name, raw);
          return { content: output };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { content: message, isError: true };
        }
      },
    };
    registry.register(tool);
  }
  return registry;
}

/**
 * Parent ToolRegistry — every tool `dispatchTool` supports for this turn.
 * Omit `task` when meshSubmitter will register the harness-native tool.
 */
export function buildParentToolRegistry(
  toolNames: string[],
  dispatch: HomeChildDispatch,
): ToolRegistry {
  const registry = new ToolRegistry();
  for (const name of toolNames) {
    if (!name.trim() || name === "task") continue;
    const tool: Tool<typeof FlexibleArgs> = {
      name,
      description: `EnvoyHome tool \`${name}\` (ApprovalSink + account jail).`,
      parameters: FlexibleArgs,
      async execute(args) {
        try {
          const raw =
            args && typeof args === "object" && !Array.isArray(args)
              ? (args as Record<string, unknown>)
              : {};
          const output = await dispatch(name, raw);
          return { content: output };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { content: message, isError: true };
        }
      },
    };
    registry.register(tool);
  }
  return registry;
}

export interface CreateHomeMeshSubmitterOptions {
  model: ModelAdapter;
  allowTools: string[];
  dispatch: HomeChildDispatch;
  /** Sandbox root shown to ToolContext.cwd (informational for Home tools). */
  cwd: string;
  systemPromptPrefix?: string;
  parentSessionId?: string;
}

/** Real LocalMeshSubmitter with Home-jailed child Agents (depth 1 — no nested mesh). */
export function createHomeMeshSubmitter(
  opts: CreateHomeMeshSubmitterOptions,
): LocalMeshSubmitter {
  const allowTools = opts.allowTools.filter((t) => t.trim());
  const prefix = opts.systemPromptPrefix ?? "";
  return new LocalMeshSubmitter({
    workerPeerId: "envoyhome-local",
    buildSubagent: (input: SubagentInput) => {
      const session = new InMemorySession(newSessionId(), {
        cwd: opts.cwd,
        permissionMode: "read-only",
        startedAt: new Date().toISOString(),
      });
      const tools = buildHomeChildToolRegistry(allowTools, opts.dispatch);
      const hooks = new HookRegistry();
      const systemPrompt = [
        prefix,
        "You are an EnvoyHome turn-scoped sub-agent (§19.13 P2-E2).",
        `Capability tag: ${input.capabilityTag}`,
        `Objective: ${input.objective}`,
        `Allowed tools only: ${allowTools.join(", ") || "(none — answer from the objective)"}.`,
        "Never call task, spawn_helper, exec, ha_*, mqtt_*, or browser.",
        "When you need a tool, emit a ```envoyhome-tools fence with JSON [{tool,args}].",
        "Prefer answering without tools when possible.",
      ]
        .filter((l) => l.length > 0)
        .join("\n");
      return new Agent({
        model: opts.model,
        tools,
        session,
        hooks,
        cwd: opts.cwd,
        maxCostUsd: input.costCeilingUsd,
        maxIterations: HOME_CHILD_MAX_ITERATIONS,
        retryPolicy: { ...DEFAULT_RETRY_POLICY, maxRetries: 0 },
        systemPrompt,
        // No meshSubmitter → child cannot spawn further task tools.
        ...(opts.parentSessionId ? { subagentOf: opts.parentSessionId } : {}),
      });
    },
  });
}

export function homeSubagentInput(objective: string): SubagentInput {
  return {
    objective: objective.slice(0, 8000),
    capabilityTag: "home-helper",
    costCeilingUsd: HOME_CHILD_COST_USD,
    deadlineMs: HOME_CHILD_DEADLINE_MS,
  };
}

export function textFromSubagentResult(result: SubagentResult): string {
  const parts: string[] = [];
  for (const b of result.content) {
    if (b.type === "text" && b.text.trim()) parts.push(b.text.trim());
  }
  return parts.join("\n").slice(0, 16_000);
}

export {
  HOME_CHILD_COST_USD,
  HOME_CHILD_DEADLINE_MS,
  HOME_CHILD_MAX_ITERATIONS,
  HOME_PARENT_MAX_ITERATIONS,
};
