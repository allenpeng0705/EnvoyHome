# Analysis: Envoy family

**Status:** Draft — re-verified against the local checkouts on 2026-10-08; merged into ground truth
[`../EnvoyHome-Design.md`](../EnvoyHome-Design.md) §1.2, §2.3, §3.  
**Sources:** `../EnvoyMesh` (incl. `EnvoyMesh_GuideBook_0.4.0.md`), `../EnvoyCoder`, `../envoy-harness`,
HomeClaw `channels/envoymesh`.

## Apps group

| Product | Job | Where it lives |
|---------|-----|----------------|
| EnvoyMesh | Home node + Social; mesh identity; optional Ext Agent | `../EnvoyMesh` (v0.8.0) |
| EnvoyGo | Phone thin client | named in the guidebook; **not checked out here** |
| EnvoyDev | Coding control plane | `../EnvoyCoder` — `package.json` → `"name": "envoydev"` |
| **EnvoyHome** | **New:** home assistant brain | this repo |

**Verified guidebook facts (correct the earlier wording):** `EnvoyMesh_GuideBook_0.4.0.md` is
**v0.4.0**, revised 2026-08-27. It names **EnvoyMesh** (home node + Social desktop) and **EnvoyGo**
(phone thin client, `:17`, `:39`, `:200`), plus an "Envoy Harness" coding-agent feature and a
"Developer CLI". It does **not** name EnvoyHome, and it does **not** name **EnvoyDev** either
(`grep -c EnvoyDev` over 0.4.0 = 0) — EnvoyDev is real but lives in the sibling repo, not the
guidebook.

## Ext Agent (guidebook §36–37 — verified)

- §36.1: a separately running assistant that receives selected messages and invokes allowed mesh tools through EnvoyMesh's local HTTP bridge; HomeClaw/Hermes/OpenHuman share the `envoymesh-message` contract.
- §36.3/§36.4: the bridge converts plain HTTP ↔ signed mesh operations so keys, bond checks, capability limits and audit stay inside EnvoyMesh; raw libp2p access would let an agent evade identity and policy boundaries.
- §36.5/§36.6 + §37.2: the bridge agent has its own mesh peer identity derived from the owner mandate; EnvoyMesh signs outbound replies on its behalf. Endpoints: `GET /bridge/list-tools`, `POST /bridge/execute-tool`, and the agent replies with `POST /bridge/send { to, text }` on port **3031** (`BRIDGE_HTTP_PORT_BASE`, `packages/node-core/src/service-ports.ts:6-7`).
- Presets: HomeClaw `127.0.0.1:8010/message`, Hermes 8020, OpenHuman 8021, bundled OpenClaw 18789; config in `bridge-config.json` (`extAgents`, `activeExtAgentId`). UI label: **Settings → AI → Ext Agent**.
- **Fitness:** useful **compat** path; **reject** as the sole long-term architecture. Target = daemon + `home.*` Mesh super channel.

## The wire envelope (get the definition site right)

The `{ id, method, params? }` / `{ id, result | error }` / `{ event, data }` shapes are defined in
**`@envoymesh/protocol`** — `packages/protocol/src/json-rpc-wire.ts:23-51` — moved out of
`@envoymesh/api`'s product surface so a reusable-layer host can import the wire types without the
product's method catalogue. `@envoymesh/reuse-host` is a **facade** over
`@envoymesh/host-connect`'s `WsServer`: it re-exports the transport and pairing builders, not the
type definitions. Depend on `@envoymesh/protocol` for shapes, `@envoymesh/reuse-host` for hosting.

Two details that matter for a Normative rule:
- `error.code` is a **string from a closed transport catalogue**, not JSON-RPC's numeric convention
  (`json-rpc-wire.ts:38-40`); product namespacing belongs in `message`.
- EnvoyCoder's copy adds `messageKey?` / `messageValues?`
  (`../EnvoyCoder/packages/protocol/src/rpc.ts:77-97`) — tolerate those on inbound errors.

## Pairing URI (verified)

Scheme+path are exactly **`envoy://pair`** (`packages/api/src/envoy-pair-uri.ts:139,160,200-208`) —
`envoymesh://` is not a pairing scheme anywhere; its only occurrences are unrelated JSON-Schema
reference strings. Required params `wsUrl`, `token`, `ownerPublicKey`, `ownerId`; optional `app`,
`lanWsUrl`, `relayPeerId`, `relayWsUrls`, `agentPeerId`, `agentPubKey`, `agentName`,
`homeNodePeerId`, `bootstrapPeers`.

**`app` is enforced by comparison, not by an enum.** `pairingAppMismatch(codeApp, nodeApp)` compares
against the receiving node's own name (`ENVOYMESH_APP_NAME`, default `EnvoyMesh`), and an **absent
`app` never mismatches** (`packages/protocol/src/app-identity.ts:46-59`). EnvoyCoder both mints
(`app: "EnvoyDev"`) and consumes it (`pairing-code.ts:97`). So `app=EnvoyHome` is a minting
convention; actually refusing foreign codes requires setting our app name and calling that check —
parsing alone refuses nothing. Verification: V-RPC-4.

## EnvoyCoder patterns to adapt

- Family envelope; loopback vs `?token=`; mint/list/revoke/forget; hosting peer vs attach node.
- Thin paired home: direct remote WS.
- **Multi-harness is a static catalogue, not a plugin system.** `packages/agent-catalog/src/index.ts`
  holds `HARNESS_CATALOG` / `HarnessDefinition` with two tiers (native `envoy-harness`,
  `deepseek-harness`; external `claude`, `codex`, `copilot`, `opencode`, `cursor-agent`, `pi`) and
  unifies them over **ACP** (`harnessTransport: "acp" | "cli" | "in-process"`). Adding an agent means
  editing TypeScript and shipping a build. There is **no** plugin loader. This is the honest
  reference for Design §6.3's third trust class.
- **Daemon claim file, not port probing.** `apps/desktop/src/daemon/lock.ts` publishes
  `DaemonDescriptor { pid, port, instanceId }` with `stale`/`running` states, because *"something
  answers on 4770" ≠ "our daemon answers on 4770"*. Also the pairing-URI host/port + IPv6
  normalisation in `apps/desktop/src/daemon/pairing.ts:119-192`.
- **Settings is registry-driven, not hand-built.** Frame/pages/rows split; sections-as-*data* with a
  mandatory `{ file, needle, because }` citation per section
  (`apps/desktop/src/state/settings-sections.ts:45,68`); scope unions holding **ids not snapshots**
  (`settings-scope.ts:16-24,80`); one push-driven store via `useSyncExternalStore`
  (`coderStore.ts:19-33`); daemon-owned zod `.strict()` JSON with atomic write and
  **quarantine-instead-of-overwrite** (`state-file.ts:1-20`).
- ⚠️ **Caveat:** EnvoyCoder's own `docs/` is gitignored and `docs/settings-parity.md` — required by
  `scripts/check-settings-parity.mjs:84,588` and cited as §7.5/§7.6 throughout the Settings code — is
  absent from the checkout, so that gate cannot pass there. Do not copy citations to an unreadable
  source; and note EnvoyHome currently has the same class of problem with `design_doc/`.

## envoy-harness

Default built-in harness plugin; works without Mesh; optional adapter. Verified: **not published to
npm** (404) — treat `@envoymesh/envoy-harness` as a source/link dependency. Its turn API is
`Agent.run(prompt | ContentBlock[]) → AgentResult` (**not** `startTurn`); host protocol is ACP
(`session/prompt`, `session/request_permission`, `session/user_question`, `session/update`); it can be
embedded in-process, as an `--acp` subprocess, or as a product shell (TUI/WebUI); and it has **no
multi-harness marketplace inside itself**. `docs/boundary.en.md` documents the envoy-harness ↔
EnvoyMesh boundary, **not** a host-vs-harness contract.

## HomeClaw EnvoyMesh channel

Legacy Ext-Agent-style bridge → `/inbound`. Compat only.

## Learnings (pinned)

1. Super channel = Mesh + thin clients  
2. Don’t fork `@envoymesh/*`; **link them** (`link:` + `overrides`), and don’t cite them as published packages  
3. `home.*` product namespace; mint `app=EnvoyHome` **and** validate the peer’s `app`  
4. Default harness = envoy-harness  
5. EnvoyHome ≠ EnvoyDev ≠ Ext-Agent-only  
6. Envelope types come from `@envoymesh/protocol`; hosting comes from `@envoymesh/reuse-host`  
7. EnvoyMesh is not a memory precedent — its `L0`/`L1` are **relay tiers**, not memory layers; EnvoyHome’s L0–L7 is its own vocabulary  
8. EnvoyMesh already owns multi-home coordination (`fleetId` + `fleet:apply`) — do not build a second federation stack
