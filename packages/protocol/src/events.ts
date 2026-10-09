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
  "home:learn-proposed": {
    summary: "A PendingLearn was queued",
    data: obj(
      {
        id: str({ minLength: 1 }),
        accountId: str({ minLength: 1 }),
        kind: enumOf(
          "profile_patch",
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
    summary: "Consolidation finished",
    data: obj({ accountId: str({ minLength: 1 }) }, ["accountId"]),
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
