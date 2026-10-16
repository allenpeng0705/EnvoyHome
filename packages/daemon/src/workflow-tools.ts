// Workflow tool catalogue + extended dispatch — Design §7 (2026-10-15b).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
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
import { isHomeAssistantReady, isMqttReady } from "./home-intent.js";
import type { HomePaths } from "./home-paths.js";
import { assertPublicHttpsUrl } from "./skill-remote.js";
import type { SkillService } from "./skills.js";

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
    summary: "Read a file under the account sandbox",
    sampleArgs: { path: "notes/example.txt" },
  },
  write_file: {
    summary: "Write a file under the account sandbox",
    sampleArgs: { path: "notes/example.txt", content: "hello" },
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
}): Promise<WorkflowToolInfo[]> {
  ensureSmarthomeToolSpecsRegistered();
  const out: WorkflowToolInfo[] = [];

  for (const spec of Object.values(BUILTIN_TOOLS)) {
    const meta = BUILTIN_META[spec.name];
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
 * Run skill: / ha_* / mqtt_* after ApprovalSink has already allowed the call.
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
}): Promise<string> {
  ensureSmarthomeToolSpecsRegistered();
  const tool = normalizeWorkflowToolName(input.tool);
  const origin = input.origin ?? "attended";

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
