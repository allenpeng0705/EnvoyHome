// Workflow tool catalogue + extended dispatch — Design §7 (2026-10-15b).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import {
  BUILTIN_TOOLS,
  registerToolSpec,
  type RiskTier,
  type ToolSpec,
} from "@envoyhome/harness-host";
import {
  HA_TOOLS,
  MQTT_TOOLS,
  assertActuationAllowed,
  createHaClient,
  createMqttClient,
  type ResolvedObjectHandle,
} from "@envoyhome/smarthome";
import type { ActuationService } from "./actuation-service.js";
import type { ChannelService } from "./channels/service.js";
import {
  DOCUMENT_EXTRACT_MAX_SOURCE_BYTES,
  DOCUMENT_TEXT_EXTRACTOR_ID,
  assertExtractOutputPath,
  defaultExtractUri,
  extractDocumentText,
  isExtractableExtension,
} from "./document-extract.js";
import {
  assertExportOutputPath,
  defaultExportUri,
  exportDocument,
  exportMimeType,
  isExportFormat,
} from "./document-export.js";
import { resolveSandboxPath, type WorkspaceMode } from "./fs-jail.js";
import { isHomeAssistantReady, isMqttReady } from "./home-intent.js";
import type { HomePaths } from "./home-paths.js";
import { assertPublicHttpsUrl } from "./skill-remote.js";
import type { SkillService } from "./skills.js";
import type { WebSearchService } from "./web-search.js";
import type { BrowserControlService } from "./browser-control.js";
import { describeScheduleSpec } from "./schedule/chat-card.js";
import { formatProposeFailure, type ScheduleService } from "./schedule/service.js";
import { resolveAndValidateUserSchedulePayload } from "./schedule/resolve-user-payload.js";
import type { WorkflowStore } from "./workflows.js";

type WorkspaceOpts = {
  workspaceRoot?: string | null;
  workspaceMode?: WorkspaceMode | null;
  workspaceMounts?: Array<{ id: string; hostPath: string; mode: WorkspaceMode }> | null;
};

function toolPathOpts(
  paths: HomePaths,
  accountId: string,
  ws: WorkspaceOpts | undefined,
  write: boolean,
  path: string,
): Parameters<typeof resolveSandboxPath>[0] {
  return {
    accountFilesRoot: paths.accountFiles(accountId),
    shareRoot: paths.shareDir,
    path,
    write,
    workspaceMounts: ws?.workspaceMounts ?? null,
    workspaceRoot: ws?.workspaceRoot ?? null,
    workspaceMode: ws?.workspaceMode ?? null,
  };
}

export type WorkflowToolSource = "builtin" | "skill" | "smarthome";

export interface WorkflowToolInfo {
  name: string;
  risk: RiskTier;
  source: WorkflowToolSource;
  summary: string;
  sampleArgs?: Record<string, unknown>;
  /**
   * Known discrete values for an arg key → Settings uses a dropdown.
   * For values that depend on another arg (e.g. service ← domain), see `argChoiceGroups`.
   */
  argChoices?: Record<string, string[]>;
  /**
   * Dependent choice tables: childArg → { parentValue → childValues[] }.
   * Pair with `argChoiceDependsOn` (default parent key `domain` when omitted for `service`).
   */
  argChoiceGroups?: Record<string, Record<string, string[]>>;
  argChoiceDependsOn?: Record<string, string>;
  available: boolean;
  unavailableReason?: string;
}

/** Curated HA domain → services for Schedules / tool-arg dropdowns. */
export const HA_DOMAIN_SERVICE_CHOICES: Record<string, string[]> = {
  light: ["turn_on", "turn_off", "toggle"],
  switch: ["turn_on", "turn_off", "toggle"],
  fan: ["turn_on", "turn_off", "toggle", "set_percentage"],
  lock: ["lock", "unlock"],
  cover: ["open_cover", "close_cover", "stop_cover", "toggle"],
  climate: ["turn_on", "turn_off", "set_temperature", "set_hvac_mode"],
  media_player: ["turn_on", "turn_off", "play_media", "media_play", "media_pause"],
  scene: ["turn_on"],
  script: ["turn_on"],
  input_boolean: ["turn_on", "turn_off", "toggle"],
  valve: ["open_valve", "close_valve", "turn_on", "turn_off"],
  alarm_control_panel: ["alarm_arm_home", "alarm_arm_away", "alarm_disarm"],
};

const BUILTIN_META: Record<
  string,
  { summary: string; sampleArgs: Record<string, unknown> }
> = {
  read_file: {
    summary: "Read a file under the account sandbox or workspace/…",
    sampleArgs: { path: "documents/example.txt" },
  },
  write_file: {
    summary:
      "Write a UTF-8 file under the account sandbox (prefer documents/ or output/ for Shared files)",
    sampleArgs: { path: "documents/example.txt", content: "hello" },
  },
  list_dir: {
    summary:
      "List one directory level under the account sandbox or workspace/… (empty path = tops)",
    sampleArgs: { path: "documents" },
  },
  search_files: {
    summary:
      "Find files/dirs by basename glob or substring under sandbox/workspace (capped walk)",
    sampleArgs: { pattern: "*.md", path: "documents", maxDepth: 4 },
  },
  web_search: {
    summary: "Search the public web (household provider; Design §9.5f)",
    sampleArgs: { query: "EnvoyHome household agent", count: 5 },
  },
  browser: {
    summary:
      "Control a managed Chromium tab (navigate / snapshot / act) — Design §9.5g",
    sampleArgs: { action: "navigate", url: "https://example.com/" },
  },
  schedule: {
    summary:
      "Propose / confirm / list reminders (propose then confirm after user yes — Design §7.4)",
    sampleArgs: {
      action: "propose",
      text: "Remind me tomorrow at 8am to stretch",
      message: "stretch",
    },
  },
  export_document: {
    summary:
      "Export Markdown to Word/Excel/CSV/PDF under output/exports/ (Design §9.5b)",
    sampleArgs: {
      format: "docx",
      markdown: "# Report\n\n| A | B |\n|---|---|\n| 1 | 2 |\n",
      title: "Report",
    },
  },
  extract_document: {
    summary:
      "Extract Office/PDF/text in the sandbox to Markdown under output/extracts/ (Design §9.5c)",
    sampleArgs: { sourcePath: "documents/report.docx" },
  },
  exec: {
    summary: "Run a shell command (asks / grants apply)",
    sampleArgs: { cmd: "echo hi" },
  },
  http_fetch: {
    summary: "HTTPS GET a public URL (SSRF-guarded)",
    sampleArgs: { url: "https://example.com/" },
  },
};

let smarthomeRegistered = false;

export function ensureSmarthomeToolSpecsRegistered(): void {
  if (smarthomeRegistered) return;
  smarthomeRegistered = true;
  const mapTier = (t: string): RiskTier => {
    if (t === "admin") return "admin";
    if (t === "sensitive") return "sensitive";
    return "read";
  };
  for (const d of [...HA_TOOLS, ...MQTT_TOOLS]) {
    const spec: ToolSpec = {
      name: d.name,
      risk: mapTier(d.baseTier),
      grantable: d.baseTier === "admin" || d.baseTier === "sensitive",
    };
    registerToolSpec(spec);
  }
}

export function normalizeWorkflowToolName(name: string): string {
  if (name === "sandbox_write") return "write_file";
  if (name === "sandbox_read") return "read_file";
  return name;
}

/** Ready = enabled + credentials (same gate as Home chat / V-UX-8). Enabled alone is not enough. */
async function channelLooksReady(
  channels: ChannelService,
  id: "homeassistant" | "mqtt",
): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (id === "homeassistant") {
      if (await isHomeAssistantReady(channels)) return { ok: true };
      const st = channels.getChannelStatus(id);
      if (!st.enabled) {
        return { ok: false, reason: "Enable and configure Home Assistant under Connections" };
      }
      return {
        ok: false,
        reason: "Home Assistant needs a Base URL and access token under Connections",
      };
    }
    if (await isMqttReady(channels)) return { ok: true };
    const st = channels.getChannelStatus(id);
    if (!st.enabled) {
      return { ok: false, reason: "Enable and configure MQTT under Connections" };
    }
    return { ok: false, reason: "MQTT needs a Broker URL under Connections" };
  } catch {
    return { ok: false, reason: `${id} channel not available` };
  }
}

function haSampleArgs(name: string): Record<string, unknown> | undefined {
  if (name === "ha_get_state") return { objectId: "homeassistant:light.living_room" };
  if (name === "ha_call_service") {
    return {
      objectId: "homeassistant:light.living_room",
      domain: "light",
      service: "turn_on",
    };
  }
  if (name === "ha_list_entities" || name === "ha_list_services") return {};
  return undefined;
}

function mqttSampleArgs(name: string): Record<string, unknown> | undefined {
  if (name === "mqtt_publish") {
    return { objectId: "mqtt:home/test", payload: "1" };
  }
  if (name === "mqtt_subscribe" || name === "mqtt_read") {
    return { objectId: "mqtt:home/test" };
  }
  return undefined;
}

/** Opaque handle form `channel:sourceId` (Design §5.7.3). */
export function splitObjectId(objectId: string): { channel: string; sourceId: string } {
  const idx = objectId.indexOf(":");
  if (idx <= 0 || idx >= objectId.length - 1) {
    throw Object.assign(
      new Error("envoyhome.bad_params: objectId must be channel:sourceId"),
      { code: "bad_params" },
    );
  }
  return { channel: objectId.slice(0, idx), sourceId: objectId.slice(idx + 1) };
}

/**
 * V-HA-14 — tools take a resolved handle (`objectId`), never a raw entity_id/topic.
 */
export function requireObjectId(
  args: Record<string, unknown>,
  tool: string,
): string {
  const objectId = typeof args.objectId === "string" ? args.objectId.trim() : "";
  if (objectId) return objectId;
  if (args.entity_id != null || args.entityId != null || args.topic != null) {
    throw Object.assign(
      new Error(
        `envoyhome.bad_params: ${tool} requires objectId (resolved handle); raw entity_id/topic refused`,
      ),
      { code: "bad_params" },
    );
  }
  throw Object.assign(new Error(`envoyhome.bad_params: objectId required for ${tool}`), {
    code: "bad_params",
  });
}

export async function listWorkflowTools(input: {
  skills: SkillService;
  channels: ChannelService;
  webSearch?: WebSearchService | null;
  browserControl?: BrowserControlService | null;
  /** When set with ownerAccountId, elevated-only readiness does not mark available for non-Owners. */
  forAccountId?: string | null;
  ownerAccountId?: string | null;
}): Promise<WorkflowToolInfo[]> {
  ensureSmarthomeToolSpecsRegistered();
  const out: WorkflowToolInfo[] = [];
  const webReady = input.webSearch?.readyInfo() ?? {
    ok: false,
    reason: "Web search service not configured",
  };
  const browserPub = input.browserControl
    ? await input.browserControl.getPublicConfig()
    : null;

  for (const spec of Object.values(BUILTIN_TOOLS)) {
    const meta = BUILTIN_META[spec.name];
    if (spec.name === "web_search") {
      out.push({
        name: spec.name,
        risk: spec.risk,
        source: "builtin",
        summary: meta?.summary ?? spec.name,
        ...(meta?.sampleArgs ? { sampleArgs: meta.sampleArgs } : {}),
        available: webReady.ok,
        ...(webReady.ok ? {} : { unavailableReason: webReady.reason }),
      });
      continue;
    }
    if (spec.name === "browser") {
      const managedReady =
        browserPub?.enabled === true && browserPub.browserRuntime === "ready";
      const isOwner =
        !!input.forAccountId &&
        !!input.ownerAccountId &&
        input.forAccountId === input.ownerAccountId;
      const elevatedReady =
        browserPub?.elevatedAcknowledged === true &&
        ((browserPub.personalEnabled && browserPub.personalReady) ||
          (browserPub.remoteEnabled && browserPub.remoteReady));
      // Anyone may use managed when Chromium is ready; elevated only for Owner.
      const available = managedReady || (isOwner && elevatedReady === true);
      let unavailableReason: string | undefined;
      if (!available) {
        if (!browserPub?.enabled) {
          unavailableReason =
            browserPub?.unavailableReason ?? "Browser control not configured";
        } else if (!managedReady && elevatedReady && !isOwner) {
          unavailableReason =
            "Elevated browser profiles are Owner-account only; managed Chromium not ready";
        } else {
          unavailableReason =
            browserPub?.unavailableReason ?? "Browser control not ready";
        }
      }
      const browserRow: WorkflowToolInfo = {
        name: spec.name,
        risk: spec.risk,
        source: "builtin",
        summary: meta?.summary ?? spec.name,
        available,
      };
      if (meta?.sampleArgs) browserRow.sampleArgs = meta.sampleArgs;
      if (!available && unavailableReason) browserRow.unavailableReason = unavailableReason;
      out.push(browserRow);
      continue;
    }
    out.push({
      name: spec.name,
      risk: spec.risk,
      source: "builtin",
      summary: meta?.summary ?? spec.name,
      ...(meta?.sampleArgs ? { sampleArgs: meta.sampleArgs } : {}),
      available: true,
    });
  }

  const skills = await input.skills.listSkills();
  for (const s of skills) {
    if (!s.enabled || !s.verified) continue;
    const name = `skill:${s.id}`;
    out.push({
      name,
      risk: "read",
      source: "skill",
      summary: `Verified skill «${s.name}» (returns SKILL.md text)`,
      sampleArgs: {},
      available: true,
    });
  }

  const ha = await channelLooksReady(input.channels, "homeassistant");
  for (const d of HA_TOOLS) {
    const sample = haSampleArgs(d.name);
    const risk: RiskTier =
      d.baseTier === "admin" ? "admin" : d.baseTier === "sensitive" ? "sensitive" : "read";
    const haChoices =
      d.name === "ha_call_service"
        ? {
            argChoices: { domain: Object.keys(HA_DOMAIN_SERVICE_CHOICES) },
            argChoiceGroups: { service: HA_DOMAIN_SERVICE_CHOICES },
            argChoiceDependsOn: { service: "domain" },
          }
        : {};
    out.push({
      name: d.name,
      risk,
      source: "smarthome",
      summary: `Home Assistant · ${d.name}`,
      ...(sample ? { sampleArgs: sample } : {}),
      ...haChoices,
      available: ha.ok,
      ...(ha.ok ? {} : { unavailableReason: ha.reason }),
    });
  }

  const mqtt = await channelLooksReady(input.channels, "mqtt");
  for (const d of MQTT_TOOLS) {
    const sample = mqttSampleArgs(d.name);
    const risk: RiskTier =
      d.baseTier === "admin" ? "admin" : d.baseTier === "sensitive" ? "sensitive" : "read";
    const mqttChoices =
      d.name === "mqtt_publish"
        ? { argChoices: { payload: ["0", "1", "ON", "OFF", "true", "false"] } }
        : {};
    out.push({
      name: d.name,
      risk,
      source: "smarthome",
      summary: `MQTT · ${d.name}`,
      ...(sample ? { sampleArgs: sample } : {}),
      ...mqttChoices,
      available: mqtt.ok,
      ...(mqtt.ok ? {} : { unavailableReason: mqtt.reason }),
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Known catalogue names (including unavailable) — used for put validation. */
export async function workflowToolNameSet(input: {
  skills: SkillService;
  channels: ChannelService;
  webSearch?: WebSearchService | null;
  browserControl?: BrowserControlService | null;
}): Promise<Set<string>> {
  const tools = await listWorkflowTools(input);
  const set = new Set(tools.map((t) => t.name));
  set.add("sandbox_write");
  set.add("sandbox_read");
  return set;
}

export function assertWorkflowToolsKnown(
  def: { steps: Array<{ type: string; name?: string }> },
  known: Set<string>,
): void {
  for (const step of def.steps) {
    if (step.type !== "tool") continue;
    const raw = String(step.name ?? "");
    const name = normalizeWorkflowToolName(raw);
    if (!known.has(name) && !known.has(raw)) {
      throw Object.assign(new Error(`workflow.unknown_tool: ${raw || "(missing name)"}`), {
        code: "bad_params",
      });
    }
  }
}

async function readHaConfig(
  channels: ChannelService,
): Promise<{ baseUrl: string; token: string } | null> {
  try {
    const st = channels.getChannelStatus("homeassistant");
    if (!st.enabled) return null;
    const cfg = await channels.peekChannelConfig("homeassistant");
    const secrets = channels.peekChannelSecrets("homeassistant");
    if (typeof cfg.baseUrl !== "string" || !cfg.baseUrl) return null;
    const token = secrets.accessToken || secrets.token || "";
    if (!token) return null;
    return { baseUrl: cfg.baseUrl, token };
  } catch {
    return null;
  }
}

async function readMqttConfig(
  channels: ChannelService,
): Promise<{ brokerUrl: string; username?: string; password?: string } | null> {
  try {
    const st = channels.getChannelStatus("mqtt");
    if (!st.enabled) return null;
    const cfg = await channels.peekChannelConfig("mqtt");
    const secrets = channels.peekChannelSecrets("mqtt");
    if (typeof cfg.brokerUrl !== "string" || !cfg.brokerUrl) return null;
    const out: { brokerUrl: string; username?: string; password?: string } = {
      brokerUrl: cfg.brokerUrl,
    };
    if (secrets.username) out.username = secrets.username;
    if (secrets.password) out.password = secrets.password;
    return out;
  } catch {
    return null;
  }
}

/**
 * Design §5.7.3 — every object access (reads included) goes through resolve.
 * `objectId` is the opaque handle (`channel:sourceId`); never a bare entity_id/topic.
 */
export async function resolveBoundHandle(
  channels: ChannelService,
  objectId: string,
  accountId: string,
): Promise<ResolvedObjectHandle> {
  const { channel, sourceId } = splitObjectId(objectId);
  const all = await channels.objects.list({});
  // Household: any bound object resolves for any profile (Design 2026-10-16l).
  const bound = all.filter(
    (o) => o.sourceId === sourceId && o.channel === channel && o.bound && o.accountId !== null,
  );
  if (bound.length === 0) {
    throw Object.assign(
      new Error(`envoyhome.object_not_bound: ${objectId} unbound or unknown`),
      { code: "object_not_bound" },
    );
  }
  // Prefer the active channelAccount when several instances share a sourceId;
  // refuse when still ambiguous (wrong object / confused audit).
  let rec = bound[0]!;
  if (bound.length > 1) {
    const activeAccount = channels.loader.getChannelStatus(channel).channelAccount;
    const preferred = bound.filter((o) => o.channelAccount === activeAccount);
    if (preferred.length !== 1) {
      throw Object.assign(
        new Error(
          `envoyhome.object_not_bound: ${objectId} ambiguous across channelAccounts`,
        ),
        { code: "object_not_bound" },
      );
    }
    rec = preferred[0]!;
  }
  void accountId;
  // Narrowed by `o.accountId !== null` above; TS does not carry that through reassignment.
  const boundAccountId = rec.accountId;
  if (!boundAccountId) {
    throw Object.assign(
      new Error(`envoyhome.object_not_bound: ${objectId} unbound or unknown`),
      { code: "object_not_bound" },
    );
  }
  return {
    objectId: `${rec.channel}:${rec.sourceId}`,
    sourceId: rec.sourceId,
    accountId: boundAccountId,
    class: rec.class,
    displayName: rec.displayName,
    neverUnattended: rec.neverUnattended,
    actuationAllowList: [...rec.actuationAllowList],
    indirectionAllowList: [...rec.indirectionAllowList],
  };
}

async function journaledActuate(input: {
  actuations: ActuationService;
  accountId: string;
  handle: ResolvedObjectHandle;
  service: string;
  desiredState: string;
  origin: "attended" | "unattended";
  idempotent: boolean;
  dispatch: () => Promise<void>;
}): Promise<void> {
  const row = await input.actuations.journal.begin({
    accountId: input.accountId,
    objectId: input.handle.objectId,
    desiredState: input.desiredState,
    risk: "admin",
    origin: input.origin,
    idempotent: input.idempotent,
    service: input.service,
  });
  try {
    await input.dispatch();
    await input.actuations.journal.complete(input.accountId, row.actuationId, "confirmed", true);
  } catch (err) {
    await input.actuations.journal
      .complete(input.accountId, row.actuationId, "failed", false)
      .catch(() => undefined);
    throw err;
  }
}

/**
 * Run export_document / skill: / ha_* / mqtt_* after ApprovalSink has already allowed the call.
 * Actuation still goes through resolveObject + safety + journal (Design §5.7.3 / §5.7.7).
 */
export async function runExtendedWorkflowTool(input: {
  tool: string;
  args: Record<string, unknown>;
  skills: SkillService;
  channels: ChannelService;
  paths: HomePaths;
  /** Required for ha_* / mqtt_* object resolve + journal. */
  accountId?: string;
  origin?: "attended" | "unattended";
  actuations?: ActuationService;
  /** Design §4.2.1 — optional host workspace for `workspace/…` tool paths. */
  workspaceRoot?: string | null;
  workspaceMode?: WorkspaceMode | null;
  workspaceMounts?: Array<{ id: string; hostPath: string; mode: WorkspaceMode }> | null;
  /** Design §9.5f. */
  webSearch?: WebSearchService | null;
  /** Design §9.5g. */
  browserControl?: BrowserControlService | null;
  /** Design §7.4 V-CRON-9. */
  schedules?: ScheduleService | null;
  /** For schedule confirm workflow existence. */
  workflows?: WorkflowStore | null;
  /** Design §7.4 / 2026-10-19m — ephemeral thin-client context for NL WHEN. */
  clientContext?: import("./client-context.js").ClientTurnContext;
  /** Chat session for schedule proposal cards. */
  sessionId?: string;
  /** Design §9.5g.1 — Owner seat for elevated profiles. */
  ownerAccountId?: string | null;
  /** Design §9.5f.1 — mid-tool ask for browser SERP fallback. */
  authorizeBrowserFallback?: (detail: {
    engines: Array<"bing" | "google">;
  }) => Promise<boolean>;
}): Promise<string> {
  ensureSmarthomeToolSpecsRegistered();
  const tool = normalizeWorkflowToolName(input.tool);
  const origin = input.origin ?? "attended";

  if (tool === "export_document") {
    return runExportDocumentTool(input);
  }
  if (tool === "extract_document") {
    return runExtractDocumentTool(input);
  }
  if (tool === "schedule") {
    return runScheduleTool({
      args: input.args,
      skills: input.skills,
      channels: input.channels,
      ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
      ...(input.schedules !== undefined ? { schedules: input.schedules } : {}),
      ...(input.workflows !== undefined ? { workflows: input.workflows } : {}),
      ...(input.clientContext !== undefined ? { clientContext: input.clientContext } : {}),
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(input.webSearch !== undefined ? { webSearch: input.webSearch } : {}),
      ...(input.browserControl !== undefined
        ? { browserControl: input.browserControl }
        : {}),
    });
  }
  if (tool === "web_search") {
    if (!input.webSearch) {
      throw new Error("envoyhome.tool_unavailable: web search not configured");
    }
    return input.webSearch.runSearch(input.args, {
      origin,
      ...(input.authorizeBrowserFallback
        ? { authorizeBrowserFallback: input.authorizeBrowserFallback }
        : {}),
    });
  }
  if (tool === "browser") {
    if (!input.browserControl) {
      throw new Error("envoyhome.tool_unavailable: browser control not configured");
    }
    if (!input.accountId) {
      throw new Error("envoyhome.bad_params: accountId required for browser");
    }
    return input.browserControl.runTool(input.args, {
      accountId: input.accountId,
      origin,
      ownerAccountId: input.ownerAccountId ?? null,
    });
  }

  if (tool.startsWith("skill:")) {
    const id = tool.slice("skill:".length);
    const rows = await input.skills.listSkills();
    const row = rows.find((r) => r.id === id);
    if (!row || !row.enabled || !row.verified) {
      throw new Error(`envoyhome.tool_unavailable: skill ${id} not verified/enabled`);
    }
    const text = await readFile(join(input.paths.skillsDir, id, "SKILL.md"), "utf8");
    return text;
  }

  if (tool.startsWith("ha_")) {
    const haOk = await channelLooksReady(input.channels, "homeassistant");
    if (!haOk.ok) {
      throw new Error(`envoyhome.tool_unavailable: ${haOk.reason}`);
    }
    const cfg = await readHaConfig(input.channels);
    if (!cfg) {
      throw new Error(
        "envoyhome.tool_unavailable: Home Assistant channel needs baseUrl + accessToken",
      );
    }
    const client = createHaClient(cfg);
    if (tool === "ha_list_entities") {
      return JSON.stringify(await client.listEntities());
    }
    if (tool === "ha_list_services") {
      return JSON.stringify(await client.listServices());
    }
    if (tool === "ha_get_state") {
      if (!input.accountId) {
        throw new Error("envoyhome.bad_params: accountId required for ha_get_state");
      }
      const objectId = requireObjectId(input.args, tool);
      const handle = await resolveBoundHandle(input.channels, objectId, input.accountId);
      return JSON.stringify((await client.getState(handle.sourceId)) ?? null);
    }
    if (tool === "ha_call_service") {
      const domain = String(input.args.domain ?? "");
      const service = String(input.args.service ?? "");
      if (!domain || !service) throw new Error("domain and service required");
      if (!input.accountId || !input.actuations) {
        throw new Error(
          "envoyhome.bad_params: accountId + actuations required for ha_call_service",
        );
      }
      const objectId = requireObjectId(input.args, tool);
      const handle = await resolveBoundHandle(input.channels, objectId, input.accountId);
      // ApprovalSink already claimed a grant for unattended before dispatch.
      assertActuationAllowed({
        handle,
        domain,
        service,
        origin,
        hasGrant: origin === "unattended",
      });
      const data: Record<string, unknown> = { ...input.args };
      delete data.domain;
      delete data.service;
      delete data.objectId;
      data.entity_id = handle.sourceId;
      await journaledActuate({
        actuations: input.actuations,
        accountId: input.accountId,
        handle,
        service: `${domain}.${service}`,
        desiredState: JSON.stringify({
          domain,
          service,
          objectId: handle.objectId,
        }),
        origin,
        idempotent: !service.endsWith("toggle"),
        dispatch: () => client.callService(domain, service, data),
      });
      return "ok";
    }
    throw new Error(`envoyhome.tool_unavailable: unsupported HA tool ${tool}`);
  }

  if (tool.startsWith("mqtt_")) {
    const mqttOk = await channelLooksReady(input.channels, "mqtt");
    if (!mqttOk.ok) {
      throw new Error(`envoyhome.tool_unavailable: ${mqttOk.reason}`);
    }
    const cfg = await readMqttConfig(input.channels);
    if (!cfg) {
      throw new Error("envoyhome.tool_unavailable: MQTT channel needs brokerUrl");
    }
    const client = createMqttClient(cfg);
    try {
      if (tool === "mqtt_subscribe") {
        if (!input.accountId) {
          throw new Error("envoyhome.bad_params: accountId required for mqtt_subscribe");
        }
        const objectId = requireObjectId(input.args, tool);
        const handle = await resolveBoundHandle(input.channels, objectId, input.accountId);
        await client.subscribe(handle.sourceId);
        return "ok";
      }
      if (tool === "mqtt_read") {
        if (!input.accountId) {
          throw new Error("envoyhome.bad_params: accountId required for mqtt_read");
        }
        const objectId = requireObjectId(input.args, tool);
        const handle = await resolveBoundHandle(input.channels, objectId, input.accountId);
        const row = await client.read(handle.sourceId);
        return JSON.stringify(row ?? null);
      }
      if (tool === "mqtt_publish") {
        const payload = String(input.args.payload ?? "");
        if (!input.accountId || !input.actuations) {
          throw new Error(
            "envoyhome.bad_params: accountId + actuations required for mqtt_publish",
          );
        }
        const objectId = requireObjectId(input.args, tool);
        const handle = await resolveBoundHandle(input.channels, objectId, input.accountId);
        const topic = handle.sourceId;
        const mqttTopicAllowed = handle.actuationAllowList.includes(topic);
        // ApprovalSink already claimed a grant for unattended before dispatch.
        assertActuationAllowed({
          handle,
          domain: "mqtt",
          service: "publish",
          origin,
          hasGrant: origin === "unattended",
          mqttTopicAllowed,
        });
        await journaledActuate({
          actuations: input.actuations,
          accountId: input.accountId,
          handle,
          service: "mqtt_publish",
          desiredState: JSON.stringify({ objectId: handle.objectId, payload }),
          origin,
          idempotent: true,
          dispatch: () => client.publish(topic, payload),
        });
        return "ok";
      }
      throw new Error(`envoyhome.tool_unavailable: unsupported MQTT tool ${tool}`);
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  throw new Error(`envoyhome.bad_params: unknown tool ${tool}`);
}

/** Design §9.5b — Markdown → docx/xlsx/csv/pdf under output/exports/. */
async function runExportDocumentTool(input: {
  args: Record<string, unknown>;
  paths: HomePaths;
  accountId?: string;
  workspaceRoot?: string | null;
  workspaceMode?: WorkspaceMode | null;
  workspaceMounts?: Array<{ id: string; hostPath: string; mode: WorkspaceMode }> | null;
}): Promise<string> {
  if (!input.accountId) {
    throw new Error("envoyhome.bad_params: accountId required for export_document");
  }
  const formatRaw = input.args.format;
  if (!isExportFormat(formatRaw)) {
    throw new Error(
      "envoyhome.bad_params: format must be one of docx, xlsx, csv, pdf",
    );
  }
  const title =
    typeof input.args.title === "string" && input.args.title.trim()
      ? input.args.title.trim()
      : undefined;

  let markdown = "";
  if (typeof input.args.markdown === "string" && input.args.markdown.length > 0) {
    markdown = input.args.markdown;
  } else if (typeof input.args.sourcePath === "string" && input.args.sourcePath.trim()) {
    const src = input.args.sourcePath.trim().replace(/\\/g, "/");
    const ext = extname(src).toLowerCase();
    if (ext !== ".md" && ext !== ".markdown" && ext !== ".txt") {
      throw new Error(
        "envoyhome.bad_params: sourcePath must be a .md / .markdown / .txt file",
      );
    }
    const resolved = resolveSandboxPath(
      toolPathOpts(input.paths, input.accountId, input, false, src),
    );
    markdown = await readFile(resolved.absolute, "utf8");
  } else {
    throw new Error(
      "envoyhome.bad_params: export_document requires markdown or sourcePath",
    );
  }

  const uri =
    typeof input.args.path === "string" && input.args.path.trim()
      ? assertExportOutputPath(input.args.path.trim())
      : defaultExportUri(formatRaw, title);

  // Ensure extension matches format.
  const expectedExt = `.${formatRaw}`;
  if (!uri.toLowerCase().endsWith(expectedExt)) {
    throw new Error(
      `envoyhome.bad_params: path must end with ${expectedExt}`,
    );
  }

  const buf = await exportDocument(formatRaw, markdown, title ? { title } : undefined);
  const out = resolveSandboxPath(
    toolPathOpts(input.paths, input.accountId, input, true, uri),
  );
  await mkdir(dirname(out.absolute), { recursive: true });
  await writeFile(out.absolute, buf);

  return JSON.stringify({
    uri,
    bytes: buf.length,
    mimeType: exportMimeType(formatRaw),
    format: formatRaw,
  });
}

/** Design §9.5c — sandbox Office/PDF → GFM under output/extracts/. */
async function runExtractDocumentTool(input: {
  args: Record<string, unknown>;
  paths: HomePaths;
  accountId?: string;
  workspaceRoot?: string | null;
  workspaceMode?: WorkspaceMode | null;
  workspaceMounts?: Array<{ id: string; hostPath: string; mode: WorkspaceMode }> | null;
}): Promise<string> {
  if (!input.accountId) {
    throw new Error("envoyhome.bad_params: accountId required for extract_document");
  }
  const sourcePath =
    typeof input.args.sourcePath === "string" ? input.args.sourcePath.trim().replace(/\\/g, "/") : "";
  if (!sourcePath) {
    throw new Error("envoyhome.bad_params: extract_document requires sourcePath");
  }
  const ext = extname(sourcePath);
  if (!isExtractableExtension(ext)) {
    throw new Error(
      `envoyhome.bad_params: sourcePath extension not extractable (${ext || "none"})`,
    );
  }

  const src = resolveSandboxPath(
    toolPathOpts(input.paths, input.accountId, input, false, sourcePath),
  );
  const raw = await readFile(src.absolute);
  if (raw.length > DOCUMENT_EXTRACT_MAX_SOURCE_BYTES) {
    throw new Error(
      `envoyhome.bad_params: source exceeds ${DOCUMENT_EXTRACT_MAX_SOURCE_BYTES} bytes`,
    );
  }

  const gfm = await extractDocumentText(ext, raw);
  if (!gfm) {
    throw new Error(
      "envoyhome.bad_params: extract unavailable (unsupported, encrypted, scanned PDF, or malformed)",
    );
  }

  const uri =
    typeof input.args.path === "string" && input.args.path.trim()
      ? assertExtractOutputPath(input.args.path.trim())
      : defaultExtractUri(sourcePath);

  const out = resolveSandboxPath(
    toolPathOpts(input.paths, input.accountId, input, true, uri),
  );
  await mkdir(dirname(out.absolute), { recursive: true });
  await writeFile(out.absolute, gfm, "utf8");

  // `text` is for workflow LLM prompts ({{step.extract.text}}); full body stays at uri.
  // Cap matches chat attach inline (§9.5a CHAT_MEDIA_EXTRACT_INLINE_CHARS).
  const inlineCap = 24_000;
  const truncated = gfm.length > inlineCap;
  const text = truncated
    ? `${gfm.slice(0, inlineCap).trimEnd()}\n\n…[truncated — read_file \`${uri}\` for remainder]`
    : gfm;

  return JSON.stringify({
    uri,
    extractChars: gfm.length,
    extractor: DOCUMENT_TEXT_EXTRACTOR_ID,
    sourcePath,
    text,
    ...(truncated ? { textTruncated: true } : {}),
  });
}

/** Design §7.4 — chat-native schedule propose / confirm / list / change. */
async function runScheduleTool(input: {
  args: Record<string, unknown>;
  accountId?: string;
  schedules?: ScheduleService | null;
  workflows?: WorkflowStore | null;
  skills: SkillService;
  channels: ChannelService;
  webSearch?: WebSearchService | null;
  browserControl?: BrowserControlService | null;
  clientContext?: import("./client-context.js").ClientTurnContext;
  sessionId?: string;
}): Promise<string> {
  if (!input.schedules) {
    throw new Error("envoyhome.tool_unavailable: schedule service not configured");
  }
  if (!input.accountId) {
    throw new Error("envoyhome.bad_params: accountId required for schedule");
  }
  const accountId = input.accountId;
  const action =
    typeof input.args.action === "string" ? input.args.action.trim().toLowerCase() : "";
  if (
    action !== "propose" &&
    action !== "confirm" &&
    action !== "list" &&
    action !== "reschedule" &&
    action !== "enable" &&
    action !== "remove" &&
    action !== "rename"
  ) {
    throw new Error(
      "envoyhome.bad_params: schedule action must be propose | confirm | list | reschedule | enable | remove | rename",
    );
  }
  await input.schedules.watchAccount(accountId);

  if (action === "list") {
    const jobs = await input.schedules.store.listJobs(accountId);
    const rows = jobs
      .filter((j) => j.payload.kind !== "system")
      .slice(0, 40)
      .map((j) => ({
        id: j.id,
        name: j.name,
        enabled: j.enabled,
        kind: j.spec.kind,
        when: describeScheduleSpec(j.spec),
        nextRunAt: j.nextRunAt,
        payloadKind: j.payload.kind,
        source: j.source,
      }));
    return JSON.stringify({ jobs: rows });
  }

  if (action === "reschedule") {
    const jobId = await resolveScheduleJobId(input.schedules, accountId, input.args);
    const text = typeof input.args.text === "string" ? input.args.text.trim() : "";
    if (!text) {
      throw new Error(
        "envoyhome.bad_params: schedule reschedule requires text (user WHEN phrasing)",
      );
    }
    if (
      input.args.whenInstant !== undefined ||
      input.args.cronExpr !== undefined ||
      input.args.everyMs !== undefined ||
      input.args.spec !== undefined
    ) {
      throw new Error(
        "envoyhome.bad_params: schedule reschedule refuses whenInstant/cronExpr/everyMs/spec — pass natural-language text only",
      );
    }
    const proposal = await input.schedules.proposeFromText(accountId, text, undefined, {
      replacesJobId: jobId,
      ...(input.clientContext ? { clientContext: input.clientContext } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    });
    if ("error" in proposal) {
      throw new Error(`envoyhome.bad_params: ${formatProposeFailure(proposal)}`);
    }
    return JSON.stringify({
      proposalId: proposal.proposalId,
      replacesJobId: jobId,
      resolvedLocal: proposal.resolvedLocal,
      kind: proposal.spec.kind,
      timeZone: proposal.spec.timeZone,
      ...(proposal.relativeHint ? { relativeHint: proposal.relativeHint } : {}),
      ...(proposal.nextRunAt ? { nextRunAt: proposal.nextRunAt } : {}),
      note: "Not changed — call schedule confirm with this proposalId after the user agrees. Quote resolvedLocal.",
    });
  }

  if (action === "enable" || action === "remove" || action === "rename") {
    const jobId = await resolveScheduleJobId(input.schedules, accountId, input.args);
    if (action === "remove") {
      await input.schedules.removeJob(accountId, jobId);
      return JSON.stringify({ removed: true, jobId });
    }
    if (action === "rename") {
      const name = typeof input.args.name === "string" ? input.args.name.trim() : "";
      if (!name) {
        throw new Error("envoyhome.bad_params: schedule rename requires name");
      }
      const job = await input.schedules.updateJob(accountId, jobId, { name });
      return JSON.stringify({ renamed: true, job: { id: job.id, name: job.name } });
    }
    if (typeof input.args.enabled !== "boolean") {
      throw new Error("envoyhome.bad_params: schedule enable requires enabled true or false");
    }
    const job = await input.schedules.updateJob(accountId, jobId, {
      enabled: input.args.enabled,
    });
    return JSON.stringify({
      enabled: job.enabled,
      job: { id: job.id, name: job.name, enabled: job.enabled, nextRunAt: job.nextRunAt },
    });
  }

  if (action === "propose") {
    // V-CRON-11 — WHEN is resolver-only; refuse invented structured specs in the fence.
    if (
      input.args.whenInstant !== undefined ||
      input.args.cronExpr !== undefined ||
      input.args.everyMs !== undefined ||
      input.args.spec !== undefined
    ) {
      throw new Error(
        "envoyhome.bad_params: schedule propose refuses whenInstant/cronExpr/everyMs/spec — pass natural-language text only",
      );
    }
    const text =
      typeof input.args.text === "string"
        ? input.args.text.trim()
        : "";
    if (!text) {
      throw new Error(
        "envoyhome.bad_params: schedule propose requires text (user WHEN phrasing)",
      );
    }
    const timeZone =
      typeof input.args.timeZone === "string" && input.args.timeZone.trim()
        ? input.args.timeZone.trim()
        : undefined;
    const message =
      typeof input.args.message === "string" && input.args.message.trim()
        ? input.args.message.trim()
        : undefined;
    const proposal = await input.schedules.proposeFromText(accountId, text, timeZone, {
      ...(message ? { message } : {}),
      ...(input.clientContext ? { clientContext: input.clientContext } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    });
    if ("error" in proposal) {
      throw new Error(`envoyhome.bad_params: ${formatProposeFailure(proposal)}`);
    }
    return JSON.stringify({
      proposalId: proposal.proposalId,
      resolvedLocal: proposal.resolvedLocal,
      kind: proposal.spec.kind,
      timeZone: proposal.spec.timeZone,
      expiresAt: proposal.expiresAt,
      ...(proposal.relativeHint ? { relativeHint: proposal.relativeHint } : {}),
      ...(proposal.nextRunAt ? { nextRunAt: proposal.nextRunAt } : {}),
      ...(proposal.spec.whenInstant ? { whenInstant: proposal.spec.whenInstant } : {}),
      ...(proposal.spec.cronExpr ? { cronExpr: proposal.spec.cronExpr } : {}),
      ...(proposal.spec.everyMs !== undefined ? { everyMs: proposal.spec.everyMs } : {}),
      ...(proposal.payload.message ? { message: proposal.payload.message } : {}),
      note: "Not armed — call schedule confirm with this proposalId after the user agrees. Quote resolvedLocal (and relativeHint if present) to the user.",
    });
  }

  // confirm — same payload validation as home.confirmSchedule
  const proposalId =
    typeof input.args.proposalId === "string" ? input.args.proposalId.trim() : "";
  if (!proposalId) {
    throw new Error("envoyhome.bad_params: schedule confirm requires proposalId");
  }
  const overrides: {
    name?: string;
    payload?: Awaited<ReturnType<typeof resolveAndValidateUserSchedulePayload>>;
  } = {};
  if (typeof input.args.name === "string" && input.args.name.trim()) {
    overrides.name = input.args.name.trim();
  }
  if (input.args.payload !== undefined) {
    if (!input.workflows) {
      throw new Error("envoyhome.tool_unavailable: workflows not configured for schedule");
    }
    await input.workflows.ensureLoaded();
    overrides.payload = await resolveAndValidateUserSchedulePayload({
      raw: input.args.payload,
      accountId,
      hasWorkflow: (workflowId, aid) => !!input.workflows!.getWorkflow(workflowId, aid),
      knownToolNames: workflowToolNameSet({
        skills: input.skills,
        channels: input.channels,
        ...(input.webSearch !== undefined ? { webSearch: input.webSearch } : {}),
        ...(input.browserControl !== undefined
          ? { browserControl: input.browserControl }
          : {}),
      }),
    });
  }
  const replacing = input.schedules.store.getProposal(proposalId)?.replacesJobId;
  const job = await input.schedules.confirmProposal(accountId, proposalId, overrides);
  return JSON.stringify({
    armed: !replacing,
    ...(replacing ? { updated: true, jobId: job.id } : {}),
    job: {
      id: job.id,
      enabled: job.enabled,
      nextRunAt: job.nextRunAt,
      name: job.name,
    },
  });
}

async function resolveScheduleJobId(
  schedules: ScheduleService,
  accountId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const jobId = typeof args.jobId === "string" ? args.jobId.trim() : "";
  if (jobId) return jobId;
  const name = typeof args.jobName === "string" ? args.jobName.trim() : "";
  if (!name) {
    throw new Error("envoyhome.bad_params: schedule change requires jobId");
  }
  const jobs = await schedules.store.listJobs(accountId);
  const hits = jobs.filter((j) => j.payload.kind !== "system" && j.name === name);
  if (hits.length === 1 && hits[0]) return hits[0].id;
  if (hits.length === 0) {
    throw new Error("envoyhome.bad_params: unknown schedule name");
  }
  throw new Error("envoyhome.bad_params: schedule name is ambiguous — pass jobId");
}

/** SSRF-safe fetch wrapper for workflow http_fetch (fetch-compatible). */
export async function workflowHttpFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input instanceof Request
          ? input.url
          : String(input);
  assertPublicHttpsUrl(url);
  return fetch(url, { ...(init ?? {}), method: "GET", redirect: "error" });
}
