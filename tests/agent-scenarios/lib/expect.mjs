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
 * @param {{ toolNames?: string[]; assistantText?: string; expect: Record<string, unknown> }} input
 * @returns {{ ok: boolean; reason: string }}
 */
export function softLiveExpect(input) {
  const { expect: exp } = input;
  const tools = input.toolNames ?? [];
  const text = input.assistantText ?? "";
  const wantTools = /** @type {string[]|undefined} */ (exp.liveTools ?? exp.tools);
  const honesty = /** @type {string|string[]|undefined} */ (exp.honestyMatching ?? exp.liveHonesty);
  const requireHonesty = Boolean(exp.requireHonesty || exp.liveRequireHonesty);

  const toolsHit = Boolean(wantTools?.length && wantTools.some((t) => tools.includes(t)));
  const honestyHit = honesty != null && matchesAny(text, honesty);

  // User-journey cases often need the assistant to *return* facts, not only call tools.
  if (requireHonesty) {
    if (!honestyHit) {
      return {
        ok: false,
        reason: `requireHonesty; text=${text.slice(0, 160)}`,
      };
    }
    if (wantTools?.length && !toolsHit) {
      // Honesty alone is enough when tools were optional / inferred poorly from events.
      return { ok: true, reason: "honesty (required)" };
    }
    return {
      ok: true,
      reason: toolsHit
        ? `honesty+tools: ${tools.join(",") || "(none)"}`
        : "honesty (required)",
    };
  }

  if (toolsHit) return { ok: true, reason: `tools: ${tools.join(",") || "(none)"}` };
  if (honestyHit) return { ok: true, reason: "honesty phrase" };
  if (wantTools?.length || honesty != null) {
    return {
      ok: false,
      reason: `need tools∈${JSON.stringify(wantTools ?? [])} or honesty; got tools=${JSON.stringify(tools)} text=${text.slice(0, 120)}`,
    };
  }
  return { ok: true, reason: "no soft expect" };
}
