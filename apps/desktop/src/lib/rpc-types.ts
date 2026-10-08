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
