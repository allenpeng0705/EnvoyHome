// Static harness catalogue (Design §6.3 — v1 built-in + ACP adapters).

export interface HarnessManifest {
  id: string;
  name: string;
  version: string;
  builtin: boolean;
  requiresConfirm: boolean;
}

export const DEFAULT_HARNESS_ID = "envoy-harness";

export const HARNESS_CATALOG: readonly HarnessManifest[] = [
  {
    id: "envoy-harness",
    name: "Envoy Harness",
    version: "1.0.0",
    builtin: true,
    requiresConfirm: false,
  },
  {
    id: "codex-adapter",
    name: "Codex (ACP)",
    version: "1.0.0",
    builtin: false,
    requiresConfirm: true,
  },
] as const;

export interface HarnessSelectionState {
  /** Per account/agent harness id. */
  selections: Record<string, string>;
  /** Non-built-in harness ids explicitly confirmed on this machine. */
  confirmed: string[];
}

export function harnessKey(accountId: string, agentId: string): string {
  return `${accountId}:${agentId || "default"}`;
}

export function resolveHarnessId(
  state: HarnessSelectionState,
  accountId: string,
  agentId: string,
): string {
  const key = harnessKey(accountId, agentId);
  return state.selections[key] ?? DEFAULT_HARNESS_ID;
}

export function canEnableHarness(
  manifest: HarnessManifest,
  state: HarnessSelectionState,
  confirm?: boolean,
): { ok: true } | { ok: false; reason: string } {
  if (manifest.builtin) return { ok: true };
  if (state.confirmed.includes(manifest.id)) return { ok: true };
  if (confirm === true) return { ok: true };
  return { ok: false, reason: "envoyhome.harness_confirm_required: non-built-in harness needs confirm" };
}

export function catalogEntry(id: string): HarnessManifest | undefined {
  return HARNESS_CATALOG.find((h) => h.id === id);
}
