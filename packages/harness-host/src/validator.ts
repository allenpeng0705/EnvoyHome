// Allow-list IS the contract (conventions R2).

export const ALLOWED_INTENTS = new Set([
  "tool_call",
  "approval",
  "memory_op",
  "workflow_step",
  "final",
] as const);

export type AllowedIntent = typeof ALLOWED_INTENTS extends Set<infer T> ? T : never;

export function validateIntent(intent: string): boolean {
  return ALLOWED_INTENTS.has(intent as AllowedIntent);
}
