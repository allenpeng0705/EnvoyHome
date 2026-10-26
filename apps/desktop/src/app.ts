import type { MemoryScreenData, SettingsViewId } from "./lib/rpc-types.js";
import { MemoryKnowledgeView } from "./views/memory.js";
import { SmarthomeView } from "./views/smarthome.js";

export const NAV_VIEWS: SettingsViewId[] = [
  "accounts",
  "channels",
  "providers",
  "approvals",
  "memory",
  "smarthome",
  "doctor",
  "advanced",
];

export function renderSmarthomeStub(): string {
  return SmarthomeView({ sources: [], note: "Connect MQTT or Home Assistant channels to bind objects" });
}

/** Settings → Memory stub including Knowledge + Embed (Knowledge-RAG §7). */
export function renderMemoryStub(data?: Partial<MemoryScreenData>): string {
  return MemoryKnowledgeView({
    pendingLearnCount: data?.pendingLearnCount ?? 0,
    pendingLearnCap: data?.pendingLearnCap ?? 50,
    knowledgeSectionCount: data?.knowledgeSectionCount ?? 0,
    knowledgeLastReindexAt: data?.knowledgeLastReindexAt ?? null,
    knowledgeInject: data?.knowledgeInject ?? "auto",
    episodicInject: data?.episodicInject ?? "auto",
    embedEnabled: data?.embedEnabled ?? false,
    embedReady: data?.embedReady ?? false,
    embedMode: data?.embedMode ?? "off",
    embedModelId: data?.embedModelId ?? "qwen3-embedding-0.6b-q8_0",
    embedStale: data?.embedStale ?? false,
    note: "Defaults: inject=tool until Owner enables auto; embed off until enableEmbedEngine",
  });
}
