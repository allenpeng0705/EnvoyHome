/**
 * Household scene / automation authoring helpers (Design §19.8).
 * Builds standing-order payloads for ScheduleService — not a second engine.
 */

/** @typedef {{ enabled?: boolean, blockSmartHomeEgress?: boolean }} PrivacyModeView */

/**
 * @typedef {object} SceneTemplate
 * @property {string} id
 * @property {string} nameKey
 * @property {string} hintKey
 * @property {boolean} presenceAware
 * @property {"cron"|"smarthome_event"} whenKind
 * @property {string} [cronExpr]
 * @property {string} [eventType]
 * @property {"agentTurn"|"notify"} actionKind
 * @property {string} [prompt]
 * @property {string} [message]
 */

/** @type {SceneTemplate[]} */
export const SCENE_TEMPLATES = [
  {
    id: "good_morning",
    nameKey: "scenes.tplGoodMorning",
    hintKey: "scenes.tplGoodMorningHint",
    presenceAware: false,
    whenKind: "cron",
    cronExpr: "0 7 * * *",
    actionKind: "agentTurn",
    prompt:
      "Run the household good-morning routine: briefly check bound lights/climate if needed, then send a short friendly morning note. Prefer local tools; do not invent devices.",
  },
  {
    id: "good_night",
    nameKey: "scenes.tplGoodNight",
    hintKey: "scenes.tplGoodNightHint",
    presenceAware: false,
    whenKind: "cron",
    cronExpr: "0 22 * * *",
    actionKind: "agentTurn",
    prompt:
      "Run the household good-night routine: propose turning off non-essential bound lights and arming night mode only if bound objects allow. Ask before admin actuation when attended.",
  },
  {
    id: "evening_reminder",
    nameKey: "scenes.tplEvening",
    hintKey: "scenes.tplEveningHint",
    presenceAware: false,
    whenKind: "cron",
    cronExpr: "0 18 * * *",
    actionKind: "notify",
    message: "Evening check-in — anything the house should prepare?",
  },
  {
    id: "leave_home",
    nameKey: "scenes.tplLeaveHome",
    hintKey: "scenes.tplLeaveHomeHint",
    presenceAware: true,
    whenKind: "smarthome_event",
    eventType: "occupancy",
    actionKind: "agentTurn",
    prompt:
      "Presence: treat as nobody-home / leave-home. Secure bound locks/lights only via resolved objects and Approvals. Do not write presence into standing memory.",
  },
  {
    id: "arrive_home",
    nameKey: "scenes.tplArriveHome",
    hintKey: "scenes.tplArriveHomeHint",
    presenceAware: true,
    whenKind: "smarthome_event",
    eventType: "occupancy",
    actionKind: "agentTurn",
    prompt:
      "Presence: treat as arrive-home. Welcome lights/climate only via bound objects and Approvals. Do not Learn presence into standing memory.",
  },
];

/**
 * Presence-aware scenes require Privacy Mode with smart-home egress blocked (V-P2-PRIV-2).
 * @param {PrivacyModeView | null | undefined} privacy
 * @returns {{ ok: true } | { ok: false, reason: "privacy_required" }}
 */
export function assertPresenceSceneAllowed(privacy) {
  if (privacy && privacy.enabled === true && privacy.blockSmartHomeEgress !== false) {
    return { ok: true };
  }
  return { ok: false, reason: "privacy_required" };
}

/**
 * @param {SceneTemplate} template
 * @param {{
 *   name?: string,
 *   cronExpr?: string,
 *   sourceId?: string,
 *   eventType?: string,
 *   prompt?: string,
 *   message?: string,
 * }} opts
 */
/**
 * Standing orders store bare HA entity / MQTT topic sourceId.
 * Accept opaque `channel:sourceId` handles from the object registry too.
 * @param {string} raw
 */
export function normalizeSceneSourceId(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const i = s.indexOf(":");
  if (i <= 0) return s;
  const channel = s.slice(0, i).toLowerCase();
  if (
    channel === "ha" ||
    channel === "homeassistant" ||
    channel === "mqtt" ||
    channel === "demo-ha" ||
    channel === "demo-mqtt"
  ) {
    return s.slice(i + 1).trim();
  }
  return s;
}

export function buildStandingOrderFromScene(template, opts = {}) {
  const name = (opts.name || "").trim() || template.id.replace(/_/g, " ");
  /** @type {Record<string, unknown>} */
  let when;
  if (template.whenKind === "cron") {
    const cronExpr = (opts.cronExpr || template.cronExpr || "").trim();
    if (!cronExpr) throw new Error("cronExpr required");
    when = { kind: "cron", cronExpr };
  } else {
    const sourceId = normalizeSceneSourceId(opts.sourceId || "");
    if (!sourceId) throw new Error("sourceId required for presence scene");
    when = {
      kind: "smarthome_event",
      sourceId,
      ...(opts.eventType || template.eventType
        ? { eventType: (opts.eventType || template.eventType || "").trim() }
        : {}),
    };
  }

  /** @type {Record<string, unknown>} */
  let action;
  if (template.actionKind === "notify") {
    const message = (opts.message || template.message || "").trim();
    if (!message) throw new Error("notify message required");
    action = { kind: "notify", message };
  } else {
    const prompt = (opts.prompt || template.prompt || "").trim();
    if (!prompt) throw new Error("agentTurn prompt required");
    action = { kind: "agentTurn", prompt };
  }

  return {
    id: `scene:${template.id}:${Date.now().toString(36)}`,
    name: name.slice(0, 120),
    enabled: true,
    when,
    action,
    presenceAware: template.presenceAware === true,
    templateId: template.id,
  };
}

/** @param {string | undefined} id */
export function isSceneStandingOrderId(id) {
  return typeof id === "string" && id.startsWith("scene:");
}
