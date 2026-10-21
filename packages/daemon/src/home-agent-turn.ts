/**
 * Design §19.13 P2-E3 — parent turn via envoy-harness Agent → TurnEvent stream.
 */

import {
  Agent,
  DEFAULT_RETRY_POLICY,
  HookRegistry,
  type MeshSubmitter,
  type ModelAdapter,
  type TraceEvent,
  type Tracer,
} from "@envoymesh/envoy-harness";
import {
  applyReminderHonestyGuard,
  claimsActuationWithoutTools,
  dispatchTool,
  isHomeOfferQuestion,
  BUILTIN_TOOLS,
  type HistoryMessage,
  type PlannedToolStep,
  type TurnDeps,
  type TurnEvent,
} from "@envoyhome/harness-host";
import {
  HomeModelAdapter,
  buildParentToolRegistry,
  createHomeMeshSubmitter,
  homeTaskArgsToHarness,
  HOME_PARENT_MAX_ITERATIONS,
  type HomeModelAdapterOptions,
} from "./home-harness-bridge.js";
import { HomeAgentSession } from "./home-agent-session.js";
import {
  TASK_DEFAULT_ALLOW,
  TASK_MAX_PARALLEL,
  TASK_MAX_SUBAGENTS,
  filterChildAllowTools,
} from "./harness-subagents.js";

const HOME_SMART_HOME_TOOLS = [
  "ha_list_entities",
  "ha_list_services",
  "ha_get_state",
  "ha_call_service",
  "mqtt_subscribe",
  "mqtt_read",
  "mqtt_publish",
] as const;

export function parentToolNamesForSurface(opts: {
  homeSurface: boolean;
  schedulesSurface: boolean;
}): string[] {
  if (opts.schedulesSurface) return ["schedule"];
  const names = Object.keys(BUILTIN_TOOLS).filter((n) => n !== "task");
  if (opts.homeSurface) {
    for (const t of HOME_SMART_HOME_TOOLS) {
      if (!names.includes(t)) names.push(t);
    }
  }
  return names;
}

export function parentAgentEnabled(): boolean {
  const v = (process.env.ENVOYHOME_PARENT_AGENT ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

/** Live queue: Tracer.emit pushes; generator drains as Agent.run progresses. */
class LiveTurnEventQueue {
  private readonly pending: TurnEvent[] = [];
  private waiters: Array<() => void> = [];
  private closed = false;
  hadSchedulePropose = false;
  toolsDispatched = false;

  push(ev: TurnEvent): void {
    this.pending.push(ev);
    const waiters = this.waiters.splice(0);
    for (const w of waiters) w();
  }

  close(): void {
    this.closed = true;
    const waiters = this.waiters.splice(0);
    for (const w of waiters) w();
  }

  async *drain(): AsyncGenerator<TurnEvent> {
    for (;;) {
      while (this.pending.length > 0) {
        yield this.pending.shift()!;
      }
      if (this.closed) return;
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
  }
}

class LiveTurnTracer implements Tracer {
  constructor(private readonly queue: LiveTurnEventQueue) {}

  emit(event: TraceEvent): void {
    if (event.kind === "tool_call") {
      this.queue.toolsDispatched = true;
      if (event.call.name === "schedule") {
        const args = event.call.args;
        if (args && typeof args === "object" && !Array.isArray(args)) {
          const action = String((args as Record<string, unknown>).action ?? "").toLowerCase();
          if (action === "propose" || action === "" || action === "create") {
            this.queue.hadSchedulePropose = true;
          }
        }
      }
      this.queue.push({
        kind: "tool_call",
        tool: event.call.name,
        text: JSON.stringify(event.call.args ?? {}),
      });
      return;
    }
    if (event.kind === "tool_result") {
      const content =
        typeof event.result.content === "string"
          ? event.result.content
          : JSON.stringify(event.result.content);
      this.queue.push({
        kind: "tool_result",
        tool: event.toolName,
        text: content,
      });
      return;
    }
    if (event.kind === "error") {
      this.queue.push({ kind: "error", text: event.message });
    }
  }
}

/**
 * Match runTurn home fallthrough order:
 * offer question → recover+dispatch → claimsActuation honesty → soft stash.
 */
async function finalizeHomeText(input: {
  raw: string;
  userText: string;
  deps: TurnDeps;
  toolLoop: boolean;
  queue: LiveTurnEventQueue;
}): Promise<void> {
  const { raw, userText, deps, toolLoop, queue } = input;
  const zhTurn =
    /[\u4e00-\u9fff]/.test(raw) || /[\u4e00-\u9fff]/.test(userText);

  const withScheduleOffer = (): string => {
    const offer =
      !queue.hadSchedulePropose && deps.scheduleIntentOffer
        ? deps.scheduleIntentOffer(userText)
        : undefined;
    if (offer) return `${raw.trimEnd()}\n\n${offer}`;
    return applyReminderHonestyGuard(raw, {
      hadSchedulePropose: queue.hadSchedulePropose,
      localeSample: `${userText}\n${raw}`,
    });
  };

  if (!toolLoop || queue.toolsDispatched) {
    queue.push({ kind: "text", text: withScheduleOffer() });
    return;
  }

  // 1. Multi-round offer question → stash pending; do not recover.
  if (isHomeOfferQuestion(raw)) {
    deps.onHomeProposalOffer?.(raw);
    queue.push({ kind: "text", text: withScheduleOffer() });
    return;
  }

  // 2. Recover concrete home tools BEFORE claimsActuation honesty (match runTurn).
  const recovered: PlannedToolStep[] = deps.recoverHomeTools?.(raw) ?? [];
  if (recovered.length > 0) {
    for (const step of recovered) {
      queue.push({
        kind: "tool_call",
        tool: step.tool,
        text: JSON.stringify(step.args),
      });
      const result = await dispatchTool(deps, {
        tool: step.tool,
        args: step.args,
        ...(step.summary !== undefined ? { summary: step.summary } : {}),
      });
      if (!result.ok) {
        queue.push({ kind: "error", text: result.reason });
        return;
      }
      queue.toolsDispatched = true;
      queue.push({ kind: "tool_result", tool: step.tool, text: result.output });
    }
    const honesty = zhTurn
      ? `已提交「${recovered[0]?.summary || recovered[0]?.tool}」— 请在 Approvals 中确认后生效。`
      : `Submitted “${recovered[0]?.summary || recovered[0]?.tool}” — Allow in Approvals to apply.`;
    queue.push({ kind: "text", text: honesty });
    return;
  }

  // 3. Honesty: claimed actuation with no tools / no recover.
  if (claimsActuationWithoutTools(raw)) {
    queue.push({
      kind: "text",
      text: zhTurn
        ? "我还没有真正提交 Approvals 请求。请再说一次具体设备与操作（例如「把走廊恒温器调到 24 度」），或直接在家庭对话里重试。"
        : "I did not actually submit an Approvals request. Please restate the device and action (e.g. “set hallway thermostat to 24”), or try again in Home chat.",
    });
    return;
  }

  // 4. Soft offer / mention → stash for later affirmation.
  deps.onHomeProposalOffer?.(raw);
  queue.push({ kind: "text", text: withScheduleOffer() });
}

export interface RunAgentTurnInput {
  userText: string;
  history: HistoryMessage[];
  deps: TurnDeps;
  sessionDir: string;
  sessionId: string;
  turnId: string;
  toolLoop?: boolean;
  abortSignal?: AbortSignal;
  /** Override model (tests). */
  model?: ModelAdapter;
  meshSubmitter?: MeshSubmitter;
}

/**
 * Build + run parent Agent; yield TurnEvents as Tracer fires (live),
 * then final text after home recover / honesty (same order as runTurn).
 */
export async function* runAgentTurn(
  input: RunAgentTurnInput,
): AsyncGenerator<TurnEvent> {
  const {
    userText,
    history,
    deps,
    sessionDir,
    sessionId,
    turnId,
    toolLoop = false,
  } = input;

  const homeSurface = deps.ctx.policy_snapshot.homeSurface === true;
  const schedulesSurface = deps.ctx.policy_snapshot.schedulesSurface === true;
  const toolNames = parentToolNamesForSurface({ homeSurface, schedulesSurface });

  const adapterOpts: HomeModelAdapterOptions = {
    allowSandbox: !schedulesSurface,
    allowSmartHome: toolLoop && homeSurface && !schedulesSurface,
    schedulesOnly: schedulesSurface,
    normalizeTaskArgs: true,
  };

  const model =
    input.model ??
    new HomeModelAdapter(async (messages) => {
      const standing = deps.ctx.standing_inject;
      const withStanding =
        standing && standing.trim()
          ? [{ role: "system" as const, content: standing }, ...messages]
          : messages;
      const out = await deps.provider.complete({
        messages: withStanding,
        maxTokens: 2048,
      });
      return out.text ?? "";
    }, adapterOpts);

  const tools = buildParentToolRegistry(toolNames, async (tool, args) => {
    const normalized =
      tool === "task" ? (homeTaskArgsToHarness(args) as Record<string, unknown>) : args;
    const result = await dispatchTool(deps, { tool, args: normalized });
    if (!result.ok) throw new Error(result.reason);
    return result.output;
  });

  const session = new HomeAgentSession({
    id: sessionId,
    sessionDir,
    cwd: deps.ctx.sandbox_root,
    turnId,
    userAlreadyPersisted: true,
    history: history.map((h) => ({
      role: h.role,
      content: h.content,
    })),
  });

  const childAllow = filterChildAllowTools([...TASK_DEFAULT_ALLOW]);
  const mesh =
    input.meshSubmitter ??
    createHomeMeshSubmitter({
      model,
      allowTools: childAllow,
      cwd: deps.ctx.sandbox_root,
      parentSessionId: sessionId,
      dispatch: async (tool, args) => {
        if (tool === "task" || tool === "spawn_helper") {
          throw new Error(`envoyhome.tool_unavailable: helper allow-list excludes ${tool}`);
        }
        const result = await dispatchTool(deps, { tool, args });
        if (!result.ok) throw new Error(result.reason);
        return result.output;
      },
    });

  const queue = new LiveTurnEventQueue();
  const tracer = new LiveTurnTracer(queue);
  const hooks = new HookRegistry();
  const systemPrompt = [
    "You are EnvoyHome, the household agent (Design §19.13 P2-E3).",
    schedulesSurface
      ? "This is Schedules chat — only use the schedule tool."
      : `Available tools: ${toolNames.join(", ")}, and task (harness sub-agents).`,
    "When you need a tool, emit a ```envoyhome-tools fence with JSON [{tool,args}].",
    "Prefer answering without tools when possible.",
  ].join("\n");

  const agent = new Agent({
    model,
    tools,
    session,
    hooks,
    cwd: deps.ctx.sandbox_root,
    maxIterations: HOME_PARENT_MAX_ITERATIONS,
    maxSubagents: TASK_MAX_SUBAGENTS,
    maxParallelToolCalls: TASK_MAX_PARALLEL,
    retryPolicy: { ...DEFAULT_RETRY_POLICY, maxRetries: 0 },
    systemPrompt,
    meshSubmitter: mesh,
    tracer,
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
  });

  const runPromise = (async () => {
    try {
      const result = await agent.run(userText);
      const finalText = result.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text.trim())
        .filter(Boolean)
        .join("\n")
        .trim();
      let raw = finalText;
      if (!raw) {
        const last = [...session.messages].reverse().find((m) => m.role === "assistant");
        if (last) {
          raw = last.content
            .filter((b): b is { type: "text"; text: string } => b.type === "text")
            .map((b) => b.text)
            .join("\n")
            .trim();
        }
      }
      if (raw) {
        await finalizeHomeText({
          raw,
          userText,
          deps,
          toolLoop,
          queue,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      queue.push({ kind: "error", text: message });
    } finally {
      queue.close();
    }
  })();

  try {
    for await (const ev of queue.drain()) {
      yield ev;
    }
  } finally {
    await runPromise;
  }
}
