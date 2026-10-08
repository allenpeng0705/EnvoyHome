# AGENTS.md — project-local instructions for AI coding agents

| Field | Value |
|-------|-------|
| **Document** | Project-local instructions consumed by OpenCode/Codex/Cursor/Aider/Devin/Gemini CLI |
| **Owner** | Allen Peng |
| **Status** | Living; bump when conventions change |
| **Conflicts** | This file is subordinate to `design_doc/EnvoyHome-Design.md` and `design_doc/EnvoyHome-Implementation-Plan.md` |

## Ground truth (always read first)

1. **`design_doc/EnvoyHome-Design.md`** — what we build, why, every Normative rule.
2. **`design_doc/EnvoyHome-Memory-Design.md`** — how memory works (L0–L7, flush, LearnQueue).
3. **`design_doc/EnvoyHome-Implementation-Plan.md`** — Build Stages **B0–B14**, verification IDs, soft-risk mitigations.
4. **`tests/min/conventions.md`** — 13 must-follow rules (R1–R13). **Read before editing any package code.**

## Don't

- Don't invent a second envelope shape — adopt `@envoymesh/protocol`'s `{id, method, params?}` (`../EnvoyMesh/packages/protocol/src/json-rpc-wire.ts`), **hosted** via `@envoymesh/reuse-host`, which re-exports the transport and **not** the type definitions (Design §3.1; conventions R11).
- Don't fork `@envoymesh/*` under `@envoyhome/*`, and don't declare a sibling as `workspace:*` — they are neither workspace members nor on npm (Design §1.4; Plan §2).
- Don't sandbox off by default (Design §4.0, §14 item 5; the OpenClaw "sandbox off" default is rejected for shared-home).
- Don't build a consent model on HomeClaw — its tool default is `allow_all` and its approvals are in-memory. Design §4.4 adopts OpenHuman's durable + TTL + fail-closed shape.
- Don't let a paired device act for an account it is not bound to; fail closed with `envoyhome.account_not_bound` (Design §4.1, V-SEC-7).
- Don't classify smart-home actuation as `write`. `ha_call_service` / `mqtt_publish` are **`admin`** (Design §4.3.2).
- Don't classify the safety class with a regex or a service string. It is **data-driven on the resolved object's declared `class`** plus a service deny list, script/scene/button indirection, the MQTT allow-list and `neverUnattended` — and **unknown means safety-class**. The regex version was withdrawn for failing open on `alarm_control_panel.alarm_disarm`, `cover.*`, `lock.open`, every MQTT publish, and all script/scene/button indirection (Design §5.7.2; conventions R13).
- Don't let a channel plugin hold a write credential or actuate from `outbound` — an `event-source` plugin gets a **read-only** credential and its outbound is notification-only (Design §5.3.1, §5.3.5 rule 6).
- Don't resolve an object from a plugin-asserted `sourceId`. Sources are **registered by the authenticated instance** (`ChannelContext.registerSources`), and every object access — **reads included** — goes through the `resolveObject` chokepoint (Design §5.7.3).
- Don't bypass the actuation journal: write the intent record **before** dispatch, reconcile on restart, never blind-retry, and refuse non-idempotent (`*.toggle`) services unattended (Design §5.7.7).
- Don't let a workflow actuate unattended without a grant, and don't let smart-home state into standing memory automatically — device state is `sensitive` and reveals presence (Design §5.7.2, §5.7.4, V-HA-4, V-HA-8).
- Don't grow a core device model, become an MQTT broker, or add radio support — we integrate with hubs, we are not one (Design §5.7.1, §19.8).
- Don't write to L1 profile / L2 MEMORY / L7 skill without going through PendingLearn — **except** the paths Memory Design §8.1 and §9 permit explicitly (user-driven tools; flush L3 only when `trust ∈ {owner, agent}` **and** under cap; flush L2 only when under cap **and** `trust ∈ {owner, agent}`; consolidate safe append). Design §9.3 + Memory Design §10.
- Don't bump a version to add an optional field — additive change is discovered via `home.hello.methods[]`; only a **breaking** wire change bumps `protocolApiVersion` (Design §3.7; conventions R10).
- Don't set `CI=true` before `pnpm install` (conventions R9; pnpm strict-mode trap). GitHub Actions sets it for every step — `unset CI` explicitly.
- Don't mask `peers:check` or any merge gate with `|| echo ...` (Plan §5.7).
- Don't rely on Ext-Agent-only as the long-term phone path (Design §14 item 9).
- Don't put EnvoyMesh Social product inside EnvoyHome (Design §14 item 10).

## Do

- Read the Build Stage you're working on (`Plan §3 B0–B14`) before touching code.
- Map your change to **exactly one** owning stage via the verification ID in `Plan §4`. If an ID appears to need two stages, the table is wrong — fix the table.
- For sandbox/path work, use the chokepoint resolvers — `safeJoin` for files, `homePaths(stateDir)` for every on-disk path, `resolveObject` for smart-home objects (all three land in B3/B14). Run the security corpus fixture (`packages/daemon/test/security-corpus.test.ts`, **lands in B3**) and the required-deny corpus (Design Appendix C.4) for anything touching actuation.
- For harness/plugins work, follow the allow-list contract (conventions R2).
- For memory work, follow the writer-lock + recall-over-L2+L3-only rules; the FTS index must be **CJK-capable** (`tokenize='trigram'`) and must exclude `memory/compact/**` (Plan §5.4, Memory Design §4.5, V-MEM-13).
- For `home.*` payloads, use **camelCase** wire field names; snake_case is for conceptual names and daemon-internal interfaces only (Design §3.7, Appendix A conventions).
- For smart-home work, declare the §4.3.2 tier **and `idempotent`** on every tool, take a **resolved object handle** (never a raw `entity_id`/topic), route actuation through the daemon, and bind objects with `home.setSourceBinding` — an unbound or unregistered object opens no turn (Design §5.7.3, V-HA-6, V-HA-14).
- For tests, use `flushLoop()` + `__resetActiveXForTests()` from `@envoyhome/test-utils` (conventions R8).
- Cite the peer you're imitating with a file path. If a peer claim cannot be verified in the sibling checkout, say so instead of citing it.

## Repo layout

> **Target layout.** The paths below are the plan (Plan §2–§3). At B0 only `packages/{channel-api,daemon,harness-host,memory,protocol,providers,test-utils,workflows}` exist; `packages/smarthome/` and `plugins/` land in B14/B7.

```
EnvoyHome/
  design_doc/                  # Design + Memory Design + Implementation Plan + agreed + analysis (versioned)
  apps/
    desktop/                   # Tauri thin UI (B12)
  packages/
    protocol/                  # @envoyhome/protocol — home.* types + JSON schemas (B1)
    daemon/                    # @envoyhome/daemon — control plane (B2–B13)
    channel-api/               # @envoyhome/channel-api — Channel SDK (B7)
    harness-host/              # @envoyhome/harness-host — plugin loader + TurnContext (B6)
    providers/                 # @envoyhome/providers — model providers + mix router (B6)
    workflows/                 # @envoyhome/workflows — static workflow executor (B9)
    memory/                    # @envoyhome/memory — facade + standing store (B5/B8)
    smarthome/                 # @envoyhome/smarthome — HA + MQTT clients, ha_*/mqtt_* tools, safety list (B14)
    test-utils/                # @envoyhome/test-utils — flushLoop + __resetActiveXForTests (R8)
  plugins/                     # bundled channel plugins: channel-telegram (B7); channel-mqtt, channel-homeassistant (B14)
  scripts/                     # peers-check, fetch-peers, build, lint, test, ci
  tests/
    min/
      conventions.md           # R1–R13 must-follow rules
  .github/workflows/ci.yml
  .npmrc                       # confirm-modules-purge=false (R9 interaction)
  package.json                 # workspace root scripts + typescript devDep
  pnpm-workspace.yaml          # workspace globs + `overrides:` sibling `link:`s
  tsconfig.base.json           # extended by each package's tsconfig.json
  AGENTS.md                    # this file
```

## Peer workspace links (do not fork)

Siblings are linked with `link:` in each `package.json` **plus** an `overrides:` block in `pnpm-workspace.yaml` (transitive `@envoymesh/*` would otherwise 404). See Plan §2.

- `../EnvoyMesh` → `@envoymesh/protocol` (envelope/wire types), `host-connect`, `reuse-host` (hosting), `network`, `identity`
- `../envoy-harness` → `@envoymesh/envoy-harness` (default harness; **not** published to npm)
- `../EnvoyCoder` → reference patterns only (Settings, host-bridge, daemon claim file); **not** a linked dependency

`./scripts/peers-check.sh` is **fail-closed**: it exits non-zero if a linked sibling package is missing, is not a git checkout, or is on the wrong branch (`ENVOYHOME_PEER_BRANCH`, default `main`). `./scripts/fetch-peers.sh` clones the siblings when `ENVOYHOME_PEERS_GIT_BASE` is set.

## PR title: `[B<stage-id>] <short>`

Example: `[B5] StandingStore + MemoryFacade (L1–L3)`

PR body must list:
- verification IDs now green
- files added/modified
- any Design doc edits required (with changelog row)

## When unsure

1. Re-read the Build Stage in `Plan §3`.
2. Re-read the verification IDs owned by that stage in `Plan §4`.
3. Re-read the soft-risks table in `Plan §5` for the relevant category.
4. If still unclear, edit Design first (with changelog row), then this file, then code.

Never silently grow scope. Never silently change Normative.
