/** Minimal home.* shapes for the Settings shell (B12). */

export interface AccountRow {
  accountId: string;
  displayName: string;
}

export interface PendingLearnRow {
  id: string;
  kind: string;
  status: string;
}

export interface MemoryScreenData {
  pendingLearnCount: number;
  pendingLearnCap: number;
  flushEnabled: boolean;
  reviewEnabled: boolean;
  backendId: string;
  /** Knowledge-RAG — Doc KB / KnowYou / embed (Settings Memory surface). */
  knowledgeSectionCount?: number;
  knowledgeLastReindexAt?: string | null;
  knowledgeInject?: "off" | "tool" | "auto";
  episodicInject?: "off" | "tool" | "auto";
  embedEnabled?: boolean;
  embedReady?: boolean;
  embedMode?: string;
  embedModelId?: string;
  embedStale?: boolean;
}

export type SettingsViewId =
  | "accounts"
  | "channels"
  | "providers"
  | "approvals"
  | "memory"
  | "advanced"
  | "doctor"
  | "smarthome";
