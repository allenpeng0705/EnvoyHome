// Turn loop for built-in envoy-harness (B6). Pre-loop asserts live inside try (R1).

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { registerResetHook } from "@envoyhome/test-utils";
import type { TurnContext } from "./context.js";
import { ApprovalSink, type ToolDispatchRequest } from "./approval-sink.js";
import type { ProviderHandle } from "./provider-handle.js";
import { isRegisteredMcpTool, toolSpec } from "./policy.js";
import { applyEditFile, applyUnifiedPatch } from "./file-edit.js";
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
  /** Design §9.5e — one-level list; empty path → synthetic roots. */
  listDir?(relPath: string): Promise<string>;
  /** Design §9.5e — basename search; returns JSON string. */
  searchFiles?(opts: {
    pattern: string;
    path?: string;
    maxDepth?: number;
  }): Promise<string>;
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
   * Household browser defaultProfile (§9.5g.1) — used in approval summary when
   * the tool call omits `args.profile` so the prompt matches execution.
   */
  browserDefaultProfile?: string;
  /** Design §9.5h — resolve MCP server label for approval summaries. */
  mcpServerLabel?: (serverId: string) => string | undefined;
  /**
   * Design §7.4 V-CRON-11 — peek a schedule proposal so confirm ask shows resolvedLocal.
   */
  peekScheduleProposal?: (proposalId: string) =>
    | {
        resolvedLocal: string;
        kind?: string;
        message?: string;
        prompt?: string;
        replacesJobId?: string;
      }
    | undefined;
  /**
   * Design §7.4 — when the model skips schedule tools, offer if the resolver
   * already sees a schedule in the user text. Sync; no second model.
   */
  scheduleIntentOffer?: (userText: string) => string | undefined;
  /**
   * Design V-UX-14 — park on a choice card; returns the user's selected labels.
   */
  askUserImpl?: (args: Record<string, unknown>) => Promise<string>;
  /**
   * Design §19.13 P2-E4 — persist session plan checklist (attended plan→execute).
   */
  sessionPlanImpl?: (args: Record<string, unknown>) => Promise<string>;
  /**
   * Home tool-loop: recover concrete tools from free-text claims/offers when the
   * model skipped the envoyhome-tools fence (multi-round honesty).
   */
  recoverHomeTools?: (assistantText: string) => PlannedToolStep[] | undefined;
  /** Stash a multi-round offer when the assistant proposed an action without tools. */
  onHomeProposalOffer?: (assistantText: string) => void;
}

const activeTurnFailures = new Map<string, { message: string; at: string }>();
/** Per-sessionDir mutex — serialize append / rewrite / messageId migrate. */
const transcriptLocks = new Map<string, Promise<void>>();

registerResetHook(() => {
  activeTurnFailures.clear();
  transcriptLocks.clear();
});

export function peekTurnFailure(turnId: string): { message: string; at: string } | undefined {
  return activeTurnFailures.get(turnId);
}

function isSmartHomeToolName(tool: string): boolean {
  return tool.startsWith("ha_") || tool.startsWith("mqtt_");
}

/** Sandbox builtins safe to propose via the envoyhome-tools fence (never exec/http_fetch). */
function isSandboxToolName(
  tool: string,
  opts?: { allowLocalSql?: boolean },
): boolean {
  if (tool === "sql_load" || tool === "sql_query") {
    // V-OFFICE-42 — absent from fence catalogue until DuckDB ready.
    return opts?.allowLocalSql === true;
  }
  return (
    tool === "read_file" ||
    tool === "write_file" ||
    tool === "edit_file" ||
    tool === "apply_patch" ||
    tool === "list_dir" ||
    tool === "search_files" ||
    tool === "knowledge_search" ||
    tool === "knowyou_search" ||
    tool === "export_document" ||
    tool === "extract_document" ||
    tool === "promote_knowledge" ||
    tool === "table_transform" ||
    tool === "chart_table" ||
    tool === "render_diagram" ||
    tool === "render_table" ||
    tool === "view_image"
  );
}

/** Design Memory §7 — remember / recall / session_search (facade-backed; fence-parseable). */
function isMemoryToolName(tool: string): boolean {
  return (
    tool === "memory_remember" ||
    tool === "memory_recall" ||
    tool === "session_search" ||
    tool === "knowledge_search" ||
    tool === "knowyou_search"
  );
}

/** First-class agent network tools (ApprovalSink still gates) — Design §9.5f/§9.5g. */
function isAgentNetworkToolName(tool: string): boolean {
  return (
    tool === "web_search" ||
    tool === "web_extract" ||
    tool === "web_research" ||
    tool === "browser" ||
    tool === "message"
  );
}

/** Design §19.11 / §19.12 / §19.13 — session / media / helper tools. */
function isPhase2AgentToolName(tool: string): boolean {
  return (
    tool === "sessions_list" ||
    tool === "sessions_history" ||
    tool === "sessions_status" ||
    tool === "sessions_send" ||
    tool === "image_generate" ||
    tool === "spawn_helper" ||
    tool === "task"
  );
}

/** Design §9.2 — progressive skill disclosure + propose + legacy skill:<id> shortcut. */
function isSkillDiscoveryToolName(tool: string): boolean {
  return (
    tool === "skills_list" ||
    tool === "skill_view" ||
    tool === "skill_propose" ||
    (tool.startsWith("skill:") && tool.length > "skill:".length)
  );
}

/** Design §7.4 V-CRON-9 — schedule propose/confirm/list via fence. */
function isScheduleToolName(tool: string): boolean {
  return tool === "schedule";
}

/** Design V-UX-14 — EnvoyCoder ask_user peer. */
function isAskUserToolName(tool: string): boolean {
  return tool === "ask_user";
}

/** Design §19.13 P2-E4 — attended session plan checklist. */
function isSessionPlanToolName(tool: string): boolean {
  return tool === "session_plan";
}

/** Design §9.5h — Owner MCP catalogue tools (`mcp__<server>__<tool>`). */
function isMcpToolName(tool: string): boolean {
  return tool.startsWith("mcp__") && tool.length > "mcp__".length;
}

export type ParseToolCallsOptions = {
  /** Design §5.7.8 — ha_/mqtt_ tools only when home surface tool-loop is on. */
  allowSmartHome?: boolean;
  /** Design §9.5b/c — sandbox file tools on every chat turn. */
  allowSandbox?: boolean;
  /** Design §7.4 — Schedules chat accepts only the schedule tool. */
  schedulesOnly?: boolean;
  /**
   * Attended parent turns MAY propose `exec` / `http_fetch` via fence;
   * ApprovalSink still asks / grants. Default false (children / schedules).
   */
  allowExec?: boolean;
  allowHttpFetch?: boolean;
  /**
   * Design §9.5k / V-OFFICE-42 — include sql_load/sql_query in fence parse
   * only when DuckDB is ready. Default false (absent until ready).
   */
  allowLocalSql?: boolean;
};

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
  if (deps.ctx.policy_snapshot.schedulesSurface === true && req.tool !== "schedule") {
    return {
      ok: false,
      reason: "envoyhome.tool_unavailable: Schedules chat only runs the schedule tool",
    };
  }
  let summary = req.summary;
  if (req.tool === "browser" && (!summary || !summary.trim())) {
    const a = (req.args ?? {}) as Record<string, unknown>;
    const action = typeof a.action === "string" ? a.action : "browser";
    const profile =
      typeof a.profile === "string" && a.profile.trim()
        ? a.profile.trim()
        : deps.browserDefaultProfile?.trim() || "managed";
    const bits: string[] = [];
    if (typeof a.url === "string" && a.url.trim()) bits.push(a.url.trim());
    else if (typeof a.targetId === "string" && a.targetId.trim()) {
      bits.push(`target=${a.targetId.trim()}`);
    }
    if (action === "act") {
      if (typeof a.kind === "string" && a.kind.trim()) bits.push(a.kind.trim());
      if (typeof a.ref === "string" && a.ref.trim()) bits.push(`ref=${a.ref.trim()}`);
      if (typeof a.snapshotId === "string" && a.snapshotId.trim()) {
        bits.push(`snap=${a.snapshotId.trim()}`);
      }
      if (typeof a.verify === "string" && a.verify.trim()) bits.push(`verify=${a.verify.trim()}`);
    } else if (action === "wait") {
      if (typeof a.until === "string" && a.until.trim()) bits.push(`until=${a.until.trim()}`);
      if (a.ms !== undefined) bits.push(`ms=${String(a.ms)}`);
    } else if (action === "press") {
      const key = typeof a.key === "string" ? a.key : typeof a.text === "string" ? a.text : "";
      if (key.trim()) bits.push(`key=${key.trim()}`);
    } else if (action === "propose_form" || action === "apply_form") {
      if (typeof a.snapshotId === "string" && a.snapshotId.trim()) {
        bits.push(`snap=${a.snapshotId.trim()}`);
      }
      if (Array.isArray(a.fields)) {
        bits.push(`fields=${a.fields.length}`);
        // §9.5g.3 / P2-J — name file fields only (no paths / values).
        const fileLabels = a.fields
          .filter(
            (f): f is Record<string, unknown> =>
              !!f && typeof f === "object" && !Array.isArray(f) && (f as { kind?: string }).kind === "file",
          )
          .map((f) => String((f as { label?: string }).label ?? (f as { id?: string }).id ?? "file").trim())
          .filter(Boolean)
          .slice(0, 6);
        if (fileLabels.length) bits.push(`files=${fileLabels.join(",")}`);
      }
      // Never put fieldValues / passwords / file paths into the approval summary.
    }
    const extra = bits.length ? ` ${bits.join(" ")}` : "";
    summary = `browser ${action} [${profile}]${extra}`;
  }
  if (isMcpToolName(req.tool) && (!summary || !summary.trim())) {
    const rest = req.tool.slice("mcp__".length);
    const sep = rest.indexOf("__");
    const serverId = sep > 0 ? rest.slice(0, sep) : rest;
    const toolPart = sep > 0 ? rest.slice(sep + 2) : "tool";
    const label = deps.mcpServerLabel?.(serverId)?.trim() || serverId || "mcp";
    const dig = (() => {
      try {
        const blob = JSON.stringify(req.args ?? {});
        return blob.length > 80 ? `${blob.slice(0, 80)}…` : blob;
      } catch {
        return "";
      }
    })();
    summary = dig ? `mcp:${label} ${toolPart} ${dig}` : `mcp:${label} ${toolPart}`;
  }
  if (req.tool === "schedule") {
    const a = (req.args ?? {}) as Record<string, unknown>;
    const action = typeof a.action === "string" ? a.action.trim().toLowerCase() : "schedule";
    if (action === "confirm") {
      const proposalId =
        typeof a.proposalId === "string" ? a.proposalId.trim() : "";
      const peeked =
        proposalId && deps.peekScheduleProposal
          ? deps.peekScheduleProposal(proposalId)
          : undefined;
      const resolved =
        peeked?.resolvedLocal ||
        (typeof a.resolvedLocal === "string" ? a.resolvedLocal.trim() : "");
      const payload =
        a.payload && typeof a.payload === "object" && !Array.isArray(a.payload)
          ? (a.payload as Record<string, unknown>)
          : undefined;
      const agentPrompt =
        (typeof payload?.prompt === "string" ? payload.prompt.trim() : "") ||
        (typeof peeked?.prompt === "string" ? peeked.prompt.trim() : "");
      // V-CRON-11 — confirm ask MUST surface resolvedLocal when known.
      if (resolved.length > 0) {
        const verb = peeked?.replacesJobId ? "Change schedule to" : "Arm schedule at";
        summary =
          agentPrompt.length > 0
            ? `${verb} ${resolved} · agent: ${agentPrompt.slice(0, 80)}`
            : `${verb} ${resolved}`;
      } else {
        summary =
          summary?.trim() ||
          `schedule confirm${proposalId ? ` ${proposalId.slice(0, 12)}…` : ""}`;
      }
    } else if (action === "remove") {
      summary = summary?.trim() || "Remove schedule";
    } else if (action === "enable") {
      const enabled = a.enabled === true;
      summary = summary?.trim() || (enabled ? "Resume schedule" : "Pause schedule");
    } else if (action === "rename") {
      const name = typeof a.name === "string" ? a.name.trim() : "";
      summary = summary?.trim() || (name ? `Rename schedule to ${name}` : "Rename schedule");
    } else if (!summary || !summary.trim()) {
      const extra =
        typeof a.text === "string"
          ? ` ${a.text.slice(0, 80)}`
          : typeof a.proposalId === "string"
            ? ` ${a.proposalId.slice(0, 12)}…`
            : "";
      summary = `schedule ${action}${extra}`;
    }
  }
  const full: ToolDispatchRequest = {
    accountId: deps.ctx.account_id,
    agentId: deps.ctx.agent_id,
    turnId: deps.ctx.turn_id,
    ...req,
    ...(summary !== undefined ? { summary } : {}),
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
      // Echo normalized path so thin-client Open chips fire (Design §9.5d / V-OUT-3).
      const echo = normalizeSandboxEchoPath(args.path);
      return { ok: true, output: `Written: \`${echo}\`` };
    }
    if (req.tool === "edit_file") {
      const args = req.args as Record<string, unknown>;
      const path = typeof args.path === "string" ? args.path : "";
      if (!path) throw new Error("path required");
      const existing = await deps.fs.readFile(path);
      const edited = applyEditFile(existing, {
        path,
        ...(typeof args.oldString === "string"
          ? { oldString: args.oldString }
          : typeof args.old_string === "string"
            ? { oldString: args.old_string }
            : {}),
        ...(typeof args.newString === "string"
          ? { newString: args.newString }
          : typeof args.new_string === "string"
            ? { newString: args.new_string }
            : {}),
        ...(typeof args.startLine === "number"
          ? { startLine: args.startLine }
          : typeof args.start_line === "number"
            ? { startLine: args.start_line }
            : {}),
        ...(typeof args.endLine === "number"
          ? { endLine: args.endLine }
          : typeof args.end_line === "number"
            ? { endLine: args.end_line }
            : {}),
      });
      if (!edited.ok) throw new Error(edited.reason);
      await deps.fs.writeFile(path, edited.content);
      const echo = normalizeSandboxEchoPath(path);
      return { ok: true, output: `Edited: \`${echo}\` (${edited.detail})` };
    }
    if (req.tool === "apply_patch") {
      const args = req.args as Record<string, unknown>;
      const patch =
        typeof args.patch === "string"
          ? args.patch
          : typeof args.diff === "string"
            ? args.diff
            : "";
      const pathHint = typeof args.path === "string" ? args.path.trim() : "";
      const cache = new Map<string, string>();
      const existingByPath = (rel: string): string | undefined => {
        if (cache.has(rel)) return cache.get(rel);
        return undefined;
      };
      // First pass: resolve path from args/headers (empty loader → "file not found" or path errors).
      let applied = applyUnifiedPatch(existingByPath, {
        ...(pathHint ? { path: pathHint } : {}),
        patch,
      });
      if (!applied.ok && /file not found for patch/.test(applied.reason)) {
        const missingPath = /file not found for patch: (.+)$/.exec(applied.reason)?.[1]?.trim();
        const toRead = missingPath || pathHint;
        if (toRead) {
          try {
            cache.set(toRead, await deps.fs.readFile(toRead));
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`envoyhome.bad_params: cannot read ${toRead}: ${message}`);
          }
          applied = applyUnifiedPatch(existingByPath, {
            ...(pathHint ? { path: pathHint } : {}),
            patch,
          });
        }
      }
      if (!applied.ok) throw new Error(applied.reason);
      await deps.fs.writeFile(applied.path, applied.content);
      const echo = normalizeSandboxEchoPath(applied.path);
      return { ok: true, output: `Patched: \`${echo}\` (${applied.detail})` };
    }
    if (req.tool === "read_file") {
      const args = req.args as { path?: string };
      if (typeof args.path !== "string") throw new Error("path required");
      const text = await deps.fs.readFile(args.path);
      return { ok: true, output: text };
    }
    if (req.tool === "list_dir") {
      const args = req.args as { path?: string };
      const list = deps.fs.listDir;
      if (!list) throw new Error("list_dir not available");
      const path = typeof args.path === "string" ? args.path : "";
      return { ok: true, output: await list(path) };
    }
    if (req.tool === "search_files") {
      const args = req.args as { pattern?: string; path?: string; maxDepth?: number };
      const search = deps.fs.searchFiles;
      if (!search) throw new Error("search_files not available");
      if (typeof args.pattern !== "string" || !args.pattern.trim()) {
        throw new Error("pattern required");
      }
      const opts: { pattern: string; path?: string; maxDepth?: number } = {
        pattern: args.pattern,
      };
      if (typeof args.path === "string") opts.path = args.path;
      if (typeof args.maxDepth === "number") opts.maxDepth = args.maxDepth;
      return { ok: true, output: await search(opts) };
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
    if (req.tool === "ask_user") {
      if (!deps.askUserImpl) {
        throw new Error("envoyhome.tool_unavailable: ask_user not configured");
      }
      const args =
        req.args && typeof req.args === "object" && !Array.isArray(req.args)
          ? (req.args as Record<string, unknown>)
          : {};
      return { ok: true, output: await deps.askUserImpl(args) };
    }
    if (req.tool === "session_plan") {
      if (!deps.sessionPlanImpl) {
        throw new Error("envoyhome.tool_unavailable: session_plan not configured");
      }
      const args =
        req.args && typeof req.args === "object" && !Array.isArray(req.args)
          ? (req.args as Record<string, unknown>)
          : {};
      return { ok: true, output: await deps.sessionPlanImpl(args) };
    }
    // export_document / skill: / ha_* / mqtt_* — daemon workflow dispatcher.
    if (deps.extraToolImpl) {
      const out = await deps.extraToolImpl(req.tool, (req.args as Record<string, unknown>) ?? {});
      return { ok: true, output: out };
    }
    if (
      req.tool === "export_document" ||
      req.tool === "extract_document" ||
      req.tool === "promote_knowledge" ||
      req.tool === "table_transform" ||
      req.tool === "sql_load" ||
      req.tool === "sql_query" ||
      req.tool === "chart_table" ||
      req.tool === "render_diagram" ||
      req.tool === "render_table" ||
      req.tool === "web_search" ||
      req.tool === "web_extract" ||
      req.tool === "web_research"
    ) {
      return {
        ok: false,
        reason: `tool not implemented: ${req.tool} (daemon required)`,
      };
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
  /** Design §9.5k / V-OFFICE-42 — DuckDB ready → fence may parse sql_*. */
  localSqlReady?: boolean;
}

/**
 * Extract ```envoyhome-tools body. Models often nest ```json inside, and a
 * non-greedy ```…``` would close on that opener and yield an empty body.
 */
function extractEnvoyhomeToolsFence(
  text: string,
): { body: string; fullMatch: string } | undefined {
  const open = /```envoyhome-tools\b/i.exec(text);
  if (!open) return undefined;
  let i = open.index + open[0].length;
  while (i < text.length && /[ \t\r\n]/.test(text[i]!)) i += 1;
  const nest = /^```(?:json|javascript)?[ \t]*\r?\n?/i.exec(text.slice(i));
  if (nest) i += nest[0].length;
  const close = text.indexOf("```", i);
  const end = close >= 0 ? close : text.length;
  const body = text.slice(i, end).trim();
  const fullMatch = text.slice(open.index, close >= 0 ? close + 3 : text.length);
  return { body, fullMatch };
}

/** True when the model claims an Approvals proposal without emitting tools. */
export function claimsActuationWithoutTools(text: string): boolean {
  return /请在\s*Approvals|Allow in Approvals|已请求将|已请求打开|已请求关闭|Requested .+ — Allow/i.test(
    text,
  );
}

/**
 * True when the assistant claims a reminder was/will-be created without schedule propose.
 * Skips offers / hypotheticals across product UI locales.
 */
export function claimsReminderWithoutPropose(text: string): boolean {
  // Soft offer / hypothetical — not a claim that a job exists.
  if (
    /\b(would you like|want me to|shall i|should i|i can|i could|i might)\b/i.test(text) ||
    /要不要|需要我|我可以提醒|如果你想|要是你愿意/.test(text) ||
    /\b(möchtest du|soll ich|kann ich dich|darf ich)\b/i.test(text) ||
    /\b(veux[- ]tu|voulez[- ]vous|puis[- ]je|je peux te|je peux vous)\b/i.test(text) ||
    /\b(vuoi che|posso|desideri che)\b/i.test(text) ||
    /リマインドしましょうか|思い出させましょうか|設定しましょうか/.test(text) ||
    /알려드릴까요|리마인더를?\s*설정할까요|상기시켜\s*드릴까요/.test(text)
  ) {
    return false;
  }
  return (
    /\bI('ll| will)\s+(set|schedule|create|add)\b[\s\S]{0,80}\b(remind|reminder|alarm)\b/i.test(
      text,
    ) ||
    /\bI('ve| have)\s+(set|scheduled|created|added)\b[\s\S]{0,80}\b(remind|reminder)\b/i.test(
      text,
    ) ||
    /\breminder\s+(is|has been|was)\s+(set|scheduled|created)\b/i.test(text) ||
    /我会提醒你|已经?(帮你)?(设好|设置|预约|安排)(了)?提醒|提醒已(设置|安排|创建)|已为你(设置|安排)提醒/.test(
      text,
    ) ||
    /\b(ich habe|ich werde)\b[\s\S]{0,80}\b(erinnerung|wecker)\b/i.test(text) ||
    /\b(j['']ai|je vais)\b[\s\S]{0,80}\b(rappel|alarme)\b/i.test(text) ||
    /\b(ho|provo a)\b[\s\S]{0,80}\b(promemoria|sveglia)\b/i.test(text) ||
    /リマインダーを?(設定|作成|追加)(しました|します)|リマインドを?(設定|作成)/.test(text) ||
    /리마인더를?\s*(설정|만들|추가)(했|할)|알림을?\s*(설정|만들)/.test(text)
  );
}

/** Pick honesty disclaimer language from assistant+user script / keywords. */
export function honestyDisclaimerLocale(sample: string): "en" | "zh" | "de" | "fr" | "it" | "ja" | "ko" {
  if (/[\u3040-\u30ff]/.test(sample)) return "ja";
  if (/[\uac00-\ud7af]/.test(sample)) return "ko";
  if (/[\u4e00-\u9fff]/.test(sample)) return "zh";
  if (/\b(erinnerung|erinnere|wecker)\b/i.test(sample)) return "de";
  if (/\b(rappel|rappelle|alarme)\b/i.test(sample)) return "fr";
  if (/\b(promemoria|ricord|sveglia)\b/i.test(sample)) return "it";
  return "en";
}

const HONESTY_DISCLAIMER: Record<
  ReturnType<typeof honestyDisclaimerLocale>,
  string
> = {
  en: "\n\n(No schedule propose ran — a reminder was not actually created. Confirm a time and try again.)",
  zh: "\n\n（尚未调用 schedule propose — 提醒还没有真正创建。请确认时间后再试。）",
  de: "\n\n(Kein schedule propose — die Erinnerung wurde nicht wirklich erstellt. Bitte Zeit bestätigen und erneut versuchen.)",
  fr: "\n\n(Aucun schedule propose — le rappel n'a pas vraiment été créé. Confirmez l'heure et réessayez.)",
  it: "\n\n(Nessun schedule propose — il promemoria non è stato davvero creato. Conferma l'orario e riprova.)",
  ja: "\n\n（schedule propose が実行されていません — リマインダーはまだ作成されていません。時刻を確認してもう一度お試しください。）",
  ko: "\n\n(schedule propose가 실행되지 않았습니다 — 리마인더가 실제로 만들어지지 않았습니다. 시간을 확인한 뒤 다시 시도하세요.)",
};

export function applyReminderHonestyGuard(
  text: string,
  opts: { hadSchedulePropose: boolean; zh?: boolean; localeSample?: string },
): string {
  if (opts.hadSchedulePropose || !claimsReminderWithoutPropose(text)) return text;
  const loc =
    opts.localeSample !== undefined
      ? honestyDisclaimerLocale(opts.localeSample)
      : opts.zh
        ? "zh"
        : honestyDisclaimerLocale(text);
  return `${text.trimEnd()}${HONESTY_DISCLAIMER[loc]}`;
}

function toolsIncludeSchedulePropose(tools: PlannedToolStep[]): boolean {
  return tools.some((t) => {
    if (t.tool !== "schedule") return false;
    const action = (t.args as Record<string, unknown> | undefined)?.action;
    return action === "propose" || action === "reschedule";
  });
}

function toolsTouchedSchedule(tools: PlannedToolStep[]): boolean {
  return tools.some((t) => t.tool === "schedule");
}

/** True when the assistant is asking permission (stash pending — do not dispatch yet). */
export function isHomeOfferQuestion(text: string): boolean {
  return /需要我|要不要|可以帮你|帮你把|shall\s+i|should\s+i|want\s+me\s+to|may\s+i|can\s+i\s+set|möchtest\s+du|soll\s+ich|veux[- ]tu|voulez[- ]vous|puis[- ]je|vuoi\s+che|posso\s+|しましょうか|할까요/i.test(
    text,
  );
}

/** Parse fenced tool proposals from model text. */
export function parseAssistantToolCalls(
  text: string,
  opts?: ParseToolCallsOptions,
): {
  tools: PlannedToolStep[];
  replyText: string;
} {
  const allowSmartHome = opts?.allowSmartHome !== false;
  const allowSandbox = opts?.allowSandbox === true;
  const schedulesOnly = opts?.schedulesOnly === true;
  const allowExec = opts?.allowExec === true;
  const allowHttpFetch = opts?.allowHttpFetch === true;
  const allowLocalSql = opts?.allowLocalSql === true;
  const fence = extractEnvoyhomeToolsFence(text);
  if (!fence?.body) {
    const bare = bareScheduleSteps(text);
    return { tools: bare, replyText: text };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fence.body);
  } catch {
    const bare = bareScheduleSteps(text);
    return { tools: bare, replyText: text };
  }
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const tools: PlannedToolStep[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.tool !== "string" || !o.tool.trim()) continue;
    const name = o.tool.trim();
    // exec/http_fetch only when explicitly opted in (parent attended); ApprovalSink still gates.
    const okSchedule = isScheduleToolName(name);
    const okAskUser = isAskUserToolName(name);
    const okSessionPlan = isSessionPlanToolName(name);
    // Only hub-registered catalogue names — reject invented mcp__* fences.
    const okMcp = isRegisteredMcpTool(name);
    if (schedulesOnly) {
      if (!okSchedule) continue;
    } else {
      const okHome = allowSmartHome && isSmartHomeToolName(name);
      const okSandbox =
        allowSandbox && isSandboxToolName(name, { allowLocalSql });
      const okAgentNet = isAgentNetworkToolName(name);
      const okPhase2 = isPhase2AgentToolName(name);
      // Skills discovery is read-tier; allow whenever sandbox tools are allowed (not schedules-only).
      const okSkill = allowSandbox && isSkillDiscoveryToolName(name);
      const okMemory = allowSandbox && isMemoryToolName(name);
      const okExec = allowExec && name === "exec";
      const okHttp = allowHttpFetch && name === "http_fetch";
      if (
        !okHome &&
        !okSandbox &&
        !okAgentNet &&
        !okSchedule &&
        !okAskUser &&
        !okSessionPlan &&
        !okMcp &&
        !okPhase2 &&
        !okSkill &&
        !okMemory &&
        !okExec &&
        !okHttp
      ) {
        continue;
      }
    }
    const step: PlannedToolStep = {
      tool: name,
      args: liftToolArgs(o),
    };
    if (typeof o.summary === "string" && o.summary.trim()) step.summary = o.summary;
    tools.push(step);
  }
  const replyText = fence.fullMatch
    ? text.replace(fence.fullMatch, "").trim()
    : text;
  if (!tools.some((t) => t.tool === "schedule")) {
    for (const step of bareScheduleSteps(text)) tools.push(step);
  }
  return { tools, replyText };
}

/** Model sometimes puts action/text next to tool instead of under args. */
function liftToolArgs(o: Record<string, unknown>): Record<string, unknown> {
  if (o.args && typeof o.args === "object" && !Array.isArray(o.args)) {
    return o.args as Record<string, unknown>;
  }
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(o)) {
    if (key === "tool" || key === "summary") continue;
    rest[key] = value;
  }
  return rest;
}

/** Schedule JSON left in `<think>` or prose, not an envoyhome-tools fence. */
function bareScheduleSteps(text: string): PlannedToolStep[] {
  const out: PlannedToolStep[] = [];
  const re = /\{[^{}]*"tool"\s*:\s*"schedule"[^{}]*\}/g;
  for (const m of text.matchAll(re)) {
    try {
      const o = JSON.parse(m[0]) as Record<string, unknown>;
      if (o.tool !== "schedule") continue;
      out.push({ tool: "schedule", args: liftToolArgs(o) });
    } catch {
      /* ignore malformed */
    }
  }
  return out;
}

/**
 * Normalize a tool path for thin-client Open chips (Design §9.5d / V-OUT-3).
 * Strips leading `./` and `/`, unifies separators — chip regexes need a clean
 * `documents|output|knowledge|uploads|workspace/` prefix.
 */
export function normalizeSandboxEchoPath(path: string): string {
  let p = String(path || "").replace(/\\/g, "/").trim();
  while (p.startsWith("./")) p = p.slice(2);
  while (p.startsWith("/")) p = p.slice(1);
  // Collapse duplicate slashes (not significant for virtual prefixes).
  p = p.replace(/\/{2,}/g, "/");
  return p;
}

/** Design §7.4 — humanize schedule tool JSON for chat (no raw propose dump). */
export function formatScheduleToolOutput(output: string): string | undefined {
  try {
    const j = JSON.parse(output) as Record<string, unknown>;
    if (typeof j.resolvedLocal === "string" && j.resolvedLocal.trim()) {
      const msg =
        typeof j.message === "string" && j.message.trim()
          ? ` — ${j.message.trim().slice(0, 80)}`
          : "";
      const rel =
        typeof j.relativeHint === "string" && j.relativeHint.trim()
          ? ` (${j.relativeHint.trim()})`
          : "";
      return `Proposed for ${j.resolvedLocal.trim()}${rel}${msg} — not armed yet. Confirm after you agree.`;
    }
    if (j.updated === true) {
      return "Schedule time updated.";
    }
    if (j.removed === true) {
      return "Schedule removed.";
    }
    if (typeof j.enabled === "boolean" && j.job) {
      return j.enabled ? "Schedule resumed." : "Schedule paused.";
    }
    if (j.renamed === true) {
      return "Schedule renamed.";
    }
    if (j.armed === true) {
      const job =
        j.job && typeof j.job === "object" && !Array.isArray(j.job)
          ? (j.job as Record<string, unknown>)
          : undefined;
      const next =
        typeof job?.nextRunAt === "string" && job.nextRunAt
          ? ` · next ${job.nextRunAt}`
          : "";
      return `Schedule armed${next}.`;
    }
    if (Array.isArray(j.jobs)) {
      return `${j.jobs.length} schedule${j.jobs.length === 1 ? "" : "s"} listed.`;
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

/** Tools whose results may carry an openable sandbox/workspace path for thin clients. */
function isFileHandoffToolName(tool: string): boolean {
  return (
    tool === "write_file" ||
    tool === "edit_file" ||
    tool === "apply_patch" ||
    tool === "export_document" ||
    tool === "extract_document" ||
    tool === "promote_knowledge" ||
    tool === "table_transform" ||
    tool === "sql_load" ||
    tool === "sql_query" ||
    tool === "chart_table" ||
    tool === "render_diagram" ||
    tool === "render_table" ||
    tool === "image_generate" ||
    tool === "browser"
  );
}

function isChipReadySandboxPath(path: string): boolean {
  const p = normalizeSandboxEchoPath(path);
  return (
    !!p &&
    !p.includes("..") &&
    !p.includes("\0") &&
    /^(output|documents|knowledge|uploads|workspace)\//.test(p)
  );
}

const SANDBOX_TICK_PATH_RE =
  /`((?:output|documents|knowledge|uploads|workspace)\/[^`\n]+)`/g;

/** First chip-ready path in a handoff line (primary open target). */
function primaryHandoffPath(line: string): string | undefined {
  const m = /`((?:output|documents|knowledge|uploads|workspace)\/[^`\n]+)`/.exec(line);
  return m?.[1] ? String(m[1]).replace(/\\/g, "/") : undefined;
}

/** True when `text` already cites `path` (backticks, bare, or markdown href). */
function textCitesSandboxPath(text: string, path: string): boolean {
  if (!path) return false;
  if (text.includes(path)) return true;
  // Percent-encoded href form: output%2Fexports%2F…
  try {
    if (text.includes(encodeURIComponent(path))) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Append file-handoff lines (chip-ready backtick paths) that are not already
 * cited in `text`. Used by parent Agent turns (Design §9.5d) so mobile/desktop
 * Open chips fire even when the model omits the path.
 *
 * Decision key = **primary** (first) backtick path only — avoids duplicating an
 * extract line when the uri is cited but `from \`source\`` is not.
 */
export function appendMissingSandboxHandoffLines(
  text: string,
  results: Array<{ tool: string; output: string }>,
): string {
  const fileResults = results.filter((r) => isFileHandoffToolName(r.tool));
  const lines = formatSandboxToolResultLines(fileResults);
  if (!lines.length) return text;
  const present = new Set<string>();
  for (const m of text.matchAll(SANDBOX_TICK_PATH_RE)) {
    present.add(String(m[1]).replace(/\\/g, "/"));
  }
  const missing: string[] = [];
  for (const line of lines) {
    const primary = primaryHandoffPath(line);
    if (!primary) continue;
    if (present.has(primary) || textCitesSandboxPath(text, primary)) {
      present.add(primary);
      continue;
    }
    present.add(primary);
    missing.push(line);
  }
  if (!missing.length) return text;
  const base = text.trimEnd();
  return base ? `${base}\n\n${missing.join("\n")}` : missing.join("\n");
}

/**
 * Owner-facing copy for common table/SQL refuse / cap errors.
 * Returns undefined when the message is not a known data-tool failure.
 */
export function humanizeSandboxToolError(
  tool: string,
  reason: string,
): string | undefined {
  const msg = String(reason || "").trim();
  if (!msg) return undefined;
  const lower = msg.toLowerCase();
  if (
    /result exceeds\s*10[_\s]?000\s*rows/i.test(msg) ||
    /exceeds\s*10[_\s]?000\s*rows/i.test(msg) ||
    (lower.includes("10000") && lower.includes("row"))
  ) {
    return "Result over 10 000 rows — filter first with table_transform or split the ask.";
  }
  if (/exceeds\s*\d+\s*cols|max.*cols|64\s*cols/i.test(msg) && lower.includes("col")) {
    return "Too many columns (cap 64) — select_columns / drop unused fields first.";
  }
  if (
    tool === "sql_query" &&
    (/not found|unknown table|catalog error|no such table/i.test(msg) ||
      /registry/i.test(msg))
  ) {
    return "SQL table missing — call sql_load first (or pass tables[]), then sql_query.";
  }
  if (tool === "sql_load" && /registry exceeds|clear or drop/i.test(msg)) {
    return "Too many registered SQL tables — sql_load with clear:true or drop unused names.";
  }
  if (
    /localsql_not_ready|duckdb.*not|sql_.*absent|local.?sql.*not ready/i.test(msg)
  ) {
    return "DuckDB is not ready — Owner installs under System → Files (never silent).";
  }
  if (/attach|copy\s|http:\/\/|https:\/\/|read_csv|read_parquet/i.test(msg) && tool.startsWith("sql")) {
    return "That SQL statement is refused (no ATTACH/COPY/remote URLs) — keep queries on loaded jail tables.";
  }
  if (/envoyhome\.bad_params:/i.test(msg)) {
    const rest = msg.replace(/^[\s\S]*envoyhome\.bad_params:\s*/i, "").trim();
    if (rest) return rest.slice(0, 240);
  }
  return undefined;
}

/** Human-readable lines for sandbox + schedule tool outputs (esp. export_document uri). */
export function formatSandboxToolResultLines(
  results: Array<{ tool: string; output: string }>,
): string[] {
  const lines: string[] = [];
  for (const r of results) {
    if (r.tool === "schedule") {
      const human = formatScheduleToolOutput(r.output);
      lines.push(human ?? `schedule → ${r.output.slice(0, 240)}`);
      continue;
    }
    if (r.tool === "export_document") {
      try {
        const j = JSON.parse(r.output) as {
          uri?: string;
          bytes?: number;
          format?: string;
          mimeType?: string;
        };
        if (typeof j.uri === "string" && j.uri) {
          const uri = normalizeSandboxEchoPath(j.uri);
          if (!isChipReadySandboxPath(uri)) {
            lines.push(`export_document → ${r.output.slice(0, 500)}`);
            continue;
          }
          const fmt = typeof j.format === "string" ? j.format : "file";
          const bytes = typeof j.bytes === "number" ? `, ${j.bytes} bytes` : "";
          lines.push(`Exported ${fmt}: \`${uri}\`${bytes}`);
          continue;
        }
      } catch {
        /* fall through */
      }
      lines.push(`export_document → ${r.output.slice(0, 500)}`);
    } else if (r.tool === "extract_document") {
      try {
        const j = JSON.parse(r.output) as {
          uri?: string;
          extractChars?: number;
          extractor?: string;
          sourcePath?: string;
        };
        if (typeof j.uri === "string" && j.uri) {
          const uri = normalizeSandboxEchoPath(j.uri);
          if (!isChipReadySandboxPath(uri)) {
            lines.push(`extract_document → ${r.output.slice(0, 500)}`);
            continue;
          }
          const chars =
            typeof j.extractChars === "number" ? `, ${j.extractChars} chars` : "";
          const srcRaw =
            typeof j.sourcePath === "string" ? normalizeSandboxEchoPath(j.sourcePath) : "";
          const src =
            srcRaw && isChipReadySandboxPath(srcRaw) ? ` from \`${srcRaw}\`` : "";
          lines.push(`Extracted Markdown: \`${uri}\`${src}${chars}`);
          continue;
        }
      } catch {
        /* fall through */
      }
      lines.push(`extract_document → ${r.output.slice(0, 500)}`);
    } else if (r.tool === "promote_knowledge") {
      try {
        const j = JSON.parse(r.output) as {
          knowledgePath?: string;
          sourcePath?: string;
          bytes?: number;
        };
        if (typeof j.knowledgePath === "string" && j.knowledgePath) {
          const kp = normalizeSandboxEchoPath(j.knowledgePath);
          if (!isChipReadySandboxPath(kp)) {
            lines.push(`promote_knowledge → ${r.output.slice(0, 500)}`);
            continue;
          }
          const bytes = typeof j.bytes === "number" ? `, ${j.bytes} bytes` : "";
          lines.push(`Promoted to Doc KB: \`${kp}\`${bytes}`);
          continue;
        }
      } catch {
        /* fall through */
      }
      lines.push(`promote_knowledge → ${r.output.slice(0, 500)}`);
    } else if (r.tool === "table_transform") {
      try {
        const j = JSON.parse(r.output) as {
          uri?: string;
          summary?: string;
          preview?: string;
          rows?: number;
          cols?: number;
        };
        if (typeof j.uri === "string" && j.uri) {
          const uri = normalizeSandboxEchoPath(j.uri);
          if (isChipReadySandboxPath(uri)) {
            const dims =
              typeof j.rows === "number" && typeof j.cols === "number"
                ? `${j.rows}×${j.cols}`
                : "";
            const summary =
              typeof j.summary === "string" && j.summary.trim()
                ? j.summary.trim().replace(/\n+/g, "; ")
                : "";
            const detail = [dims, summary].filter(Boolean).join(" — ");
            lines.push(`Table transform: \`${uri}\`${detail ? ` — ${detail}` : ""}`);
            continue;
          }
        }
      } catch {
        /* fall through */
      }
      const human = humanizeSandboxToolError("table_transform", r.output);
      lines.push(human ?? `table_transform → ${r.output.slice(0, 500)}`);
    } else if (r.tool === "sql_load") {
      try {
        const j = JSON.parse(r.output) as {
          name?: string;
          sourcePath?: string;
          sheetName?: string;
          tables?: string[];
        };
        if (typeof j.name === "string" && j.name) {
          const src =
            typeof j.sourcePath === "string" && j.sourcePath
              ? ` from \`${normalizeSandboxEchoPath(j.sourcePath)}\``
              : "";
          const sheet =
            typeof j.sheetName === "string" && j.sheetName.trim()
              ? ` (sheet ${j.sheetName.trim()})`
              : "";
          lines.push(
            `Loaded \`${j.name}\`${src}${sheet} — next: sql_query`,
          );
          continue;
        }
      } catch {
        /* fall through */
      }
      const human = humanizeSandboxToolError("sql_load", r.output);
      lines.push(human ?? `sql_load → ${r.output.slice(0, 500)}`);
    } else if (r.tool === "sql_query") {
      try {
        const j = JSON.parse(r.output) as {
          uri?: string;
          summary?: string;
          rows?: number;
          cols?: number;
        };
        if (typeof j.uri === "string" && j.uri) {
          const uri = normalizeSandboxEchoPath(j.uri);
          if (isChipReadySandboxPath(uri)) {
            const dims =
              typeof j.rows === "number" && typeof j.cols === "number"
                ? `${j.rows}×${j.cols}`
                : typeof j.summary === "string"
                  ? j.summary
                  : "";
            lines.push(`SQL query: \`${uri}\`${dims ? ` — ${dims}` : ""}`);
            continue;
          }
        }
        if (typeof j.summary === "string" && j.summary) {
          lines.push(
            j.summary.includes("non-SELECT")
              ? `SQL query OK (no CSV chip) — ${j.summary}`
              : `SQL query: ${j.summary}`,
          );
          continue;
        }
      } catch {
        /* fall through */
      }
      const human = humanizeSandboxToolError("sql_query", r.output);
      lines.push(human ?? `sql_query → ${r.output.slice(0, 500)}`);
    } else if (r.tool === "chart_table") {
      try {
        const j = JSON.parse(r.output) as { uri?: string; chartType?: string };
        if (typeof j.uri === "string" && j.uri) {
          const uri = normalizeSandboxEchoPath(j.uri);
          if (isChipReadySandboxPath(uri)) {
            lines.push(
              `Chart (${typeof j.chartType === "string" ? j.chartType : "png"}): \`${uri}\``,
            );
            continue;
          }
        }
      } catch {
        /* fall through */
      }
      lines.push(`chart_table → ${r.output.slice(0, 500)}`);
    } else if (r.tool === "render_diagram" || r.tool === "render_table") {
      try {
        const j = JSON.parse(r.output) as { uri?: string; kind?: string };
        if (typeof j.uri === "string" && j.uri) {
          const uri = normalizeSandboxEchoPath(j.uri);
          if (isChipReadySandboxPath(uri)) {
            const label =
              r.tool === "render_diagram"
                ? `Diagram${typeof j.kind === "string" ? ` (${j.kind})` : ""}`
                : "Table image";
            lines.push(`${label}: \`${uri}\``);
            continue;
          }
        }
      } catch {
        /* fall through */
      }
      lines.push(`${r.tool} → ${r.output.slice(0, 500)}`);
    } else if (r.tool === "write_file") {
      // Prefer echoed path (`Written: \`…\``) for chat Open chips.
      lines.push(
        r.output.startsWith("Written:")
          ? r.output
          : r.output === "written"
            ? "File written."
            : `write_file → ${r.output.slice(0, 200)}`,
      );
    } else if (r.tool === "edit_file") {
      lines.push(
        r.output.startsWith("Edited:")
          ? r.output
          : `edit_file → ${r.output.slice(0, 200)}`,
      );
    } else if (r.tool === "apply_patch") {
      lines.push(
        r.output.startsWith("Patched:")
          ? r.output
          : `apply_patch → ${r.output.slice(0, 200)}`,
      );
    } else if (r.tool === "image_generate") {
      try {
        const j = JSON.parse(r.output) as { path?: string; bytes?: number };
        if (typeof j.path === "string" && j.path) {
          const path = normalizeSandboxEchoPath(j.path);
          if (!isChipReadySandboxPath(path)) continue;
          const bytes = typeof j.bytes === "number" ? `, ${j.bytes} bytes` : "";
          lines.push(`Generated image: \`${path}\`${bytes}`);
          continue;
        }
      } catch {
        /* fall through */
      }
      // No openable path — omit (avoid noisy JSON dump in the bubble).
    } else if (r.tool === "browser") {
      try {
        const j = JSON.parse(r.output) as {
          path?: string;
          bytes?: number;
          action?: string;
          verify?: { path?: string; bytes?: number; mode?: string };
        };
        // Top-level screenshot action, or act/apply_form verify=screenshot.
        const rawShot =
          typeof j.path === "string" && j.path
            ? j.path
            : typeof j.verify?.path === "string"
              ? j.verify.path
              : undefined;
        const shotPath = rawShot ? normalizeSandboxEchoPath(rawShot) : undefined;
        if (shotPath && isChipReadySandboxPath(shotPath)) {
          const shotBytes =
            typeof j.path === "string" && j.path ? j.bytes : j.verify?.bytes;
          const bytes = typeof shotBytes === "number" ? `, ${shotBytes} bytes` : "";
          lines.push(`Screenshot: \`${shotPath}\`${bytes}`);
          continue;
        }
      } catch {
        /* fall through */
      }
      // Non-file browser actions — omit from handoff lines.
    } else if (r.tool === "read_file") {
      const preview = r.output.length > 1200 ? `${r.output.slice(0, 1200)}…` : r.output;
      lines.push(preview);
    } else if (r.tool === "list_dir" || r.tool === "search_files") {
      try {
        const j = JSON.parse(r.output) as {
          path?: string;
          entries?: unknown[];
          hits?: unknown[];
          truncated?: boolean;
          pattern?: string;
        };
        if (r.tool === "list_dir" && Array.isArray(j.entries)) {
          const where = typeof j.path === "string" && j.path ? `\`${j.path}\`` : "roots";
          const trunc = j.truncated ? " (truncated)" : "";
          lines.push(`list_dir ${where}: ${j.entries.length} entries${trunc}`);
          continue;
        }
        if (r.tool === "search_files" && Array.isArray(j.hits)) {
          const pat = typeof j.pattern === "string" ? j.pattern : "?";
          const trunc = j.truncated ? " (truncated)" : "";
          lines.push(`search_files \`${pat}\`: ${j.hits.length} hits${trunc}`);
          continue;
        }
      } catch {
        /* fall through */
      }
      lines.push(`${r.tool} → ${r.output.slice(0, 400)}`);
    } else {
      lines.push(`${r.tool} → ${r.output.slice(0, 400)}`);
    }
  }
  return lines;
}

async function* dispatchPlannedTools(
  deps: TurnDeps,
  steps: PlannedToolStep[],
): AsyncGenerator<TurnEvent, { ok: boolean; results: Array<{ tool: string; output: string }> }> {
  const results: Array<{ tool: string; output: string }> = [];
  for (const step of steps) {
    if (!validateIntent("tool_call")) return { ok: false, results };
    yield { kind: "tool_call", tool: step.tool, text: JSON.stringify(step.args) };
    const result = await dispatchTool(deps, {
      tool: step.tool,
      args: step.args,
      ...(step.summary !== undefined ? { summary: step.summary } : {}),
    });
    if (!result.ok) {
      const human =
        humanizeSandboxToolError(step.tool, result.reason) ?? result.reason;
      yield { kind: "error", text: human };
      activeTurnFailures.set(deps.ctx.turn_id, {
        message: human,
        at: new Date().toISOString(),
      });
      return { ok: false, results };
    }
    results.push({ tool: step.tool, output: result.output });
    yield { kind: "tool_result", tool: step.tool, text: result.output };
  }
  return { ok: true, results };
}

async function completeAssistantText(
  deps: TurnDeps,
  history: HistoryMessage[],
  userText: string,
): Promise<string> {
  if (deps.completionText !== undefined) return deps.completionText;
  const messages = [
    ...(deps.ctx.standing_inject
      ? [{ role: "system" as const, content: deps.ctx.standing_inject }]
      : []),
    ...history,
    { role: "user" as const, content: userText },
  ];
  const completed = await deps.provider.complete({ messages });
  return completed.text;
}

export async function* runTurn(input: RunTurnInput): AsyncGenerator<TurnEvent> {
  const {
    deps,
    userText,
    plannedTools = [],
    history = [],
    toolLoop = false,
    localSqlReady = false,
  } = input;
  const zhTurn = (assistant: string) =>
    /[\u4e00-\u9fff]/.test(assistant) || /[\u4e00-\u9fff]/.test(userText);
  const yieldText = function* (
    text: string,
    hadSchedulePropose: boolean,
    assistantForLocale: string,
    hadScheduleTool = hadSchedulePropose,
  ): Generator<TurnEvent> {
    const sample = `${userText}\n${assistantForLocale}`;
    let out = text;
    const offer =
      !hadScheduleTool && deps.scheduleIntentOffer ? deps.scheduleIntentOffer(userText) : undefined;
    if (offer) {
      out = `${text.trimEnd()}\n\n${offer}`;
    } else {
      out = applyReminderHonestyGuard(text, {
        hadSchedulePropose,
        localeSample: sample,
      });
    }
    yield { kind: "text", text: out };
  };
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
        const dispatched = yield* dispatchPlannedTools(deps, plannedTools);
        if (!dispatched.ok) return;
        const assistant = await completeAssistantText(deps, history, userText);
        yield* yieldText(
          assistant,
          toolsIncludeSchedulePropose(plannedTools),
          assistant,
          toolsTouchedSchedule(plannedTools),
        );
        return;
      }

      const assistant = await completeAssistantText(deps, history, userText);

      // Sandbox tools on every turn; smart-home only when home-surface toolLoop.
      const schedulesOnly = deps.ctx.policy_snapshot.schedulesSurface === true;
      const parsed = parseAssistantToolCalls(assistant, {
        allowSandbox: !schedulesOnly,
        allowSmartHome: toolLoop && !schedulesOnly,
        schedulesOnly,
        ...(localSqlReady ? { allowLocalSql: true } : {}),
      });
      if (parsed.tools.length > 0) {
        const dispatched = yield* dispatchPlannedTools(deps, parsed.tools);
        if (!dispatched.ok) return;
        const hasHome = parsed.tools.some((t) => isSmartHomeToolName(t.tool));
        const onlyHome = hasHome && parsed.tools.every((t) => isSmartHomeToolName(t.tool));
        const hadPropose = toolsIncludeSchedulePropose(parsed.tools);
        if (onlyHome) {
          yield* yieldText(
            parsed.replyText || "Requested — Allow in Approvals to apply.",
            hadPropose,
            assistant,
          );
          return;
        }
        // File-producing tools: append only paths not already cited (chip-ready).
        const fileResults = dispatched.results.filter((r) => isFileHandoffToolName(r.tool));
        // Other sandbox tools (list_dir / search_files / read_file / …): keep
        // always-on human lines (pre-appendMissing behaviour).
        const otherSandbox = dispatched.results.filter(
          (r) => isSandboxToolName(r.tool) && !isFileHandoffToolName(r.tool),
        );
        const scheduleLines = formatSandboxToolResultLines(
          dispatched.results.filter((r) => isScheduleToolName(r.tool)),
        );
        const otherLines = formatSandboxToolResultLines(otherSandbox);
        let body = appendMissingSandboxHandoffLines(parsed.replyText || "", fileResults);
        if (otherLines.length) {
          body = body.trimEnd()
            ? `${body.trimEnd()}\n\n${otherLines.join("\n")}`
            : otherLines.join("\n");
        }
        if (scheduleLines.length) {
          body = body.trimEnd()
            ? `${body.trimEnd()}\n\n${scheduleLines.join("\n")}`
            : scheduleLines.join("\n");
        }
        if (hasHome && !parsed.replyText) {
          body = body.trimEnd()
            ? `${body.trimEnd()}\n\nRequested — Allow in Approvals to apply.`
            : "Requested — Allow in Approvals to apply.";
        }
        yield* yieldText(
          body.trim() || "Done.",
          hadPropose,
          assistant,
          toolsTouchedSchedule(parsed.tools),
        );
        return;
      }

      // Home-surface fallthrough when no fenced tools.
      if (toolLoop) {
        // Multi-round offer (“需要我…吗？”) → stash pending; wait for 是的 / yes.
        if (isHomeOfferQuestion(assistant)) {
          deps.onHomeProposalOffer?.(assistant);
          yield* yieldText(assistant, false, assistant);
          return;
        }
        // Free-text claim/imperative without fence → recover + dispatch if concrete.
        const recovered = deps.recoverHomeTools?.(assistant) ?? [];
        if (recovered.length > 0) {
          const dispatched = yield* dispatchPlannedTools(deps, recovered);
          if (!dispatched.ok) return;
          const zh = zhTurn(assistant);
          yield* yieldText(
            zh
              ? `已提交「${recovered[0]?.summary || recovered[0]?.tool}」— 请在 Approvals 中确认后生效。`
              : `Submitted “${recovered[0]?.summary || recovered[0]?.tool}” — Allow in Approvals to apply.`,
            toolsIncludeSchedulePropose(recovered),
            assistant,
          );
          return;
        }
        // Honesty: never surface "Allow in Approvals" when no tool was dispatched.
        if (claimsActuationWithoutTools(assistant)) {
          const zh = zhTurn(assistant);
          yield* yieldText(
            zh
              ? "我还没有真正提交 Approvals 请求。请再说一次具体设备与操作（例如「把走廊恒温器调到 24 度」），或直接在家庭对话里重试。"
              : "I did not actually submit an Approvals request. Please restate the device and action (e.g. “set hallway thermostat to 24”), or try again in Home chat.",
            false,
            assistant,
          );
          return;
        }
        // Soft offer / mention → still try to stash for a later affirmation.
        deps.onHomeProposalOffer?.(assistant);
        yield* yieldText(assistant, false, assistant);
        return;
      }

      yield* yieldText(assistant, false, assistant);
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

export async function withTranscriptLock<T>(
  sessionDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = transcriptLocks.get(sessionDir) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const tail = prev.then(() => gate);
  transcriptLocks.set(sessionDir, tail);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (transcriptLocks.get(sessionDir) === tail) transcriptLocks.delete(sessionDir);
  }
}

/**
 * Merge consecutive assistant lines that share a `turnId` (streaming / tool-loop chunks).
 * Used on read so desktop + mobile hydrate one bubble per turn (live clients already merge).
 * Preserves the first messageId; keeps the latest format / artifactPath / artifactUrl.
 */
export function coalesceAssistantByTurnId(
  lines: Record<string, unknown>[],
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of lines) {
    const last = out[out.length - 1];
    const turnId = typeof line.turnId === "string" ? line.turnId : "";
    const lastTurn = last && typeof last.turnId === "string" ? last.turnId : "";
    if (
      last &&
      line.role === "assistant" &&
      last.role === "assistant" &&
      turnId &&
      turnId === lastTurn
    ) {
      const prevText = typeof last.text === "string" ? last.text : "";
      const nextText = typeof line.text === "string" ? line.text : "";
      if (nextText.startsWith(prevText)) last.text = nextText;
      else if (!prevText.endsWith(nextText)) last.text = prevText + nextText;
      if (line.format === "plain" || line.format === "markdown" || line.format === "link") {
        last.format = line.format;
      }
      if (typeof line.artifactPath === "string" && line.artifactPath) {
        last.artifactPath = line.artifactPath;
      }
      if (typeof line.artifactUrl === "string" && line.artifactUrl) {
        last.artifactUrl = line.artifactUrl;
      }
      if (typeof line.at === "string" && line.at) last.at = line.at;
      continue;
    }
    out.push({ ...line });
  }
  return out;
}

/** Persist a minimal session transcript line (daemon owns canonical store). */
export async function appendTranscriptLine(
  sessionDir: string,
  line: Record<string, unknown>,
): Promise<void> {
  await withTranscriptLock(sessionDir, async () => {
    await mkdir(sessionDir, { recursive: true });
    const path = `${sessionDir}/transcript.jsonl`;
    const withId =
      typeof line.messageId === "string" && line.messageId.length > 0
        ? line
        : { ...line, messageId: randomUUID() };
    await writeFile(path, `${JSON.stringify(withId)}\n`, { encoding: "utf8", flag: "a" });
  });
}

/** Stable fingerprint for legacy rows — must not depend on list index (delete shifts indices). */
function legacyMessageId(line: Record<string, unknown>): string {
  const turnId = typeof line.turnId === "string" ? line.turnId : "";
  const at = typeof line.at === "string" ? line.at : "";
  const role = typeof line.role === "string" ? line.role : "unknown";
  const text = typeof line.text === "string" ? line.text : "";
  // FNV-1a 32-bit — short, deterministic, no crypto import needed at call sites.
  let h = 0x811c9dc5;
  const key = `${turnId}\0${at}\0${role}\0${text}`;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `legacy:${role}:${(h >>> 0).toString(16)}`;
}

/**
 * Ensure every transcript line has a stable `messageId` for UI delete.
 * Legacy rows (pre-messageId) get a deterministic synthetic id.
 */
export function withTranscriptMessageIds(
  lines: Record<string, unknown>[],
): Record<string, unknown>[] {
  return lines.map((line) => {
    if (typeof line.messageId === "string" && line.messageId.length > 0) return line;
    return { ...line, messageId: legacyMessageId(line) };
  });
}

/** True when any line was missing a durable messageId (caller may persist). */
export function transcriptNeedsMessageIdPersist(
  raw: Record<string, unknown>[],
  withIds: Record<string, unknown>[],
): boolean {
  if (raw.length !== withIds.length) return true;
  for (let i = 0; i < raw.length; i++) {
    const before = raw[i]?.messageId;
    const after = withIds[i]?.messageId;
    if (typeof before !== "string" || before.length === 0 || before !== after) return true;
  }
  return false;
}

async function readTranscriptUnlocked(sessionDir: string): Promise<Record<string, unknown>[]> {
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

export async function readTranscript(sessionDir: string): Promise<Record<string, unknown>[]> {
  return withTranscriptLock(sessionDir, () => readTranscriptUnlocked(sessionDir));
}

/**
 * Read transcript, stamp durable messageIds, and persist under the session lock
 * so a concurrent append cannot be overwritten by a migrate rewrite.
 */
export async function readTranscriptEnsuringMessageIds(
  sessionDir: string,
): Promise<Record<string, unknown>[]> {
  return withTranscriptLock(sessionDir, async () => {
    const raw = await readTranscriptUnlocked(sessionDir);
    const withIds = withTranscriptMessageIds(raw);
    // Persist coalesce so UI delete / model history / getTranscript stay consistent
    // (one assistant bubble per turnId — Design §9.5 thin-client hydrate).
    const lines = coalesceAssistantByTurnId(withIds);
    const needIds = transcriptNeedsMessageIdPersist(raw, withIds);
    const needCoalesce = lines.length !== withIds.length;
    if (needIds || needCoalesce) {
      await writeTranscriptUnlocked(sessionDir, lines);
    }
    return lines;
  });
}

/** Line count without JSON parse — for listSessions messageCount. */
export async function countTranscriptLines(sessionDir: string): Promise<number> {
  try {
    const raw = await readFile(`${sessionDir}/transcript.jsonl`, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) return 0;
    return trimmed.split("\n").length;
  } catch {
    return 0;
  }
}

async function writeTranscriptUnlocked(
  sessionDir: string,
  lines: Record<string, unknown>[],
): Promise<void> {
  await mkdir(sessionDir, { recursive: true });
  const path = `${sessionDir}/transcript.jsonl`;
  const body = lines.map((l) => JSON.stringify(l)).join("\n");
  await writeFile(path, body.length > 0 ? `${body}\n` : "", "utf8");
}

/** Replace the whole transcript (post-compaction rewrite). Daemon owns when to call. */
export async function writeTranscript(
  sessionDir: string,
  lines: Record<string, unknown>[],
): Promise<void> {
  await withTranscriptLock(sessionDir, () => writeTranscriptUnlocked(sessionDir, lines));
}

/** Read → transform → write under one lock (delete/clear/migrate-safe). */
export async function updateTranscript(
  sessionDir: string,
  fn: (lines: Record<string, unknown>[]) => Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  return withTranscriptLock(sessionDir, async () => {
    const raw = await readTranscriptUnlocked(sessionDir);
    const next = fn(withTranscriptMessageIds(raw));
    await writeTranscriptUnlocked(sessionDir, next);
    return next;
  });
}
