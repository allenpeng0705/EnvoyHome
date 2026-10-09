// @envoyhome/protocol — the `home.*` method catalogue.
//
// One entry per method in Design §3.2 + §3.4 + Appendix A. `test/validate.test.ts`
// re-derives the expected set by parsing the Design doc itself, so a method added
// to the doc without a schema here fails CI (V-PROTO-1) rather than being
// discovered later by an implementer who cannot build it.
//
// Scope (`loopback-owner` / `owner-scope` / `account-scoped`) is Design §4.3.1.
// It lives with the schema so a router cannot accidentally treat an owner-scope
// method as account-scoped: the transport enforces what this table declares.

import {
  any,
  arr,
  bool,
  digest,
  enumOf,
  factValue,
  int,
  iso,
  nullable,
  num,
  obj,
  str,
  type JsonSchema,
} from "./schema.js";

export type MethodScope = "loopback-owner" | "owner-scope" | "account-scoped";

export type MethodGroup =
  | "bootstrap"
  | "pairing"
  | "accounts"
  | "objects"
  | "chat"
  | "approvals"
  | "channels"
  | "workflows"
  | "schedules"
  | "skills"
  | "artifacts"
  | "memory"
  | "doctor";

export interface MethodSpec {
  readonly group: MethodGroup;
  readonly scope: MethodScope;
  /** `params` omitted entirely is legal for these (Design A conventions). */
  readonly paramsOptional: boolean;
  readonly params: JsonSchema;
  readonly result: JsonSchema;
  /** One line for `home.hello.methods[]` consumers and generated docs. */
  readonly summary: string;
}

/* --------------------------------------------------------------- shared shapes */

const emptyParams = obj({});

const sessionTail = obj(
  { sessionId: str({ minLength: 1 }), title: str(), updatedAt: iso() },
  ["sessionId", "updatedAt"],
);

const account = obj(
  { accountId: str({ minLength: 1 }), displayName: str({ minLength: 1 }), createdAt: iso() },
  ["accountId", "displayName", "createdAt"],
);

/** Design §4.3.2 tier names — shared by approvals, grants and actuations. */
const riskTier = enumOf("read", "write", "exec", "network", "admin", "sensitive");

/** Design §4.3.3. Derived by the daemon; never asserted by a client. */
const turnOrigin = enumOf("attended", "unattended");

/** Design §5.7.3 — the closed object-class enum. Drives the safety class. */
const objectClass = enumOf(
  "lock",
  "garage",
  "gate",
  "valve",
  "alarm",
  "camera",
  "presence",
  "light",
  "switch",
  "sensor",
  "climate",
  "other",
);

/** Design §5.7.3 — presence-revealing classes, which may not be shared. */
export const PRESENCE_REVEALING_CLASSES = ["lock", "alarm", "camera", "presence"] as const;

const sourceRecord = obj(
  {
    channel: str({ minLength: 1 }),
    channelAccount: str({ minLength: 1 }),
    sourceId: str({ minLength: 1 }),
    displayName: str(),
    class: objectClass,
    accountId: nullable(str({ minLength: 1 })),
    bound: bool(),
    shared: bool(),
    neverUnattended: bool(),
    actuationAllowList: arr(str()),
    indirectionAllowList: arr(str()),
    firstSeen: iso(),
    lastSeen: iso(),
  },
  [
    "channel",
    "channelAccount",
    "sourceId",
    "displayName",
    "class",
    "accountId",
    "bound",
    "shared",
    "neverUnattended",
    "actuationAllowList",
    "indirectionAllowList",
    "firstSeen",
    "lastSeen",
  ],
);

const meshInfo = obj(
  {
    kind: enumOf("hosting", "attached", "no-node"),
    peerId: str(),
    multiaddrs: arr(str()),
    scopeKey: str(),
  },
  ["kind"],
);

const approval = obj(
  {
    id: str({ minLength: 1 }),
    accountId: str({ minLength: 1 }),
    agentId: str(),
    turnId: str(),
    tool: str({ minLength: 1 }),
    argsDigest: digest(),
    risk: riskTier,
    origin: turnOrigin,
    createdAt: iso(),
    expiresAt: iso(),
    // REQUIRED for admin/sensitive risk (Design A.5) — enforced in
    // assertApprovalSummary, not by the schema, because the requirement is
    // conditional on `risk`.
    summary: str(),
    objectId: str(),
    desiredState: str(),
    safetyClass: bool(),
    answerableBy: arr(str()),
  },
  [
    "id",
    "accountId",
    "agentId",
    "turnId",
    "tool",
    "argsDigest",
    "risk",
    "origin",
    "createdAt",
    "expiresAt",
  ],
);

const grant = obj(
  {
    id: str({ minLength: 1 }),
    accountId: str({ minLength: 1 }),
    tool: str({ minLength: 1 }),
    argsDigest: digest(),
    isFullDigest: bool(),
    objectId: str(),
    desiredState: str(),
    risk: riskTier,
    grantedBy: str(),
    createdAt: iso(),
    expiresAt: nullable(iso()),
  },
  ["id", "accountId", "tool", "argsDigest", "isFullDigest", "risk", "grantedBy", "createdAt", "expiresAt"],
);

const actuation = obj(
  {
    actuationId: str({ minLength: 1 }),
    accountId: str({ minLength: 1 }),
    turnId: str(),
    objectId: str({ minLength: 1 }),
    desiredState: str(),
    risk: riskTier,
    origin: turnOrigin,
    grantId: str(),
    dispatchedAt: iso(),
    outcome: enumOf("pending", "confirmed", "unconfirmed", "failed"),
    stateChanged: enumOf(true, false, "unknown"),
    error: str(),
  },
  ["actuationId", "accountId", "objectId", "desiredState", "risk", "origin", "dispatchedAt", "outcome", "stateChanged"],
);

const profileFact = obj(
  { value: factValue(), updatedAt: iso(), source: str({ minLength: 1 }), trust: enumOf("owner", "agent", "untrusted") },
  ["value", "updatedAt", "source", "trust"],
);

const profile = obj(
  { version: int({ minimum: 1 }), updatedAt: iso(), facts: obj({}, [], profileFact) },
  ["version", "updatedAt", "facts"],
);

const memoryNote = obj(
  {
    path: str({ minLength: 1 }),
    rawChars: int({ minimum: 0 }),
    injectChars: int({ minimum: 0 }),
    truncated: bool(),
    injectBudget: int({ minimum: 0 }),
    rawSoftCap: int({ minimum: 0 }),
    sectionsOmitted: arr(str()),
  },
  ["path", "rawChars", "injectChars", "truncated", "injectBudget", "rawSoftCap", "sectionsOmitted"],
);

const pendingLearnKind = enumOf(
  "profile_patch",
  "memory_append",
  "memory_edit",
  "skill_create",
  "skill_patch",
  "skill_delete",
);

const pendingLearn = obj(
  {
    id: str({ minLength: 1 }),
    accountId: str({ minLength: 1 }),
    kind: pendingLearnKind,
    diff: obj({ summary: str(), patch: str() }, ["summary"]),
    sourceTurnId: str(),
    createdAt: iso(),
    // The re-review surface (Memory Design §7.2, §12). Without these a stale
    // proposal cannot be shown, let alone re-reviewed, and V-MEM-19 is untestable.
    expiresAt: iso(),
    trust: enumOf("owner", "agent", "untrusted"),
    baseDigest: digest(),
    diffKey: digest(),
    stale: bool(),
  },
  ["id", "accountId", "kind", "diff", "createdAt", "expiresAt", "trust", "baseDigest", "diffKey", "stale"],
);

const channelSummary = obj(
  {
    id: str({ minLength: 1 }),
    kind: str(),
    channelKind: enumOf("chat", "event-source"),
    enabled: bool(),
    status: str(),
    sourceCount: int({ minimum: 0 }),
    unboundSources: arr(str()),
  },
  ["id", "kind", "channelKind", "enabled", "status"],
);

const providerKind = enumOf(
  "local_llama_cpp",
  "local_openai_compat",
  "cloud_openai_compat",
  "cloud_anthropic_compat",
);

const placementFilter = enumOf("any", "local", "cloud");

const providerCost = obj(
  {
    inputPerMTok: num(),
    outputPerMTok: num(),
    currency: str(),
  },
  [],
);

const providerSummary = obj(
  {
    id: str({ minLength: 1 }),
    kind: providerKind,
    healthy: bool(),
    baseUrl: str(),
    model: str(),
    enabled: bool(),
    hasSecret: bool(),
    label: str(),
    placement: enumOf("local", "cloud"),
    cost: providerCost,
    costRank: num(),
    paramCountB: num(),
    capabilityRank: num(),
    contextTokens: int({ minimum: 0 }),
    supportsTools: bool(),
    supportsVision: bool(),
    supportsLogprobs: bool(),
    latencyClass: enumOf("fast", "standard", "slow"),
  },
  ["id", "kind", "healthy", "enabled"],
);

const modelMode = enumOf("local", "cloud", "mix");

const turnRoute = enumOf("workflow", "harness", "direct");

/* ------------------------------------------------------------------- catalogue */

export const METHODS: Readonly<Record<string, MethodSpec>> = {
  /* A.1 bootstrap ---------------------------------------------------------- */
  "home.hello": {
    group: "bootstrap",
    scope: "account-scoped",
    paramsOptional: true,
    summary: "Negotiate product, version, methods[], mesh status",
    params: obj({
      client: obj(
        {
          name: str({ minLength: 1 }),
          version: str({ minLength: 1 }),
          platform: str(),
          id: str(),
        },
        ["name", "version"],
      ),
    }),
    result: obj(
      {
        product: str({ minLength: 1 }),
        version: str({ minLength: 1 }),
        protocolApiVersion: int({ minimum: 1 }),
        instanceId: str({ minLength: 1 }),
        home: obj({ label: str(), stateDir: str() }, ["label", "stateDir"]),
        startedAt: iso(),
        methods: arr(str()),
        mesh: meshInfo,
        notes: arr(str()),
        // Additive: bound accounts for the authenticated caller (phone thin client).
        accountIds: arr(str()),
        deviceId: str(),
      },
      [
        "product",
        "version",
        "protocolApiVersion",
        "instanceId",
        "home",
        "startedAt",
        "methods",
        "mesh",
        "notes",
      ],
    ),
  },
  "home.health": {
    group: "bootstrap",
    scope: "account-scoped",
    paramsOptional: true,
    summary: "Liveness: uptime, connections, active turns",
    params: emptyParams,
    result: obj(
      {
        ok: bool(),
        uptimeSec: int({ minimum: 0 }),
        connections: int({ minimum: 0 }),
        activeTurns: int({ minimum: 0 }),
        wsPort: int({ minimum: 0 }),
        httpPort: int({ minimum: 0 }),
        publicBaseUrl: str(),
      },
      ["ok", "uptimeSec", "connections", "activeTurns"],
    ),
  },
  "home.subscribe": {
    group: "bootstrap",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Subscribe to product events (after authentication)",
    params: obj({ events: arr(str({ minLength: 1 }), { minItems: 1 }) }, ["events"]),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.meshStatus": {
    group: "bootstrap",
    scope: "account-scoped",
    paramsOptional: true,
    summary: "Mesh kind, peers, multiaddrs",
    params: emptyParams,
    result: obj({ mesh: meshInfo }, ["mesh"]),
  },
  "home.shutdown": {
    group: "bootstrap",
    scope: "loopback-owner",
    paramsOptional: true,
    summary: "Graceful stop; cancels turns and denies pending approvals",
    params: obj({ reason: str(), graceSec: int({ minimum: 0 }) }),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.getDaemonLog": {
    group: "bootstrap",
    scope: "loopback-owner",
    paramsOptional: true,
    summary: "Tail the daemon log (object state excluded at default verbosity)",
    params: obj({ tailLines: int({ minimum: 1, maximum: 10000 }), level: enumOf("info", "warn", "error") }),
    result: obj(
      {
        lines: arr(
          obj({ at: iso(), level: str({ minLength: 1 }), message: str() }, ["at", "level", "message"]),
        ),
      },
      ["lines"],
    ),
  },
  "home.getServiceStatus": {
    group: "bootstrap",
    scope: "loopback-owner",
    paramsOptional: true,
    summary: "OS service install/run state",
    params: emptyParams,
    result: obj(
      {
        installed: bool(),
        running: bool(),
        manager: enumOf("launchd", "systemd", "none"),
        execPath: str(),
        lastError: str(),
      },
      ["installed", "running", "manager"],
    ),
  },
  "home.installService": {
    group: "bootstrap",
    scope: "loopback-owner",
    paramsOptional: true,
    summary: "Register the daemon as an OS service",
    params: obj({ manager: str() }),
    result: obj({ ok: bool(), unitPath: str() }, ["ok", "unitPath"]),
  },
  "home.uninstallService": {
    group: "bootstrap",
    scope: "loopback-owner",
    paramsOptional: false,
    summary: "Remove the OS service registration",
    params: obj({ confirm: bool() }, ["confirm"]),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.restartService": {
    group: "bootstrap",
    scope: "loopback-owner",
    paramsOptional: true,
    summary: "Restart via the OS manager; denies pending approvals first",
    params: obj({ graceSec: int({ minimum: 0 }) }),
    result: obj({ ok: bool(), restartedAt: iso() }, ["ok", "restartedAt"]),
  },

  /* A.2 pairing ------------------------------------------------------------ */
  "home.mintPairing": {
    group: "pairing",
    scope: "loopback-owner",
    paramsOptional: false,
    summary: "Mint a pairing URI + device (loopback only, rate-limited)",
    params: obj(
      {
        deviceLabel: str({ minLength: 1 }),
        host: str({ minLength: 1 }),
        lanHost: str({ minLength: 1 }),
        accountIds: arr(str({ minLength: 1 })),
        token: str(),
        fresh: bool(),
      },
      ["deviceLabel", "host", "lanHost"],
    ),
    result: obj(
      {
        uri: str({ pattern: "^envoy://pair\\?" }),
        device: obj(
          {
            deviceId: str({ minLength: 1 }),
            label: str(),
            createdAt: iso(),
            accountIds: arr(str()),
          },
          ["deviceId", "label", "createdAt", "accountIds"],
        ),
      },
      ["uri", "device"],
    ),
  },
  "home.listPairedDevices": {
    group: "pairing",
    scope: "owner-scope",
    paramsOptional: true,
    summary: "List paired devices",
    params: emptyParams,
    result: obj(
      {
        devices: arr(
          obj(
            {
              deviceId: str({ minLength: 1 }),
              label: str(),
              createdAt: iso(),
              lastSeenAt: iso(),
              revoked: bool(),
              accountIds: arr(str()),
              ownerTrusted: bool(),
            },
            ["deviceId", "label", "createdAt", "revoked", "accountIds"],
          ),
        ),
      },
      ["devices"],
    ),
  },
  "home.revokePairedDevice": {
    group: "pairing",
    scope: "loopback-owner",
    paramsOptional: false,
    summary: "Revoke a device credential (drops live sessions)",
    params: obj({ deviceId: str({ minLength: 1 }) }, ["deviceId"]),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.forgetPairedDevice": {
    group: "pairing",
    scope: "loopback-owner",
    paramsOptional: false,
    summary: "Forget a device record without keeping an audit row",
    params: obj({ deviceId: str({ minLength: 1 }) }, ["deviceId"]),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.setDeviceAccounts": {
    group: "pairing",
    scope: "loopback-owner",
    paramsOptional: false,
    summary: "Rebind a paired device to accounts without re-pairing",
    params: obj({ deviceId: str({ minLength: 1 }), accountIds: arr(str({ minLength: 1 })) }, [
      "deviceId",
      "accountIds",
    ]),
    result: obj(
      {
        ok: bool(),
        device: obj(
          { deviceId: str(), accountIds: arr(str()), ownerTrusted: bool() },
          ["deviceId", "accountIds"],
        ),
      },
      ["ok", "device"],
    ),
  },
  "home.registerPushToken": {
    group: "pairing",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Register APNs (iOS) or FCM (Android) alert token for this paired device",
    params: obj(
      {
        platform: enumOf("ios", "android"),
        token: str({ minLength: 1 }),
        tokenType: enumOf("alert"),
        accountId: str({ minLength: 1 }),
      },
      ["platform", "token"],
    ),
    result: obj(
      {
        ok: bool(),
        deviceId: str({ minLength: 1 }),
        platform: enumOf("ios", "android"),
      },
      ["ok", "deviceId", "platform"],
    ),
  },
  "home.unregisterPushToken": {
    group: "pairing",
    scope: "account-scoped",
    paramsOptional: true,
    summary: "Remove the push token for this paired device",
    params: emptyParams,
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.sendTestPush": {
    group: "pairing",
    scope: "loopback-owner",
    paramsOptional: true,
    summary: "Send a test APNs/FCM alert to registered device(s) (operator check)",
    params: obj({
      deviceId: str({ minLength: 1 }),
      title: str(),
      body: str(),
    }),
    result: obj({ ok: bool(), sent: int({ minimum: 0 }) }, ["ok", "sent"]),
  },

  /* A.3 accounts & bindings ------------------------------------------------ */
  "home.createAccount": {
    group: "accounts",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Create an account",
    params: obj(
      { accountId: str({ minLength: 1, pattern: "^[a-z0-9][a-z0-9_-]*$" }), displayName: str({ minLength: 1 }), locale: str() },
      ["displayName"],
    ),
    result: obj({ account }, ["account"]),
  },
  "home.listAccounts": {
    group: "accounts",
    scope: "account-scoped",
    paramsOptional: true,
    summary: "List accounts",
    params: emptyParams,
    result: obj({ accounts: arr(account) }, ["accounts"]),
  },
  "home.updateAccount": {
    group: "accounts",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Update display name / locale / tool-policy preset",
    params: obj(
      { accountId: str({ minLength: 1 }), displayName: str(), locale: str(), toolPolicy: enumOf("standard", "restricted") },
      ["accountId"],
    ),
    result: obj({ account }, ["account"]),
  },
  "home.deleteAccount": {
    group: "accounts",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Delete an account (fails closed on active sessions unless forced)",
    params: obj(
      { accountId: str({ minLength: 1 }), confirm: bool(), force: bool() },
      ["accountId", "confirm"],
    ),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.setBinding": {
    group: "accounts",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Bind a sender or a paired device to an account",
    params: {
      oneOf: [
        obj(
          {
            channel: str({ minLength: 1 }),
            channelAccount: str({ minLength: 1 }),
            senderId: str({ minLength: 1 }),
            accountId: str({ minLength: 1 }),
            agentId: str(),
            machine: bool(),
            trustedChannel: bool(),
          },
          ["channel", "channelAccount", "senderId", "accountId"],
        ),
        obj(
          {
            deviceId: str({ minLength: 1 }),
            accountId: str({ minLength: 1 }),
            agentId: str(),
            ownerTrusted: bool(),
          },
          ["deviceId", "accountId"],
        ),
      ],
    },
    result: obj({ bindingId: str({ minLength: 1 }), binding: any("updated binding record") }, [
      "bindingId",
      "binding",
    ]),
  },
  "home.listBindings": {
    group: "accounts",
    scope: "owner-scope",
    paramsOptional: true,
    summary: "List bindings (echoes the binding flags)",
    params: obj({ accountId: str(), deviceId: str() }),
    result: obj({ bindings: arr(any("binding record")) }, ["bindings"]),
  },
  "home.removeBinding": {
    group: "accounts",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Remove a binding",
    params: obj({ bindingId: str({ minLength: 1 }) }, ["bindingId"]),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.listSources": {
    group: "objects",
    scope: "account-scoped",
    paramsOptional: true,
    summary: "List smart-home objects (owner: all; account: own + shared)",
    params: obj({ accountId: str(), channel: str(), bound: bool() }),
    result: obj({ sources: arr(sourceRecord), unboundCapped: bool() }, ["sources"]),
  },
  "home.setSourceBinding": {
    group: "objects",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Bind an object / change its class, sharing and safety flags",
    params: obj(
      {
        channel: str({ minLength: 1 }),
        channelAccount: str({ minLength: 1 }),
        sourceId: str({ minLength: 1 }),
        accountId: nullable(str({ minLength: 1 })),
        class: objectClass,
        shared: bool(),
        neverUnattended: bool(),
        actuationAllowList: arr(str()),
        indirectionAllowList: arr(str()),
        displayName: str(),
      },
      ["channel", "channelAccount", "sourceId", "accountId"],
    ),
    result: obj({ source: sourceRecord }, ["source"]),
  },
  "home.removeSourceBinding": {
    group: "objects",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Unbind an object and drop grants scoped to it",
    params: obj(
      { channel: str({ minLength: 1 }), channelAccount: str({ minLength: 1 }), sourceId: str({ minLength: 1 }) },
      ["channel", "channelAccount", "sourceId"],
    ),
    result: obj({ ok: bool() }, ["ok"]),
  },

  /* A.4 chat / turns ------------------------------------------------------- */
  "home.openSession": {
    group: "chat",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Open a chat session",
    params: obj(
      { accountId: str({ minLength: 1 }), agentId: str(), title: str(), channel: str() },
      ["accountId"],
    ),
    result: obj(
      {
        sessionId: str({ minLength: 1 }),
        accountId: str({ minLength: 1 }),
        agentId: str(),
        createdAt: iso(),
      },
      ["sessionId", "accountId", "agentId", "createdAt"],
    ),
  },
  "home.sendMessage": {
    group: "chat",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Send a turn (streams via turn events)",
    params: obj(
      {
        accountId: str({ minLength: 1 }),
        sessionId: str({ minLength: 1 }),
        text: str(),
        media: arr(
          obj({ kind: enumOf("image", "audio", "video", "file"), uri: str({ minLength: 1 }) }, [
            "kind",
            "uri",
          ]),
        ),
        clientTurnId: str(),
      },
      ["accountId", "sessionId", "text"],
    ),
    result: obj(
      {
        turnId: str({ minLength: 1 }),
        sessionId: str({ minLength: 1 }),
        status: enumOf("started"),
        route: turnRoute,
      },
      ["turnId", "sessionId", "status", "route"],
    ),
  },
  "home.cancelTurn": {
    group: "chat",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Cancel an in-flight turn",
    params: obj({ turnId: str({ minLength: 1 }) }, ["turnId"]),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.getTranscript": {
    group: "chat",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Read a session transcript (tainted spans excluded by default)",
    params: obj(
      { sessionId: str({ minLength: 1 }), limit: int({ minimum: 1, maximum: 500 }), before: str() },
      ["sessionId"],
    ),
    result: obj(
      { messages: arr(any("session message")), nextCursor: str() },
      ["messages"],
    ),
  },
  "home.listSessions": {
    group: "chat",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "List sessions for an account",
    params: obj({ accountId: str({ minLength: 1 }) }, ["accountId"]),
    result: obj({ sessions: arr(sessionTail) }, ["sessions"]),
  },

  /* A.5 approvals & grants ------------------------------------------------- */
  "home.listApprovals": {
    group: "approvals",
    scope: "account-scoped",
    paramsOptional: true,
    summary: "List approvals (pending carries summary + argsDigest)",
    params: obj({ accountId: str(), status: enumOf("pending", "allowed", "denied", "expired") }),
    result: obj({ approvals: arr(approval) }, ["approvals"]),
  },
  "home.answerApproval": {
    group: "approvals",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Answer an approval; must echo the argsDigest shown",
    params: obj(
      {
        id: str({ minLength: 1 }),
        decision: enumOf("allow", "deny"),
        scope: enumOf("once", "session", "always"),
        argsDigest: digest(),
      },
      ["id", "decision", "argsDigest"],
    ),
    result: obj({ ok: bool(), grantId: str() }, ["ok"]),
  },
  "home.listGrants": {
    group: "approvals",
    scope: "owner-scope",
    paramsOptional: true,
    summary: "List durable auto-approve grants",
    params: obj({ accountId: str() }),
    result: obj({ grants: arr(grant) }, ["grants"]),
  },
  "home.revokeGrant": {
    group: "approvals",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Revoke a grant",
    params: obj({ id: str({ minLength: 1 }) }, ["id"]),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.listActuations": {
    group: "approvals",
    scope: "owner-scope",
    paramsOptional: true,
    summary: "Read the actuation journal (§5.7.7)",
    params: obj({
      accountId: str(),
      objectId: str(),
      since: iso(),
      limit: int({ minimum: 1, maximum: 500 }),
    }),
    result: obj({ actuations: arr(actuation) }, ["actuations"]),
  },

  /* A.6 channels, harness, models ------------------------------------------ */
  "home.listChannels": {
    group: "channels",
    scope: "account-scoped",
    paramsOptional: true,
    summary: "List channel plugins",
    params: emptyParams,
    result: obj({ channels: arr(channelSummary) }, ["channels"]),
  },
  "home.enableChannel": {
    group: "channels",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Enable a channel plugin",
    params: obj({ id: str({ minLength: 1 }) }, ["id"]),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.disableChannel": {
    group: "channels",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Disable a channel plugin",
    params: obj({ id: str({ minLength: 1 }) }, ["id"]),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.getChannelStatus": {
    group: "channels",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Channel health; unboundSources scoped to the caller",
    params: obj({ id: str({ minLength: 1 }), all: bool() }),
    result: obj(
      {
        id: str({ minLength: 1 }),
        enabled: bool(),
        healthy: bool(),
        detail: str(),
        sourceCount: int({ minimum: 0 }),
        unboundSources: arr(str()),
      },
      ["id", "enabled", "healthy"],
    ),
  },
  "home.setChannelConfig": {
    group: "channels",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Write a channel's non-secret config and/or write-only secrets",
    params: obj(
      {
        id: str({ minLength: 1 }),
        config: obj({}, [], true),
        secrets: obj({}, [], str()),
      },
      ["id"],
    ),
    result: obj(
      { channel: obj({ id: str(), enabled: bool(), healthy: bool() }, ["id", "enabled", "healthy"]) },
      ["channel"],
    ),
  },
  "home.listHarnesses": {
    group: "channels",
    scope: "account-scoped",
    paramsOptional: true,
    summary: "List harness plugins and the default",
    params: emptyParams,
    result: obj(
      {
        harnesses: arr(obj({ id: str(), name: str(), version: str() }, ["id", "name", "version"])),
        defaultId: str({ minLength: 1 }),
      },
      ["harnesses", "defaultId"],
    ),
  },
  "home.setHarness": {
    group: "channels",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Select a harness per account/agent",
    params: obj(
      {
        accountId: str(),
        agentId: str(),
        harnessId: str({ minLength: 1 }),
        confirm: bool(),
      },
      ["harnessId"],
    ),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.listProviders": {
    group: "channels",
    scope: "account-scoped",
    paramsOptional: true,
    summary: "List model providers, default, placement filter, and auto-switch",
    params: emptyParams,
    result: obj(
      {
        providers: arr(providerSummary),
        mode: modelMode,
        defaultProviderId: str(),
        placementFilter: placementFilter,
        autoModelSwitch: obj({ enabled: bool() }, ["enabled"]),
      },
      ["providers", "mode", "placementFilter", "autoModelSwitch"],
    ),
  },
  "home.setProvider": {
    group: "channels",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Add/update a provider (secrets refused here)",
    params: obj(
      {
        id: str({ minLength: 1 }),
        kind: providerKind,
        baseUrl: str(),
        model: str(),
        enabled: bool(),
        label: str(),
        placement: enumOf("local", "cloud"),
        cost: providerCost,
        costRank: num(),
        paramCountB: num(),
        capabilityRank: num(),
        contextTokens: int({ minimum: 0 }),
        supportsTools: bool(),
        supportsVision: bool(),
        supportsLogprobs: bool(),
        latencyClass: enumOf("fast", "standard", "slow"),
      },
      ["id", "kind"],
    ),
    result: obj(
      {
        provider: obj(
          { id: str(), kind: str(), healthy: bool() },
          ["id", "kind", "healthy"],
        ),
      },
      ["provider"],
    ),
  },
  "home.removeProvider": {
    group: "channels",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Remove a provider",
    params: obj({ id: str({ minLength: 1 }) }, ["id"]),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.setProviderSecret": {
    group: "channels",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Write a provider secret (write-only, never echoed)",
    params: obj(
      { id: str({ minLength: 1 }), field: str({ minLength: 1 }), value: str() },
      ["id", "value"],
    ),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.testProvider": {
    group: "channels",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Run a tiny completion against a configured provider (secrets never echoed)",
    params: obj({ id: str({ minLength: 1 }) }, ["id"]),
    result: obj(
      { ok: bool(), latencyMs: int({ minimum: 0 }), error: str(), model: str() },
      ["ok"],
    ),
  },
  "home.setModelMode": {
    group: "channels",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Compat: set placement filter via local/cloud/mix (auto-switch stays off)",
    params: obj({ mode: modelMode, accountId: str() }, ["mode"]),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.setDefaultProvider": {
    group: "channels",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Set the account default model provider",
    params: obj(
      { accountId: str(), providerId: str({ minLength: 1 }) },
      ["providerId"],
    ),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.setPlacementFilter": {
    group: "channels",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Restrict the provider pool to any / local / cloud",
    params: obj(
      { accountId: str(), filter: placementFilter },
      ["filter"],
    ),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.setAutoModelSwitch": {
    group: "channels",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Enable or disable smart multi-model switching (default off)",
    params: obj(
      { accountId: str(), enabled: bool() },
      ["enabled"],
    ),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.getLocalEngineStatus": {
    group: "channels",
    scope: "owner-scope",
    paramsOptional: true,
    summary: "EnvoyHome Local / Ollama engine status (Design §8.5)",
    params: obj({}),
    result: obj(
      {
        enabled: bool(),
        mode: enumOf("off", "attach", "spawn", "ollama"),
        baseUrl: str(),
        providerId: str(),
        healthy: bool(),
        modelIds: arr(str()),
        meshAttachAvailable: bool(),
        runtimeInstalled: bool(),
        modelsOnDisk: arr(str()),
        pid: int({ minimum: 0 }),
        hint: str(),
        error: str(),
      },
      [
        "enabled",
        "mode",
        "baseUrl",
        "providerId",
        "healthy",
        "modelIds",
        "meshAttachAvailable",
        "runtimeInstalled",
        "modelsOnDisk",
      ],
    ),
  },
  "home.enableLocalEngine": {
    group: "channels",
    scope: "owner-scope",
    paramsOptional: true,
    summary:
      "Enable EnvoyHome Local: attach Mesh Envoy Local (:18790) or spawn llama-server (:18792)",
    params: obj({
      accountId: str(),
      prefer: enumOf("auto", "attach", "spawn"),
      modelPath: str(),
      binaryPath: str(),
      modelAlias: str(),
      downloadRuntime: bool(),
    }),
    result: obj(
      {
        enabled: bool(),
        mode: enumOf("off", "attach", "spawn", "ollama"),
        healthy: bool(),
        baseUrl: str(),
      },
      ["enabled", "mode", "healthy", "baseUrl"],
    ),
  },
  "home.enableOllama": {
    group: "channels",
    scope: "owner-scope",
    paramsOptional: true,
    summary: "Use a running Ollama server as the local provider (default :11434)",
    params: obj({
      accountId: str(),
      baseUrl: str(),
      model: str(),
    }),
    result: obj(
      {
        enabled: bool(),
        mode: enumOf("off", "attach", "spawn", "ollama"),
        healthy: bool(),
        baseUrl: str(),
      },
      ["enabled", "mode", "healthy", "baseUrl"],
    ),
  },
  "home.disableLocalEngine": {
    group: "channels",
    scope: "owner-scope",
    paramsOptional: true,
    summary: "Stop EnvoyHome-spawned llama-server and clear local-engine enable flag",
    params: obj({}),
    result: obj(
      {
        enabled: bool(),
        mode: enumOf("off", "attach", "spawn", "ollama"),
        healthy: bool(),
      },
      ["enabled", "mode", "healthy"],
    ),
  },
  "home.getUsage": {
    group: "channels",
    scope: "account-scoped",
    paramsOptional: true,
    summary: "Token usage for an account/window",
    params: obj({ accountId: str(), since: iso() }),
    result: obj(
      {
        localTokens: int({ minimum: 0 }),
        cloudTokens: int({ minimum: 0 }),
        turns: int({ minimum: 0 }),
      },
      ["localTokens", "cloudTokens", "turns"],
    ),
  },

  /* A.7 workflows, skills, artifacts, doctor ------------------------------- */
  "home.listWorkflows": {
    group: "workflows",
    scope: "account-scoped",
    paramsOptional: true,
    summary: "List static workflows (global + account overlay)",
    params: emptyParams,
    result: obj(
      {
        workflows: arr(
          obj(
            { id: str(), source: enumOf("global", "account"), accountId: str() },
            ["id", "source"],
          ),
        ),
      },
      ["workflows"],
    ),
  },
  "home.getWorkflow": {
    group: "workflows",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Read a workflow's YAML",
    params: obj({ id: str({ minLength: 1 }), accountId: str() }, ["id"]),
    result: obj({ id: str(), yaml: str() }, ["id", "yaml"]),
  },
  "home.reloadWorkflows": {
    group: "workflows",
    scope: "owner-scope",
    paramsOptional: true,
    summary: "Reload workflow definitions",
    params: emptyParams,
    result: obj({ ok: bool(), count: int({ minimum: 0 }) }, ["ok", "count"]),
  },
  "home.listSchedules": {
    group: "schedules",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "List schedule jobs for an account (Design §7.4)",
    params: obj({ accountId: str({ minLength: 1 }) }, ["accountId"]),
    result: obj(
      {
        jobs: arr(
          obj(
            {
              id: str({ minLength: 1 }),
              name: str(),
              enabled: bool(),
              kind: enumOf("at", "every", "cron"),
              nextRunAt: iso(),
              lastStatus: enumOf("ok", "error", "skipped"),
              source: enumOf("user", "workflow"),
            },
            ["id", "name", "enabled", "kind", "source"],
          ),
        ),
      },
      ["jobs"],
    ),
  },
  "home.proposeSchedule": {
    group: "schedules",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Resolve NL to a schedule proposal (does not arm; Design §7.4)",
    params: obj(
      {
        accountId: str({ minLength: 1 }),
        text: str({ minLength: 1 }),
        timeZone: str({ minLength: 1 }),
      },
      ["accountId", "text"],
    ),
    result: obj(
      {
        proposalId: str({ minLength: 1 }),
        resolvedLocal: str({ minLength: 1 }),
        kind: enumOf("at", "every", "cron"),
        whenInstant: iso(),
        cronExpr: str(),
        everyMs: int({ minimum: 1 }),
        message: str(),
        timeZone: str({ minLength: 1 }),
      },
      ["proposalId", "resolvedLocal", "kind", "timeZone"],
    ),
  },
  "home.confirmSchedule": {
    group: "schedules",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Confirm a proposal and arm the schedule timer",
    params: obj(
      { accountId: str({ minLength: 1 }), proposalId: str({ minLength: 1 }) },
      ["accountId", "proposalId"],
    ),
    result: obj(
      {
        job: obj(
          {
            id: str({ minLength: 1 }),
            enabled: bool(),
            nextRunAt: iso(),
          },
          ["id", "enabled"],
        ),
      },
      ["job"],
    ),
  },
  "home.updateSchedule": {
    group: "schedules",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Enable/disable a schedule job",
    params: obj(
      {
        accountId: str({ minLength: 1 }),
        jobId: str({ minLength: 1 }),
        enabled: bool(),
      },
      ["accountId", "jobId"],
    ),
    result: obj(
      {
        job: obj(
          {
            id: str({ minLength: 1 }),
            enabled: bool(),
            nextRunAt: iso(),
          },
          ["id", "enabled"],
        ),
      },
      ["job"],
    ),
  },
  "home.removeSchedule": {
    group: "schedules",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Delete a schedule job",
    params: obj(
      { accountId: str({ minLength: 1 }), jobId: str({ minLength: 1 }) },
      ["accountId", "jobId"],
    ),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.runSchedule": {
    group: "schedules",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Force-run a schedule job now",
    params: obj(
      { accountId: str({ minLength: 1 }), jobId: str({ minLength: 1 }) },
      ["accountId", "jobId"],
    ),
    result: obj(
      {
        receipt: obj(
          {
            execStatus: enumOf("ok", "error", "skipped"),
            deliveryStatus: enumOf("delivered", "not-delivered", "none", "unknown"),
            error: str(),
          },
          ["execStatus", "deliveryStatus"],
        ),
      },
      ["receipt"],
    ),
  },
  "home.listSkills": {
    group: "skills",
    scope: "account-scoped",
    paramsOptional: true,
    summary: "List skills",
    params: emptyParams,
    result: obj(
      {
        skills: arr(
          obj({ id: str(), name: str(), enabled: bool(), verified: bool() }, [
            "id",
            "name",
            "enabled",
            "verified",
          ]),
        ),
      },
      ["skills"],
    ),
  },
  "home.installSkill": {
    group: "skills",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Install a skill (never auto-trusted)",
    params: obj({ source: enumOf("path", "clawhub", "url"), ref: str({ minLength: 1 }) }, [
      "source",
      "ref",
    ]),
    result: obj({ id: str(), needsReview: bool() }, ["id", "needsReview"]),
  },
  "home.verifySkill": {
    group: "skills",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Verify a skill's declared capabilities",
    params: obj({ id: str({ minLength: 1 }) }, ["id"]),
    result: obj({ ok: bool(), findings: arr(str()) }, ["ok", "findings"]),
  },
  "home.removeSkill": {
    group: "skills",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Remove a skill",
    params: obj({ id: str({ minLength: 1 }) }, ["id"]),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.listArtifacts": {
    group: "artifacts",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "List artifacts for an account/session",
    params: obj({ accountId: str({ minLength: 1 }), sessionId: str() }, ["accountId"]),
    result: obj(
      { artifacts: arr(obj({ id: str(), path: str(), createdAt: iso() }, ["id", "path", "createdAt"])) },
      ["artifacts"],
    ),
  },
  "home.getArtifactUrl": {
    group: "artifacts",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Mint a signed artifact URL (TTL clamped to 86400)",
    params: obj(
      { accountId: str({ minLength: 1 }), path: str({ minLength: 1 }), ttlSec: int({ minimum: 0 }) },
      ["accountId", "path"],
    ),
    result: obj({ url: str({ minLength: 1 }), expiresAt: iso() }, ["url", "expiresAt"]),
  },
  "home.doctor": {
    group: "doctor",
    scope: "account-scoped",
    paramsOptional: true,
    summary: "Health check with classified issues",
    params: emptyParams,
    result: obj(
      {
        ok: bool(),
        issues: arr(
          obj(
            {
              id: str(),
              severity: enumOf("info", "warn", "error"),
              message: str(),
              fixable: bool(),
            },
            ["id", "severity", "message", "fixable"],
          ),
        ),
      },
      ["ok", "issues"],
    ),
  },
  "home.doctorFix": {
    group: "doctor",
    scope: "owner-scope",
    paramsOptional: false,
    summary: "Apply doctor fixes (shows before/after in the UI)",
    params: obj({ issueIds: arr(str({ minLength: 1 })) }, ["issueIds"]),
    result: obj({ fixed: arr(str()), failed: arr(str()) }, ["fixed", "failed"]),
  },

  /* A.9 memory, profile, learn --------------------------------------------- */
  "home.getProfile": {
    group: "memory",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Read the profile (optionally filtered to keys)",
    params: obj({ accountId: str({ minLength: 1 }), keys: arr(str()) }, ["accountId"]),
    result: obj({ profile }, ["profile"]),
  },
  "home.updateProfile": {
    group: "memory",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Supersede-by-key profile write (set is a key→value map, never a list)",
    params: obj(
      {
        accountId: str({ minLength: 1 }),
        // A flat map keyed by fact name. `additionalProperties: factValue()` is
        // what makes "supersede by key" structural: an array of append ops, or a
        // {key,value} pair, does not validate.
        set: obj({}, [], factValue()),
        removeKeys: arr(str({ minLength: 1 })),
      },
      ["accountId"],
    ),
    result: obj({ profile }, ["profile"]),
  },
  "home.listMemory": {
    group: "memory",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Memory sizes vs budgets (echoes the caps contract)",
    params: obj({ accountId: str({ minLength: 1 }), includeContent: bool() }, ["accountId"]),
    result: obj(
      {
        accountId: str({ minLength: 1 }),
        profileSummary: obj(
          {
            factCount: int({ minimum: 0 }),
            injectChars: int({ minimum: 0 }),
            rawChars: int({ minimum: 0 }),
            truncated: bool(),
            injectBudget: int({ minimum: 0 }),
            rawSoftCap: int({ minimum: 0 }),
          },
          ["factCount", "injectChars", "rawChars", "truncated", "injectBudget", "rawSoftCap"],
        ),
        notes: arr(memoryNote),
        reviewEnabled: bool(),
        flushEnabled: bool(),
        sessionRetentionDays: int({ minimum: 0 }),
        pendingLearnCount: int({ minimum: 0 }),
        pendingLearnCap: int({ minimum: 0 }),
        backendId: str({ minLength: 1 }),
      },
      [
        "accountId",
        "profileSummary",
        "notes",
        "reviewEnabled",
        "flushEnabled",
        "sessionRetentionDays",
        "pendingLearnCount",
        "pendingLearnCap",
        "backendId",
      ],
    ),
  },
  "home.setMemorySettings": {
    group: "memory",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Toggle flush/review and session retention (Settings Memory screen)",
    params: obj(
      {
        accountId: str({ minLength: 1 }),
        flushEnabled: bool(),
        reviewEnabled: bool(),
        sessionRetentionDays: int({ minimum: 0 }),
      },
      ["accountId"],
    ),
    result: obj(
      {
        ok: bool(),
        flushEnabled: bool(),
        reviewEnabled: bool(),
        sessionRetentionDays: int({ minimum: 0 }),
      },
      ["ok", "flushEnabled", "reviewEnabled", "sessionRetentionDays"],
    ),
  },
  "home.recall": {
    group: "memory",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Keyword/FTS recall over L2+L3 (per-hit engine)",
    params: obj(
      {
        accountId: str({ minLength: 1 }),
        query: str({ minLength: 1 }),
        limit: int({ minimum: 1, maximum: 100 }),
        paths: arr(str({ minLength: 1 })),
      },
      ["accountId", "query"],
    ),
    result: obj(
      {
        hits: arr(
          obj(
            {
              path: str({ minLength: 1 }),
              startLine: int({ minimum: 1 }),
              endLine: int({ minimum: 1 }),
              snippet: str(),
              score: num(),
              engine: enumOf("fts", "scan"),
            },
            ["path", "startLine", "endLine", "snippet", "score", "engine"],
          ),
        ),
      },
      ["hits"],
    ),
  },
  "home.forget": {
    group: "memory",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Delete a profile key or a note/query match",
    params: obj(
      {
        accountId: str({ minLength: 1 }),
        target: enumOf("profile_key", "note"),
        key: str(),
        path: str(),
        query: str(),
      },
      ["accountId", "target"],
    ),
    result: obj({ ok: bool(), removed: arr(str()) }, ["ok", "removed"]),
  },
  "home.compactMemory": {
    group: "memory",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Run consolidation now",
    params: obj({ accountId: str({ minLength: 1 }) }, ["accountId"]),
    result: obj(
      {
        ok: bool(),
        pendingLearnIds: arr(str()),
        compactSummaryPath: str(),
      },
      ["ok", "pendingLearnIds", "compactSummaryPath"],
    ),
  },
  "home.listPendingLearns": {
    group: "memory",
    scope: "account-scoped",
    paramsOptional: true,
    summary: "List PendingLearn proposals",
    params: obj({ accountId: str(), status: enumOf("pending", "accepted", "rejected", "stale") }),
    result: obj({ learns: arr(pendingLearn) }, ["learns"]),
  },
  "home.acceptLearn": {
    group: "memory",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Accept a PendingLearn (re-validates its base)",
    params: obj({ id: str({ minLength: 1 }) }, ["id"]),
    result: obj({ ok: bool() }, ["ok"]),
  },
  "home.rejectLearn": {
    group: "memory",
    scope: "account-scoped",
    paramsOptional: false,
    summary: "Reject a PendingLearn",
    params: obj({ id: str({ minLength: 1 }) }, ["id"]),
    result: obj({ ok: bool() }, ["ok"]),
  },
};

/** Every method name, sorted — what `home.hello.methods[]` advertises. */
export function methodNames(): string[] {
  return Object.keys(METHODS).sort();
}

export function isKnownMethod(method: string): boolean {
  return Object.prototype.hasOwnProperty.call(METHODS, method);
}

/** The valid PendingLearn `kind` enum — asserted against Design A.9 by test. */
export const PENDING_LEARN_KINDS = [
  "profile_patch",
  "memory_append",
  "memory_edit",
  "skill_create",
  "skill_patch",
  "skill_delete",
] as const;

/** The valid `class` enum for a smart-home object (Design §5.7.2 vocabulary). */
export const OBJECT_CLASSES = [
  "lock",
  "garage",
  "gate",
  "valve",
  "alarm",
  "camera",
  "presence",
  "light",
  "switch",
  "sensor",
  "climate",
  "other",
] as const;

export type ObjectClass = (typeof OBJECT_CLASSES)[number];

/** Design §5.7.3: read sharing is refused for presence-revealing classes. */
export function isShareableClass(cls: ObjectClass): boolean {
  return !(PRESENCE_REVEALING_CLASSES as readonly string[]).includes(cls);
}

/**
 * Design §5.7.3 rule 3: a plugin descriptor is untrusted input, so `class` may
 * only move up the safety ordering. A downgrade request is refused with this.
 */
export function isClassDowngrade(from: ObjectClass, to: ObjectClass): boolean {
  return CLASS_RANK[to] < CLASS_RANK[from];
}

/**
 * Safety tier per class, used by `isClassDowngrade` (Design §5.7.3 rule 3).
 *
 * Ranked in TIERS rather than a total order, because moves *within* a tier are
 * not safety downgrades: `light` → `switch` re-describes a lamp, while
 * `garage` → `light` turns a door into a lamp. A linear ordering would call the
 * first one a downgrade and force a pointless approval.
 *
 *   0 — ordinary actuation / read-only
 *   1 — sensitive: presence-revealing
 *   2 — physical safety: the §5.7.2 safety classes
 */
export const CLASS_RANK: Readonly<Record<ObjectClass, 0 | 1 | 2>> = {
  other: 0,
  sensor: 0,
  switch: 0,
  light: 0,
  climate: 0,
  camera: 1,
  presence: 1,
  valve: 2,
  gate: 2,
  garage: 2,
  lock: 2,
  alarm: 2,
};

/** Design Appendix A.7: `ttlSec` is clamped, not rejected. */
export const ARTIFACT_TTL_DEFAULT_SEC = 3600;
export const ARTIFACT_TTL_MAX_SEC = 86400;

export function clampArtifactTtlSec(ttlSec: unknown): number {
  if (typeof ttlSec !== "number" || !Number.isFinite(ttlSec)) return ARTIFACT_TTL_DEFAULT_SEC;
  const whole = Math.floor(ttlSec);
  if (whole <= 0) return ARTIFACT_TTL_DEFAULT_SEC;
  return Math.min(whole, ARTIFACT_TTL_MAX_SEC);
}

/**
 * Design A.5: `summary` is REQUIRED for any approval whose risk is `admin` or
 * `sensitive` — a human must never be asked to approve a bare tool name. This is
 * a conditional requirement the schema cannot express, so it lives here and is
 * called by the daemon before an approval is persisted or emitted.
 */
export interface ApprovalSummarySubject {
  risk: string;
  summary?: string | undefined;
  argsDigest: string;
}

export function assertApprovalSummary(subject: ApprovalSummarySubject): void {
  const needsSummary = subject.risk === "admin" || subject.risk === "sensitive";
  if (needsSummary && (subject.summary === undefined || subject.summary.trim().length === 0)) {
    throw new Error(
      `assertApprovalSummary: risk "${subject.risk}" requires a rendered \`summary\` naming ` +
        `the target and desired state (Design A.5, V-HA-20); argsDigest alone cannot ` +
        `distinguish two objects`,
    );
  }
}
