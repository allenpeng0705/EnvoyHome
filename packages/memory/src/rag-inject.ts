// Budgeted KnowYou / Doc KB prompt blocks — Knowledge-RAG Design §3.6 / §4.5 / §6.

import type { EpisodicHit } from "./episodic-index.js";
import type { KnowledgeHit } from "./knowledge-index.js";

export const KNOWLEDGE_INJECT_LABEL =
  "## Knowledge base (derived; non-authoritative vs profile/MEMORY)";

export const EPISODIC_INJECT_LABEL =
  "## Related past context (episodic; non-authoritative vs profile/MEMORY)";

export type RagInjectMode = "off" | "tool" | "auto";

export function buildKnowledgeInjectBlock(
  hits: KnowledgeHit[],
  budgetChars: number,
): { text: string; truncated: boolean; chars: number } {
  if (hits.length === 0 || budgetChars <= 0) {
    return { text: "", truncated: false, chars: 0 };
  }
  const lines = [KNOWLEDGE_INJECT_LABEL, ""];
  let truncated = false;
  for (const h of hits) {
    const cite = h.heading
      ? `- \`${h.path}\` (§ ${h.heading}): ${h.snippet.slice(0, 280)}`
      : `- \`${h.path}\`: ${h.snippet.slice(0, 280)}`;
    const next = [...lines, cite].join("\n");
    if (next.length > budgetChars) {
      truncated = true;
      break;
    }
    lines.push(cite);
  }
  const text = lines.join("\n");
  return { text, truncated, chars: text.length };
}

export function buildEpisodicInjectBlock(
  hits: EpisodicHit[],
  budgetChars: number,
): { text: string; truncated: boolean; chars: number } {
  if (hits.length === 0 || budgetChars <= 0) {
    return { text: "", truncated: false, chars: 0 };
  }
  const lines = [EPISODIC_INJECT_LABEL, ""];
  let truncated = false;
  for (const h of hits) {
    const label = h.key ? `[${h.key}] ` : "";
    const cite = `- ${label}${h.text.slice(0, 280)}`;
    const next = [...lines, cite].join("\n");
    if (next.length > budgetChars) {
      truncated = true;
      break;
    }
    lines.push(cite);
  }
  const text = lines.join("\n");
  return { text, truncated, chars: text.length };
}

/** Append RAG blocks under standing inject (caller applies authority order). */
export function appendRagToStanding(
  standing: string,
  knowledgeBlock: string,
  episodicBlock: string,
): string {
  const parts = [standing.trim()];
  if (episodicBlock.trim()) parts.push(episodicBlock.trim());
  if (knowledgeBlock.trim()) parts.push(knowledgeBlock.trim());
  return parts.filter(Boolean).join("\n\n");
}
