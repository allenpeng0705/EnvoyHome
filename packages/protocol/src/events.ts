// @envoyhome/protocol — the event catalogue (Design §3.5 + Appendix A.4).
//
// Events are server → client and subscription-gated. `home:turn-finished` is
// emitted **exactly once** per turn, including on cancel and on error, so a
// client must never infer completion from deltas (Design A.4).

import { arr, bool, digest, enumOf, int, iso, nullable, obj, str, any, type JsonSchema } from "./schema.js";

export interface EventSpec {
  readonly data: JsonSchema;
  readonly summary: string;
}

/** Common identity block carried by all three turn events (Design A.4). */
const turnCommon = {
  turnId: str({ minLength: 1 }),
  sessionId: str({ minLength: 1 }),
  accountId: str({ minLength: 1 }),
  agentId: str(),
};

const turnRoute = enumOf("workflow", "harness", "direct");

export const EVENTS: Readonly<Record<string, EventSpec>> = {
  "home:state-changed": {
    summary: "Daemon / mesh / channel summary changed",
    data: obj(
      {
        scope: enumOf("daemon", "mesh", "channel"),
        changedAt: iso(),
        detail: any("scope-specific summary"),
      },
      ["scope"],
      true,
    ),
  },
  "home:turn-started": {
    summary: "A turn began",
    data: obj(
      { ...turnCommon, route: turnRoute, clientTurnId: str(), at: iso() },
      ["turnId", "sessionId", "accountId", "route", "at"],
    ),
  },
  "home:turn-delta": {
    summary: "Streaming turn output (text / tool call / tool result / format / error)",
    data: obj(
      {
        ...turnCommon,
        kind: enumOf("text", "tool_call", "tool_result", "format", "error"),
        text: str(),
        format: enumOf("plain", "markdown", "link"),
        /** Relative path under accounts/<id>/files/ — preferred for thin-client open. */
        artifactPath: str(),
        /** Optional signed HTTP URL when publicBaseUrl is reachable (LAN/tunnel). */
        artifactUrl: str(),
        tool: obj({ name: str({ minLength: 1 }), id: str() }, ["name"]),
      },
      ["turnId", "sessionId", "accountId", "kind"],
    ),
  },
  "home:turn-finished": {
    summary: "Emitted exactly once per turn, including cancel and error",
    data: obj(
      {
        ...turnCommon,
        status: enumOf("ok", "cancelled", "error"),
        error: obj({ code: str(), message: str() }, ["code", "message"]),
        usage: obj({ localTokens: int({ minimum: 0 }), cloudTokens: int({ minimum: 0 }) }, []),
        at: iso(),
      },
      ["turnId", "sessionId", "accountId", "status", "at"],
    ),
  },
  "home:approval-needed": {
    // Kept identical to `home.listApprovals`' row shape (Design A.5): the event is
    // what the human actually sees, so it must carry `summary` and `argsDigest`.
    summary: "An approval is pending; carries the target summary and the args digest",
    data: obj(
      {
        id: str({ minLength: 1 }),
        accountId: str({ minLength: 1 }),
        agentId: str(),
        turnId: str(),
        tool: str({ minLength: 1 }),
        argsDigest: digest(),
        risk: enumOf("read", "write", "exec", "network", "admin", "sensitive"),
        origin: enumOf("attended", "unattended"),
        createdAt: iso(),
        expiresAt: iso(),
        summary: str(),
        objectId: str(),
        desiredState: str(),
        safetyClass: bool(),
        answerableBy: arr(str()),
      },
      [
        "id",
        "accountId",
        "turnId",
        "tool",
        "argsDigest",
        "risk",
        "origin",
        "createdAt",
        "expiresAt",
      ],
    ),
  },
  "home:approval-resolved": {
    summary: "An approval was answered",
    data: obj(
      {
        id: str({ minLength: 1 }),
        accountId: str({ minLength: 1 }),
        decision: enumOf("allow", "deny"),
        scope: enumOf("once", "session", "always"),
        grantId: str(),
      },
      ["id", "accountId", "decision"],
    ),
  },
  "home:choice-needed": {
    summary: "A chat choice card is pending (one / many / text / form; Design V-UX-14 / §9.5g.3)",
    data: obj(
      {
        id: str({ minLength: 1 }),
        accountId: str({ minLength: 1 }),
        sessionId: str({ minLength: 1 }),
        turnId: str(),
        question: str({ minLength: 1 }),
        detail: str(),
        options: arr(
          obj(
            {
              id: str({ minLength: 1 }),
              label: str({ minLength: 1 }),
              destructive: bool(),
            },
            ["id", "label"],
          ),
        ),
        selection: enumOf("one", "many", "text", "form"),
        multiline: bool(),
        purpose: enumOf(
          "ask_user",
          "schedule_candidates",
          "home_disambiguation",
          "general",
          "session_plan",
          "browser_form",
          "outbound_handoff",
        ),
        fields: arr(
          obj(
            {
              id: str({ minLength: 1 }),
              label: str({ minLength: 1 }),
              ref: str({ minLength: 1 }),
              kind: enumOf(
                "text",
                "password",
                "otp",
                "textarea",
                "select",
                "checkbox",
                "file",
              ),
              required: bool(),
              options: arr(
                obj(
                  {
                    value: str({ minLength: 1 }),
                    label: str({ minLength: 1 }),
                  },
                  ["value", "label"],
                ),
              ),
              accept: str({ minLength: 1 }),
              multiple: bool(),
              sensitive: bool(),
            },
            ["id", "label", "ref", "kind", "sensitive"],
          ),
        ),
        snapshotId: str({ minLength: 1 }),
        targetId: str({ minLength: 1 }),
        profile: enumOf("managed", "personal", "remote"),
        submitRef: str({ minLength: 1 }),
        url: str({ minLength: 1 }),
        title: str({ minLength: 1 }),
        openUrl: str({ minLength: 1 }),
        steps: arr(str({ minLength: 1 })),
        createdAt: iso(),
        expiresAt: iso(),
      },
      [
        "id",
        "accountId",
        "sessionId",
        "question",
        "options",
        "selection",
        "purpose",
        "createdAt",
        "expiresAt",
      ],
    ),
  },
  "home:session-plan": {
    summary: "Attended session plan checklist snapshot (Design §19.13 P2-E4)",
    data: obj(
      {
        accountId: str({ minLength: 1 }),
        sessionId: str({ minLength: 1 }),
        planId: str({ minLength: 1 }),
        phase: enumOf("planning", "awaiting_confirm", "executing", "done"),
        entries: arr(
          obj(
            {
              id: str(),
              content: str({ minLength: 1 }),
              status: enumOf("pending", "in_progress", "completed", "cancelled"),
              risk: enumOf("read", "write", "exec", "network", "admin", "sensitive"),
            },
            ["content", "status"],
          ),
        ),
        needsWriteConfirm: bool(),
        confirmedAt: iso(),
        hopCount: int({ minimum: 0 }),
        hopBudget: int({ minimum: 1 }),
        at: iso(),
      },
      [
        "accountId",
        "sessionId",
        "planId",
        "phase",
        "entries",
        "needsWriteConfirm",
        "hopCount",
        "hopBudget",
        "at",
      ],
    ),
  },
  "home:choice-resolved": {
    summary: "A chat choice card was answered or expired",
    data: obj(
      {
        id: str({ minLength: 1 }),
        accountId: str({ minLength: 1 }),
        sessionId: str({ minLength: 1 }),
        status: enumOf("answered", "canceled", "expired"),
        optionIds: arr(str({ minLength: 1 })),
        labels: arr(str()),
        text: str(),
      },
      ["id", "accountId", "sessionId", "status"],
    ),
  },
  "home:learn-proposed": {
    summary: "A PendingLearn was queued",
    data: obj(
      {
        id: str({ minLength: 1 }),
        accountId: str({ minLength: 1 }),
        kind: enumOf(
          "profile_patch",
          "identity_append",
          "memory_append",
          "memory_edit",
          "skill_create",
          "skill_patch",
          "skill_delete",
        ),
      },
      ["id", "accountId", "kind"],
    ),
  },
  "home:learn-rejected-full": {
    // Memory Design §7.2: over-cap proposals are rejected with an event, never
    // silently evicted.
    summary: "A PendingLearn was refused because the queue is full",
    data: obj(
      {
        accountId: str({ minLength: 1 }),
        kind: str({ minLength: 1 }),
        reason: enumOf("queue_full"),
      },
      ["accountId", "kind", "reason"],
    ),
  },
  "home:memory-compacted": {
    summary: "Standing-memory consolidation finished (nightly / Compact now)",
    data: obj({ accountId: str({ minLength: 1 }) }, ["accountId"]),
  },
  "home:session-compacted": {
    summary: "L0 session transcript compacted under context pressure (Memory Design §8)",
    data: obj(
      {
        accountId: str({ minLength: 1 }),
        sessionId: str({ minLength: 1 }),
        turnId: str({ minLength: 1 }),
        reason: str({ minLength: 1 }),
        droppedLines: int({ minimum: 0 }),
      },
      ["accountId", "sessionId"],
    ),
  },
  "home:mesh-status": {
    summary: "Mesh kind / peers changed",
    data: obj(
      {
        mesh: obj(
          {
            kind: enumOf("hosting", "attached", "no-node"),
            peerId: str(),
            multiaddrs: arr(str()),
            scopeKey: str(),
          },
          ["kind"],
        ),
      },
      ["mesh"],
    ),
  },
  "home:route-decided": {
    summary: "Which model provider was chosen for a turn (Design §8.3)",
    data: obj(
      {
        turnId: str({ minLength: 1 }),
        accountId: str({ minLength: 1 }),
        sessionId: str(),
        providerId: str({ minLength: 1 }),
        reason: enumOf(
          "privacy",
          "default",
          "config",
          "auto_switch",
          "mode",
        ),
        placementFilter: enumOf("any", "local", "cloud"),
        autoSwitch: bool(),
        needClass: enumOf("cheap", "standard", "hard"),
      },
      ["turnId", "accountId", "providerId", "reason"],
    ),
  },
  "home:schedule-fired": {
    summary: "A schedule job ran or was skipped (Design §7.4)",
    data: obj(
      {
        jobId: str({ minLength: 1 }),
        accountId: str({ minLength: 1 }),
        status: enumOf("ok", "error", "skipped"),
        deliveryStatus: enumOf("delivered", "not-delivered", "none", "unknown"),
        error: str(),
        reason: str(),
      },
      ["jobId", "accountId", "status"],
    ),
  },
  "home:schedule-proposed": {
    summary: "Unarmed schedule proposal ready for Confirm/Cancel in chat (Design §7.4)",
    data: obj(
      {
        proposalId: str({ minLength: 1 }),
        accountId: str({ minLength: 1 }),
        sessionId: str({ minLength: 1 }),
        resolvedLocal: str({ minLength: 1 }),
        expiresAt: iso(),
        name: str(),
        message: str(),
        kind: enumOf("at", "every", "cron"),
      },
      ["proposalId", "accountId", "resolvedLocal", "expiresAt"],
    ),
  },
  "home:schedule-proposal-closed": {
    summary: "Schedule proposal confirmed, canceled, or expired (Design §7.4)",
    data: obj(
      {
        proposalId: str({ minLength: 1 }),
        accountId: str({ minLength: 1 }),
        sessionId: str({ minLength: 1 }),
        status: enumOf("confirmed", "canceled", "expired"),
        jobId: str({ minLength: 1 }),
      },
      ["proposalId", "accountId", "status"],
    ),
  },
  "home:workflow-step": {
    summary: "A static-workflow node started or finished (Design §7 test-run / demos)",
    data: obj(
      {
        runId: str({ minLength: 1 }),
        workflowId: str({ minLength: 1 }),
        accountId: str({ minLength: 1 }),
        nodeId: str({ minLength: 1 }),
        type: str({ minLength: 1 }),
        phase: enumOf("started", "finished"),
        ok: bool(),
        detail: str(),
        output: str(),
      },
      ["runId", "workflowId", "accountId", "nodeId", "type", "phase"],
    ),
  },
  "home:workflow-finished": {
    summary: "A static-workflow run completed (Design §7)",
    data: obj(
      {
        runId: str({ minLength: 1 }),
        workflowId: str({ minLength: 1 }),
        accountId: str({ minLength: 1 }),
        ok: bool(),
      },
      ["runId", "workflowId", "accountId", "ok"],
    ),
  },
  "home:local-model-download": {
    summary: "Local GGUF download progress / pause / complete (Design §8.5)",
    data: obj(
      {
        fileName: str({ minLength: 1 }),
        url: str(),
        status: enumOf("downloading", "paused", "completed", "failed"),
        bytesReceived: int({ minimum: 0 }),
        bytesTotal: int({ minimum: 0 }),
        modelId: str(),
        path: str(),
        error: str(),
      },
      ["fileName", "status", "bytesReceived"],
    ),
  },
  "home:embed-model-download": {
    summary: "Home embed GGUF download progress / pause / complete (:18793; Knowledge-RAG §5)",
    data: obj(
      {
        fileName: str({ minLength: 1 }),
        url: str(),
        status: enumOf("downloading", "paused", "completed", "failed"),
        bytesReceived: int({ minimum: 0 }),
        bytesTotal: int({ minimum: 0 }),
        modelId: str(),
        path: str(),
        error: str(),
      },
      ["fileName", "status", "bytesReceived"],
    ),
  },
};

/** Every event name, sorted — the subscribable set. */
export function eventNames(): string[] {
  return Object.keys(EVENTS).sort();
}

export function isKnownEvent(event: string): boolean {
  return Object.prototype.hasOwnProperty.call(EVENTS, event);
}

/** Shape used by `home.subscribe` to reject an unknown event name up front. */
export function validateSubscriptions(events: readonly string[]): string[] {
  return events.filter((e) => !isKnownEvent(e));
}

/** Re-exported for the event schemas' benefit. */
export { nullable };
