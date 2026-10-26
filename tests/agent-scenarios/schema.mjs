/**
 * Validate agent-scenario catalogue cases (Schedule + General packs).
 * @typedef {"schedule"|"general"} Pack
 * @typedef {"nl"|"tool"|"turn"|"compose"} Mode
 * @typedef {object} ScenarioCase
 * @property {string} id
 * @property {Pack} pack
 * @property {string} prompt
 * @property {Mode} mode
 * @property {boolean} [live] — eligible for scripts/agent-eval-live.mjs
 * @property {string} [locale]
 * @property {"general"|"schedules"|"home"} [purpose]
 * @property {Record<string, unknown>} [clientContext]
 * @property {Record<string, unknown>} [tool] — for mode=tool
 * @property {Array<Record<string, unknown>>} [toolSequence] — sequential tools (composition)
 * @property {Array<{reply: string}>} [rounds] — multi-round model replies (mode=compose)
 * @property {string[]} [allowTools] — compose allow-list
 * @property {Record<string, unknown>} [setup]
 * @property {Record<string, unknown>} [liveAnswer] — auto-answer ask_user in live eval
 * @property {Record<string, unknown>} expect
 */

const PACKS = new Set(["schedule", "general"]);
const MODES = new Set(["nl", "tool", "turn", "compose"]);
const PURPOSES = new Set(["general", "schedules", "home"]);

/**
 * @param {unknown} raw
 * @param {string} from
 * @returns {ScenarioCase}
 */
export function validateScenarioCase(raw, from = "(case)") {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${from}: case must be an object`);
  }
  /** @type {Record<string, unknown>} */
  const c = /** @type {Record<string, unknown>} */ (raw);
  if (typeof c.id !== "string" || !c.id.trim()) throw new Error(`${from}: missing id`);
  if (!PACKS.has(/** @type {string} */ (c.pack))) {
    throw new Error(`${from}: pack must be schedule|general (got ${JSON.stringify(c.pack)})`);
  }
  if (typeof c.prompt !== "string") throw new Error(`${from}: missing prompt string`);
  if (!MODES.has(/** @type {string} */ (c.mode))) {
    throw new Error(`${from}: mode must be nl|tool|turn|compose (got ${JSON.stringify(c.mode)})`);
  }
  if (c.purpose != null && !PURPOSES.has(/** @type {string} */ (c.purpose))) {
    throw new Error(`${from}: purpose must be general|schedules|home`);
  }
  if (c.expect == null || typeof c.expect !== "object" || Array.isArray(c.expect)) {
    throw new Error(`${from}: missing expect object`);
  }
  if (c.live != null && typeof c.live !== "boolean") {
    throw new Error(`${from}: live must be boolean when set`);
  }
  if (c.mode === "compose") {
    if (!Array.isArray(c.rounds) || c.rounds.length < 2) {
      throw new Error(`${from}: compose requires rounds[] with ≥2 model replies`);
    }
    for (let i = 0; i < c.rounds.length; i++) {
      const r = c.rounds[i];
      if (!r || typeof r !== "object" || typeof /** @type {Record<string, unknown>} */ (r).reply !== "string") {
        throw new Error(`${from}: rounds[${i}] needs { reply: string }`);
      }
    }
  }
  if (c.toolSequence != null) {
    if (!Array.isArray(c.toolSequence) || c.toolSequence.length < 2) {
      throw new Error(`${from}: toolSequence must be an array of ≥2 steps`);
    }
  }
  return /** @type {ScenarioCase} */ (c);
}
