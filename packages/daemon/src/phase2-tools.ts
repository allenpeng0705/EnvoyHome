// Design §19.11–§19.13 — message / sessions_* / view_image / image_generate / spawn_helper.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import type { ChannelService } from "./channels/service.js";
import type { BindingStore } from "./bindings.js";
import type { SessionStore, SessionMeta } from "./sessions.js";
import type { HomePaths } from "./home-paths.js";
import { resolveSandboxPath } from "./fs-jail.js";
import type { PrivacyModeStore } from "./policy-store.js";
import type { MediaGenerateStore } from "./media-generate-store.js";
import type { TurnOrigin } from "@envoyhome/harness-host";
import {
  extractDocumentText,
  isExtractableExtension,
  DOCUMENT_EXTRACT_MAX_SOURCE_BYTES,
} from "./document-extract.js";
import { __resetHarnessSubagentsForTests } from "./harness-subagents.js";

export {
  TASK_ACCOUNT_CONCURRENCY,
  TASK_ACCOUNT_CONCURRENCY as SPAWN_HELPER_MAX_CONCURRENT,
  TASK_DEFAULT_ALLOW,
  TASK_DEFAULT_ALLOW as SPAWN_HELPER_DEFAULT_ALLOW,
  TASK_MAX_PARALLEL,
  TASK_MAX_SUBAGENTS,
  runTaskTool,
  runSpawnHelperTool,
  parseTaskChildren,
  filterChildAllowTools,
  __resetHarnessSubagentsForTests,
} from "./harness-subagents.js";

export const SESSIONS_LIST_CAP = 40;
export const SESSIONS_HISTORY_CAP = 80;
export const SESSIONS_SEND_TEXT_CAP = 8000;

/**
 * Message actions we Adapt (OpenClaw has a wider zoo — Design §19.11).
 * Channel must declare capability for react / media / edit / delete / pin.
 */
export const MESSAGE_ACTIONS_SUPPORTED = [
  "send",
  "notify",
  "reply",
  "react",
  "edit",
  "delete",
  "pin",
  "unpin",
] as const;
export type MessageAction = (typeof MESSAGE_ACTIONS_SUPPORTED)[number];

export const SESSIONS_SEND_WAIT_MS_CAP = 60_000;

export function __resetPhase2ToolsForTests(): void {
  __resetHarnessSubagentsForTests();
}

const IMAGE_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".heic",
  ".svg",
]);

function sniffImageMime(buf: Buffer, ext: string): string {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.length >= 6 && buf.slice(0, 6).toString("ascii") === "GIF87a") return "image/gif";
  if (buf.length >= 6 && buf.slice(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString("ascii") === "RIFF" &&
    buf.slice(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".gif") return "image/gif";
  if (e === ".webp") return "image/webp";
  if (e === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

/** V-P2-MSG-1/2 — send to a bound chat target; event-source notify-only; rich actions capped. */
export async function runMessageTool(input: {
  args: Record<string, unknown>;
  accountId: string;
  channels: ChannelService;
  bindings: BindingStore;
  privacyMode?: PrivacyModeStore | null;
  toolPolicy?: "standard" | "restricted";
  /** Resolve sandbox-relative media paths to jail-relative validated paths. */
  resolveMediaPath?: (rel: string) => Promise<string>;
}): Promise<string> {
  if (input.toolPolicy === "restricted") {
    throw new Error("envoyhome.tool_unavailable: message blocked under restricted policy");
  }
  const actionRaw =
    typeof input.args.action === "string" ? input.args.action.trim().toLowerCase() : "send";
  const action = (actionRaw || "send") as string;
  if (!(MESSAGE_ACTIONS_SUPPORTED as readonly string[]).includes(action)) {
    throw new Error(
      `envoyhome.bad_params: message action "${action}" not supported (allowed: ${MESSAGE_ACTIONS_SUPPORTED.join(", ")})`,
    );
  }
  const channel = typeof input.args.channel === "string" ? input.args.channel.trim() : "";
  const channelAccount =
    typeof input.args.channelAccount === "string" ? input.args.channelAccount.trim() : "";
  const peerId =
    (typeof input.args.peerId === "string" && input.args.peerId.trim()) ||
    (typeof input.args.senderId === "string" && input.args.senderId.trim()) ||
    "";
  const text = typeof input.args.text === "string" ? input.args.text.trim() : "";
  const reaction =
    typeof input.args.reaction === "string" ? input.args.reaction.trim().slice(0, 64) : "";
  const rawRef = typeof input.args.rawRef === "string" ? input.args.rawRef.trim() : "";
  if (!channel || !channelAccount || !peerId) {
    throw new Error(
      "envoyhome.bad_params: message requires channel, channelAccount, peerId|senderId",
    );
  }
  if (action === "react") {
    if (!reaction) {
      throw new Error("envoyhome.bad_params: message action react requires reaction");
    }
    if (!rawRef) {
      throw new Error("envoyhome.bad_params: message action react requires rawRef");
    }
  } else if (action === "reply" || action === "edit") {
    if (!rawRef) {
      throw new Error(`envoyhome.bad_params: message action ${action} requires rawRef`);
    }
    if (!text) {
      throw new Error(`envoyhome.bad_params: message action ${action} requires text`);
    }
  } else if (action === "delete" || action === "pin" || action === "unpin") {
    if (!rawRef) {
      throw new Error(`envoyhome.bad_params: message action ${action} requires rawRef`);
    }
  } else if (!text) {
    throw new Error("envoyhome.bad_params: message requires text");
  }
  if (input.privacyMode) {
    const privacy = await input.privacyMode.get(input.accountId);
    if (privacy.enabled) {
      throw new Error("envoyhome.privacy_mode: message blocked");
    }
  }
  const binding = await input.bindings.resolveSender(channel, channelAccount, peerId);
  if (!binding || binding.accountId !== input.accountId) {
    throw new Error("envoyhome.auth: message target unbound or wrong account");
  }
  const row = input.channels.listChannels().find((c) => c.id === channel);
  const channelKind = row?.channelKind ?? "chat";
  const caps = new Set(row?.capabilities ?? input.channels.loader.getCapabilities(channel) ?? []);

  const needCap =
    action === "react"
      ? "react"
      : action === "edit"
        ? "edit"
        : action === "delete"
          ? "delete"
          : action === "pin" || action === "unpin"
            ? "pin"
            : null;
  if (needCap && !caps.has(needCap)) {
    throw new Error(
      `envoyhome.tool_unavailable: channel ${channel} does not declare ${needCap} capability`,
    );
  }

  const mediaRaw =
    typeof input.args.mediaPath === "string"
      ? [input.args.mediaPath]
      : Array.isArray(input.args.mediaPaths)
        ? (input.args.mediaPaths as unknown[]).filter((p): p is string => typeof p === "string")
        : [];
  let mediaPaths: string[] | undefined;
  if (mediaRaw.length > 0) {
    if (action === "react" || action === "delete" || action === "pin" || action === "unpin") {
      throw new Error(`envoyhome.bad_params: ${action} cannot include mediaPaths`);
    }
    if (!caps.has("media") && channelKind === "chat") {
      throw new Error(
        `envoyhome.tool_unavailable: channel ${channel} does not declare media capability`,
      );
    }
    if (!input.resolveMediaPath) {
      throw new Error("envoyhome.tool_unavailable: media path resolver not configured");
    }
    mediaPaths = [];
    for (const rel of mediaRaw.slice(0, 4)) {
      const cleaned = rel.trim().replace(/\\/g, "/");
      if (!cleaned || cleaned.startsWith("/") || cleaned.includes("..")) {
        throw new Error("envoyhome.bad_params: mediaPath must be sandbox-relative");
      }
      mediaPaths.push(await input.resolveMediaPath(cleaned));
    }
  }

  const forceNotify = action === "notify" || channelKind === "event-source";
  if (channelKind === "event-source" || forceNotify) {
    // V-P2-MSG-2 — notification-only; never actuate / never reply-as-chat.
    if (action !== "send" && action !== "notify") {
      throw new Error(`envoyhome.bad_params: ${action} not allowed on event-source`);
    }
    await input.channels.deliverOutbound(channel, {
      accountId: input.accountId,
      text: (text || reaction || "notify").slice(0, 4000),
      kind: "notify",
      format: "plain",
      action: "notify",
      ...(rawRef ? { rawRef } : {}),
      ...(mediaPaths ? { mediaPaths } : {}),
    });
    return JSON.stringify({
      ok: true,
      action: "notify",
      kind: "notify",
      channel,
      peerId,
      ...(mediaPaths ? { mediaPaths } : {}),
    });
  }

  if (action === "react") {
    await input.channels.deliverOutbound(channel, {
      accountId: input.accountId,
      text: reaction,
      kind: "reply",
      format: "plain",
      action: "react",
      reaction,
      rawRef,
    });
    return JSON.stringify({ ok: true, action: "react", kind: "reply", channel, peerId, reaction });
  }

  if (action === "edit" || action === "delete" || action === "pin" || action === "unpin") {
    await input.channels.deliverOutbound(channel, {
      accountId: input.accountId,
      text: text.slice(0, 16_000) || action,
      kind: "reply",
      format: action === "edit" ? "markdown" : "plain",
      action,
      rawRef,
    });
    return JSON.stringify({ ok: true, action, kind: "reply", channel, peerId, rawRef });
  }

  const outboundAction = action === "reply" ? "reply" : "send";
  await input.channels.deliverOutbound(channel, {
    accountId: input.accountId,
    text: text.slice(0, 16_000),
    kind: "reply",
    format: "markdown",
    action: outboundAction,
    ...(rawRef ? { rawRef } : {}),
    ...(mediaPaths ? { mediaPaths } : {}),
  });
  return JSON.stringify({
    ok: true,
    action: outboundAction,
    kind: "reply",
    channel,
    peerId,
    ...(mediaPaths ? { mediaPaths } : {}),
  });
}

/** V-P2-MSG-3 — account-scoped session list (capped). */
export async function runSessionsListTool(input: {
  args: Record<string, unknown>;
  accountId: string;
  sessions: SessionStore;
}): Promise<string> {
  const limitRaw = typeof input.args.limit === "number" ? input.args.limit : SESSIONS_LIST_CAP;
  const limit = Math.max(1, Math.min(SESSIONS_LIST_CAP, Math.floor(limitRaw)));
  const rows = await input.sessions.list(input.accountId);
  const sliced = rows.slice(0, limit).map((m: SessionMeta) => ({
    sessionId: m.sessionId,
    title: m.title ?? "",
    purpose: m.purpose ?? "general",
    updatedAt: m.updatedAt,
    ...(m.channel ? { channel: m.channel } : {}),
    ...(m.archivedAt ? { archivedAt: m.archivedAt } : {}),
  }));
  return JSON.stringify({ sessions: sliced, capped: rows.length > sliced.length });
}

/** V-P2-MSG-3 — capped transcript for same-account session. */
export async function runSessionsHistoryTool(input: {
  args: Record<string, unknown>;
  accountId: string;
  sessions: SessionStore;
  readTranscript: (sessionDir: string) => Promise<Array<Record<string, unknown>>>;
}): Promise<string> {
  const sessionId =
    typeof input.args.sessionId === "string" ? input.args.sessionId.trim() : "";
  if (!sessionId) {
    throw new Error("envoyhome.bad_params: sessionId required");
  }
  const meta = await input.sessions.get(input.accountId, sessionId);
  if (!meta || meta.accountId !== input.accountId) {
    throw new Error("envoyhome.auth: session not found for this account");
  }
  const limitRaw =
    typeof input.args.limit === "number" ? input.args.limit : SESSIONS_HISTORY_CAP;
  const limit = Math.max(1, Math.min(SESSIONS_HISTORY_CAP, Math.floor(limitRaw)));
  const dir = input.sessions.sessionDir(input.accountId, sessionId);
  const lines = await input.readTranscript(dir);
  const window = lines.slice(-limit).map((line) => ({
    role: line["role"],
    ...(typeof line["content"] === "string"
      ? { content: (line["content"] as string).slice(0, 4000) }
      : {}),
    ...(typeof line["turnId"] === "string" ? { turnId: line["turnId"] } : {}),
  }));
  return JSON.stringify({
    sessionId,
    messages: window,
    capped: lines.length > window.length,
  });
}

/** Coarse status for same-account session. */
export async function runSessionsStatusTool(input: {
  args: Record<string, unknown>;
  accountId: string;
  sessions: SessionStore;
  pendingApprovalCount?: (sessionId: string) => number;
}): Promise<string> {
  const sessionId =
    typeof input.args.sessionId === "string" ? input.args.sessionId.trim() : "";
  if (!sessionId) {
    throw new Error("envoyhome.bad_params: sessionId required");
  }
  const meta = await input.sessions.get(input.accountId, sessionId);
  if (!meta || meta.accountId !== input.accountId) {
    throw new Error("envoyhome.auth: session not found for this account");
  }
  const pending = input.pendingApprovalCount?.(sessionId) ?? 0;
  const updatedMs = Date.parse(meta.updatedAt);
  const idle =
    Number.isFinite(updatedMs) && Date.now() - updatedMs > 15 * 60_000;
  const status = pending > 0 ? "pending_approval" : idle ? "idle" : "open";
  return JSON.stringify({
    sessionId,
    status,
    purpose: meta.purpose ?? "general",
    updatedAt: meta.updatedAt,
    pendingApprovals: pending,
  });
}

/**
 * V-P2-MSG-3 / Design §19.11 — inject and optionally run+wait another same-account session.
 * No swarm / cross-account. Attended ask is enforced by tool policy (attendedAsk).
 * Default `run: true` (OpenClaw-aligned Adapt); `run: false` is inject-only.
 */
export async function runSessionsSendTool(input: {
  args: Record<string, unknown>;
  accountId: string;
  sessions: SessionStore;
  origin: TurnOrigin;
  fromSessionId?: string | null;
  appendLine: (sessionDir: string, line: Record<string, unknown>) => Promise<void>;
  /** When run=true — wake a turn on the target session (append happens in the turn). */
  wake?: (opts: {
    sessionId: string;
    text: string;
    waitMs: number;
    fromSessionId?: string | null;
  }) => Promise<{
    turnId: string;
    reply?: string;
    timedOut?: boolean;
  }>;
}): Promise<string> {
  void input.origin; // ApprovalSink enforces attended ask / unattended grant.
  const sessionId =
    typeof input.args.sessionId === "string" ? input.args.sessionId.trim() : "";
  const text = typeof input.args.text === "string" ? input.args.text.trim() : "";
  if (!sessionId || !text) {
    throw new Error("envoyhome.bad_params: sessions_send requires sessionId and text");
  }
  if (input.fromSessionId && sessionId === input.fromSessionId) {
    throw new Error("envoyhome.bad_params: sessions_send cannot target the current session");
  }
  const meta = await input.sessions.get(input.accountId, sessionId);
  if (!meta || meta.accountId !== input.accountId) {
    throw new Error("envoyhome.auth: session not found for this account");
  }
  const clipped = text.slice(0, SESSIONS_SEND_TEXT_CAP);
  const run = input.args.run !== false; // default true
  const waitRaw = typeof input.args.waitMs === "number" ? input.args.waitMs : 0;
  const waitMs = Math.max(0, Math.min(SESSIONS_SEND_WAIT_MS_CAP, Math.floor(waitRaw)));

  if (!run) {
    const dir = input.sessions.sessionDir(input.accountId, sessionId);
    await input.appendLine(dir, {
      role: "user",
      text: clipped,
      at: new Date().toISOString(),
      provenance: {
        kind: "sessions_send",
        ...(input.fromSessionId ? { fromSessionId: input.fromSessionId } : {}),
      },
    });
    await input.sessions.touch(input.accountId, sessionId);
    return JSON.stringify({
      ok: true,
      sessionId,
      bytes: clipped.length,
      capped: text.length > clipped.length,
      run: false,
    });
  }

  if (!input.wake) {
    throw new Error("envoyhome.tool_unavailable: sessions_send wake not configured");
  }
  const woke = await input.wake({
    sessionId,
    text: clipped,
    waitMs,
    ...(input.fromSessionId ? { fromSessionId: input.fromSessionId } : {}),
  });
  return JSON.stringify({
    ok: true,
    sessionId,
    bytes: clipped.length,
    capped: text.length > clipped.length,
    run: true,
    turnId: woke.turnId,
    ...(woke.reply !== undefined ? { reply: woke.reply.slice(0, 8000) } : {}),
    ...(woke.timedOut === true ? { timedOut: true } : {}),
  });
}

/** V-P2-MEDIA-1 — jail path or https URL (SSRF-gated) + optional vision describe. */
export async function runViewImageTool(input: {
  args: Record<string, unknown>;
  accountId: string;
  paths: HomePaths;
  workspaceRoot?: string | null;
  workspaceMode?: "ro" | "rw" | null;
  workspaceMounts?: Array<{ id: string; hostPath: string; mode: "ro" | "rw" }> | null;
  /**
   * Optional vision path — when provided, may attach a short description.
   * Caller MUST refuse cloud vision under Privacy Mode / forceLocal without vision.
   */
  visionDescribe?: (meta: {
    path: string;
    mimeType: string;
    bytesBase64: string;
  }) => Promise<string | null>;
  /** SSRF-safe fetch for https URIs (workflowHttpFetch). */
  httpFetch?: typeof fetch;
}): Promise<string> {
  const path =
    (typeof input.args.path === "string" && input.args.path.trim()) ||
    (typeof input.args.uri === "string" && input.args.uri.trim()) ||
    "";
  if (!path) {
    throw new Error("envoyhome.bad_params: view_image requires path");
  }
  if (/^file:/i.test(path) || path.startsWith("http://")) {
    throw new Error("envoyhome.bad_params: view_image refuses file:// and non-TLS http");
  }

  let buf: Buffer;
  let mime: string;
  let label: string;

  if (/^https:\/\//i.test(path)) {
    if (!input.httpFetch) {
      throw new Error("envoyhome.tool_unavailable: view_image URL fetch not configured");
    }
    const { assertPublicHttpsUrl } = await import("./skill-remote.js");
    assertPublicHttpsUrl(path);
    const res = await input.httpFetch(path, { method: "GET", redirect: "error" });
    if (!res.ok) {
      throw new Error(`envoyhome.bad_params: view_image fetch HTTP ${res.status}`);
    }
    const ab = await res.arrayBuffer();
    buf = Buffer.from(ab);
    if (buf.length === 0 || buf.length > 8 * 1024 * 1024) {
      throw new Error("envoyhome.bad_params: image empty or exceeds 8 MiB");
    }
    const ct = (res.headers.get("content-type") || "").split(";")[0]!.trim().toLowerCase();
    mime = ct.startsWith("image/") ? ct : sniffImageMime(buf, extname(path).toLowerCase());
    if (!mime.startsWith("image/")) {
      throw new Error("envoyhome.bad_params: URL is not a recognized image");
    }
    label = path.slice(0, 500);
  } else {
    // Refuse absolute / host-looking paths up front (V-P2-MEDIA-1).
    if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.includes("..")) {
      throw new Error("envoyhome.bad_params: view_image path must be sandbox-relative");
    }
    const resolved = resolveSandboxPath({
      accountFilesRoot: input.paths.accountFiles(input.accountId),
      shareRoot: input.paths.shareDir,
      path,
      write: false,
      ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
      ...(input.workspaceMode ? { workspaceMode: input.workspaceMode } : {}),
      ...(input.workspaceMounts ? { workspaceMounts: input.workspaceMounts } : {}),
    });
    const st = await stat(resolved.absolute);
    if (!st.isFile()) {
      throw new Error("envoyhome.bad_params: view_image path is not a file");
    }
    if (st.size > 8 * 1024 * 1024) {
      throw new Error("envoyhome.bad_params: image exceeds 8 MiB");
    }
    const ext = extname(resolved.absolute).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) {
      throw new Error(`envoyhome.bad_params: not an image extension (${ext || "none"})`);
    }
    buf = await readFile(resolved.absolute);
    mime = sniffImageMime(buf, ext);
    if (!mime.startsWith("image/")) {
      throw new Error("envoyhome.bad_params: file is not a recognized image");
    }
    label = path.replace(/\\/g, "/");
  }

  const base: Record<string, unknown> = {
    path: label,
    mimeType: mime,
    bytes: buf.length,
    ...(label.startsWith("https://") ? { source: "url" } : { source: "jail" }),
  };
  if (input.visionDescribe) {
    try {
      const description = await input.visionDescribe({
        path: label,
        mimeType: mime,
        bytesBase64: buf.toString("base64"),
      });
      if (description && description.trim()) {
        base.description = description.trim().slice(0, 4000);
        base.vision = true;
        return JSON.stringify(base);
      }
    } catch {
      /* fall through to metadata-only */
    }
  }
  base.note =
    "Metadata only (no vision description). Prefer a supportsVision provider.";
  return JSON.stringify(base);
}

/**
 * V-P2-MEDIA-2/3 — image_generate fail-closed until Owner enable + provider + Privacy Mode.
 * Default async (returns jobId); `wait: true` blocks until bytes are written.
 */
export async function runImageGenerateTool(input: {
  args: Record<string, unknown>;
  accountId: string;
  paths: HomePaths;
  origin: TurnOrigin;
  privacyMode?: PrivacyModeStore | null;
  mediaGenerate?: MediaGenerateStore | null;
  /** Optional provider hook — omit → fail closed even when Owner-enabled. */
  generateImpl?: (prompt: string) => Promise<{ bytes: Buffer; mimeType: string; ext: string }>;
  /** Async enqueue — when omit and wait≠true, falls back to sync generateImpl. */
  enqueueGenerate?: (prompt: string) => Promise<{ jobId: string }>;
}): Promise<string> {
  if (input.privacyMode) {
    const privacy = await input.privacyMode.get(input.accountId);
    if (privacy.enabled) {
      throw new Error("envoyhome.privacy_mode: image_generate blocked");
    }
  }
  const enabled = input.mediaGenerate
    ? (await input.mediaGenerate.get(input.accountId)).enabled
    : false;
  if (!enabled) {
    throw new Error(
      "envoyhome.tool_unavailable: image_generate disabled (Owner must enable in Settings)",
    );
  }
  void input.origin; // ApprovalSink: attended ask; unattended needs grant (V-P2-MEDIA-2).
  const prompt = typeof input.args.prompt === "string" ? input.args.prompt.trim() : "";
  if (!prompt) {
    throw new Error("envoyhome.bad_params: image_generate requires prompt");
  }
  // Peek quota first (fail closed) without burning on provider errors.
  if (input.mediaGenerate) {
    const st = await input.mediaGenerate.get(input.accountId);
    const today = new Date().toISOString().slice(0, 10);
    const used = st.dayKey === today ? (st.dayCount ?? 0) : 0;
    if (used >= st.maxPerDay) {
      throw new Error(
        `envoyhome.rate_limited: image_generate daily cap (${st.maxPerDay}) reached`,
      );
    }
  }

  const wait = input.args.wait === true;
  if (!wait && input.enqueueGenerate) {
    const job = await input.enqueueGenerate(prompt.slice(0, 2000));
    return JSON.stringify({ ok: true, jobId: job.jobId, status: "pending" });
  }

  if (!input.generateImpl) {
    throw new Error(
      "envoyhome.tool_unavailable: no image generate provider configured",
    );
  }
  const out = await input.generateImpl(prompt.slice(0, 2000));
  if (!out.bytes.length || out.bytes.length > 8 * 1024 * 1024) {
    throw new Error("envoyhome.bad_params: generated image empty or exceeds 8 MiB");
  }
  if (input.mediaGenerate) {
    await input.mediaGenerate.consumeQuota(input.accountId);
  }
  const stamp = Date.now().toString(36);
  const safeExt = out.ext.replace(/[^a-z0-9]/gi, "") || "png";
  const rel = `output/media/gen-${stamp}.${safeExt}`;
  const abs = join(input.paths.accountFiles(input.accountId), rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, out.bytes);
  return JSON.stringify({
    ok: true,
    path: rel,
    mimeType: out.mimeType,
    bytes: out.bytes.length,
    status: "done",
  });
}

/** Page-range extract for PDF/Office (Design §19.12 D1) — slices GFM by page markers. */
export function sliceExtractByPageRange(
  gfm: string,
  startPage: number,
  endPage: number,
): string {
  const start = Math.max(1, Math.floor(startPage));
  const end = Math.max(start, Math.floor(endPage));
  // Common markers: form feed, "Page N", --- page breaks from anydoc.
  const parts = gfm.split(/\f|(?=^#{1,3}\s*Page\s+\d+)/im);
  if (parts.length <= 1) {
    // No page markers — return full text with a note when range was requested.
    return gfm;
  }
  const selected = parts.slice(start - 1, end);
  return selected.join("\n\n").trim() || gfm;
}

export async function runExtractDocumentWithPages(input: {
  args: Record<string, unknown>;
  accountId: string;
  paths: HomePaths;
  workspaceRoot?: string | null;
  workspaceMode?: "ro" | "rw" | null;
  workspaceMounts?: Array<{ id: string; hostPath: string; mode: "ro" | "rw" }> | null;
}): Promise<{ gfm: string; sourcePath: string; pages?: { start: number; end: number } }> {
  const sourcePath =
    typeof input.args.sourcePath === "string"
      ? input.args.sourcePath.trim().replace(/\\/g, "/")
      : "";
  if (!sourcePath) {
    throw new Error("envoyhome.bad_params: extract_document requires sourcePath");
  }
  if (sourcePath.startsWith("/") || sourcePath.includes("..")) {
    throw new Error("envoyhome.bad_params: sourcePath must be sandbox-relative");
  }
  const ext = extname(sourcePath);
  if (!isExtractableExtension(ext)) {
    throw new Error(`envoyhome.bad_params: sourcePath extension not extractable (${ext || "none"})`);
  }
  const resolved = resolveSandboxPath({
    accountFilesRoot: input.paths.accountFiles(input.accountId),
    shareRoot: input.paths.shareDir,
    path: sourcePath,
    write: false,
    ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
    ...(input.workspaceMode ? { workspaceMode: input.workspaceMode } : {}),
    ...(input.workspaceMounts ? { workspaceMounts: input.workspaceMounts } : {}),
  });
  const raw = await readFile(resolved.absolute);
  if (raw.length > DOCUMENT_EXTRACT_MAX_SOURCE_BYTES) {
    throw new Error(
      `envoyhome.bad_params: source exceeds ${DOCUMENT_EXTRACT_MAX_SOURCE_BYTES} bytes`,
    );
  }
  let gfm = await extractDocumentText(ext, raw);
  if (!gfm) {
    throw new Error(
      "envoyhome.bad_params: extract unavailable (unsupported, encrypted, scanned PDF, or malformed)",
    );
  }
  const startPage =
    typeof input.args.startPage === "number"
      ? input.args.startPage
      : typeof input.args.pageStart === "number"
        ? input.args.pageStart
        : undefined;
  const endPage =
    typeof input.args.endPage === "number"
      ? input.args.endPage
      : typeof input.args.pageEnd === "number"
        ? input.args.pageEnd
        : startPage;
  if (startPage !== undefined && endPage !== undefined) {
    gfm = sliceExtractByPageRange(gfm, startPage, endPage);
    return { gfm, sourcePath, pages: { start: Math.floor(startPage), end: Math.floor(endPage) } };
  }
  return { gfm, sourcePath };
}

