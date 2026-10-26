/**
 * Build an envoyhome-tools fence from tool call objects.
 * @param {Array<{ tool: string; args?: Record<string, unknown> }>} calls
 */
export function toolsFence(calls) {
  return [
    "```envoyhome-tools",
    JSON.stringify(calls.map((c) => ({ tool: c.tool, args: c.args ?? {} }))),
    "```",
  ].join("\n");
}

/**
 * Substitute `$skillId` (and other keys) in a reply string.
 * @param {string} reply
 * @param {Record<string, string>} vars
 */
export function substituteVars(reply, vars) {
  let out = reply;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`$${k}`).join(v);
  }
  return out;
}
