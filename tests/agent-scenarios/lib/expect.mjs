/**
 * Shared soft/hard expect helpers for deterministic + live runners.
 */

/**
 * @param {string} text
 * @param {string|string[]|undefined} patterns — string as regex source, or list (any match)
 */
export function matchesAny(text, patterns) {
  if (patterns == null) return true;
  const list = Array.isArray(patterns) ? patterns : [patterns];
  if (list.length === 0) return true;
  const hay = String(text ?? "");
  return list.some((p) => new RegExp(p, "i").test(hay));
}

/**
 * @param {string} text
 * @param {string|string[]|undefined} patterns — every pattern must match
 */
export function matchesAll(text, patterns) {
  if (patterns == null) return true;
  const list = Array.isArray(patterns) ? patterns : [patterns];
  if (list.length === 0) return true;
  const hay = String(text ?? "");
  return list.every((p) => new RegExp(p, "i").test(hay));
}

/**
 * @param {Record<string, unknown>} actual
 * @param {Record<string, unknown>} partial
 */
export function objectIncludes(actual, partial) {
  for (const [k, v] of Object.entries(partial)) {
    if (actual[k] !== v) return false;
  }
  return true;
}

/**
 * Soft live assert: pass if toolNames hit expectedTools OR honestyMatching matches text.
 * @param {{
 *   toolNames?: string[];
 *   assistantText?: string;
 *   eventNames?: string[];
 *   expect: Record<string, unknown>;
 * }} input
 * @returns {{ ok: boolean; reason: string }}
 */
export function softLiveExpect(input) {
  const { expect: exp } = input;
  const tools = input.toolNames ?? [];
  const text = input.assistantText ?? "";
  const events = input.eventNames ?? [];
  const wantTools = /** @type {string[]|undefined} */ (exp.liveTools ?? exp.tools);
  const requireLiveTools = /** @type {string[]|undefined} */ (exp.requireLiveTools);
  const forbidTools = /** @type {string[]|undefined} */ (exp.forbidTools);
  const honesty = /** @type {string|string[]|undefined} */ (exp.honestyMatching ?? exp.liveHonesty);
  /** When set, every pattern must appear in the assistant text (stricter result grading). */
  const honestyAll = /** @type {string|string[]|undefined} */ (
    exp.honestyAllMatching ?? exp.liveHonestyAll
  );
  const requireHonesty = Boolean(exp.requireHonesty || exp.liveRequireHonesty);
  const wantSessionPlan = Boolean(exp.liveSessionPlan);

  if (Array.isArray(forbidTools) && forbidTools.length > 0) {
    const hit = forbidTools.filter((t) => tools.includes(t));
    if (hit.length > 0) {
      return { ok: false, reason: `forbidTools hit: ${hit.join(",")}` };
    }
  }

  // Strict: every listed tool must appear (unlike liveTools, which is any-of).
  if (Array.isArray(requireLiveTools) && requireLiveTools.length > 0) {
    const missing = requireLiveTools.filter((t) => !tools.includes(t));
    if (missing.length > 0) {
      return {
        ok: false,
        reason: `requireLiveTools missing: ${missing.join(",")} (got ${tools.join(",") || "none"})`,
      };
    }
  }

  if (wantSessionPlan) {
    const sawPlan = events.includes("home:session-plan");
    if (!sawPlan && !tools.includes("session_plan")) {
      return {
        ok: false,
        reason: "liveSessionPlan: no home:session-plan event and no session_plan tool",
      };
    }
  }

  const toolsHit = Boolean(wantTools?.length && wantTools.some((t) => tools.includes(t)));
  const honestyHit = honesty != null && matchesAny(text, honesty);
  const honestyAllHit = honestyAll != null && matchesAll(text, honestyAll);

  // User-journey cases often need the assistant to *return* facts, not only call tools.
  if (requireHonesty) {
    if (honestyAll != null && !honestyAllHit) {
      return {
        ok: false,
        reason: `honestyAllMatching failed; text=${text.slice(0, 200)}`,
      };
    }
    if (honesty != null && !honestyHit) {
      return {
        ok: false,
        reason: `requireHonesty; text=${text.slice(0, 160)}`,
      };
    }
    if (honesty == null && honestyAll == null) {
      return { ok: false, reason: "requireHonesty with no honesty patterns" };
    }
    if (wantTools?.length && !toolsHit) {
      // Honesty alone is enough when tools were optional / inferred poorly from events.
      return {
        ok: true,
        reason: honestyAll != null ? "honestyAll (required)" : "honesty (required)",
      };
    }
    return {
      ok: true,
      reason: toolsHit
        ? `honesty+tools: ${tools.join(",") || "(none)"}`
        : honestyAll != null
          ? "honestyAll (required)"
          : "honesty (required)",
    };
  }

  if (toolsHit) return { ok: true, reason: `tools: ${tools.join(",") || "(none)"}` };
  if (honestyAll != null && honestyAllHit) return { ok: true, reason: "honestyAll phrase" };
  if (honestyHit) return { ok: true, reason: "honesty phrase" };
  if (wantSessionPlan && (events.includes("home:session-plan") || tools.includes("session_plan"))) {
    return { ok: true, reason: "session-plan event/tool" };
  }
  if (wantTools?.length || honesty != null) {
    return {
      ok: false,
      reason: `need tools∈${JSON.stringify(wantTools ?? [])} or honesty; got tools=${JSON.stringify(tools)} text=${text.slice(0, 120)}`,
    };
  }
  return { ok: true, reason: "no soft expect" };
}
