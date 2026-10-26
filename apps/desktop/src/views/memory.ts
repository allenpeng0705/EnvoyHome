/** Settings → Memory / Knowledge stub (Knowledge-RAG §7). */

export interface MemoryKnowledgeViewProps {
  pendingLearnCount: number;
  pendingLearnCap: number;
  knowledgeSectionCount: number;
  knowledgeLastReindexAt: string | null;
  knowledgeInject: string;
  episodicInject: string;
  embedEnabled: boolean;
  embedReady: boolean;
  embedMode: string;
  embedModelId: string;
  embedStale: boolean;
  note?: string;
}

/**
 * Minimal Owner-facing summary for Memory + Knowledge + Embed.
 * Full Tauri bindings land with desktop polish; RPCs already exist.
 */
export function MemoryKnowledgeView(props: MemoryKnowledgeViewProps): string {
  const lines = [
    `Memory: ${props.pendingLearnCount}/${props.pendingLearnCap} pending learns`,
    `Knowledge index: ${props.knowledgeSectionCount} sections` +
      (props.knowledgeLastReindexAt
        ? ` (reindexed ${props.knowledgeLastReindexAt})`
        : " (never reindexed)"),
    `Inject policy: knowledge=${props.knowledgeInject}, knowyou=${props.episodicInject}`,
    `Embed (:18793): ${props.embedEnabled ? props.embedMode : "off"}` +
      (props.embedReady ? " ready" : " not-ready") +
      ` model=${props.embedModelId}` +
      (props.embedStale ? " [STALE — reindex]" : ""),
    "UI: Settings → LLM → Memory → Knowledge & embed (download / enable spawn|Ollama / inject policy).",
  ];
  if (props.note) lines.push(props.note);
  return lines.join("\n");
}
