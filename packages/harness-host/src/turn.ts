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

export interface TurnDeps {
  ctx: TurnContext;
  provider: ProviderHandle;
  approval: ApprovalSink;
  fs: SandboxFs;
  /** Optional injected completion (tests / local-only without HTTP). */
  completionText?: string;
  execImpl?: (cmd: string) => Promise<string>;
}

const activeTurnFailures = new Map<string, { message: string; at: string }>();

registerResetHook(() => {
  activeTurnFailures.clear();
});

export function peekTurnFailure(turnId: string): { message: string; at: string } | undefined {
  return activeTurnFailures.get(turnId);
}

export async function dispatchTool(
  deps: TurnDeps,
  req: Omit<ToolDispatchRequest, "accountId" | "agentId" | "turnId">,
): Promise<{ ok: true; output: string } | { ok: false; reason: string }> {
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
    return { ok: false, reason: `tool not implemented: ${req.tool}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  }
}

export interface RunTurnInput {
  userText: string;
  deps: TurnDeps;
  /** Optional tool invocations parsed from harness (tests). */
  plannedTools?: Array<{ tool: string; args: unknown; summary?: string }>;
}

export async function* runTurn(input: RunTurnInput): AsyncGenerator<TurnEvent> {
  const { deps, userText, plannedTools = [] } = input;
  const attempts = [{ id: 0 }];
  for (const _attempt of attempts) {
    try {
      if (!validateIntent("final")) {
        throw new Error("intent gate misconfigured");
      }
      if (!deps.ctx.account_id) {
        throw new Error("envoyhome.bad_params: missing account_id");
      }

      for (const step of plannedTools) {
        if (!validateIntent("tool_call")) break;
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
          return;
        }
        yield { kind: "tool_result", tool: step.tool, text: result.output };
      }

      let assistant: string;
      if (deps.completionText !== undefined) {
        assistant = deps.completionText;
      } else {
        const messages = [
          ...(deps.ctx.standing_inject
            ? [{ role: "system" as const, content: deps.ctx.standing_inject }]
            : []),
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
