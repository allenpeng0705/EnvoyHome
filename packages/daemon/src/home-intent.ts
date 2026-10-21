// Home-intent routing — Design §5.7.8 (P1 cost / P2 accuracy).
// Default gate is local/session/sticky — never an LLM classify on every turn.

import type { ChannelService } from "./channels/service.js";
import type { ObjectRecord } from "./object-registry.js";

export type SessionPurpose = "general" | "home" | "schedules";

/** Sticky window after a confirmed home turn (Design §5.7.8). */
export const HOME_STICKY_TURNS_DEFAULT = 3;

/** Bound-object card soft cap (Design §5.7.8). */
export const BOUND_INJECT_CAP_DEFAULT = 40;
export const BOUND_INJECT_CAP_HARD = 80;

const HOME_PHRASE =
  /\b(turn\s+(on|off)|switch\s+(on|off)|dim|brighten|unlock|lock|thermostat|temperature|set\s+to\s+\d+|lights?|lamp|blinds?|garage|doorbell|hvac|climate|ha\b|home\s*assistant|smart\s*home)\b|开灯|关灯|开锁|上锁|开门|关门|打开|关闭|关掉|开启|调到|调高|调低|设为|\d+\s*度|卧室灯|客厅灯|厨房灯|台灯|风扇|窗帘|车库|空调|温控|报警|门锁|灯/i;

/** Room / device aliases for CJK + English local matching (Design §5.7.8 P1). */
const DEVICE_ALIASES: ReadonlyArray<{ keys: RegExp; match: RegExp; classes?: string[] }> = [
  // MQTT demos — specific names first (broad “mqtt” would hit desk before porch).
  {
    keys: /MQTT廊灯|mqtt\s*porch|廊灯/i,
    match: /mqtt_porch|porch|廊灯/i,
    classes: ["light", "switch"],
  },
  {
    keys: /MQTT台灯|mqtt\s*desk/i,
    match: /mqtt_desk|MQTT台灯/i,
    classes: ["light", "switch"],
  },
  {
    keys: /MQTT风扇|mqtt\s*fan/i,
    match: /mqtt_fan|MQTT风扇/i,
    classes: ["light", "switch"],
  },
  {
    keys: /MQTT温度|MQTT恒温|mqtt\s*temp|mqtt\s*thermo|mqtt\s*climate/i,
    match: /mqtt_thermostat|mqtt_temp|MQTT温度|MQTT恒温/i,
    classes: ["climate"],
  },
  {
    keys: /\bmqtt\b/i,
    match: /mqtt|envoyhome\/demo/i,
    classes: ["light", "switch", "climate"],
  },
  { keys: /卧室|bedroom/i, match: /bedroom|卧/i, classes: ["light", "switch"] },
  { keys: /客厅|起居|living/i, match: /living|客厅|起居/i, classes: ["light", "switch", "other"] },
  { keys: /厨房|kitchen/i, match: /kitchen|厨/i, classes: ["light", "switch"] },
  { keys: /书房|desk|台灯/i, match: /desk|书房|lamp/i, classes: ["light", "switch"] },
  { keys: /门锁|大门|front\s*door/i, match: /front_door|lock\.|门锁|大门/i, classes: ["lock"] },
  { keys: /车库|garage/i, match: /garage|车库/i, classes: ["garage", "other"] },
  { keys: /风扇|fan|ceiling/i, match: /fan\.|ceiling|风扇/i, classes: ["switch"] },
  { keys: /窗帘|blinds|cover/i, match: /blinds|cover\.|窗帘/i, classes: ["other"] },
  {
    keys: /空调|恒温|thermostat|climate|温度/i,
    match: /climate\.|hallway|恒温|空调|mqtt_thermostat/i,
    classes: ["climate"],
  },
];

/** Match full displayName or a bilingual segment (“A / B”). */
function displayNameHits(userLower: string, displayName: string): boolean {
  const name = displayName.trim();
  if (name.length < 2) return false;
  if (userLower.includes(name.toLowerCase())) return true;
  for (const part of name.split(/[/|·]/).map((s) => s.trim())) {
    if (part.length >= 2 && userLower.includes(part.toLowerCase())) return true;
  }
  return false;
}

export async function isHomeAssistantReady(channels: ChannelService): Promise<boolean> {
  try {
    const st = channels.getChannelStatus("homeassistant");
    if (!st.enabled) return false;
    const cfg = await channels.peekChannelConfig("homeassistant");
    const secrets = channels.peekChannelSecrets("homeassistant");
    const baseUrl = typeof cfg.baseUrl === "string" ? cfg.baseUrl.trim() : "";
    const token = secrets.accessToken || secrets.token || "";
    return Boolean(baseUrl && token);
  } catch {
    return false;
  }
}

export async function isMqttReady(channels: ChannelService): Promise<boolean> {
  try {
    const st = channels.getChannelStatus("mqtt");
    if (!st.enabled) return false;
    const cfg = await channels.peekChannelConfig("mqtt");
    const brokerUrl = typeof cfg.brokerUrl === "string" ? cfg.brokerUrl.trim() : "";
    return Boolean(brokerUrl);
  } catch {
    return false;
  }
}

/** Home chat / local planner unlock when HA and/or MQTT is configured. */
export async function isSmartHomeReady(channels: ChannelService): Promise<boolean> {
  return (await isHomeAssistantReady(channels)) || (await isMqttReady(channels));
}

export function normalizePurpose(raw: unknown): SessionPurpose {
  if (raw === "home" || raw === "schedules") return raw;
  return "general";
}

type BoundDevicePick = Pick<ObjectRecord, "displayName" | "sourceId" | "class"> & {
  channel?: string;
};

/**
 * Decide whether this turn is a home surface (tools + bound inject).
 * Order: purpose → sticky → local heuristic. No LLM.
 */
export function resolveHomeSurface(input: {
  purpose: SessionPurpose;
  stickyHomeTurnsRemaining?: number;
  userText: string;
  boundObjects: ReadonlyArray<BoundDevicePick>;
}): { homeSurface: boolean; reason: "purpose" | "sticky" | "local" | "off" } {
  if (input.purpose === "home") return { homeSurface: true, reason: "purpose" };
  // Schedules chat stays off the home tool surface (Design §7.4).
  if (input.purpose === "schedules") return { homeSurface: false, reason: "off" };
  if ((input.stickyHomeTurnsRemaining ?? 0) > 0) {
    return { homeSurface: true, reason: "sticky" };
  }
  const text = input.userText.trim();
  if (!text) return { homeSurface: false, reason: "off" };
  const lower = text.toLowerCase();
  for (const o of input.boundObjects) {
    if (displayNameHits(lower, o.displayName || "")) {
      return { homeSurface: true, reason: "local" };
    }
    if (o.sourceId && lower.includes(o.sourceId.toLowerCase())) {
      return { homeSurface: true, reason: "local" };
    }
  }
  if (matchBoundDevices(text, input.boundObjects).kind !== "none") {
    return { homeSurface: true, reason: "local" };
  }
  if (HOME_PHRASE.test(text)) return { homeSurface: true, reason: "local" };
  return { homeSurface: false, reason: "off" };
}

export type BoundMatchResult =
  | { kind: "unique"; device: BoundDevicePick }
  | { kind: "ambiguous"; candidates: BoundDevicePick[] }
  | { kind: "none" };

/** Opaque handle for tool args — Design §5.7.3 (`channel:sourceId`). */
export function boundObjectId(device: Pick<BoundDevicePick, "channel" | "sourceId">): string {
  return `${device.channel || "homeassistant"}:${device.sourceId}`;
}

/** Approvals / chat label: channel · displayName · sourceId */
export function formatDeviceRef(device: BoundDevicePick): string {
  const channel = device.channel || "?";
  const name = (device.displayName || "").trim() || device.sourceId;
  return `${channel} · ${name} · ${device.sourceId}`;
}

/**
 * Resolve bound device(s) for a user phrase.
 * Unique → actuate; ambiguous → ask (never silent first-match).
 */
export function matchBoundDevices(
  userText: string,
  boundObjects: ReadonlyArray<BoundDevicePick>,
): BoundMatchResult {
  const text = userText.trim();
  if (!text) return { kind: "none" };
  const lower = text.toLowerCase();

  const nameHits = boundObjects.filter(
    (o) =>
      displayNameHits(lower, o.displayName || "") ||
      (Boolean(o.sourceId) && lower.includes(o.sourceId.toLowerCase())),
  );
  if (nameHits.length === 1) return { kind: "unique", device: nameHits[0]! };
  if (nameHits.length > 1) return { kind: "ambiguous", candidates: nameHits };

  const textMentionsMqtt = /mqtt/i.test(text);
  for (const alias of DEVICE_ALIASES) {
    if (!alias.keys.test(text)) continue;
    let matches = boundObjects.filter((o) => {
      const hay = `${o.sourceId} ${o.displayName || ""}`;
      if (!alias.match.test(hay)) return false;
      if (alias.classes && o.class && !alias.classes.includes(o.class)) return false;
      return true;
    });
    if (matches.length === 0) continue;
    // Generic room phrases prefer HA when both channels match.
    if (!textMentionsMqtt) {
      const nonMqtt = matches.filter((o) => o.channel !== "mqtt");
      if (nonMqtt.length > 0) matches = nonMqtt;
    }
    if (matches.length === 1) return { kind: "unique", device: matches[0]! };
    if (matches.length > 1) return { kind: "ambiguous", candidates: matches };
  }
  return { kind: "none" };
}

/** @deprecated Prefer matchBoundDevices — unique only. */
export function matchBoundDevice(
  userText: string,
  boundObjects: ReadonlyArray<BoundDevicePick>,
): BoundDevicePick | undefined {
  const r = matchBoundDevices(userText, boundObjects);
  return r.kind === "unique" ? r.device : undefined;
}

export type LocalHomePlan = {
  tools: Array<{ tool: string; args: Record<string, unknown>; summary: string }>;
  reply: string;
  /** When set, thin clients show a choice card (Design V-UX-14). */
  choiceCandidates?: BoundDevicePick[];
};

function formatDisambiguationReply(
  candidates: ReadonlyArray<BoundDevicePick>,
  replyZh: boolean,
): string {
  const lines = candidates.slice(0, 8).map((c) => `- ${formatDeviceRef(c)}`);
  const more =
    candidates.length > 8
      ? replyZh
        ? `\n…还有 ${candidates.length - 8} 个`
        : `\n…and ${candidates.length - 8} more`
      : "";
  return replyZh
    ? [
        "有多个设备符合你的描述，请说得更具体一些（例如带上 MQTT / 房间名，或完整设备名）：",
        ...lines,
        more,
      ]
        .filter(Boolean)
        .join("\n")
    : [
        "Several devices match — be more specific (e.g. say MQTT / a room, or the full name):",
        ...lines,
        more,
      ]
        .filter(Boolean)
        .join("\n");
}

/** Parse a setpoint from phrases like `调到26度` / `set … to 22`. */
export function parseTemperatureSetpoint(userText: string): number | undefined {
  const text = userText.trim();
  const m =
    text.match(/(?:调高到|调低到|调到|调至|设为|设置到|(?:到|至))\s*(-?\d{1,2}(?:\.\d+)?)\s*(?:度|°\s*[Cc]?)?/i) ||
    text.match(/\b(?:set(?:\s+temperature)?|temperature)\b[\s\S]{0,40}?\bto\s*(-?\d{1,2}(?:\.\d+)?)\b/i) ||
    text.match(/\bto\s*(-?\d{1,2}(?:\.\d+)?)\s*(?:度|°\s*[Cc]?)?\s*$/i) ||
    text.match(/(-?\d{1,2}(?:\.\d+)?)\s*(?:度|°\s*[Cc]?)/);
  if (!m?.[1]) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 5 || n > 35) return undefined;
  return n;
}

function isClimateDevice(device: BoundDevicePick): boolean {
  return device.class === "climate" || (device.sourceId || "").startsWith("climate.");
}

function planClimateSetpoint(
  device: BoundDevicePick,
  temperature: number,
  replyZh: boolean,
  note?: string,
): LocalHomePlan {
  const objectId = boundObjectId(device);
  const label = formatDeviceRef(device);
  const shortLabel = (device.displayName || "").trim() || device.sourceId;
  const noteLine = note ? `\n${note}` : "";
  // MQTT climate: publish the setpoint number on the bound topic.
  if (device.channel === "mqtt") {
    return {
      tools: [
        {
          tool: "mqtt_publish",
          args: { objectId, payload: String(temperature) },
          summary: `Set ${label} to ${temperature}°`,
        },
      ],
      reply: replyZh
        ? `已请求将「${shortLabel}」调到 ${temperature} 度（${label}）— 请在 Approvals 中确认后生效。${noteLine}`
        : `Requested ${label} → ${temperature}° — Allow in Approvals to apply.${noteLine}`,
    };
  }
  return {
    tools: [
      {
        tool: "ha_call_service",
        args: {
          objectId,
          domain: "climate",
          service: "set_temperature",
          temperature,
        },
        summary: `Set ${label} to ${temperature}°`,
      },
    ],
    reply: replyZh
      ? `已请求将「${shortLabel}」调到 ${temperature} 度（${label}）— 请在 Approvals 中确认后生效。${noteLine}`
      : `Requested ${label} → ${temperature}° — Allow in Approvals to apply.${noteLine}`,
  };
}

const HOME_AFFIRM =
  /^(是的|好的?|可以|确认|行|嗯|对|设吧|调吧|ok|okay|yes|yep|sure|please\s*do|go\s*ahead|do\s*it)[.!。！…]*$/i;

const HOME_DENY =
  /^(不用了?|不了|不要|取消|算了|先别|别了|no|nope|cancel|never\s*mind|don't)[.!。！…]*$/i;

export function isHomeAffirmation(userText: string): boolean {
  return HOME_AFFIRM.test(userText.trim());
}

export function isHomeDenial(userText: string): boolean {
  return HOME_DENY.test(userText.trim());
}

/** Durable multi-round offer stored on session meta. */
export type PendingHomeProposal = {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  createdAt: string;
};

function parseProposedTemperature(content: string): number | undefined {
  return (
    parseTemperatureSetpoint(content) ??
    (() => {
      const m = content.match(
        /(?:目标温度|set(?:point)?|temperature|调到|设为|设置为)\s*(?:到|至|为|=|:)?\s*(-?\d{1,2}(?:\.\d+)?)\s*(?:度|℃|°\s*[Cc]?)?/i,
      );
      if (!m?.[1]) return undefined;
      const n = Number(m[1]);
      return Number.isFinite(n) && n >= 5 && n <= 35 ? n : undefined;
    })()
  );
}

function findNamedDevices(
  content: string,
  candidates: ReadonlyArray<BoundDevicePick>,
): BoundDevicePick[] {
  const lower = content.toLowerCase();
  return candidates.filter((o) => {
    const name = (o.displayName || "").trim();
    if (name.length < 2) return false;
    if (lower.includes(name.toLowerCase())) return true;
    return name.split(/[/|·]/).some((part) => {
      const p = part.trim();
      return p.length >= 2 && lower.includes(p.toLowerCase());
    });
  });
}

function resolveHandleDevice(
  content: string,
  boundObjects: ReadonlyArray<BoundDevicePick>,
): BoundDevicePick | undefined {
  const handleMatch =
    content.match(/`((?:homeassistant|mqtt):[^`\s]+)`/) ||
    content.match(/\b((?:homeassistant|mqtt):[a-z0-9_./-]+)\b/i);
  if (!handleMatch?.[1]) return undefined;
  const objectId = handleMatch[1];
  const sourceId = objectId.includes(":") ? objectId.slice(objectId.indexOf(":") + 1) : objectId;
  return (
    boundObjects.find((o) => boundObjectId(o) === objectId) ||
    boundObjects.find((o) => o.sourceId === sourceId)
  );
}

/**
 * Parse a concrete home actuation from assistant offer/claim text.
 * Used to stash session pending proposals across multi-round chat.
 */
export function extractHomeProposalFromAssistant(
  content: string,
  boundObjects: ReadonlyArray<BoundDevicePick>,
  replyZh = /[\u4e00-\u9fff]/.test(content),
): LocalHomePlan | undefined {
  const text = content.trim();
  if (!text) return undefined;

  const temperature = parseProposedTemperature(text);
  if (temperature !== undefined) {
    const fromHandle = resolveHandleDevice(text, boundObjects);
    if (fromHandle && isClimateDevice(fromHandle)) {
      return planClimateSetpoint(fromHandle, temperature, replyZh);
    }
    const climates = boundObjects.filter((o) => isClimateDevice(o));
    const named = findNamedDevices(text, climates);
    if (named.length === 1) return planClimateSetpoint(named[0]!, temperature, replyZh);
    if (climates.length === 1 && /thermostat|恒温|空调|climate|目标温度|set(?:point)?|温度/i.test(text)) {
      return planClimateSetpoint(climates[0]!, temperature, replyZh);
    }
  }

  // On/off offers: “打开 Bedroom?” / Turn on Kitchen?
  const on =
    /(打开|开启|开灯|turn\s+on|switch\s+on|unlock|开锁)/i.test(text) &&
    !/(关闭|关掉|关灯|turn\s+off|switch\s+off|上锁|\block\b)/i.test(text);
  const off = /(关闭|关掉|关灯|turn\s+off|switch\s+off|上锁|(?<![un])\block\b)/i.test(text);
  if (!on && !off) return undefined;

  const fromHandle = resolveHandleDevice(text, boundObjects);
  const device =
    fromHandle ||
    (() => {
      const named = findNamedDevices(text, boundObjects);
      return named.length === 1 ? named[0] : undefined;
    })();
  if (!device?.sourceId) return undefined;

  if (device.channel === "mqtt") {
    const objectId = boundObjectId(device);
    const label = formatDeviceRef(device);
    const shortLabel = (device.displayName || "").trim() || device.sourceId;
    const payload = on ? "ON" : "OFF";
    const action = payload === "ON" ? "Turn on" : "Turn off";
    return {
      tools: [
        {
          tool: "mqtt_publish",
          args: { objectId, payload },
          summary: `${action} ${label}`,
        },
      ],
      reply: replyZh
        ? payload === "ON"
          ? `已请求打开「${shortLabel}」（${label}）— 请在 Approvals 中确认后生效。`
          : `已请求关闭「${shortLabel}」（${label}）— 请在 Approvals 中确认后生效。`
        : `Requested ${action} ${label} — Allow in Approvals to apply.`,
    };
  }

  if (isClimateDevice(device)) return undefined; // need setpoint, handled above
  const domain = device.sourceId.split(".")[0] || "";
  if (!domain || domain === "sensor") return undefined;
  let service: string | undefined;
  if (domain === "light" || domain === "switch" || domain === "fan") {
    service = on ? "turn_on" : "turn_off";
  } else if (domain === "lock") {
    service = on ? "unlock" : "lock";
  } else if (domain === "cover" || domain === "valve") {
    service = on
      ? domain === "valve"
        ? "open_valve"
        : "open_cover"
      : domain === "valve"
        ? "close_valve"
        : "close_cover";
  }
  if (!service) return undefined;
  const objectId = boundObjectId(device);
  const label = formatDeviceRef(device);
  const shortLabel = (device.displayName || "").trim() || device.sourceId;
  return {
    tools: [
      {
        tool: "ha_call_service",
        args: { objectId, domain, service },
        summary: `${on ? "Turn on / open" : "Turn off / close"} ${label}`,
      },
    ],
    reply: replyZh
      ? on
        ? `已请求打开「${shortLabel}」（${label}）— 请在 Approvals 中确认后生效。`
        : `已请求关闭「${shortLabel}」（${label}）— 请在 Approvals 中确认后生效。`
      : `Requested ${service} on ${label} — Allow in Approvals to apply.`,
  };
}

export function pendingFromPlan(plan: LocalHomePlan): PendingHomeProposal | undefined {
  const step = plan.tools[0];
  if (!step) return undefined;
  return {
    tool: step.tool,
    args: step.args,
    summary: step.summary,
    createdAt: new Date().toISOString(),
  };
}

export function planFromPendingProposal(
  pending: PendingHomeProposal,
  replyZh: boolean,
): LocalHomePlan {
  return {
    tools: [
      {
        tool: pending.tool,
        args: { ...pending.args },
        summary: pending.summary,
      },
    ],
    reply: replyZh
      ? `已按你的确认提交「${pending.summary}」— 请在 Approvals 中确认后生效。`
      : `Submitted “${pending.summary}” as confirmed — Allow in Approvals to apply.`,
  };
}

/**
 * Follow-up "是的 / yes": prefer session pending, else scrape recent assistant turns.
 */
export function planAffirmedHomeActuation(
  userText: string,
  history: ReadonlyArray<{ role: string; content: string }>,
  boundObjects: ReadonlyArray<BoundDevicePick>,
  pending?: PendingHomeProposal | null,
): LocalHomePlan | undefined {
  if (!isHomeAffirmation(userText)) return undefined;
  const replyZh =
    /[\u4e00-\u9fff]/.test(userText) || history.some((h) => /[\u4e00-\u9fff]/.test(h.content));
  if (pending?.tool) return planFromPendingProposal(pending, replyZh);
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]!;
    if (msg.role !== "assistant") continue;
    const plan = extractHomeProposalFromAssistant(msg.content, boundObjects, replyZh);
    if (plan && plan.tools.length > 0) return plan;
  }
  return undefined;
}

/**
 * Deterministic on/off + climate setpoint planner — Design §5.7.8 P1.
 * Prefer this over the LLM tool-loop for clear hits (cost). Still goes through Approvals.
 * Ambiguous matches return a choice list and **no** tools (fail closed — no tool-loop).
 */
export function planLocalHomeActuation(
  userText: string,
  boundObjects: ReadonlyArray<BoundDevicePick>,
): LocalHomePlan | undefined {
  const text = userText.trim();
  if (!text) return undefined;
  const replyZh = /[\u4e00-\u9fff]/.test(text);
  const matched = matchBoundDevices(text, boundObjects);
  if (matched.kind === "none") return undefined;
  if (matched.kind === "ambiguous") {
    // Card carries the options (V-UX-14) — keep transcript reply short, no duplicate list.
    return {
      tools: [],
      reply: replyZh
        ? "有多个设备符合描述，请在下方选择一个："
        : "Several devices match — pick one below:",
      choiceCandidates: matched.candidates.slice(0, 8),
    };
  }
  const device = matched.device;
  if (!device.sourceId) return undefined;
  const objectId = boundObjectId(device);
  const label = formatDeviceRef(device);
  const shortLabel = (device.displayName || "").trim() || device.sourceId;

  const on =
    /(打开|开启|开灯|turn\s+on|switch\s+on|unlock|开锁)/i.test(text) &&
    !/(关闭|关掉|关灯|turn\s+off|switch\s+off|上锁|\block\b)/i.test(text);
  const off = /(关闭|关掉|关灯|turn\s+off|switch\s+off|上锁|(?<![un])\block\b)/i.test(text);

  // Setpoint: climate (HA or MQTT) directly; sensor/other → unique climate or disambiguate.
  const temperature = parseTemperatureSetpoint(text);
  if (temperature !== undefined) {
    if (isClimateDevice(device)) {
      return planClimateSetpoint(device, temperature, replyZh);
    }
    const climates = boundObjects.filter((o) => isClimateDevice(o));
    if (climates.length === 1) {
      const note = replyZh
        ? `（「${shortLabel}」不可调温，已改用恒温器）`
        : `(“${shortLabel}” is not settable; using the thermostat instead)`;
      return planClimateSetpoint(climates[0]!, temperature, replyZh, note);
    }
    if (climates.length > 1) {
      return {
        tools: [],
        reply: replyZh
          ? `「${shortLabel}」不可直接调温。请指定要用的恒温器：\n${formatDisambiguationReply(climates, true).split("\n").slice(1).join("\n")}`
          : `“${shortLabel}” cannot set temperature. Pick a thermostat:\n${formatDisambiguationReply(climates, false).split("\n").slice(1).join("\n")}`,
      };
    }
    return {
      tools: [],
      reply: replyZh
        ? `「${shortLabel}」不可调温，家里还没有可调的恒温器。请先绑定一个恒温器。`
        : `“${shortLabel}” cannot set temperature, and no thermostat is bound yet.`,
    };
  }

  // MQTT topics (channel mqtt) — publish ON/OFF via opaque handle.
  if (device.channel === "mqtt") {
    if (!on && !off) return undefined;
    const payload = on ? "ON" : "OFF";
    const action = payload === "ON" ? "Turn on" : "Turn off";
    return {
      tools: [
        {
          tool: "mqtt_publish",
          args: { objectId, payload },
          summary: `${action} ${label}`,
        },
      ],
      reply: replyZh
        ? payload === "ON"
          ? `已请求打开「${shortLabel}」（${label}）— 请在 Approvals 中确认后生效。`
          : `已请求关闭「${shortLabel}」（${label}）— 请在 Approvals 中确认后生效。`
        : `Requested ${action} ${label} — Allow in Approvals to apply.`,
    };
  }

  const domain = device.sourceId.split(".")[0] || "";
  if (!domain) return undefined;

  let service: string | undefined;
  if (domain === "light" || domain === "switch" || domain === "fan") {
    if (on) service = "turn_on";
    else if (off) service = "turn_off";
  } else if (domain === "lock") {
    if (on || /unlock|开锁|打开/.test(text)) service = "unlock";
    else if (off || /(?<![un])\block\b|上锁|锁上/.test(text)) service = "lock";
  } else if (domain === "cover" || domain === "valve") {
    if (on || /open|打开|开启/.test(text)) service = domain === "valve" ? "open_valve" : "open_cover";
    else if (off || /close|关闭|关掉/.test(text))
      service = domain === "valve" ? "close_valve" : "close_cover";
  } else if (domain === "media_player") {
    if (on || /play|播放/.test(text)) service = "media_play";
    else if (off || /pause|stop|暂停|停止/.test(text)) service = "media_pause";
  } else if (domain === "climate") {
    if (on) service = "turn_on";
    else if (off) service = "turn_off";
  }

  if (!service) return undefined;

  const openish =
    service === "turn_on" ||
    service === "open_cover" ||
    service === "open_valve" ||
    service === "unlock";
  const summary = openish ? `Turn on / open ${label}` : `Turn off / close ${label}`;
  const reply = replyZh
    ? service.includes("off") || service.includes("close") || service === "lock" || service === "media_pause"
      ? `已请求关闭「${shortLabel}」（${label}）— 请在 Approvals 中确认后生效。`
      : `已请求打开「${shortLabel}」（${label}）— 请在 Approvals 中确认后生效。`
    : `Requested ${service} on ${label} — Allow in Approvals to apply.`;

  return {
    tools: [
      {
        tool: "ha_call_service",
        args: { objectId, domain, service },
        summary,
      },
    ],
    reply,
  };
}

/** Decrement sticky counter when a turn ran as home via sticky (not purpose). */
export function consumeStickyTurn(
  purpose: SessionPurpose,
  remaining: number | undefined,
  reason: "purpose" | "sticky" | "local" | "off",
): number | undefined {
  if (purpose === "home" || purpose === "schedules") return remaining;
  if (reason === "local") return HOME_STICKY_TURNS_DEFAULT;
  if (reason === "sticky" && (remaining ?? 0) > 0) {
    const next = (remaining ?? 0) - 1;
    return next > 0 ? next : undefined;
  }
  if (reason === "off") return undefined;
  return remaining;
}

export function buildBoundObjectCard(
  objects: ReadonlyArray<ObjectRecord>,
  accountId: string,
  cap = BOUND_INJECT_CAP_DEFAULT,
): string {
  const capped = Math.min(Math.max(1, cap), BOUND_INJECT_CAP_HARD);
  void accountId;
  const bound = objects.filter((o) => o.bound && o.accountId !== null);
  if (bound.length === 0) {
    return [
      "## Home devices (bound)",
      "No devices bound for this home yet. Bind under Connections → Home Assistant or MQTT.",
    ].join("\n");
  }
  const slice = bound.slice(0, capped);
  const lines = slice.map(
    (o) =>
      `- ${o.displayName || o.sourceId} (${o.class}) · handle \`${o.channel}:${o.sourceId}\`` +
      (o.neverUnattended ? " · neverUnattended" : ""),
  );
  const more = bound.length > slice.length ? `\n… and ${bound.length - slice.length} more bound.` : "";
  return [
    "## Home devices (bound — use these opaque handles only; never invent entity ids/topics)",
    ...lines,
    more,
    "When controlling a device, call ha_call_service / mqtt_* with `objectId` set to a handle from this list (form `channel:sourceId`).",
    "Emit tool proposals in a fenced `envoyhome-tools` JSON array in the SAME message, e.g.:",
    "```envoyhome-tools",
    '[{"tool":"ha_call_service","args":{"objectId":"homeassistant:light.example","domain":"light","service":"turn_on"},"summary":"Turn on Example"}]',
    "```",
    "Never claim Approvals were requested unless you emitted that fence — chat text alone does not actuate.",
    "For multi-round offers (“需要我把…吗？”), name the device and setpoint clearly; the user may answer 是的/yes next turn.",
    "Do not ask the user to type confirm/好 in chat for Approvals — Approvals UI collects Allow/Deny after a real tool call.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function isSmartHomeToolName(tool: string): boolean {
  return tool.startsWith("ha_") || tool.startsWith("mqtt_");
}
