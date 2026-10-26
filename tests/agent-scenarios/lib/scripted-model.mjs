/**
 * Minimal scripted ModelAdapter (same idea as packages/daemon/test/parent-agent.test.ts).
 * Used when a turn-level harness test needs ordered model steps.
 */

/**
 * @param {Array<{ text?: string; toolCalls?: unknown[]; stopReason?: string }>} script
 * @returns {{ complete: () => Promise<unknown> }}
 */
export function scriptedModel(script) {
  let i = 0;
  return {
    async complete() {
      const next = script[i++];
      if (!next) throw new Error("FakeModel script exhausted");
      return next;
    },
  };
}
