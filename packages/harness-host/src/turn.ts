// Turn loop for built-in envoy-harness (B6). Pre-loop asserts live inside try (R1).

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { registerResetHook } from "@envoyhome/test-utils";
import type { TurnContext } from "./context.js";
import { ApprovalSink, type ToolDispatchRequest } from "./approval-sink.js";
import type { ProviderHandle } from "./provider-handle.js";
import { toolSpec } from "./policy.js";
import { validateIntent } from "./validator.js";

export type TurnEventKind = "text" | "tool_call" | "tool_result" | "error";

export interface TurnEvent {
  kind: TurnEventKind;
  text?: string;
  tool?: string;
}

export interface SandboxFs {
  writeFile(relPath: string, content: string): Promise<void>;
  readFile(relPath: string): Promise<string>;
}

export type PlannedToolStep = { tool: string; args: unknown; summary?: string };

export interface TurnDeps {
  ctx: TurnContext;
  provider: ProviderHandle;
  approval: ApprovalSink;
  fs: SandboxFs;
  /** Optional injected completion (tests / local-only without HTTP). */
  completionText?: string;
  execImpl?: (cmd: string) => Promise<string>;
  /** Optional fetch override for http_fetch (tests / SSRF-wrapped). */
  httpFetchImpl?: typeof fetch;
  /** Daemon extension: skill: / ha_* / mqtt_* after approval. */
  extraToolImpl?: (tool: string, args: Record<string, unknown>) => Promise<string>;
  /**
   * Home tool-loop: recover concrete tools from free-text claims/offers when the
   * model skipped the envoyhome-tools fence (multi-round honesty).
   */
  recoverHomeTools?: (assistantText: string) => PlannedToolStep[] | undefined;
  /** Stash a multi-round offer when the assistant proposed an action without tools. */
  onHomeProposalOffer?: (assistantText: string) => void;
}

const activeTurnFailures = new Map<string, { message: string; at: string }>();

registerResetHook(() => {
  activeTurnFailures.clear();
});

export function peekTurnFailure(turnId: string): { message: string; at: string } | undefined {
  return activeTurnFailures.get(turnId);
}

function isSmartHomeToolName(tool: string): boolean {
  return tool.startsWith("ha_") || tool.startsWith("mqtt_");
}

export async function dispatchTool(
  deps: TurnDeps,
  req: Omit<ToolDispatchRequest, "accountId" | "agentId" | "turnId">,
): Promise<{ ok: true; output: string } | { ok: false; reason: string }> {
  // Design §5.7.8 — general Chat omits ha_*/mqtt_* unless homeSurface is set.
  if (isSmartHomeToolName(req.tool) && deps.ctx.policy_snapshot.homeSurface !== true) {
    return {
      ok: false,
      reason: "envoyhome.tool_unavailable: home tools not enabled for this turn",
    };
  }
  const full: ToolDispatchRequest = {
    accountId: deps.ctx.account_id,
    agentId: deps.ctx.agent_id,
    turnId: deps.ctx.turn_id,
    ...req,
  };
  const decision = await deps.approval.authorize(full);
  if (decision === "denied") {
    return { ok: false, reason: "envoyhome.approval_denied" };
  }
  if (decision === "pending") {
    return { ok: false, reason: "envoyhome.approval_pending" };
  }

  const spec = toolSpec(req.tool);
  if (!spec) return { ok: false, reason: "envoyhome.bad_params: unknown tool" };

  try {
    if (req.tool === "write_file") {
      const args = req.args as { path?: string; content?: string };
      if (typeof args.path !== "string") throw new Error("path required");
      await deps.fs.writeFile(args.path, typeof args.content === "string" ? args.content : "");
      return { ok: true, output: "written" };
    }
    if (req.tool === "read_file") {
      const args = req.args as { path?: string };
      if (typeof args.path !== "string") throw new Error("path required");
      const text = await deps.fs.readFile(args.path);
      return { ok: true, output: text };
    }
    if (req.tool === "exec") {
      const args = req.args as { cmd?: string };
      if (typeof args.cmd !== "string") throw new Error("cmd required");
      const run = deps.execImpl ?? (async () => "ok");
      const out = await run(args.cmd);
      return { ok: true, output: out };
    }
    if (req.tool === "http_fetch") {
      const args = req.args as { url?: string };
      if (typeof args.url !== "string") throw new Error("url required");
      const fetchFn = deps.httpFetchImpl ?? fetch;
      const res = await fetchFn(args.url, { method: "GET", redirect: "error" });
      if (!res.ok) throw new Error(`http_fetch → ${res.status}`);
      const text = await res.text();
      return { ok: true, output: text.slice(0, 64_000) };
    }
    // skill: / ha_* / mqtt_* are handled by the daemon workflow dispatcher.
    if (deps.extraToolImpl) {
      const out = await deps.extraToolImpl(req.tool, (req.args as Record<string, unknown>) ?? {});
      return { ok: true, output: out };
    }
    return { ok: false, reason: `tool not implemented: ${req.tool}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  }
}

export type HistoryMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface RunTurnInput {
  userText: string;
  deps: TurnDeps;
  /** Prior session window (post-compaction); current userText is appended. */
  history?: HistoryMessage[];
  /** Optional tool invocations (local planner / tests). */
  plannedTools?: PlannedToolStep[];
  /**
   * Design §5.7.8 — when true and plannedTools is empty, complete then parse
   * `envoyhome-tools` proposals from the assistant (home-surface fallthrough).
   */
  toolLoop?: boolean;
}

const TOOL_FENCE_RE = /```envoyhome-tools\s*([\s\S]*?)```/i;

/** True when the model claims an Approvals proposal without emitting tools. */
export function claimsActuationWithoutTools(text: string): boolean {
  return /请在\s*Approvals|Allow in Approvals|已请求将|已请求打开|已请求关闭|Requested .+ — Allow/i.test(
    text,
  );
}

/** True when the assistant is asking permission (stash pending — do not dispatch yet). */
export function isHomeOfferQuestion(text: string): boolean {
  return /需要我|要不要|可以帮你|帮你把|shall\s+i|should\s+i|want\s+me\s+to|may\s+i|can\s+i\s+set/i.test(
    text,
  );
}

/** Parse fenced tool proposals from model text (home tool-loop). */
export function parseAssistantToolCalls(text: string): {
  tools: PlannedToolStep[];
  replyText: string;
} {
  const fence = text.match(TOOL_FENCE_RE);
  if (!fence?.[1]) return { tools: [], replyText: text };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fence[1].trim());
  } catch {
    return { tools: [], replyText: text };
  }
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const tools: PlannedToolStep[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.tool !== "string" || !o.tool.trim()) continue;
    // Home tool-loop only accepts smart-home tools (never exec/network sneak).
    if (!isSmartHomeToolName(o.tool)) continue;
    const step: PlannedToolStep = {
      tool: o.tool,
      args: (o.args as unknown) ?? {},
    };
    if (typeof o.summary === "string" && o.summary.trim()) step.summary = o.summary;
    tools.push(step);
  }
  const replyText = text.replace(fence[0], "").trim();
  return { tools, replyText };
}

async function* dispatchPlannedTools(
  deps: TurnDeps,
  steps: PlannedToolStep[],
): AsyncGenerator<TurnEvent, boolean> {
  for (const step of steps) {
    if (!validateIntent("tool_call")) return false;
    yield { kind: "tool_call", tool: step.tool, text: JSON.stringify(step.args) };
    const result = await dispatchTool(deps, {
      tool: step.tool,
      args: step.args,
      ...(step.summary !== undefined ? { summary: step.summary } : {}),
    });
    if (!result.ok) {
      yield { kind: "error", text: result.reason };
      activeTurnFailures.set(deps.ctx.turn_id, {
        message: result.reason,
        at: new Date().toISOString(),
      });
      return false;
    }
    yield { kind: "tool_result", tool: step.tool, text: result.output };
  }
  return true;
}

export async function* runTurn(input: RunTurnInput): AsyncGenerator<TurnEvent> {
  const { deps, userText, plannedTools = [], history = [], toolLoop = false } = input;
  const attempts = [{ id: 0 }];
  for (const _attempt of attempts) {
    try {
      if (!validateIntent("final")) {
        throw new Error("intent gate misconfigured");
      }
      if (!deps.ctx.account_id) {
        throw new Error("envoyhome.bad_params: missing account_id");
      }

      if (plannedTools.length > 0) {
        const ok = yield* dispatchPlannedTools(deps, plannedTools);
        if (!ok) return;
        let assistant: string;
        if (deps.completionText !== undefined) {
          assistant = deps.completionText;
        } else {
          const messages = [
            ...(deps.ctx.standing_inject
              ? [{ role: "system" as const, content: deps.ctx.standing_inject }]
              : []),
            ...history,
            { role: "user" as const, content: userText },
          ];
          const completed = await deps.provider.complete({ messages });
          assistant = completed.text;
        }
        yield { kind: "text", text: assistant };
        return;
      }

      // Home-surface fallthrough: model proposes ha_*/mqtt_* via envoyhome-tools fence.
      if (toolLoop) {
        let assistant: string;
        if (deps.completionText !== undefined) {
          assistant = deps.completionText;
        } else {
          const messages = [
            ...(deps.ctx.standing_inject
              ? [{ role: "system" as const, content: deps.ctx.standing_inject }]
              : []),
            ...history,
            { role: "user" as const, content: userText },
          ];
          const completed = await deps.provider.complete({ messages });
          assistant = completed.text;
        }
        const parsed = parseAssistantToolCalls(assistant);
        if (parsed.tools.length > 0) {
          const ok = yield* dispatchPlannedTools(deps, parsed.tools);
          if (!ok) return;
          yield {
            kind: "text",
            text:
              parsed.replyText ||
              "Requested — Allow in Approvals to apply.",
          };
          return;
        }
        // Multi-round offer (“需要我…吗？”) → stash pending; wait for 是的 / yes.
        if (isHomeOfferQuestion(assistant)) {
          deps.onHomeProposalOffer?.(assistant);
          yield { kind: "text", text: assistant };
          return;
        }
        // Free-text claim/imperative without fence → recover + dispatch if concrete.
        const recovered = deps.recoverHomeTools?.(assistant) ?? [];
        if (recovered.length > 0) {
          const ok = yield* dispatchPlannedTools(deps, recovered);
          if (!ok) return;
          const zh = /[\u4e00-\u9fff]/.test(assistant) || /[\u4e00-\u9fff]/.test(userText);
          yield {
            kind: "text",
            text: zh
              ? `已提交「${recovered[0]?.summary || recovered[0]?.tool}」— 请在 Approvals 中确认后生效。`
              : `Submitted “${recovered[0]?.summary || recovered[0]?.tool}” — Allow in Approvals to apply.`,
          };
          return;
        }
        // Honesty: never surface "Allow in Approvals" when no tool was dispatched.
        if (claimsActuationWithoutTools(assistant)) {
          const zh = /[\u4e00-\u9fff]/.test(assistant) || /[\u4e00-\u9fff]/.test(userText);
          yield {
            kind: "text",
            text: zh
              ? "我还没有真正提交 Approvals 请求。请再说一次具体设备与操作（例如「把走廊恒温器调到 24 度」），或直接在家庭对话里重试。"
              : "I did not actually submit an Approvals request. Please restate the device and action (e.g. “set hallway thermostat to 24”), or try again in Home chat.",
          };
          return;
        }
        // Soft offer / mention → still try to stash for a later affirmation.
        deps.onHomeProposalOffer?.(assistant);
        yield { kind: "text", text: assistant };
        return;
      }

      let assistant: string;
      if (deps.completionText !== undefined) {
        assistant = deps.completionText;
      } else {
        const messages = [
          ...(deps.ctx.standing_inject
            ? [{ role: "system" as const, content: deps.ctx.standing_inject }]
            : []),
          ...history,
          { role: "user" as const, content: userText },
        ];
        const completed = await deps.provider.complete({ messages });
        assistant = completed.text;
      }
      yield { kind: "text", text: assistant };
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      activeTurnFailures.set(deps.ctx.turn_id, { message, at: new Date().toISOString() });
      yield { kind: "error", text: message };
      throw err;
    }
  }
}

export function newTurnId(): string {
  return randomUUID();
}

/** Persist a minimal session transcript line (daemon owns canonical store). */
export async function appendTranscriptLine(
  sessionDir: string,
  line: Record<string, unknown>,
): Promise<void> {
  await mkdir(sessionDir, { recursive: true });
  const path = `${sessionDir}/transcript.jsonl`;
  await writeFile(path, `${JSON.stringify(line)}\n`, { encoding: "utf8", flag: "a" });
}

export async function readTranscript(sessionDir: string): Promise<Record<string, unknown>[]> {
  try {
    const raw = await readFile(`${sessionDir}/transcript.jsonl`, "utf8");
    return raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  } catch {
    return [];
  }
}

/** Replace the whole transcript (post-compaction rewrite). Daemon owns when to call. */
export async function writeTranscript(
  sessionDir: string,
  lines: Record<string, unknown>[],
): Promise<void> {
  await mkdir(sessionDir, { recursive: true });
  const path = `${sessionDir}/transcript.jsonl`;
  const body = lines.map((l) => JSON.stringify(l)).join("\n");
  await writeFile(path, body.length > 0 ? `${body}\n` : "", "utf8");
}
