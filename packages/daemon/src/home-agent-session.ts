/**
 * Design §19.13 P2-E3 — envoy-harness Session over EnvoyHome session transcript.
 */

import {
  appendDiagnostic,
  type ContentBlock,
  type Message,
  type PendingChildSnapshot,
  type PendingInboxSnapshot,
  type Role,
  type Session,
  type SessionDiagnosticEvent,
  type SessionMetadata,
} from "@envoymesh/envoy-harness";
import { appendTranscriptLine } from "@envoyhome/harness-host";

function textFromContent(content: ReadonlyArray<ContentBlock>): string {
  const parts: string[] = [];
  for (const b of content) {
    if (b.type === "text" && b.text.trim()) parts.push(b.text);
  }
  return parts.join("\n").trim();
}

/**
 * Harness Agent injects `systemPrompt` via `session.appendMessage("system", …)`.
 * That must never land in the Home chat transcript (UI would show it above
 * `<think>` / the real reply — desktop; mobile often only saw this line).
 */
export function isHarnessAgentSystemPromptLeak(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    t.includes("You are EnvoyHome, the household agent") ||
    t.includes("Design §19.13 P2-E3") ||
    (t.includes("envoyhome-tools") && t.includes("Available tools:"))
  );
}

export type HomeHistoryLine = {
  role: "user" | "assistant" | "system";
  content: string;
};

/**
 * ACP-style live checklist item (todo_write / plan_update).
 *
 * Derived from the harness contract, not restated: `PlanItem` lives in
 * `plan/index.js` but is not re-exported from the package root, while
 * `Session["getPlanItems"]` is the public handle Home actually consumes — so this
 * alias cannot drift from the pinned revision.
 */
export type HomePlanItem = ReturnType<Session["getPlanItems"]>[number];

export interface HomeAgentSessionOptions {
  id: string;
  sessionDir: string;
  cwd: string;
  /** Prior transcript window (excludes this turn's user message). */
  history?: HomeHistoryLine[];
  turnId?: string;
  /**
   * When true, user appendMessage does not write transcript
   * (TurnService already appended the user line).
   */
  userAlreadyPersisted?: boolean;
  /**
   * When false (default for parent Agent), assistant text is persisted by
   * TurnService from TurnEvents (honesty / schedule offer applied once).
   * Session still seeds from `readTranscript` history.
   */
  persistAssistant?: boolean;
  permissionMode?: SessionMetadata["permissionMode"];
}

/**
 * Session adapter: seeds from Home transcript; optional write-through on append.
 * Tool_call / tool_result blocks stay in-memory only (Home transcript is text roles).
 */
export class HomeAgentSession implements Session {
  readonly id: string;
  readonly metadata: SessionMetadata;
  private readonly sessionDir: string;
  private readonly turnId: string | undefined;
  private userAlreadyPersisted: boolean;
  private readonly persistAssistant: boolean;
  private _messages: Message[] = [];
  /** Live ACP checklist (todo_write). Kept off `metadata` so a Home turn's header stays text-only. */
  private _planItems: readonly HomePlanItem[] = [];

  constructor(opts: HomeAgentSessionOptions) {
    this.id = opts.id;
    this.sessionDir = opts.sessionDir;
    this.turnId = opts.turnId;
    this.userAlreadyPersisted = opts.userAlreadyPersisted === true;
    this.persistAssistant = opts.persistAssistant === true;
    this.metadata = {
      cwd: opts.cwd,
      permissionMode: opts.permissionMode ?? "workspace-write",
      startedAt: new Date().toISOString(),
    };
    for (const h of opts.history ?? []) {
      if (!h.content.trim()) continue;
      this._messages.push({
        role: h.role,
        content: [{ type: "text", text: h.content }],
      });
    }
  }

  get messages(): ReadonlyArray<Message> {
    return this._messages;
  }

  appendMessage(role: Role, content: ReadonlyArray<ContentBlock>): number {
    this._messages.push({ role, content: [...content] });
    void this.persistTextLine(role, content);
    return this._messages.length;
  }

  private async persistTextLine(
    role: Role,
    content: ReadonlyArray<ContentBlock>,
  ): Promise<void> {
    if (role === "tool") return;
    // Never persist harness systemPrompt (or any Agent system line) — Home
    // transcript system rows are TurnService errors / status only.
    if (role === "system") return;
    if (role === "user" && this.userAlreadyPersisted) {
      this.userAlreadyPersisted = false;
      return;
    }
    if (role === "assistant" && !this.persistAssistant) return;
    // Assistant with only tool_call blocks — no Home transcript line.
    const text = textFromContent(content);
    if (!text) return;
    const wireRole = role === "assistant" || role === "user" ? role : "assistant";
    try {
      await appendTranscriptLine(this.sessionDir, {
        role: wireRole,
        text,
        at: new Date().toISOString(),
        ...(this.turnId ? { turnId: this.turnId } : {}),
      });
    } catch {
      /* durability best-effort; Agent loop continues */
    }
  }

  lastMessage(): Message | null {
    return this._messages[this._messages.length - 1] ?? null;
  }

  clear(): void {
    this._messages = [];
  }

  replaceMessages(messages: ReadonlyArray<Message>): void {
    this._messages = messages.map((m) => ({ role: m.role, content: [...m.content] }));
  }

  async flush(): Promise<void> {
    /* appendTranscriptLine is awaited per line */
  }

  async close(): Promise<void> {
    await this.flush();
  }

  recordDiagnostic(event: SessionDiagnosticEvent): void {
    appendDiagnostic(this.metadata, event);
  }

  diagnostics(): ReadonlyArray<SessionDiagnosticEvent> {
    return this.metadata.diagnostics ?? [];
  }

  setTitle(title: string): void {
    this.metadata.title = title;
  }

  setPlan(plan: SessionMetadata["plan"]): void {
    if (plan === undefined) {
      delete this.metadata.plan;
    } else {
      this.metadata.plan = plan;
    }
  }

  getPlan(): SessionMetadata["plan"] {
    return this.metadata.plan;
  }

  /** Replace the live ACP checklist (todo_write). Empty clears. */
  setPlanItems(items: readonly HomePlanItem[]): void {
    this._planItems = items.length === 0 ? [] : items.map((item) => ({ ...item }));
  }

  /** Current checklist, or empty when none. */
  getPlanItems(): readonly HomePlanItem[] {
    return this._planItems;
  }

  setCollaborationMode(mode: NonNullable<SessionMetadata["collaborationMode"]>): void {
    this.metadata.collaborationMode = mode;
  }

  getCollaborationMode(): NonNullable<SessionMetadata["collaborationMode"]> {
    return (
      this.metadata.collaborationMode ?? {
        kind: "default",
        updatedAt: this.metadata.startedAt,
      }
    );
  }

  /**
   * Gap 4b — durable pending inbox.
   *
   * A Home turn has no cross-process resume: this session is rebuilt per turn
   * from the Home transcript, so the queues only need to outlive one
   * `Agent.run` (harness `steer` / `followup` / `inject`). Storing them on
   * `metadata` keeps the harness contract honest without pretending to persist
   * a resume that EnvoyHome does not implement.
   */
  setPendingInbox(snapshot: PendingInboxSnapshot | undefined): void {
    if (
      snapshot === undefined ||
      (snapshot.nextTurn.length === 0 && snapshot.nextStep.length === 0)
    ) {
      delete this.metadata.pendingInbox;
      return;
    }
    this.metadata.pendingInbox = {
      nextTurn: snapshot.nextTurn.map((entry) => ({ ...entry })),
      nextStep: snapshot.nextStep.map((entry) => ({ ...entry })),
    };
  }

  getPendingInbox(): PendingInboxSnapshot | undefined {
    return this.metadata.pendingInbox;
  }

  /**
   * Gap 1 — continuable-child snapshot. Home children are turn-scoped
   * (`LocalMeshSubmitter`, depth 1) and are not rehydrated after restart, so
   * this is in-memory bookkeeping only; `recordEvent`/`events` stay unimplemented.
   */
  setPendingChildren(children: ReadonlyArray<PendingChildSnapshot> | undefined): void {
    if (children === undefined || children.length === 0) {
      delete this.metadata.pendingChildren;
      return;
    }
    this.metadata.pendingChildren = children.map((child) => ({ ...child }));
  }

  getPendingChildren(): ReadonlyArray<PendingChildSnapshot> {
    return this.metadata.pendingChildren ?? [];
  }
}
