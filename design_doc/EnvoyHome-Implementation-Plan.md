# EnvoyHome Implementation Plan

Living plan for **active** EnvoyHome build work. Style aligned with EnvoyMesh [`docs/implementation-plan.md`](../../EnvoyMesh/docs/implementation-plan.md): status legend, Current Milestone, checkbox boards; stage **narratives** stay in [§3](#3-build-stages-b0b14).

| Field | Value |
|-------|-------|
| **Role** | Subordinate to [`EnvoyHome-Design.md`](EnvoyHome-Design.md), [`EnvoyHome-Memory-Design.md`](EnvoyHome-Memory-Design.md), and [`EnvoyHome-Knowledge-RAG-Design.md`](EnvoyHome-Knowledge-RAG-Design.md). **Design wins.** |
| **Last updated** | 2026-10-25 |
| **Owner** | Allen Peng |
| **G6** | **Accepted 2026-10-09** for Plan text matching Design `2026-10-08f` (with G1) |

**Start here:** [Current Milestone](#current-milestone) · **Ground truth:** [Design](EnvoyHome-Design.md) · [Memory Design](EnvoyHome-Memory-Design.md) · [Knowledge + RAG](EnvoyHome-Knowledge-RAG-Design.md) · **08f Accept:** [`reviews/2026-10-08f-acceptance.md`](reviews/2026-10-08f-acceptance.md)

**For AI agents:** Read Design Normative → this **Current Milestone** → only the relevant `### B*` / epic checklist. Flip `[ ]`/`[~]`/`[x]` when shipping; add one **Changelog** row.

## Status Legend

- `[ ]` Not started
- `[~]` In progress (code started or partial; not product-complete)
- `[x]` Done (acceptance for that slice met for current bar)
- `[!]` Blocked or needs a decision
- `[>]` Deferred on purpose (owner order / Phase 2)

Maintenance: flip checkboxes when shipping; refresh **Current Milestone**; keep Normative narrative in Design, not here.

## On this page

- [Current direction](#current-direction)
- [Key Decisions](#key-decisions)
- [Current Milestone](#current-milestone)
- [Build stage board (B0–B14)](#build-stage-board-b0b14)
- [Release bar (§8 / Design §21)](#release-bar-8--design-21)
- [Post-v1 product epics](#post-v1-product-epics)
- [Phase 2 agent capabilities (P2-A…E)](#phase-2-agent-capabilities-p2-ae)
- [§2 Repo layout](#2-repo-layout-target)
- [§3 Build Stages (detail)](#3-build-stages-b0b14)
- [§4 Verification ID index](#4-verification-id-index)
- [Changelog](#changelog-this-document)

## Current direction

EnvoyHome is a self-hosted **home agent control plane** (Design §1). Spine **B0–B14** is implemented on `main` against Design **`2026-10-08f`** (**G1/G6 Accepted 2026-10-09**).

**Active epic:** **Early-adopter claim freeze** — [`reviews/2026-10-22-early-adopter-claims.md`](reviews/2026-10-22-early-adopter-claims.md); desktop + Mesh phone + HA/MQTT demo/fixture; **not** `v1.0.0`  
**Next (after early-adopter ops):** Live HA checklist ([`docs/smart-home-live-checklist.md`](../docs/smart-home-live-checklist.md)); then **First-party IM live** (Telegram first) when Mesh phone path is solid  
**Deferred from early-adopter claims:** Production IM zoo; Privacy Mode product toggle (`home.setPrivacyMode` stays Phase 2); agentskills.io conformance  

**Active coding epic:** **Knowledge + RAG / KnowYou** — [`EnvoyHome-Knowledge-RAG-Design.md`](EnvoyHome-Knowledge-RAG-Design.md); board **KB-P1…P5** below (V-KB / V-KY / V-EMB).

**Last shipped (docs + KB spine):** Knowledge-RAG Normative (`2026-10-25`); KB-P1…P5 implementation (`2026-10-25b`); early-adopter claim sheet + live HA checklist (`2026-10-22d`)

## Key Decisions

- `[x]` Package manager: pnpm workspaces; `@envoymesh/*` via `link:` + `overrides:` (not npm, not `workspace:*`).
- `[x]` Envelope: adopt `@envoymesh/protocol`; host via `@envoymesh/reuse-host` (R11).
- `[x]` Mesh phone path: **hosting default**; attach dual-if-needed; never phone-via-attach; no Social in EnvoyHome (P2-Q4).
- `[x]` Smart home is **v1 Core** (B14); integrate hubs, do not become one.
- `[x]` Safety class is data-driven on resolved object `class` (08f); regex list withdrawn.
- `[x]` Approvals: durable + TTL + fail-closed; claim≠consume for grants (08f).
- `[x]` Memory + gated LearnQueue are **v1 Normative** (not Phase 2).
- `[x]` G1/G6 for Design/`Plan` through **`2026-10-08f`** — Accepted 2026-10-09.
- `[x]` Owner product order: **desktop → EnvoyMesh mobile → first-party IM set**.
- `[x]` First-party chat plugins (Design §5.0): **Telegram**, **Discord**, **Slack**, **Feishu/Lark**, **DingTalk**, **WeCom**; **WhatsApp** + **WeChat personal** deferred.
- `[ ]` Tag `v1.0.0` — when [release bar](#release-bar-8--design-21) items (1)–(8) all `[x]` with honest evidence. **Do not tag** on early-adopter alone.
- `[ ]` First-party IM epic — plugins+Channels catalog shipped; **live Telegram→five bots deferred** from early-adopter marketing (Mesh phone is primary).
- `[ ]` Phase 2 Privacy Mode RPC / Settings — `privacy-mode.json` stub may exist; **never advertise** until `home.setPrivacyMode` + V-P2-PRIV-*.
- `[x]` Early-adopter claim sheet — [`reviews/2026-10-22-early-adopter-claims.md`](reviews/2026-10-22-early-adopter-claims.md) (`2026-10-22d`).
- `[x]` Phase 2 agent capabilities P2-A…E — Design **Accepted 2026-10-20**; **A–E + D2 `[x]`** (`2026-10-20o`/`p` Design-max Adapt).

## Current Milestone

**Milestone:** Spine on `main`; **early-adopter claims frozen**; deepen desktop/mobile ops; live HA sign-off optional for narrow claims; IM live + Privacy RPC remain post-early-adopter / Phase 2.

| Track | Status | Notes |
|-------|--------|-------|
| Design `2026-10-08f` G1 | `[x]` | Accepted 2026-10-09 |
| Plan G6 (08f text) | `[x]` | Accepted 2026-10-09 |
| B0–B14 code on `main` | `[x]` | Every-ID e2e not claimed for all V-HA/V-UX |
| Early-adopter claims | `[x]` | `reviews/2026-10-22-early-adopter-claims.md` |
| Desktop product shell | `[~]` | V-UX Playwright green after Connections/`artifacts.hint` hygiene (`2026-10-22d`) |
| Tauri supervise | `[x]` | Spawn/reap; OS service install/uninstall/restart RPCs + Advanced controls |
| Inbound → turns + product events | `[x]` | Daemon + Settings subscribe/`on` |
| policy.json / forceLocalForEventSource | `[x]` | PolicyStore |
| Privacy Mode | `[~]` | Stub file only — **silence in marketing** until Phase 2 RPC |
| Live HA C.4 | `[>]` | Fixture `[x]`; checklist [`docs/smart-home-live-checklist.md`](../docs/smart-home-live-checklist.md); sign-off pending |
| EnvoyMesh mobile thin client | `[~]` | Pair + push + chat + artifacts + This machine; live verify + Store polish — [`docs/mobile-live-verify.md`](../docs/mobile-live-verify.md) |
| First-party IM set | `[~]` | Plugins+catalog `[x]`; **live verify deferred** (not in early-adopter claims) |
| Phase 2 P2-A…E | `[x]` | Design Accepted 2026-10-20; **A–E + D2 `[x]`** (`2026-10-20o`/`p`) |
| Tag `v1.0.0` | `[ ]` | Blocked on release bar honesty |

### Next planning pulls

0. **Operator live HA** `[>]` — fill `docs/smart-home-live-checklist.md` when hub creds available (or keep narrow claim).  
1. **Mobile thin client** `[~]` — Store/TestFlight polish when phone is a launch surface.  
2. **First-party IM live** `[ ]` — Telegram first, then five bots; only then widen claims.  
3. **Privacy Mode RPC** `[ ]` — `home.setPrivacyMode` + Settings + V-P2-PRIV-* (or stay silent).  
4. **Tag `v1.0.0`** `[ ]` — when release bar (1)–(8) honestly `[x]`.

## Build stage board (B0–B14)

Honest: `[x]` = stage acceptance met for **scaffold + CI-owned IDs**; `[~]` = code present but product/live gaps remain.

| Stage | Status | One-line |
|-------|--------|----------|
| **B0** Workspace bootstrap | `[x]` | Root tooling, peers-check, CI |
| **B1** Protocol | `[x]` | `home.*` schemas + validator |
| **B2** Daemon + transport | `[x]` | WS/hatch/claim; events bus now wired |
| **B3** Accounts + path jail | `[x]` | safeJoin + homePaths |
| **B4** Pairing + mesh hosting | `[x]` | hosting status; dual-mode notes |
| **B5** Memory L1–L3 | `[x]` | StandingStore + facade |
| **B6** Providers / harness / approvals | `[x]` | TurnService; durable approvals |
| **B7** Channel SDK + Telegram demo | `[~]` | SDK + six plugins + Channels UI `[x]`; **live bot verify deferred** from early-adopter claims |
| **B8** Memory depth | `[x]` | LearnQueue, flush, L4 FTS, compact |
| **B9** Static workflows | `[x]` | matcher/executor; V-DAG-4 real model `[ ]` optional |
| **B9.1** ScheduleService | `[x]` | clock + NL propose/confirm + workflow sync; V-CRON-1..6 |
| **B10** Skills verify | `[x]` | gate; agentskills.io unverified (residual) |
| **B11** Artifacts + signing | `[x]` | HMAC URLs |
| **B12** Settings UI (Tauri) | `[x]` | Thin Settings + QR + Memory/Advanced + V-UX Playwright smoke |
| **B13** Doctor + HomeClaw migrate | `[x]` | fresh + fixture dry-run green |
| **B14** Smart home | `[~]` | Library + C.4 + RPC `[x]`; live sign-off via [`docs/smart-home-live-checklist.md`](../docs/smart-home-live-checklist.md) `[>]` |

Detail for each stage: [§3](#3-build-stages-b0b14).

## Release bar (§8 / Design §21)

| # | Bar | Status |
|---|-----|--------|
| 1 | B0–B14 closed | `[~]` code `[x]`; full every-ID e2e not claimed |
| 2 | Normative IDs green (cadence) | `[~]` every-PR suites green; nightly/manual partial |
| 3 | `pnpm test` + fake HA/broker | `[x]` CI; e2e-mesh/smarthome nightly backlog |
| 4 | Manual §10.2 eight flows | `[x]` `smoke-v1` 8/8 automated; live device deferred |
| 5 | Doctor fresh install | `[x]` |
| 6 | HomeClaw migrate dry-run | `[x]` fixture; real `~/.homeclaw` operator |
| 7 | Tauri macOS build | `[x]` |
| 8 | Owner G1 + G6 | `[x]` **2026-10-09** |

Tag `v1.0.0` when (1)–(8) are honestly `[x]` including bar 1’s e2e bar you choose to require.

## Post-v1 product epics

| Epic | Status | Design |
|------|--------|--------|
| Desktop quality (beyond B12 scaffold) | `[~]` | §10.1 nav + V-UX-6 UI; live HA inventory operator |
| EnvoyMesh mobile thin client | `[~]` | §19.2 — chat/approvals/artifacts + push |
| Profile workspace folders (host mounts outside sandbox) | `[~]` | Design §4.2.1 — up to 16 named mounts; Owner sets (incl. `/`); `workspace/<id>/…` jail; V-SEC-13/14/20 |
| Household Owner account | `[x]` | Design §4.1.1 — exclusive Owner bind; R1/R4 deferred; seat-or-Owner grants; V-SEC-15…21 |
| Privacy Mode RPC (+ smart-home egress) | `[ ]` | §19.4, V-P2-PRIV-*; stub silent until RPC — early-adopter claim sheet |
| Automation authoring UX | `[ ]` | §19.8 |
| First-party IM set (Telegram + Discord + Slack + Feishu + DingTalk + WeCom) | `[ ]` | Design §5.0 `2026-10-16c` — after mobile solid |
| **P2-A…E agent capabilities** | `[x]` | Accepted 2026-10-20; A–E + D2 shipped (`2026-10-20o`) |
| Memory Tree / fleets / TokenJuice | `[>]` | §19.7 — not core |
| **Knowledge + RAG / KnowYou (KB-P1…P5)** | `[x]` | Knowledge-RAG Design — see board below |

## Knowledge + RAG / KnowYou (KB-P1…P5)

Ground truth: [`EnvoyHome-Knowledge-RAG-Design.md`](EnvoyHome-Knowledge-RAG-Design.md). Standing L1–L3 unchanged.

| Epic | Status | Deliverable | Verify IDs |
|------|--------|-------------|------------|
| **KB-P1** Doc KB section FTS | `[x]` | `KnowledgeIndex` + `knowledge_search` + reindex RPCs | V-KB-1…4, V-KB-7 |
| **KB-P2** Home embed `:18793` | `[x]` | EmbedEngineService + catalog + mock/Ollama; refuse Mesh attach | V-EMB-1…7 |
| **KB-P3** Hybrid KB + optional inject | `[x]` | RRF FTS∪vec; `knowledgeInject` tool→auto Settings | V-KB-5, V-KB-6 |
| **KB-P4** KnowYou engine | `[x]` | ADD\|SUPERSEDE\|SKIP; summarize/TTL on consolidate | V-KY-1…4, V-KY-6, V-KY-7 |
| **KB-P5** Auto episodic inject | `[x]` | `episodicInject=auto` + L1/L2 filter; duty line + `knowledge_search` | V-KY-5 |

**Defaults:** `knowledgeInject` / `episodicInject` = **`auto`** (live `pnpm agent:eval:kb` green 2026-10-27). Settings may set `tool`/`off`. Embed off until Owner enables.

### V-KB / V-KY / V-EMB checklist (ship)

| ID | Gate | Status |
|----|------|--------|
| V-KB-1…4, V-KB-7 | Unit + artifact | `[x]` |
| V-KB-5 | Hybrid / FTS degrade | `[x]` |
| V-KB-6 | Auto-inject + L2 filter | `[x]` unit + live `gen-live-knowledge-auto-*` |
| V-KY-1…4, V-KY-6 | Unit | `[x]` |
| V-KY-5 | Budgeted episodic auto-inject | `[x]` + live `gen-live-knowyou-auto-inject-drink` |
| V-KY-7 | PendingLearn on L1/L2 conflict | `[x]` |
| V-EMB-1…7 | Embed engine / Doctor stale | `[x]` |
| Settings Memory/Knowledge | Desktop LLM → Memory card | `[x]` |
| Live eval | `pnpm agent:eval:kb` | `[x]` 15/15 (2026-10-27) |

## Phase 2 agent capabilities (P2-A…E)

Design ground truth: **§19.9–§19.13** (**Accepted 2026-10-20**). Ship after Current Milestone IM/mobile unless Owner reorders. Wire: additive catalogue / methods only.

| Epic | Status | Design | Depends on | Deliverable (when coding) | Verify IDs |
|------|--------|--------|------------|---------------------------|------------|
| **P2-A** File edit | `[x]` | §19.9 | Path jail (B3) done | `edit_file` / `apply_patch` in harness-host; V-P2-EDIT tests green (`2026-10-20i`) | V-P2-EDIT-1, V-P2-EDIT-2 |
| **P2-B** Ambient | `[x]` | §19.10 | ScheduleService + agentTurn (B9.1) | Heartbeat + standing orders + Doctor warn (`2026-10-20j`) | V-P2-AMB-1, V-P2-AMB-2, V-P2-AMB-3 |
| **P2-C** Messaging | `[x]` | §19.11 | Prefer IM live-verify | `message` edit/delete/pin + `sessions_send` run+wait (`2026-10-20k`/`n`/`p`) | V-P2-MSG-1, V-P2-MSG-2, V-P2-MSG-3 |
| **P2-D1** Media understand | `[x]` | §19.12 D1 | Artifacts (B11) | `view_image` jail + https SSRF + vision + PDF page-range (`2026-10-20l`/`n`/`p`) | V-P2-MEDIA-1 |
| **P2-E** Helpers | `[x]` | §19.13 | Stable allow-lists from A–C | `spawn_helper` child tool loop; depth 1; Q10 (`2026-10-20m`/`n`) | V-P2-AGENT-1, V-P2-AGENT-2 |
| **P2-D2** Media generate | `[x]` | §19.12 D2 | Privacy Mode (§19.4) | OpenAI Images + async job / `wait:true` + Owner/Privacy/cap (`2026-10-20o`/`p`) | V-P2-MEDIA-2, V-P2-MEDIA-3 |
| **P2-E2** Harness sub-agents | `[x]` | §19.13 E2 | P2-E `[x]` | `LocalMeshSubmitter`+`Agent` children; `task` caps; `spawn_helper` via task (`2026-10-20s`) | V-P2-AGENT-3 |
| **P2-E3** Parent Agent | `[x]` | §19.13 E3 | P2-E2 `[x]` | Parent `Agent.run`; Home Session + full ToolRegistry; `runTurn` fallback (`2026-10-20t`) | V-P2-AGENT-4 |

**Ship order:** P2-A → P2-B → P2-C → P2-D1 → P2-E → P2-D2 → P2-E2 → **P2-E3**. Owner MAY pull E2/E3 forward.

**Package touch points (at code time):** `packages/harness-host` (policy + parse), `packages/daemon` (turn-service, schedule, standing-orders, message dispatch), `packages/protocol` (additive schemas), Settings desktop/mobile surfaces, Doctor issues.

**Soft risks (owning epic):**

| Risk | Epic | Mitigation |
|------|------|------------|
| Heartbeat stampede / cost | P2-B | Min interval + Doctor warn (V-P2-AMB-3); silent OK; tool/round caps |
| Helper privilege escalation | P2-E | Inherit origin; reduced allow-list; depth 1 (V-P2-AGENT-1/2) |
| Sub-agent stampede / cost | P2-E2 | maxSubagents + parallel pool + account caps; Doctor; refuse-all on over-cap (V-P2-AGENT-3) |
| Parent Agent streaming / honesty drift | P2-E3 | Keep TurnService preambles; `runTurn` rollback flag; golden home/schedule tests (V-P2-AGENT-4) |
| `message` spam / cross-account leak | P2-C | Bound target + same account only; grantable; Privacy Mode (V-P2-MSG-*) |
| Patch path escape / huge diff | P2-A | Jail + size cap (V-P2-EDIT-1) |
| Media generate egress / bill shock | P2-D2 | Owner opt-in; Privacy Mode; rate caps; attended default (V-P2-MEDIA-2) |

---

## 2. Repo layout (target)

Per Design §11.4 (monorepo sketch) + Design §11.2 (package naming). Concretely:

```text
EnvoyHome/
  design_doc/                         (this file + Design + Memory + agreed + analysis)
  apps/
    desktop/                          # Tauri thin UI; hosts/supervises daemon
  packages/
    protocol/                         # @envoyhome/protocol — types, JSON schemas, validator (Design §3 + Appendix A)
    daemon/                           # @envoyhome/daemon — control plane
    channel-api/                      # @envoyhome/channel-api — Channel SDK (Design §5.3)
    harness-host/                     # @envoyhome/harness-host — harness plugin loader + envoy-harness integration
    providers/                        # @envoyhome/providers — model-provider interface + llama.cpp + openai-compat adapters + mix router (B6)
    workflows/                        # @envoyhome/workflows — static workflow executor + YAML loader
    memory/                           # @envoyhome/memory — MemoryFacade + StandingStore + L4 FTS + LearnQueue + CompactDiary
    smarthome/                        # @envoyhome/smarthome — HA REST/WS + MQTT clients + ha_*/mqtt_* tool bundle (B14)
    test-utils/                       # @envoyhome/test-utils — flushLoop() + __resetActiveXForTests() (conventions R8)
  plugins/                            # channel-telegram (+ discord/slack/feishu/dingtalk/wecom); channel-mqtt, channel-homeassistant
  scripts/                            # ci, peers-check, fetch-peers, ha-c4-diff, doctor-*, smoke-rpc
  tests/manual/                       # v1 Design §10.2 smoke checklist (bar 4)
  .github/workflows/ci.yml
  .npmrc                              # confirm-modules-purge=false (see R9 note below)
  package.json                        # workspace root: scripts + typescript devDep
  pnpm-workspace.yaml                 # packages + apps + plugins globs + `overrides:` sibling links
  pnpm-lock.yaml                      # committed
  tsconfig.base.json                  # extended by every package tsconfig.json
  AGENTS.md                           # project-local instructions for AI agents
  LICENSE                             # Apache-2.0 (Q6 closed)
  README.md
```

Each package has its own `tsconfig.json` (`extends: ../../tsconfig.base.json`, `rootDir: src`, `outDir: dist`) so that `tsc -p tsconfig.json` — which every package `build`/`lint` script runs — actually resolves.

**Peer workspace links** (do not fork, do not republish under `@envoyhome`):

```text
../EnvoyMesh        → @envoymesh/* (protocol, host-connect, reuse-host, network, identity, pairing URI)
../envoy-harness    → @envoymesh/envoy-harness (default harness)
../EnvoyCoder       → reference patterns (Settings chrome, host-bridge, host transport); not a linked dep
```

**Sibling packages are NOT workspace members, and are not on the public npm registry** (registry 404 for `@envoymesh/protocol` and `@envoymesh/reuse-host`), so `workspace:*` cannot resolve them (`ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`). They are linked explicitly:

- each direct dependency uses `link:` in its `package.json`;
- `pnpm-workspace.yaml` carries an `overrides:` block with the same `link:` paths, so **transitive** `@envoymesh/*` resolution (declared by the `@envoymesh/*` packages themselves) does not fall through to the registry.

This mirrors `../envoy-harness/pnpm-workspace.yaml`, which documents the same reason.

**Bash gate before every PR:** `./scripts/peers-check.sh` verifies, for every linked sibling package, that the repo exists, the linked package directory exists, and the checkout is on the expected branch (`ENVOYHOME_PEER_BRANCH`, default `main`). It is **fail-closed**: any problem exits 1, and neither `scripts/ci.sh` nor CI masks it.

**Non-interactive installs (R9 interaction):** pnpm aborts a non-interactive modules-directory purge (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`) and suggests `CI=true` as the workaround — which R9 forbids before `pnpm install`. `.npmrc` therefore sets `confirm-modules-purge=false` (pnpm's own second option). CI additionally runs `unset CI` before install, because GitHub Actions exports `CI=true` for every step.

---

## 3. Build Stages (B0–B14)

Stages are roughly sequential. Where two stages can run in parallel, it's marked **[parallel-eligible]**. Every stage lists: scope → deliverable → acceptance → verification IDs it turns green → risk notes.

### B0 — Workspace bootstrap `[x]`

**Scope:** Repo skeleton, tooling, CI. **No product code.**

| Item | Detail |
|------|--------|
| Deliverable | Workspace root: `package.json` (scripts: `peers:check`, `build`, `lint`, `test`, `dev:daemon`, `ci`; `typescript` devDep), `pnpm-workspace.yaml` (globals + `overrides:` sibling links), `.npmrc` (`confirm-modules-purge=false`), `pnpm-lock.yaml`, `tsconfig.base.json`. Per-package `tsconfig.json` for all **9 target packages** (8 exist at B0; `smarthome` lands in B14) + `apps/desktop`, each extending `../../tsconfig.base.json` with `rootDir: src` / `outDir: dist`. Each package `package.json`: `build` (`tsc -p tsconfig.json`), `lint` (`tsc -p tsconfig.json --noEmit`), `test`, and stub `src/index.ts`; sibling deps declared with `link:`. `packages/test-utils/` (R8 helper surface; bodies land in B6). `scripts/{build,lint,test,ci,peers-check,fetch-peers}.sh`. Root `.github/workflows/ci.yml`. `AGENTS.md`. |
| Acceptance | `env -u CI pnpm install` succeeds (requires the siblings — see below); `pnpm -r build` exits 0 and emits `dist/` per package; `pnpm -r lint` exits 0; `pnpm -r test` exits 0; `pnpm dev:daemon` exits 0; `./scripts/peers-check.sh` exits 0 when the siblings are present and on `main`, and exits **1** when one is missing or mis-branched (`--warn-only` is local-only and never used in CI); CI runs `peers-check` **unmasked**. |
| Verification IDs | (none yet — infra) |
| Risk | **Sibling linking.** Do **not** use `workspace:*` for `@envoymesh/*`: they are not workspace members and not on npm, so it fails with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`. Use `link:` direct deps **plus** an `overrides:` block for transitive resolution (the envoy-harness pattern). **R9 interaction:** pnpm needs `confirm-modules-purge=false` (or it aborts non-interactively and tells you to set `CI=true`, which R9 forbids); CI must `unset CI` for the install step because GitHub Actions exports it. **Bin linking:** `@envoymesh/reuse-host` and `@envoymesh/envoy-harness` ship `bin` entries, so pnpm `chmod`s files inside the sibling checkouts — those checkouts must be writable. |
| Depends on | — |

### B1 — Protocol package (`@envoyhome/protocol`) `[x]`

**Scope:** TypeScript types + JSON schemas for **all** `home.*` RPCs and events from **Design Appendix A (including A.9, the memory/profile/learn schemas)** and every method catalogued in Design §3.2 / Design §3.4. No daemon.

| Item | Detail |
|------|--------|
| Deliverable | `packages/protocol/src/{version,errors,schema,methods,events,envelope,index}.ts` + `test/validate.test.ts` (**25 tests**, including a check that the catalogue's declared `scope` for every method equals Design §4.3.1 — the authorization table and the code cannot drift). **Schemas are data in `methods.ts`/`events.ts`, not separate `schemas/*.json` files** — one typed catalogue the validator's `assertSupportedSchema` can walk, so an unsupported keyword fails a test instead of being silently ignored at runtime. `validator.ts` is `schema.ts` (a dependency-free JSON-Schema-subset validator: Plan B1's "Ajv or equivalent", with no new install dependency), and `envelope.ts` layers numeric-`id` preservation and `messageKey`/`messageValues` tolerance over the adopted `@envoymesh/protocol` shapes. `version.ts` exports `PROTOCOL_API_VERSION` (Design §3.7). |
| Acceptance | **Met — all 25 tests green.** Every method in **Design §3.2 + Design §3.4 + Design Appendix A** has a schema; the test **parses the Design doc itself** to derive that set, so a method documented without a schema fails CI (this is the mechanism behind V-PROTO-1, and it is what previously let six ops methods sit outside Appendix A). Same for the Design §3.5 event set — the first run caught `home:learn-rejected-full` missing from that table, and it was added. `home.hello` round-trips including `protocolApiVersion`; `home.updateProfile.set` rejects append-shaped and nested values; `home.sendMessage` requires `accountId`/`sessionId`/`text`; `home.getArtifactUrl` clamps TTL (`clampArtifactTtlSec`, clamp not reject); `PENDING_LEARN_KINDS` is asserted equal to Design A.9's enum; envelope round-trips preserve a numeric `id`, and every response with both/neither `result`/`error` is rejected. |
| Verification IDs | **V-PROTO-1** (schema catalogue + envelope round-trip). |
| Risk | **Package entry points.** `main`/`types` here now point at `dist/` (the first package to do so). The other seven still point at `src/index.ts`, which cannot be *executed* under Node — a `.ts` entry whose relative imports use `.js` specifiers does not resolve. Nothing imports across packages at B0, so this is latent, but **each package must make the same switch in the stage that first gives it content**, and B2 will be the first consumer. **One compatibility mechanism only (Design §3.7):** additive methods/fields are discovered via `home.hello.methods[]` and need no bump; **breaking** changes bump `PROTOCOL_API_VERSION`. Do **not** add a protocol-level `apiVersion` parallel to the plugin-manifest `apiVersion`. The three `V-MEM-*` IDs this stage used to claim belong to B5 and have been moved there. |
| Depends on | B0 |

### B2 — Daemon skeleton + transport `[x]`

**Scope:** `@envoyhome/daemon` WS host + HTTP hatch + loopback auth gate. No accounts/memory/harness yet — just plumbing.

| Item | Detail |
|------|--------|
| Deliverable | `packages/daemon/src/{host,http,router,auth,events,logger,claim}.ts`; `bin/envoyhome-daemon.ts`; `daemon.json` loader (instanceId, ports 4780/4781, publicBaseUrl, `stateSchemaVersion`). **Daemon claim file** (`claim.ts`): publish `{pid, port, instanceId, startedAt}` on start and clear it on graceful stop, so the Tauri supervisor can distinguish "our daemon answers on 4780" from "something else holds 4780" — EnvoyCoder precedent `apps/desktop/src/daemon/lock.ts` (`DaemonDescriptor` with `stale`/`running` states). Implements `home.hello`, `home.health`, `home.subscribe`, `home.meshStatus` (returns `{kind: "no-node"}` stub), `home.shutdown`, `home.getDaemonLog`. WS is served on **4780 at path `/ws`**; HTTP hatch is **4781** with `GET /health` (Design §2.4). `POST /v1/inbound` with Bearer auth (Appendix A.8) but routes to a no-op until B5. |
| Acceptance | Loopback `home.hello` works without token and returns `protocolApiVersion` + `methods[]`; remote WS without `?token=` returns `envoyhome.auth: missing_token` and closes; **`on` before authentication is refused on both transports (Design §3.3.1 rule 3)**; `home.subscribe` dedupes events; `home.shutdown` is graceful. |
| Verification IDs | V-RPC-1, V-RPC-2, V-RPC-5, V-SEC-12. |
| Risk | **WS RPC timeout must exceed runtime retry budget** (memory: 30s default, 120s long-running). Wire the timeouts up-front — retrofitting is painful. Use the family envelope from **`@envoymesh/protocol`** (`json-rpc-wire.ts`), hosted via `@envoymesh/reuse-host`; the types are **not** declared in `reuse-host`. Do not invent a second wrapper, and do not re-declare the types. |
| Depends on | B1 |

### B3 — Accounts + path sandbox `[x]`

**Scope:** On-disk layout per Design §4.2; accounts/bindings CRUD; path jail. **Memory is the foundation for isolation — do this before any harness/channel work.**

| Item | Detail |
|------|--------|
| Deliverable | `packages/daemon/src/{accounts,bindings,fs-jail,home-paths,security-corpus}.ts`; `accounts/<id>/{profile.json,MEMORY.md,memory,COMPACT.md,learns,sessions,files/{documents,output,knowledge},skills,approvals,grants}` skeleton (Design §4.2); `share/`; `home.listAccounts`, `home.createAccount`, `home.updateAccount`, `home.deleteAccount`, `home.listBindings`, `home.setBinding` (**both** the `senderId`+`channel` and the `deviceId` forms), `home.removeBinding`. Sandbox resolver rejects `..`, absolute paths outside root, Windows `C:\…` when root is POSIX, null bytes, symlinks-out-of-jail (do not follow). **`safeJoin` and `homePaths(stateDir)` are the two chokepoints** — every on-disk path resolves through `homePaths`, mirroring EnvoyCoder's `coderPaths`. B14 adds the third (`resolveObject`). |
| Acceptance | V-SEC-1..4 pass; device bindings are daemon-owned and owner-scope (the client cannot supply its own); security corpus has a fixture-driven test list (Appendix C.3); a binding cannot silently redirect to a different `accountId`. |
| Verification IDs | V-SEC-1, V-SEC-2, V-SEC-3, V-SEC-4. `V-SEC-5`/`V-SEC-8` (grants) belong to B6 and `V-SEC-6` (Settings) to B12 — they cannot pass here because this stage has no approval gate and no UI. `V-SEC-7` is owned by B4 (it needs a paired device). |
| Risk | **Path-traversal regressions come back when adding new tools** — make the resolver one chokepoint, not sprinkled. Treat "shared skill folder" the same way: per-account overlay only. **Device bindings are the account-isolation control for paired phones** — a missing `(deviceId → accountId)` check reintroduces the Design §3.3 ambiguity; fail closed with `envoyhome.account_not_bound`. |
| Depends on | B2 |

### B4 — Pairing + mesh hosting `[x]`

**Scope:** Embed `@envoymesh/network` so the daemon **is** the hosting peer (Design §2.3). Pairing mint/revoke/forget. Artifact signing helper (no handler yet — that's B11).

| Item | Detail |
|------|--------|
| Deliverable | `packages/daemon/src/{pairing,mesh-host,artifact-signer,doctor-mesh}.ts`; `home.mintPairing` (loopback-only, rate-limited, optional `accountIds`), `home.listPairedDevices`, `home.revokePairedDevice`, `home.forgetPairedDevice`, `home.setDeviceAccounts`; device→account binding enforcement for `home.openSession`/`home.sendMessage` (Design §4.1, `envoyhome.account_not_bound`); `home.meshStatus` returns `{kind: "hosting"\|"attached"\|"no-node"}`; `doctor` flags missing `DEBUG=libp2p:circuit-relay*` in production environments. |
| Acceptance | Phone dialing the hosting peer reaches `home.hello`; a **foreign / unpaired mesh peer is refused before dispatch**; a device bound to `alice` cannot send a turn for `bob`; a zero-binding device reaches only the Design §4.1 rule-4 allow-list; revoke drops the live session; a code minted by another product (`app=EnvoyDev`) is refused at pair time via `pairingAppMismatch`. |
| Verification IDs | V-RPC-3, V-RPC-4, V-SEC-7, V-P2-MESH-1, V-P2-MESH-2. |
| Risk | **Reuse `@envoymesh/network`; do not re-derive its relay handling.** The three failure modes this row used to describe are already implemented upstream: `relay:created-reservation` on the transport's `ReservationStore` (`packages/network/src/index.ts:1863,4753-4764`), hub self-reserve via `addRelay(pid, "configured")` (`:2123,2262`), and explicit post-`addRelay` reservation verification (`:2308`) — note `hintDialTimeoutMs` is **not** a symbol in EnvoyMesh, so do not "bump" it. What B4 must add is the *EnvoyHome-owned* concerns: device-credential authz on the mesh transport (Design §3.3.1), and **dual-mode port/mDNS contention** when hosting while attached to a local EnvoyMesh node (Design §2.3) — pin listen ports, disable duplicate mDNS advertisement. |
| Depends on | B2, B3 (bindings + secrets dirs). `home.setDeviceAccounts` and binding enforcement depend on B3. |

### B5 — Memory facade L1–L3 `[x]`

**Scope:** `@envoyhome/memory` — StandingStore + MemoryFacade + tools. L0 transcript, L1 profile, L2 MEMORY.md, L3 daily. **No L4, no flush, no LearnQueue yet** — those are B8.

| Item | Detail |
|------|--------|
| Deliverable | `packages/memory/src/{standing-store,memory-facade,profile,notes,writer-lock,recall-fts,external-reload,bootstrap-inject}.ts`; `home.getProfile`, `home.updateProfile` (Appendix A.9 supersede-by-key); `home.recall` (keyword/FTS over L2+L3, account-scoped, **CJK-capable tokenizer**); `home.forget`; tools `profile_get`, `profile_update`, `remember`, `recall`, `forget`. Bootstrap inject enforces the **exact** caps of Memory Design §4.2 (L1 4000 / L2 20 000 / L3 20 000 chars — OpenClaw-aligned) and adds the **fixed duty line** when any standing inject is truncated. **Per-account writer lock** at `accounts/<id>/memory/.lock` (or an in-process mutex) — not a `memories/` directory, which does not exist in Design §4.2. **External edit reload** by mtime/hash before inject and before write. |
| Acceptance | Cross-account recall/forget denied; refresh-after-write works in same session; **V-MEM-11's interleaving test lives here** (concurrent flush + remember cannot corrupt MEMORY.md); truncation flag visible in `home.listMemory` (`truncated: true`); a **Chinese query matches Chinese note content** (V-MEM-13); a rotated `memory/compact/*.md` diary is **not** returned by `recall` as an L3 daily note. |
| Verification IDs | V-MEM-1, V-MEM-3, V-MEM-4, V-MEM-5, V-MEM-7, V-MEM-10, V-MEM-11, V-MEM-13, V-MEM-17, V-MEM-18. |
| Risk | Soft loss if model skips `recall` — settings UI must show pending LearnQueue so user can spot it. StandingStore vs L5 backend ownership boundary — keep profile.json **and L2/L3** core-owned; a backend may *read* L2/L3 but must not become their writer (Memory Design §3/§5.3 conflict, resolved in §5.3). **`recall` is FTS-only in v1**, and SQLite FTS5's default tokenizer does not segment CJK — use the `trigram` tokenizer (Hermes precedent: `messages_fts_trigram`) because `preferred_language: zh` is a first-class locale in Design A.9. |
| Depends on | B3 (needs accounts dir layout) |

### B6 — Providers, harness, chat turn, approvals `[x]` **[parallel-eligible with B7]**

**Scope:** `@envoyhome/providers` (model providers + mix routing); harness plug-in loader; TurnContext; chat RPCs; approval/**grant** gate. Default harness = `envoy-harness`. This stage owns `@envoyhome/providers` — no other stage does.

| Item | Detail |
|------|--------|
| Deliverable | `packages/providers/src/{provider,llama-cpp,openai-compat,mix-router,usage}.ts` + `home.listProviders`, `home.setProvider`, `home.removeProvider`, `home.setProviderSecret` (write-only secrets, Design A.6). `packages/harness-host/src/{loader,context,policy,approval-sink,provider-handle,validator,turn}.ts`; `home.listHarnesses`, `home.setHarness`, `home.openSession`, `home.sendMessage`, `home.cancelTurn`, `home.getTranscript`, `home.listSessions`, `home.listApprovals`, `home.answerApproval`, `home.listGrants`, `home.revokeGrant`; turn pipeline router (intent/rules → static-workflow-or-harness); events `home:turn-started`, `home:turn-delta`, `home:turn-finished`, `home:approval-needed`, `home:approval-resolved`. **Durable approvals + grants (Design §4.4):** persisted per account, `expiresAt` TTL (default 600 s), expiry ⇒ **deny**, unknown turn identity ⇒ **deny**, `scope: "always"` writes a grant. `provider_handle` mediates model calls so product API keys stay in the daemon; CLI harnesses that need their own keys are documented ("uses Anthropic key in harness env"). Enabling a non-built-in harness requires explicit Settings confirm (manifest flag). Test helpers `@envoyhome/test-utils` (`flushLoop`, `__resetActiveXForTests`) get their bodies here — this is R8's first consumer. |
| Acceptance | Envoy-harness turn under account A; sandbox write outside `accounts/<id>/files/` fails; exec without approval blocked when policy=ask; harness started for account A cannot open account B's `sandbox_root`; a **non-built-in harness cannot be enabled without the explicit confirm flag**; a local-only turn runs with no cloud provider configured; `llama.cpp ↔ openai-compat` swaps via `home.setProvider` + `home.setModelMode`; a privacy-tagged intent stays local in `mix`; an expired approval resolves as **deny**; an unattended `exec` with no grant is denied and with a matching grant is allowed. |
| Verification IDs | V-HAR-1, V-HAR-2, V-HAR-3, V-HAR-4, V-HAR-5, V-HAR-6, V-LLM-1, V-LLM-2, V-LLM-3, V-LLM-4, V-LLM-7, V-LLM-8, V-LLM-9, V-SEC-5, V-SEC-8. |
| Risk | **Pre-loop asserts must persist failures** — sanity checks at function head bypass the loop try-catch and silent-break. Move them inside the try-catch. **Watchdog signals OR** (log parser + direct probe). **Cap checks inside iteration**, not before. **Allow-list is the contract** for any "send any intent" transport routed through a validator gate. **Approvals must be durable, not in-memory** — a restart must not lose a pending question or resurrect a stale allow (this is the HomeClaw failure mode we are explicitly not copying). |
| Depends on | B3 (sandbox + bindings), B5 (memory inject reads), B2 (event bus) |

### B7 — Channel SDK + Telegram demo `[~]` **[parallel-eligible with B6]** · first-party IM epic `[ ]`

**Scope:** `@envoyhome/channel-api` package; in-process plugin loader; sidecar spawner; Telegram reference plugin. **Follow-on (post-mobile):** Discord, Slack, Feishu/Lark, DingTalk, WeCom — same contract (Design §5.0).

| Item | Detail |
|------|--------|
| Deliverable | `packages/channel-api/src/{manifest,context,emit-inbound,outbound,loader,sidecar}.ts`; `plugins/channel-telegram/` (Telegram Bot API: DM, send, edit, react, media); `home.listChannels`, `home.enableChannel`, `home.disableChannel`, `home.getChannelStatus`, **`home.setChannelConfig`** (the enable-flow write path for every channel, including Telegram — Design A.6). Plugin `ChannelContext` deliberately omits sandbox roots, other accounts, model keys, mesh private keys. `emitInbound` is the **only** way into the brain; daemon enforces `accountId` from binding — plugin cannot spoof. `ChannelContext.registerSources` (Design §5.3.2) records a plugin's inventory so an unregistered `sourceId` is dropped before account lookup (Design §5.7.3). **No `actuate` capability exists** — an event-source plugin is configured with a read-only credential and its `outbound` is notification-only. Sidecar presents daemon API key; rate-limited to localhost by default. Version skew: plugin `apiVersion` ≤ daemon max else refuse enable with doctor issue `channel.api_version`. Test double: `@envoyhome/channel-fake` (in-tree, in-memory emit/send). |
| Acceptance | Telegram demo + HTTP hatch share one inbound/outbound contract; unknown sender denied/paired; outbound cannot target another account's thread by spoofing `rawRef`; disable channel stops intake; fake channel round-trip without Telegram; sidecar using only `/v1/inbound` completes a text turn with API key; plugin cannot call harness or read `accounts/b/...` via `ChannelContext`. |
| Verification IDs | V-CH-1..9. |
| Risk | **Plugin lifecycle vs daemon restart** — store plugin state per `channelAccount` and survive restart. Sidecar failures must not orphan the in-process plugin list (mark unhealthy, never silently fail closed). |
| Depends on | B3 (bindings) |

### B8 — Memory depth (L4 + LearnQueue + flush + compact) `[x]`

**Scope:** Session FTS, LearnQueue (one per account), pre-compaction flush, consolidate, COMPACT.md.

| Item | Detail |
|------|--------|
| Deliverable | `packages/memory/src/{session-index,learn-queue,flush,consolidate,compact-diary,taint,provenance}.ts`; tool `session_search`; `home.compactMemory`, `home.listPendingLearns`, `home.acceptLearn`, `home.rejectLearn`; events `home:learn-proposed`, `home:memory-compacted`. Session FTS rows live/die with session retention (same-job purge). Background review defers when local main model is busy (no GPU fight). **Flush per Memory Design §8.1:** L3 allowed only when `trust ∈ {owner,agent}` AND under cap; L2 only if `trust ∈ {owner,agent}` AND under cap; L1 and L7 always → PendingLearn; `untrusted` (incl. every `event-source` turn) → PendingLearn or drop. COMPACT.md rotates (keep last **20 entries or 20 000 chars**, whichever first; older under `memory/compact/`). Provenance on every flush/consolidate/learn write. **PendingLearn cap: 50 per account, expire after 30 days** (Memory Design §4.2). |
| Acceptance | Cross-account deny; flush runs before compact when enabled, skip does not block; one LearnQueue per account; accept refreshes all sessions; external MEMORY.md edit reloads before inject (no silent clobber); skill unchanged until `acceptLearn`; background review defers when local model busy; rotated `memory/compact/` archives are excluded from the L3 recall corpus. |
| Verification IDs | V-MEM-2, V-MEM-6, V-MEM-8, V-MEM-9, V-MEM-12, V-MEM-14, V-MEM-15, V-MEM-16, V-MEM-19, V-MEM-20, V-MEM-21, V-LEARN-1, V-LEARN-2, V-LEARN-3. (`V-UX-MEM-1` is a Settings screen → B12.) |
| Risk | **Concurrent flush + remember must not corrupt MEMORY.md** — single writer lock per account is the contract; test interleavings explicitly (the lock lands in B5, the flush/consolidate writers here). **Pending learn fatigue** — coalesce near-duplicates (same kind + similar diff hash) while queued. **Tainted/untrusted channel content → pending only**; never auto-promote to L1/L2. **A backend must not append to L2/L3** (Memory Design §3 vs §5.3): the core owns those paths; a backend may read them. |
| Depends on | B5 |

### B9 — Static workflows (matcher + DAG executor) `[x]` **[parallel-eligible with B10]** · V-DAG-4 live model `[ ]`

**Scope:** Static-workflow **DAG** executor + YAML loader + global/overlay + authoring RPCs. Design §7. Product name **Workflow**; linear `steps[]` compiles to a single path.

| Item | Detail |
|------|--------|
| Deliverable | `packages/workflows/src/{loader,executor,matcher}.ts` (+ step helpers); `home.listWorkflows`, `home.getWorkflow`, `home.reloadWorkflows`, `home.putWorkflow`, `home.removeWorkflow`, `home.setWorkflowEnabled`, `home.validateWorkflow`, `home.runWorkflow`. Load order: global `workflows/*.yml` first, then `accounts/<id>/workflows/*.yml` overlays (same `id` replaces global). Graph: `nodes`+`edges`+optional `when`/`join`; cycles fail `workflow.cycle`. `llm_fill` / `llm_summarize` are narrow calls — not open tool loops — and go through the **same `provider_handle` + `approval_sink`** as a harness turn (Design §6.1), so a workflow's `tool` node is subject to Design §4.3 risk tiers exactly like a harness tool call. |
| Acceptance | Keyword match → workflow (no free tool loop); unmatched → harness; tool nodes sandboxed+§4.4; cycle reject; conditional branch; `join: all`; linear YAML still loads; put/validate/test-run from Settings. |
| Verification IDs | V-DAG-1, V-DAG-2, V-DAG-3, V-DAG-4, V-DAG-5, V-DAG-6, V-DAG-7, V-DAG-8. |
| Risk | **The scheduler is new here.** `match.schedule` runs unattended with no turn text, so it must not depend on keywords; `match.event` fires on a **registered** object (Design §5.7.3) and its rendered text is untrusted. **There is still no intent classifier in v1** (Design §8.3, Q3 closed), so `match.keywords` remains the only text trigger — do not write a matcher that requires `match.intents` to be produced by a model, or V-DAG-1/2/4 are unreachable. Keep the matcher conservative: a positive match wins, otherwise the harness. Conditions are static expressions only — never a model-picked next node. |
| Depends on | B3 (sandbox), B5 (memory reads), B6 (turn pipeline routes here; `provider_handle` + `approval_sink`) |

### B10 — Skills (verify gate) `[x]` **[parallel-eligible with B9]**

**Scope:** AgentSkills / SKILL.md loader with progressive disclosure; verify/review gate before enable.

| Item | Detail |
|------|--------|
| Deliverable | `packages/daemon/src/skills.ts` + `skill-remote.ts`; `home.listSkills`, `home.searchClawHubSkills`, `home.installSkill` (`source: "path"\|"clawhub"\|"url"`), `home.verifySkill`, `home.removeSkill`. Catalog → load body → `references/` on demand. Operator-installed skills work from day one; agent-authored skill create/patch/delete goes through PendingLearn (B8). |
| Acceptance | Install + verify before skill tools available; verified=false skills cannot be loaded into tool list (V-SKILL-1). |
| Verification IDs | V-SKILL-1. |
| Risk | Skill bundles often pull deps that try to `exec` — verify gate must lint for exec/network capability before enable. |
| Depends on | B6 (turn pipeline exposes tools), B8 (skills patch goes through LearnQueue) |

### B11 — Artifacts + signing `[x]`

**Scope:** Artifact URLs + handler + path-jail recheck at serve time.

| Item | Detail |
|------|--------|
| Deliverable | `packages/daemon/src/{artifacts,artifact-handler}.ts`; `home.listArtifacts`, `home.getArtifactUrl` → `{ url, expiresAt }`. URL = `{publicBaseUrl}/artifacts/{accountId}/{token}`; token = base64url(payload) + `.` + base64url(HMAC-SHA256), where `payload` is the **canonical JSON (Design §4.4)** of `{accountId, expUnix, path}` — **never** a `\|`-delimited string that a consumer has to split (a `\|` inside `path` makes parsing ambiguous). Default TTL 3600s, max 86400s. Handler verifies sig, exp, and that the resolved file is under `accounts/<accountId>/files/`. **No unsigned routes in production builds.** |
| Acceptance | Replay after TTL → 403; a tampered `accountId` or `path` fails signature verification; long artifact → summary + openable URL on phone; unsigned path → 404 in production builds. |
| Verification IDs | V-OUT-1. (`V-RPC-2`'s tokenless-refusal case also exercises this handler, but it is owned by B2; this stage previously mis-cited it as V-SEC-3, which is actually "unknown channel identity → pairing or deny".) |
| Risk | `publicBaseUrl` misconfigured (LAN only when phone is on LAN, public URL behind reverse proxy when off-LAN) — Settings advanced exposes this; Doctor warns if private bind but `publicBaseUrl=public`. |
| Depends on | B3 (sandbox), B4 (artifact-signer helper) |

### B12 — Settings UI (Tauri desktop) `[~]` **active epic**

**Scope:** `apps/desktop` Tauri shell hosting/supervising the daemon; full left-nav Settings chrome. Design §10.

| Item | Detail |
|------|--------|
| Deliverable | `apps/desktop/src/{app,nav,views/{accounts,account-detail,bindings,pairing,channels,approvals,models,harness,skills,workflows,memory,artifacts,doctor,advanced}}.tsx` (or svelte — match EnvoyCoder decision); pairing QR; device→account binding editor; WS client over the hosting peer (or LAN WS); `daemon.json` editor for advanced; **OS service control** (`home.getServiceStatus` / `installService` / `uninstallService` / `restartService`, Design A.1) surfaced on `advanced` (EnvoyCoder precedent: `SectionsService`). Settings reads the **RESOLVED** config (bundled + persisted), keeps the source-URI form, and never overwrites an unparseable settings file — **quarantine + report**, in the family's idiom (`../EnvoyCoder/apps/desktop/src/daemon/state-file.ts:1-20`). |
| Acceptance | V-UX-1..5 + V-UX-MEM-1 + V-SEC-6 pass: new account + channel bind without raw config edit; view/revoke pairings and pending approvals and grants in UI; Telegram enable + token via Settings only; Advanced shows ports 4780/4781 and publicBaseUrl and service state; Memory screen shows pending learns, exact caps, flush/review toggles and compact now. |
| Verification IDs | V-UX-1, V-UX-2, V-UX-3, V-UX-4, V-UX-5, V-UX-9, V-UX-10, V-UX-11, V-UX-12, V-UX-MEM-1, V-SEC-6. |
| Risk | **Persisted-wins-over-bundled path** must be tested explicitly ("Settings UI for merged-config features must read resolved, not persisted"). UI hints on classified errors, not regex of message — persist `lastErrorKind` (network\|proof-token\|other) alongside `lastError`. Don't render every error as plain red text. **Write settings atomically and quarantine rather than clobber** — a settings file is user data. |
| Depends on | All RPC stages B2–B11 (UI is thin wrapper around stable wire). The smart-home view is **added by the stage that builds it**, on top of this nav shell — naming it here would be a cycle, so this cell lists only real dependencies. |

### B13 — Doctor + HomeClaw migrate `[x]`

**Scope:** Doctor issues + fix; HomeClaw dry-run import path (Appendix B).

| Item | Detail |
|------|--------|
| Deliverable | `packages/daemon/src/doctor/{issues,fixes,migrations,homeclaw-import}.ts` (loader at `packages/daemon/src/doctor/index.ts`); `home.doctor`, `home.doctorFix`; `daemon.json` gains `stateSchemaVersion` and `migrations/` holds explicit on-disk migrations. Doctor categories: mesh (relay DEBUG env, mesh ports/mDNS contention in dual mode, `hintDialTimeoutMs` is **not** an EnvoyMesh symbol — check the real reservation state instead), channels (plugin `apiVersion` vs daemon max, manifest validity), accounts (orphaned dirs, device bindings pointing at deleted accounts), skills (exec/network capability unverified), memory (size drift vs the **Memory Design §4.2** caps, FTS orphan rows, LearnQueue depth), approvals/grants (expired rows, grants for deleted tools), ports/binding. Doctor dry-run prints planned copies without writing (`migrate.homeclaw.plan`) and reports which Appendix B sources were **absent**. |
| Acceptance | The Design Appendix C.2 every-PR rows for this stage pass; the Appendix B matrix is honoured, including the `users.json`-first rule and the "profile dir may be empty" case; dry-run reports missing sources; chat-import optional flag works. |
| Verification IDs | Doctor regression set (new IDs added as items emerge). **Not** V-MEM-17 — external-edit reload is owned by B5. |
| Risk | Doctor that "fixes" without diff confuses users — always show before/after. Migrate that imports chat history silently can leak PII — keep chat import **opt-in**. **Do not let migrate import HomeClaw's `allow_all` policy posture** (Appendix B). |
| Depends on | B3, B4, B5, B7, B8. Doctor does **not** wait on the final stage: the issue registry is extensible, so the smart-home hooks (`objects.json` drift, unregistered sources, stale actuation rows, write-credential warning) register themselves from the stage that builds them. A doctor that cannot run until the last stage exists is a doctor nobody runs. |

### B14 — Smart home (MQTT + Home Assistant) `[~]` **[parallel-eligible with B9; after B12 shell]** · live household `[ ]`

**Scope:** Design §5.7. The smart-home surface: a tool bundle, two `kind: "event-source"` channel plugins, example workflows, and §5.7.8 NL control (home-intent routing, bound-only inject, Home chat). **No core device model** (Design §5.7.1). Additive optional `purpose` on existing `home.openSession` only — no new method names. This stage exists because "home agent" without the home is a misnomer (Design §1.1, Design §1.3).

| Item | Detail |
|------|--------|
| Deliverable | `packages/smarthome/src/{ha-client,mqtt-client,object-resolver,safety-class,tools/{ha,mqtt},actuation-journal}.ts` — the `ha_*` (`ha_list_entities`, `ha_get_state`, `ha_list_services`, `ha_call_service`) and `mqtt_*` (`mqtt_subscribe`, `mqtt_read`, `mqtt_publish`) tools, each declaring its Design §4.3.2 tier **and** `idempotent`, and each taking a **resolved object handle** from `object-resolver` (never a raw `entity_id`/topic). `safety-class` implements Design §5.7.2 as data (object class + service deny list + script/scene/button indirection + MQTT allow-list + `neverUnattended`), defaulting unknown to safety-class. `actuation-journal` writes the intent record **before** dispatch and reconciles on restart (Design §5.7.7). `plugins/channel-mqtt/` + `plugins/channel-homeassistant/` as `kind: "event-source"` plugins with **read-only credentials**, `registerSources` inventory, and notification-only `outbound`. `home.listSources`, `home.setSourceBinding`, `home.removeSourceBinding`, `home.listActuations` (Design §3.4, A.3, A.5); `objects.json` registry; **`apps/desktop/src/views/smarthome.tsx`** — the object registry, unbound list, sharing/`neverUnattended` flags, actuation journal and credential warning, added to B12's nav shell (Design §10.1). Doctor hooks for `objects.json` drift, unregistered sources, stale actuation rows and the write-credential warning. Example workflows: morning brief (**`schedule` trigger**) and motion → notify (**`event` trigger**). |
| Acceptance | **V-HA-1..24** pass (V-CH-8/V-CH-9 belong to B7). Specifically: a topic/state event opens a turn **only** for the bound account and **only** for a source registered by that plugin instance; an unbound object opens none; **every** object access — reads included — goes through `resolveObject`, and a foreign object fails `envoyhome.object_not_bound`; actuation is `admin` and blocked when attended-with-no-answer; unattended actuation without a grant fails closed (`envoyhome.actuation_not_granted`); a broad grant is refused (`envoyhome.grant_too_broad`); the safety class is refused at creation **and** dispatch (`envoyhome.actuation_never_unattended`) and the whole Appendix C.4 corpus is denied; non-idempotent services are refused unattended; the journal has an intent record for every dispatch and reconciles `pending` records after a crash without re-issuing; Connections → Home Assistant or MQTT binds an unbound object, refuses `shared` on a presence class, and toggles `neverUnattended` without editing files (V-UX-6), and an actuation approval renders its **target summary** (V-UX-7); **§5.7.8** home-intent routing keeps `ha_*`/`mqtt_*` off general Chat unless home-related (V-HA-21), bound-only inject is capped (V-HA-22), Home chat (`purpose: "home"`) works (V-HA-23, V-UX-8), and ambiguous intent does not actuate (V-HA-24); object state reaches no store outside Design §5.7.4; tokens never surface in reads or logs; with the broker down a local turn still works and actuation fails closed with a classified error. |
| Verification IDs | V-HA-1 … V-HA-24, V-SEC-11, **V-UX-6, V-UX-7, V-UX-8** (smart-home screen, actuation Approvals, Home chat — owned here). |
| Risk | **Actuation is the highest-consequence tool call in the product.** Hence R13, the `admin` tier, the data-driven safety **class** (Design §5.7.2 — a regex was tried and withdrawn: it missed `alarm_control_panel.alarm_disarm`, garage/`cover.*`, `lock.open`, all MQTT, and every script/scene/button indirection), the resolver chokepoint for reads as well as writes, and the actuation journal. **Second: presence leakage** — motion/lock/camera state reveals whether anyone is home; Design §5.7.4 names every store, event turns are privacy-tagged local, and event bodies are untrusted input to the *tool gate* too. **Third: the plugin holds credentials** — an `event-source` plugin gets a **read-only** credential and its `outbound` is notification-only, because a plugin that can publish bypasses the gate entirely. **Fourth: scope creep into a hub** — do not grow a device model, a broker, or radio support in v1 (Design §5.7.1, Design §19.8). |
| Depends on | B3 (bindings, layout), B6 (tool catalogue + approvals/grants + risk tiers), B7 (Channel SDK + loader + `setChannelConfig`), B9 (workflows for automations), B12 (`smarthome` Settings screen) |

---

## 4. Verification ID index

Every verification ID from Design §3.6, §3.7, §4.5, §5.6, **§5.7.6**, §6.4, §7.3, §8.4, §9.6, §10.3, §19.6 and Memory Design §16, mapped to **exactly one** owning stage. One ID → one stage is the rule: if an ID needs work from two subsystems, the *later* stage owns it and the earlier one is listed as a dependency, not a co-owner.

| ID | Owning stage | Test fixture (initial) |
|----|--------------|------------------------|
| V-PROTO-1 | **B1** | schema catalogue complete; envelope encode/decode round-trip; sad-path rejections |
| V-RPC-1 | **B2** | `home.hello` returns `protocolApiVersion` + expected `methods[]` |
| V-RPC-2 | **B2** | remote WS without `?token=` refuses with `envoyhome.auth: missing_token` |
| V-RPC-5 | **B2** | `on` before auth refused; tokenless/foreign mesh session refused before dispatch |
| V-RPC-3 | **B4** | revoke drops the live paired connection |
| V-RPC-4 | **B4** | a code minted by another product is refused at pair time (`app` mismatch) |
| V-SEC-1 | **B3** | cross-account RPC/channel read denied |
| V-SEC-2 | **B3** | path-traversal corpus (Appendix C.3) |
| V-SEC-3 | **B3** | unknown channel identity → pairing or deny, never the agent |
| V-SEC-4 | **B3** | only `share/` is cross-account writable, with explicit policy |
| V-SEC-7 | **B4** | a device bound to `alice` cannot act for `bob`; zero-binding device hits only the rule-4 allow-list; same over mesh |
| V-SEC-5 | **B6** | unattended `exec` with no grant is denied |
| V-SEC-9 | **B6** | a `sensitive` tool result forces the turn local, or fails `envoyhome.privacy_local_unavailable` |
| V-SEC-10 | **B6** | a `null`/short-digest grant for an `admin`/`sensitive` tool is refused; the digest commits to object + desired state |
| V-SEC-8 | **B6** | matching unexpired grant permits unattended action without a prompt; expired ⇒ deny |
| V-SEC-6 | **B12** | Settings creates account + binding with no raw config edit |
| V-SEC-11 | **B14** | an account-scoped caller cannot read another account's object names (`home.listSources`, `getChannelStatus.unboundSources`) |
| V-SEC-12 | **B2** | the HTTP hatch resolves the account from a binding; a client-supplied `accountId` cannot open a turn for an unbound account |
| V-SEC-13 | **B12** (workspace; Design §4.2.1) | workspace path jail: no escape from `hostPath`; raw absolutes refused; unset ⇒ `workspace/…` fails |
| V-SEC-14 | **B12** (workspace) | workspace set/clear refused for non-Owner devices; household Owner (or loopback) may set any profile |
| V-SEC-15 | **B4** (Household Owner §4.1.1) | exactly one `ownerAccountId`; first account = Owner; delete Owner without transfer fails; transfer leaves one Owner |
| V-SEC-16 | **B4** | non-Owner device cannot Owner-scope; Owner-bound device can over mesh; `ownerTrusted` alone insufficient |
| V-SEC-17 | **B4** | member list/revoke own grants only; Owner may revoke any seat’s grant |
| V-SEC-18 | **B4** | member `updateAccount` own displayName/locale OK; `toolPolicy` Owner-only |
| V-SEC-19 | **B4** | Owner dual-bind refused (`owner_bind_exclusive`) |
| V-SEC-20 | **B12** | filesystem-root workspace only for Owner seat |
| V-SEC-21 | **B4** / **B5** | member paired memory `untrusted`; Owner-seat paired `owner` |
| V-CH-1 | **B7** | Telegram demo + HTTP hatch share one inbound/outbound contract |
| V-CH-2 | **B7** | unknown sender denied/paired |
| V-CH-3 | **B7** | outbound cannot target another account's thread via `rawRef` spoofing |
| V-CH-4 | **B7** | disable channel stops intake |
| V-CH-5 | **B7** | `@envoyhome/channel-fake` round-trip without Telegram |
| V-CH-6 | **B7** | sidecar `POST /v1/inbound` with API key completes a turn |
| V-CH-7 | **B7** | plugin cannot reach harness or `accounts/b/` via `ChannelContext` |
| V-CH-8 | **B7** | a `kind: "event-source"` plugin round-trips event → turn → notification on the published contract |
| V-CH-9 | **B7** | `home.setChannelConfig` refuses an undeclared key; a secret is never read back or logged |
| V-HAR-1 | **B6** | envoy-harness turn under account A |
| V-HAR-2 | **B6** | swap harness via `home.setHarness` (or documented restart) |
| V-HAR-3 | **B6** | write outside `sandbox_root` fails |
| V-HAR-4 | **B6** | exec without approval blocked when policy=ask |
| V-HAR-5 | **B6** | non-built-in harness cannot enable without the Settings confirm flag |
| V-HAR-6 | **B6** | harness for account A cannot open account B's `sandbox_root` |
| V-LLM-1 | **B6** | local-only turn with no cloud provider configured |
| V-LLM-2 | **B6** | swap llama.cpp ↔ openai-compat via `home.setProvider` + `home.setModelMode` |
| V-LLM-3 | **B6** | privacy-tagged turn (Design §8.3) stays local in `mix`; fails closed in `cloud` |
| V-LLM-4 | **B6** | `home.setProviderSecret` value never echoed in `home.listProviders` or logs |
| V-LLM-7 | **B6** | `prefer=attach` → `envoyhome.local_engine_independent`; `auto`/`spawn` registers Home-owned `envoyhome-local` on `:18792` (never Mesh `:18790`) |
| V-LLM-8 | **B6** | `home.enableOllama` fail-closed when down; registers `ollama` when healthy |
| V-LLM-9 | **B6** | Home spawn uses `:18792`; missing GGUF ⇒ `envoyhome.local_engine_no_model` |
| V-LLM-10 | **B6** | hardware probe recommends curated GGUF; `home.downloadLocalModel` installs under `local-engine/models/` |
| V-LLM-11 | **B6** | Spawn downloads GPU llama.cpp when NVIDIA present (Win CUDA / Linux Vulkan / Mac Metal); missing accel marker on NVIDIA re-downloads; `-ngl -1` when GPU offload |
| V-DAG-1 | **B9** | a matched keyword/rule trigger does not open a free tool loop |
| V-DAG-2 | **B9** | unmatched input falls through to the harness |
| V-DAG-3 | **B9** | a `tool` step's side effects are sandboxed and policy-gated |
| V-DAG-4 | **B9** | sample workflow runs on a small local model (nightly/local suite) |
| V-DAG-5 | **B9** | `schedule` trigger fires unattended without a model call; `event` trigger fires on a registered object change; two trigger classes rejected at load |
| V-DAG-6 | **B9** | cyclic graph rejected at load (`workflow.cycle`) |
| V-DAG-7 | **B9** | conditional `when` edge takes only the matching branch |
| V-DAG-8 | **B9** | `join: all` waits for every parent before the join node runs |
| V-MEM-1 | **B5** | no cross-account recall / forget |
| V-MEM-3 | **B5** | prompt authority ordering; supersede-by-key profile |
| V-MEM-4 | **B5** | bootstrap caps (L1 4000 / L2 20 000 / L3 20 000 — OpenClaw-aligned) enforced; Settings shows truncation |
| V-MEM-5 | **B5** | default `files` backend works with zero plugins |
| V-MEM-7 | **B5** | after `remember`, the same session sees the updated fact |
| V-MEM-10 | **B5** | truncated inject ⇒ recall/session_search duty line present |
| V-MEM-11 | **B5** | concurrent flush + remember cannot corrupt MEMORY.md (writer lock) |
| V-MEM-13 | **B5** | recall is keyword/FTS over L2+L3 only; **CJK query matches**; rotated `memory/compact/*` excluded |
| V-MEM-17 | **B5** | external MEMORY.md edit reloads before inject; no silent clobber (check inside the writer lock) |
| V-MEM-18 | **B5** | caps contract enforced (serialized-block budgets, `rawSoftCap` action, section-aware L2 builder); `listMemory` echoes budgets and reports L1 `truncated` |
| V-MEM-2 | **B8** | compact/flush cannot exec/network without grant |
| V-MEM-6 | **B8** | a backend cannot bypass LearnQueue for skills, and cannot become the L2/L3 writer |
| V-MEM-8 | **B8** | flush runs before compact when enabled; skip does not block compact |
| V-MEM-9 | **B8** | `session_search` works without an L5 backend |
| V-MEM-12 | **B8** | disabling the L5 backend leaves L1–L3 intact |
| V-MEM-14 | **B8** | session FTS rows are purged with session retention |
| V-MEM-15 | **B8** | background review defers when the local main model is busy |
| V-MEM-16 | **B8** | one LearnQueue per account; accept refreshes all sessions; over-cap is rejected with `home:learn-rejected-full` |
| V-MEM-19 | **B8** | `diffKey` coalescing; accepting against a moved base re-validates or fails `envoyhome.learn_stale` |
| V-MEM-20 | **B8** | backend containment: disable/delete/account-removal leave L1–L3 intact, purge derived documents, and cannot return another account's chunk |
| V-MEM-21 | **B8** | trust derivation: `event-source` ⇒ `untrusted`; `sensitive` result taints its spans even in an owner turn; accepted learns keep their origin's trust |
| V-MEM-22 | **B8** | model-aware inject: cloud vs local packages from `contextTokens` (Memory Design §4.2.1); turn uses route-resolved placement; `listMemory.injectProfiles` reports both |
| V-LEARN-1 | **B8** | skill unchanged until `acceptLearn` |
| V-LEARN-2 | **B8** | background review: skills always pending; L1/L2 pending by default |
| V-LEARN-3 | **B8** | provenance recorded on flush/consolidate/learn writes |
| V-SKILL-1 | **B10** | install + verify before skill tools are available |
| V-OUT-1 | **B11** | replay after TTL → 403; long artifact → summary + openable URL / mesh path |
| V-OUT-2 | **B11** | getArtifactContent opens cited workspace/… (jail); listArtifacts sandbox-only; stat-before-read 8 MiB |
| V-OUT-3 | **B11** | write_file echoes chip-ready normalized path; steer documents/output/knowledge |
| V-OUT-4 | **B11** | listSandboxEntries: sandbox tops + R3-effective workspace/; refuse share/ + inactive workspace; parent stays in root; entry cap |
| V-OUT-5 | **B11** | list_dir / search_files: read-tier builtins; **turn-profile jail only**; share/ refuse; search depth/visit/hit caps; fence + catalogue |
| V-OUT-6 | **B11** | web_search: DDG zero-config; Brave/Tavily key gate; attendedAllow; unattended grant; restricted deny; result cap |
| V-OUT-7 | **B11** | web_search browser fallback: Settings opt-in; Bing→Google; attended ask; caps; missing Chromium → install hint (no silent download) |
| V-OUT-8 | **B11** | browser control tool: Owner opt-in; Playwright managed session; SSRF; snapshot/act; attended ask; restricted/unattended gates |
| V-OUT-9 | **B11** | browser personal profile: Owner-only; ack; loopback CDP; never unattended; summary tag |
| V-OUT-10 | **B11** | browser remote profile: Owner-only; ack; cdpUrl+secret; never unattended; summary tag |
| V-UX-12b | **B9** | Mobile Schedules: `jobs` key; desktop parity badges/argChoices/receipts |
| V-CRON-7 | **B9** | updateSchedule name/spec/payload; workflow-synced refuse; no system payload |
| V-CRON-8 | **B9** | listScheduleReceipts capped receipts |
| V-CRON-9 | **B9** | chat schedule tool propose/confirm/list; confirm asks; propose no arm |
| V-CRON-10 | **B9** | system flush/review fire; ensureReviewJob when reviewEnabled |
| V-CRON-11 | **B9** | chat propose verbatim WHEN; refuse invented specs; confirm shows resolvedLocal |
| V-CRON-12 | **B9** | agentTurn payload fire with frozen prompt; elevated browser denied on schedule |
| V-AGENT-SCENARIO-1 | **B9** | Deterministic agent scenario catalogue (Schedule + General) green in daemon tests (`tests/agent-scenarios/`) |
| V-AGENT-SCENARIO-2 | **B9** | Optional live LLM soft-eval documented (`ENVOYHOME_AGENT_EVAL=1` → `scripts/agent-eval-live.mjs`); not a CI gate |
| V-UX-1 | **B12** | new account + channel bind without raw config edit |
| V-UX-2 | **B12** | view/revoke pairings, pending approvals, grants in the UI |
| V-UX-3 | **B12** | Telegram enable + token via Settings only |
| V-UX-4 | **B12** | Advanced shows ports 4780/4781, `publicBaseUrl`, service state |
| V-UX-5 | **B12** | Memory screen shows pending learns, exact caps, flush/review toggles + compact now |
| V-UX-6 | **B14** | Connections → Home Assistant or MQTT binds an unbound object, marks shared/read-only, toggles `neverUnattended` |
| V-UX-7 | **B14** | An actuation request appears in Approvals labelled as actuation and can be denied |
| V-UX-8 | **B14** | Home chat opens with `purpose: "home"` only when HA is configured+enabled; entry hidden otherwise; general Chat does not dump full HA inventory |
| V-UX-9 | **B12** | Workflows Diagram\|YAML dual editor round-trips; YAML remains put source of truth |
| V-UX-10 | **B12** | `home.draftWorkflow` / `home.draftWorkflowPrompt` draft-only (never write); optional `currentYaml` revise; Settings New/Edit Draft/Revise with AI; invalid/unknown-tool fail closed |
| V-UX-11 | **B12** | reusable LLM step templates list/put/remove; Add step ▾ + Save as step; runtime kinds stay closed |
| V-UX-12 | **B12** | Schedules authoring: Reminder/Workflow/Tool; list payloadKind + Workflow badge; putSchedule / confirm payload override |
| V-UX-MEM-1 | **B12** | Memory screen: view, pending, caps, compact, flush/review toggles, active backend |
| V-P2-MESH-1 | **B4** | phone path works with hosting only (no Social, attach not required) |
| V-P2-MESH-2 | **B4** | if attach is enabled, the dial target stays the hosting peer; dual-mode ports/mDNS do not collide |
| V-HA-1 | **B14** | an MQTT topic event starts a turn for the **bound** account only |
| V-HA-2 | **B14** | a Home Assistant state change does the same via `channel-homeassistant` |
| V-HA-3 | **B14** | reads need no approval; any actuation is `admin` and blocked when `ask` goes unanswered |
| V-HA-4 | **B14** | a workflow whose `tool` step actuates is subject to Design §4.4 — blocked unattended with no grant, never an approval bypass |
| V-HA-5 | **B14** | the safety list (unlock/garage/valve/gate/disarm) is not grant-satisfiable; such a grant is refused |
| V-HA-6 | **B14** | an event from an unbound object opens no turn and actuates nothing; it lists in Settings |
| V-HA-7 | **B14** | unbound object cannot be actuated/resolved; bound objects are household-scoped |
| V-HA-8 | **B14** | device state / entity names never auto-enter L1/L2/L3 |
| V-HA-9 | **B14** | HA/MQTT credentials never appear in `getChannelStatus`, `listChannels`, or logs |
| V-HA-10 | **B14** | broker down → local turn still works; actuation fails closed with a classified error |
| V-HA-11 | **B14** | broad grant refused for an actuating tool; a lamp grant cannot be replayed against a door |
| V-HA-12 | **B14** | grant expired/revoked between check and effect cannot actuate (CAS at dispatch) |
| V-HA-13 | **B14** | `sourceId` spoofing dropped before account resolution; no cross-account turn via a claimed id |
| V-HA-14 | **B14** | the resolver holds for reads — unbound/unknown fails `envoyhome.object_not_bound`; bound is household-scoped |
| V-HA-15 | **B14** | a read-only-credential plugin cannot change state via `outbound`; write credential raises Doctor `channel.write_credential` |
| V-HA-16 | **B14** | non-idempotent service refused unattended; crash ⇒ `unconfirmed`, never re-issued; duplicate delivery does not double-apply |
| V-HA-17 | **B14** | presence reaches no L4 row, COMPACT.md, artifact, foreign `turn-delta` subscriber, notification, or default log |
| V-HA-18 | **B14** | event turns are privacy-tagged: local in `mix`, fail closed in `cloud` without a local provider |
| V-HA-19 | **B14** | the whole Appendix C.4 required-deny corpus is denied |
| V-HA-20 | **B14** | approvals state their target; a mismatched `argsDigest` answer is rejected |
| V-HA-21 | **B14** | general Chat omits `ha_*`/`mqtt_*` unless home-intent routing marks the turn; default gate is local/session/sticky — not a per-turn LLM classify |
| V-HA-22 | **B14** | home inject = bound objects only, capped; no full HA dump in standing inject |
| V-HA-23 | **B14** | Home chat (`purpose: "home"`) enables smart-home tools + bound inject; Approvals still required to actuate |
| V-HA-24 | **B14** | ambiguous / low-confidence home intent does not call `ha_call_service` / `mqtt_publish` |
| V-P2-PRIV-1 | *(Phase 2 — unowned by design)* | Privacy Mode → cloud fails closed |
| V-P2-PRIV-2 | *(Phase 2 — unowned by design)* | Privacy Mode also stops outbound smart-home calls **and** notifications (Design §19.4) |
| V-P2-MOB-1 | *(Phase 2 — unowned by design)* | Dart thin client; no local model; dials the hosting peer |
| V-P2-HA-1, V-P2-HA-2 | *(Phase 2 — unowned by design)* | home-automation via the Channel contract + static workflow, no approval bypass (Design §19.8) |
| V-P2-EDIT-1, V-P2-EDIT-2 | **P2-A** | file edit / apply_patch jail + write grants (Design §19.9) |
| V-P2-AMB-1, V-P2-AMB-2, V-P2-AMB-3 | **P2-B** | heartbeat silent OK; standing-order safety; Doctor interval (Design §19.10) |
| V-P2-MSG-1, V-P2-MSG-2, V-P2-MSG-3 | **P2-C** | message bound/same-account; event-source notify-only; sessions_* scoped (Design §19.11) |
| V-P2-MEDIA-1 | **P2-D1** | view_image jail paths (Design §19.12 D1) |
| V-P2-MEDIA-2, V-P2-MEDIA-3 | **P2-D2** | generate Owner/Privacy/attended; artifacts under output/media (Design §19.12 D2) |
| V-P2-AGENT-1, V-P2-AGENT-2 | **P2-E** | spawn_helper origin/allow-list; depth/caps; Q10 default (Design §19.13) |
| V-P2-AGENT-3 | **P2-E2** | harness `task`/meshSubmitter; caps/batching; origin inherit; no sessions_spawn (Design §19.13 E2) |
| V-P2-AGENT-4 | **P2-E3** | parent Agent path; tools via ApprovalSink; transcript durable; task depth-1 (Design §19.13 E3) |
| Design Appendix C.2 (pre-MVP floor) | **B0–B14 (gate)** | every C.2 row green, including the smart-home safety IDs (V-HA-4/5/7/8/11/13/14/19) in the every-PR `smarthome` suite |

**Not owned by any single v1 stage, on purpose:** `V-P2-PRIV-*`, `V-P2-MOB-1`, and `V-P2-HA-*` remain Design §19.6 Phase 2 (unowned for v1). **P2-A…E** IDs are owned by the Phase 2 epics above — still **not** claimable for v1 / B0–B14.

**Open by reference matrix** (where each family is defined and where it is tested):

| Verification family | Where defined | Where tested |
|---------------------|---------------|--------------|
| V-PROTO-* | Design §3.6 + Appendix A | `packages/protocol/test/validate.test.ts` |
| V-RPC-* | Design §3.6 + Appendix A | `packages/protocol/test/`, `packages/daemon/test/host.test.ts` |
| V-SEC-* | Design §4.5 + Appendix C.3 | `packages/daemon/test/security-corpus.test.ts`, `packages/daemon/test/bindings.test.ts` |
| V-CH-* | Design §5.6 | `packages/channel-api/test/`, `plugins/channel-telegram/test/` |
| V-HAR-* | Design §6.4 | `packages/harness-host/test/` |
| V-LLM-* | Design §8.4 | `packages/providers/test/` |
| V-DAG-* | Design §7.3 | `packages/workflows/test/` |
| V-MEM-* | Memory Design §16 + Design §9.6 | `packages/memory/test/` |
| V-LEARN-* | Memory Design §16 | `packages/memory/test/learn-queue.test.ts` |
| V-SKILL-* | Design §9.2 | `packages/daemon/test/skills.test.ts` |
| V-UX-*, V-UX-MEM-* | Design §10.3 | `apps/desktop/test/` (Playwright/manual) |
| V-HA-* | Design §5.7.6 | `packages/smarthome/test/`, `plugins/channel-{mqtt,homeassistant}/test/` |
| V-OUT-* | Design §9.6 | `packages/daemon/test/artifacts.test.ts` |
| V-P2-* | Design §19.6 | Phase 2; mesh-host for mesh half; P2-A…E suites when those epics ship |

If you find a verification ID referenced in code that isn't in this table, file an issue — not a silent addition. If you find one ID with two owning stages, that is a bug in this table, not a reason to co-own it.

---

## 5. Soft risks → mitigations

These are the risks the Design doc is honest about ("watch in implementation") plus what we've already shipped and learned. Each has: owner-stage, **concrete solution** (where it lives), **test that proves it's solved**, and (where applicable) the verification ID it locks down. Risks are grouped by category for easier review.

### 5.1 Transport & mesh (B2, B4, B13)

| Risk | Owner | Solution | Where | Test |
|------|-------|----------|-------|------|
| **WS RPC timeout < retry budget** → "timed out" with no classified hint | B2 | Wire timeouts at WS host layer. Default 30s, long-running 120s; **must exceed** `maxAttempts × (retryDelayMs + perAttemptTimeoutMs)`. Classify timeout on failure (`network`). | `packages/daemon/src/host.ts` (timeout constants at top) | `host.test.ts` asserts `timeoutMs > runtime.maxAttempts * (retryDelayMs + perAttemptTimeoutMs)`; classified `network` on timeout. |
| **libp2p relay DEBUG env silent** → "server not logging this" impossible to diagnose | B4, B13 | Doctor checks for `DEBUG=libp2p:circuit-relay*` when mesh is enabled, using a **platform-appropriate** probe: the process environment on POSIX, the service definition (launchd plist / systemd unit) on managed installs. **`/proc/self/environ` is Linux-only** and v1 ships macOS-first (Plan §8 item 7), so it cannot be the only probe. Missing in production → issue `mesh.relay_debug_env` (severity=warn, fixable=true). | `packages/daemon/src/doctor/mesh.ts` | Doctor test: relay up + no DEBUG → issue returned; + DEBUG → clean. Test runs on macOS and Linux. |
| **`addRelay` returns success before RESERVE round-trip** | B4 | **Already handled in `@envoymesh/network`** — do not re-implement: `addRelay(pid, "configured")` is followed by explicit reservation verification with bounded attempts (`packages/network/src/index.ts:2262,2308`). EnvoyHome consumes that; it does **not** "bump `hintDialTimeoutMs`" (no such symbol exists in EnvoyMesh). | `@envoymesh/network` (consumed by `packages/daemon/src/mesh-host.ts`) | Integration: after starting the host peer, the relay reports a reservation for it within 5 s. |
| **Wrong relay event name** (`relay:reservation` server-side vs `relay:created-reservation` transport-side) | B4 | **Already handled upstream**: the listener is typed and locked to `relay:created-reservation` on the transport's `ReservationStore` (`packages/network/src/index.ts:1863,4763`). EnvoyHome must not add a second, untyped listener. | `@envoymesh/network` | Upstream test exists; EnvoyHome asserts only that it consumes the upstream helper rather than wiring its own listener. |
| **Hub nodes don't self-reserve** → `circuitPeers=0` even with relay connected | B4 | **Already handled upstream** via `addRelay(selfPeer, "configured")` at startup (`packages/network/src/index.ts:2123,2262`). EnvoyHome's `doctor` reports hosting-with-no-reservation as an issue rather than fixing it itself. | `@envoymesh/network` + `packages/daemon/src/doctor/mesh.ts` | Integration: spin up the host peer, then `/reservations/inspect` on the relay shows it. |
| **Dual mode runs two libp2p stacks on one host** → port/mDNS contention | B4 | Accepting an `overrides:` note: EnvoyMesh allocates its own mesh ports (`packages/network/src/mesh-ports.ts`, `quic-listen.ts`) and advertises via mDNS; its node bases are 3030/3031. When hosting *and* attached (Design §2.3), pin EnvoyHome's listen ports and disable duplicate mDNS advertisement. | `packages/daemon/src/mesh-host.ts` | Test: dual mode starts both stacks; fixed ports bind deterministically; no duplicate mDNS service names. |

### 5.2 Async / loop / turn pipeline (B6, B8)

| Risk | Owner | Solution | Where | Test |
|------|-------|----------|-------|------|
| **Pre-loop asserts bypass loop try-catch** → silent failures | B6, B8 | Convention rule in `tests/min/conventions.md`: "If failure is persistent, it must land in the persisted store before throwing." Helper `assertInsideLoop()` enforces via code review + lint rule. | `packages/harness-host/src/turn.ts` + lint rule | Test: assert throws at function head, no try-catch → no failure in store. Wrapped inside try-catch → failure in store. |
| **Watchdog signals ANDing** → restart when one signal is just slow | B6 | Direct probe (`node.getStatus()` ping) is **source of truth**. Log parser is faster-but-flakier pre-confirmation. Restart if probe unhealthy OR (log parser unhealthy AND elapsed > timeout). | `packages/daemon/src/watchdog.ts` | Test: log-parser unhealthy, probe healthy → no restart. Probe unhealthy → restart. |
| **Cap checks before iteration** → fast-path bailout misses growth inside loop | B8, B11 | Cap check **inside** iteration; `break` cleanly when reached. No comment near top of function about "we'll check after." | the iterating module itself: `packages/memory/src/{learn-queue,consolidate}.ts` (B8) and `packages/daemon/src/artifact-handler.ts` (B11) — **not** `harness-host`, which owns no memory or artifact loop | Test loop adds items each iteration, cap N → exactly N iterations, breaks (does not pre-bail at 0). |
| **Allow-list drift in "send any intent" transport routed through validator gate** | B6, B7 | Allow-list IS the contract. New intent family = allow-list entry + regression test exercising every new value. CI fails if mismatch. | `packages/harness-host/src/validator.ts` | Test asserts every value in runtime allow-list has a regression case; CI fails otherwise. |
| **Fire-and-forget tests pass in isolation, fail in suite** | B6, B8 | Two helpers in test infra: `flushXxxLoop()` (microtasks + N macrotask ticks via `setTimeout(0)` × 10) + `__resetActiveXForTests()` for module-level Sets/Maps/counters. | `packages/test-utils/src/flush.ts`, `reset.ts` | Add a test that fails in suite (module leak); passes after both helpers wired. |

### 5.3 Settings UX (B12)

| Risk | Owner | Solution | Where | Test |
|------|-------|----------|-------|------|
| **Settings UI shows persisted config, ignoring bundled overlay** | B12 | Form reads **RESOLVED** config (`resolveXxxConfig({ bundled, persisted })`); keeps source-URI form for users to copy. | `apps/desktop/src/lib/resolve-config.ts` | Test: bundled=`{port:4780}`, persisted=`{port:4781}` → RESOLVED.port===4781. UI exposes source URI form. Persisted-wins-over-bundled path tested explicitly. |
| **UI hints driven by error string regex** | B12 | Classify at runtime; persist `lastErrorKind` (network\|proof-token\|other) alongside `lastError`. UI gates hints on classification. Always persist first-run failures (success AND catch paths). | `packages/daemon/src/{errors,store}.ts` | Test: error classified network → hint shown; same regex unclassified → no hint. First-run failure always persisted. |
| **Soft loss if model skips `recall`** | B5, B12 | Visible truncation flag in `home.listMemory` (already B5); Settings memory screen surfaces pending LearnQueue so operator can spot missed remember. Future: nudge-on-no-memory-tool (Provisional, Memory Design §10). | `packages/memory/src/list-memory.ts` (B5) + `apps/desktop/src/views/memory.tsx` (B12) | Test: standing inject truncated → duty line in prompt; no standing write in N turns → Settings surfaces counter. |
| **Pending-learn fatigue** | B8 | Coalesce near-duplicates (same kind + similar diff hash) while pending; one queue per account so UI is clean. | `packages/memory/src/learn-queue.ts` | Test: 3 near-identical pending learns added → only 1 unique remains; different diffs all kept. |

### 5.4 Memory & sandbox (B3, B5, B8)

| Risk | Owner | Solution | Where | Test |
|------|-------|----------|-------|------|
| **StandingStore vs L5 backend ownership** | B5, B8 | `profile.json` is core-owned; backend may `searchNotes` over L2/L3 paths but never replaces them. Disable L5 → L1–L3 intact (V-MEM-12). | `packages/memory/src/standing-store.ts` (boundary check) | Test: backend ingest with profile keys → no-op; backend ingest L2 file → no-op; L5 off → profile/MEMORY/daily all pass. |
| **Path-traversal regression on new tools** | B3 + every tool-adding stage | One chokepoint resolver `safeJoin(accountRoot, path)`; security corpus fixture is the regression guard; every new tool funnels through it. | `packages/daemon/src/fs-jail.ts` | Security corpus test (`security-corpus.test.ts`) runs on every PR with full Appendix C.3 path list. |
| **Tainted/untrusted content auto-promotes to L1/L2** | B8 | Provenance required on every flush/consolidate/learn write; `trust: "untrusted"` → pending only, never direct write. | `packages/memory/src/{flush,consolidate,learn-queue}.ts` | Test: tainted input → only PendingLearn, never direct MEMORY append. |
| **Concurrent flush + remember corrupt MEMORY.md** | B8 | Per-account writer lock (mutex + optional `accounts/<id>.lock` file); test interleavings explicitly. | `packages/memory/src/writer-lock.ts` | Concurrency test: spawn 100 flush + 100 remember on same account → MEMORY.md well-formed, no torn writes. |

### 5.5 Plugins / channels (B7)

| Risk | Owner | Solution | Where | Test |
|------|-------|----------|-------|------|
| **Plugin lifecycle vs daemon restart** | B7 | Plugin state stored per `channelAccount` and persisted (`channels.json`); restart re-`start(ctx)` on same state. Health checked on resume. | `packages/channel-api/src/loader.ts` + `packages/daemon/src/channels/state.ts` | Test: enable Telegram → kill daemon → restart → Telegram still enabled, health re-checked, no duplicate start. |
| **API version drift** between plugin and daemon | B7 | Plugin `apiVersion` ≤ daemon max else refuse enable with doctor issue `channel.api_version`. **Plugin `apiVersion` is not `protocolApiVersion`** (Design §3.7). | `packages/channel-api/src/loader.ts` + doctor | Test: plugin declares apiVersion=2, daemon max=1 → refused; doctor returns issue. |
| **Sidecar failures orphan in-process plugin list** | B7 | Sidecar health checked every Ns; unhealthy → mark, never silently fail closed. Restart attempts backoff. | `packages/channel-api/src/sidecar.ts` | Test: kill sidecar → marked unhealthy within 5s; in-process plugin list unaffected. |
| **A channel plugin cannot be written without the SDK** | B7 | `Test double: @envoyhome/channel-fake` ships in-tree; V-CH-5 proves a third party can complete a round trip using only the published contract. | `packages/channel-api/` + in-tree `channel-fake` | Fake channel round-trip with no Telegram and no daemon internals. |

### 5.6 Doctor / migration (B13)

| Risk | Owner | Solution | Where | Test |
|------|-------|----------|-------|------|
| **Doctor "fix" without diff** confuses users | B13 | `home.doctorFix` always returns `before/after diff` for each issue; UI shows diff in confirmation. | `packages/daemon/src/doctor/fixes.ts` | Test: any fix call → diff in result. |
| **Chat history import leaks PII** | B13 | Chat import is **opt-in flag** (`--import-chat`), never default on. Dry-run prints planned import before write, and reports which Appendix B sources were **absent**. | `packages/daemon/src/doctor/homeclaw-import.ts` | Test: dry-run → print only; `--import-chat` flag absent → skip; present → import. |
| **Migrate silently imports a permissive policy** | B13 | Appendix B imports data + risk-tier vocabulary only. Never import HomeClaw's `allow_all` tool default or its in-memory approval state. | `packages/daemon/src/doctor/homeclaw-import.ts` | Test: migrating a HomeClaw config with `default_mode: allow_all` leaves EnvoyHome's Design §4.3 / Design §4.4 defaults unchanged. |
| **Schema migration story missing** | B13 (extends to B1, B2+) | **Design §3.7 is the single source of truth for compatibility.** Three separate axes: `protocolApiVersion` (wire, `packages/protocol/src/version.ts`, advertised in `home.hello`) bumps only on **breaking** wire change; plugin `apiVersion` (manifest) governs plugin enablement; `daemon.json` `stateSchemaVersion` governs **on-disk** migrations, which are explicit code in `packages/daemon/src/migrations/`. Additive wire change needs no bump — clients discover via `home.hello.methods[]`. | `packages/protocol/src/version.ts` + `packages/daemon/src/migrations/` | Tests: an additive method appears in `methods[]` with no version bump; a breaking change without a bump fails CI; stale `stateSchemaVersion` → migration runs on next start. |

### 5.7 Build & CI (B0)

| Risk | Owner | Solution | Where | Test |
|------|-------|----------|-------|------|
| **`CI=true pnpm install` makes pnpm strict-mode** | B0 + all CI | Don't set `CI=true` before pnpm in any script. Set `CI=true` only AFTER pnpm completes. Always check pnpm exit code (don't mask with `\| tail -N`). **GitHub Actions exports `CI=true` for every step**, so the install step must `unset CI` explicitly — not merely avoid exporting it. | `scripts/ci.sh`, `.github/workflows/ci.yml` | Test: run `scripts/ci.sh` with `CI=true` preset in the environment; the install step must still succeed. |
| **Non-interactive pnpm purge deadlocks against R9** | B0 | pnpm aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` when the modules dir is stale without a TTY, and its suggested workaround is `CI=true` — which R9 forbids before install. Take pnpm's other option: `confirm-modules-purge=false` in `.npmrc`. | `.npmrc` | Test: modify `pnpm-workspace.yaml`, then run `env -u CI pnpm install < /dev/null`; must not abort. |
| **`peers:check` unreliable / masked** | B0 | Fail-closed by default: exits 1 if any linked sibling package is missing, not a git checkout, or on the wrong branch (`ENVOYHOME_PEER_BRANCH`, default `main`). CI calls it **unmasked** — no `\|\| echo` escape hatch. `--warn-only` exists for local exploration only and is never used in a merge gate. `scripts/fetch-peers.sh` obtains the siblings when `ENVOYHOME_PEERS_GIT_BASE` is configured, and itself fails closed otherwise. | `scripts/peers-check.sh`, `scripts/fetch-peers.sh`, `.github/workflows/ci.yml` | Tests: missing package → exit 1; wrong branch → exit 1; wrong branch + `--warn-only` → exit 0; all present on `main` → exit 0. |

### 5.8 Conventions that must live in `tests/min/conventions.md`

Some risks aren't just code fixes — they're rules future implementers must follow or the fix silently regresses. **`tests/min/conventions.md` now carries all thirteen (R1–R13)**, not just the three below; R4–R12 were added because each one is a bug a peer project actually shipped, and **R13** because the smart-home surface lets us actuate the physical world (Design §5.7.2). Land any new one there and reference it from the PR template.

The three that came out of this risk register first:

1. **Pre-loop asserts must persist failures** (R1). If a failure is persistent, it must land in the persisted store before throwing — never at function head.
2. **Allow-list IS the contract** (R2). Adding a new intent family requires both an allow-list entry and a regression test exercising every new value. No silent additions.
3. **Cap checks inside iteration** (R3). Cap checks live inside the loop, not before. `break` cleanly when reached mid-cycle. Pre-loop bailouts miss growth.

The rest, with the source risk each closes:

| Rule | Closes |
|------|--------|
| R4 watchdog signals OR | Watchdog signals ANDing (§5.2) |
| R5 RPC timeout > retry budget | WS RPC timeout < retry budget (§5.1) |
| R6 UI hints from classified errors | Error-string regex in the UI (§5.3) |
| R7 Settings reads RESOLVED config | Persisted-config-only forms (§5.3) |
| R8 drain helpers for fire-and-forget tests | Suite-only test failures (§5.2) |
| R9 `CI=true` after pnpm, not before | pnpm strict-mode trap, plus the non-interactive purge deadlock (§5.7) |
| R10 one compatibility mechanism, separate from on-disk migrations | The Q1-vs-`apiVersion` ambiguity (§5.6, Design §3.7) |
| R11 one family envelope, defined in `@envoymesh/protocol` | Second-wrapper drift (§5.1, Design §3.1) |
| R12 plugin lifecycle vs daemon restart | Orphaned/duplicated plugins on restart (§5.5) |
| R13 physical actuation is `admin`, never implicitly granted | The smart-home surface: object state changes need an attended approval or a matching grant, and the safety class is never grant-satisfiable (Design §5.7.2, Design §5.7.7) |

---

## 6. "First day" engineer onboarding

A new engineer should be able to land a green PR on day one. Concrete path (post-B14 code on `main`):

1. Clone `EnvoyHome`; make sure the siblings exist (`../EnvoyMesh`, `../envoy-harness`, `../EnvoyCoder`) or run `./scripts/fetch-peers.sh` with `ENVOYHOME_PEERS_GIT_BASE` set. `./scripts/peers-check.sh` is the gate and fails closed.
2. `pnpm install` (no `CI=true` — see R9), then `pnpm -r build`, then `pnpm test`. `./scripts/ci.sh` runs the whole sequence.
3. Run `pnpm --filter @envoyhome/daemon build && pnpm dev:daemon` — boots WS **4780** `/ws` and HTTP hatch **4781**. Optional: `ENVOYHOME_STATE_DIR=…` `ENVOYHOME_HATCH_API_KEY=…`.
4. `curl http://127.0.0.1:4781/health` returns 200.
5. WebSocket RPC on **4780 at path `/ws`** (Design §2.4). `wscat` has no JSON-RPC mode — open the socket and paste:
   ```
   wscat -c ws://127.0.0.1:4780/ws
   {"id":"1","method":"home.hello","params":{"client":{"name":"wscat","version":"0.0","platform":"darwin","id":"dev"}}}
   ```
   The reply is `{"id":"1","result":{…,"methods":[…]}}` (Design §3.1 envelope).
6. Settings UI: `pnpm --filter @envoyhome/desktop tauri:dev` (daemon must already be running), or open the bundled static shell under `apps/desktop/ui-dist/` after `pnpm --filter @envoyhome/desktop build`.
7. Before claiming a release bar: read **§1.1** and the checklist in [`tests/manual/v1-smoke.md`](../tests/manual/v1-smoke.md).

A new engineer should **not** need to read Design front-to-back. They should read:
- README.md (top-level) — 30 sec.
- **This doc §1.1** (status / next steps) — 5 min.
- Design §3 (`home.*` RPC envelope) — 5 min.
- The area they're changing (§3 stage + §4 IDs) — 15 min.

If they're working on memory, additionally: Memory Design §4 (layers) + Memory Design §8 (flush) + Memory Design §10 (LearnQueue) — 15 min.

---

## 7. PR conventions

| Item | Rule |
|------|------|
| Branch | `feat/<stage-id>-<short>` (e.g. `feat/b5-memory-facade`) |
| Title | `[B5] StandingStore + MemoryFacade (L1–L3)` |
| Body | Lists verification IDs turned green + files added/modified + any Design doc edits required |
| Tests | New behavior ⇒ test in same PR. No "test in a later PR." |
| Schema changes | Bumping a `home.*` JSON schema requires a Design changelog row + a new **`protocolApiVersion`** if **breaking** (Design §3.7). Additive changes need no bump — clients discover them via `home.hello.methods[]`. `apiVersion` is the **plugin** axis, `stateSchemaVersion` the on-disk axis |
| Design doc edits | Allowed, but must add a changelog row (Design §0); reviewers confirm "doesn't change Normative" or escalate |
| Forbidden | Skipping `peers:check`; adding `envoyhome.*` package that re-publishes `@envoymesh/*`; bypassing sandbox in a new tool; allowing agent-authored skill patch to mutate SKILL.md without PendingLearn |

---

## 8. Definition of done — v1 MVP

v1 MVP is "done" when **all** of the following hold (mirrors Design §21). Checkbox board: [Release bar](#release-bar-8--design-21).

> **Mirrors Design §21.** Change both lists in the same PR.

1. `[~]` All Build Stages **B0–B14** closed (code `[x]`; full every-ID e2e optional until you require it for tag).
2. `[~]` Normative verification IDs green for suite cadence; smart-home safety IDs every-PR (Appendix C.2/C.4).
3. `[x]` `pnpm test` covers protocol, daemon, smarthome fake/fixture + C.4, security corpus; e2e-mesh/smarthome nightly backlog.
4. `[x]` Manual §10.2 eight flows — `smoke-v1` 8/8; live Telegram/phone/MQTT deferred by product order ([`tests/manual/v1-smoke.md`](../tests/manual/v1-smoke.md)).
5. `[x]` `home.doctor` fresh (`pnpm doctor:fresh`).
6. `[x]` HomeClaw migrate dry-run on fixture (`pnpm doctor:homeclaw`); real `~/.homeclaw` operator-optional.
7. `[x]` Tauri macOS build (`pnpm desktop:tauri:build`).
8. `[x]` Owner G1 + G6 for `2026-10-08f` — **Accepted 2026-10-09**.

When (1)–(8) are honestly `[x]`, tag `v1.0.0`. Post-tag product order: desktop polish → EnvoyMesh mobile → demo IM last → Phase 2 Privacy/automation.

---

## 9. What this doc does **not** cover

- Phase 2 Normative narrative — Design §19 owns this (including §19.9–§19.13). This Plan owns **epic order, verify-ID ownership, and soft-risk rows** for P2-A…E after Accept.
- Normative re-designs — Design owns this.
- Memory layer depth beyond what B5/B8 implement — Memory Design owns this.
- Peer-research fitness updates — `analysis/synthesis.md` and Design §13.1 own this.

If you need to change the answer to "what we build," edit Design first, then this doc.
If you need to change the answer to "how memory works," edit Memory Design first, then this doc.
If you need to change the answer to "in what order we build," edit this doc and bump the version stamp.

---

## Changelog (this document)

| Date | Change |
|------|--------|
| 2026-10-27 | **KB item 5 close:** live `agent:eval:kb` green (auto-inject + standing filter); ship `knowledgeInject`/`episodicInject` default **`auto`**; V-KB/V-KY/V-EMB checklist in Plan. |
| 2026-10-25d | **Settings Knowledge & embed UI:** LLM → Memory card — curated embed download/progress, enable spawn/Ollama/disable, inject defaults `tool`, reindex; `home:embed-model-download` + cancel/resume RPCs. |
| 2026-10-25c | **KB hardening:** session→episodic purge; V-KY-7 PendingLearn on L1/L2 conflict; real `downloadEmbedModel` + TOFU sha256; Doctor embed/stale; V-KB-7 artifact open; Settings Memory stub; KnowYou journeys; JSON day-one paths Normative note. |
| 2026-10-25b | **KB-P1…P5 shipped:** section FTS + `knowledge_search`; Home embed `:18793` (+ mock); hybrid RRF; KnowYou ADD\|SUPERSEDE\|SKIP + summarize on consolidate; optional auto-inject + standing filter. Board checkboxes `[x]`; V-KB/V-KY/V-EMB tests. |
| 2026-10-25a | **Design lock:** [`EnvoyHome-Knowledge-RAG-Design.md`](EnvoyHome-Knowledge-RAG-Design.md) — Doc KB + KnowYou + Home embed `:18793`; ground-truth links; epic staging TBD (V-KB/V-KY/V-EMB). Aligns Design / Memory Design `2026-10-25`. |
| 2026-10-25 | **Test infra:** agent scenario catalogue (Schedule + General) — V-AGENT-SCENARIO-1 deterministic CI; V-AGENT-SCENARIO-2 optional live eval. No Design Normative change. |
| 2026-10-22e | **Mobile gap close:** live verify + privacy/store docs; CI mobile job; release signing pattern; System This machine; workflow Diagram↔YAML; §11.3/Q12 sync. Aligns Design `2026-10-22e`. |
| 2026-10-22d | **Early-adopter freeze:** claim sheet; live HA checklist; IM live + Privacy Mode **out of marketing**; V-SEC-13…21 stage owners synced (no longer “post-v1”); desktop V-UX hygiene. Tag `v1.0.0` still `[ ]`. Aligns Design `2026-10-22d`. |
| 2026-10-22c | **Watch-item close:** household L7 Normative; flat-skill migrate; media-generate catalogue; V-SEC-7 / V-MEM-22 test fixes. Aligns Design `2026-10-22c`. |
| 2026-10-22b | **Skills propose gate:** `skill_propose` → PendingLearn; accept → SkillService pack unverified until `verifySkill`. Aligns Design `2026-10-22b`. No new verify IDs (V-LEARN-* / V-SKILL-*). |
| 2026-10-22a | **Skills progressive disclosure:** `skills_list` + `skill_view` builtins (Hermes Adapt §9.2). Aligns Design `2026-10-22a`. No new verify IDs (covered by V-SKILL-*). |
| 2026-10-22 | **Defer reaffirm:** OpenClaw device nodes not a Phase 2 epic; mesh-first investigate only. Aligns Design `2026-10-22`. No new verify IDs. |
| 2026-10-20t | **P2-E3 shipped:** parent harness turn = envoy-harness `Agent.run`; V-P2-AGENT-4; `runTurn` fallback. Aligns Design `2026-10-20t`. |
| 2026-10-20s | **P2-E2 full mesh:** task children = LocalMeshSubmitter+Agent; parent stays runTurn. Aligns Design `2026-10-20s`. |
| 2026-10-20r | **P2-E2 shipped:** `task` tool + harness `mapBoundedParallel`; spawn_helper via task; V-P2-AGENT-3. Aligns Design `2026-10-20r`. |
| 2026-10-20q | **P2-E2 board:** parallel children via envoy-harness sub-agents (caps/batching); `sessions_spawn` still Reject. Aligns Design `2026-10-20q`. |
| 2026-10-20p | **Design-max Adapt honesty-gap close:** sessions_send run+wait; view_image https SSRF; image_generate async; message edit/delete/pin/unpin. P2-D2 stays `[x]`. Aligns Design `2026-10-20p`. |
| 2026-10-20o | **P2-C/D full Adapt:** message reply/react/media; vision multimodal; image_generate OpenAI Images + daily cap. Aligns Design `2026-10-20o`. D2 `[x]`. |
| 2026-10-20n | **P2 refine:** HB OK / standing fire / spawn loop / Settings / message+sessions_send / vision+image_generate fail-closed. Aligns Design `2026-10-20n`. |
| 2026-10-20m | **P2-E shipped:** `spawn_helper` + V-P2-AGENT tests. Aligns Design `2026-10-20m`. |
| 2026-10-20l | **P2-D1 shipped:** `view_image` + extract page-range + V-P2-MEDIA-1. Aligns Design `2026-10-20l`. D2 still deferred. |
| 2026-10-20k | **P2-C shipped:** `message` + `sessions_*` + V-P2-MSG tests. Aligns Design `2026-10-20k`. |
| 2026-10-20j | **P2-B shipped:** heartbeat + standing orders + V-P2-AMB tests. Aligns Design `2026-10-20j`. |
| 2026-10-20i | **P2-A shipped:** `edit_file` / `apply_patch` + V-P2-EDIT tests. Aligns Design `2026-10-20i`. |
| 2026-10-20h | **Phase 2 P2-A…E board:** Design §19.9–§19.13; verify IDs; soft-risks. **Owner Accepted 2026-10-20.** |
| 2026-10-19k | **§7.4 accuracy high-impact:** no silent clock invent; account IANA TZ; NL corpus (this/next, in-N-days, 半, noon). Aligns Design `2026-10-19k`. |
| 2026-10-19j | **§7.4 follow-through:** `maxToolRounds` reserved (v1 single-cycle); schedule propose `resolvedLocal` humanized in harness + thin clients; V-CRON-12 elevated glue. Aligns Design `2026-10-19j`. |
| 2026-10-19i | **§7.4 authoring accuracy + restricted agentTurn:** V-CRON-11/12. Aligns Design `2026-10-19i`. |
| 2026-10-19h | **§7.4 schedules enhancement C:** mobile parity, updateSchedule, receipts, chat `schedule` tool, flush/review fire. V-UX-12b, V-CRON-7…10. Aligns Design `2026-10-19h`. |
| 2026-10-19g | **Browser harden:** redirect SSRF, rate-limit split, summary/catalogue/Doctor/UX. Aligns Design `2026-10-19g`. |
| 2026-10-19f | **§9.5g.1 elevated browser profiles:** personal + remote CDP; V-OUT-9/10. Aligns Design `2026-10-19f`. |
| 2026-10-19e | **§9.5g browser control:** OpenClaw-adapted builtin `browser` tool; V-OUT-8. Aligns Design `2026-10-19e`. |
| 2026-10-19d | **§9.5f.1 dependency clarify:** `playwright` npm driver on `@envoyhome/daemon`; Chromium via Owner `npx playwright install chromium`. Aligns Design `2026-10-19d`. |
| 2026-10-19c | **§9.5f.1 browser SERP fallback:** opt-in Bing→Google headless; V-OUT-7. Aligns Design `2026-10-19c`. Implemented: Settings toggle; Doctor warn; attended mid-tool ask. |
| 2026-10-19b | **§9.5f web_search:** household Owner config + DDG/Brave/Tavily + V-OUT-6. Aligns Design `2026-10-19b`. |
| 2026-10-19a | **§9.5e list/search tools:** `list_dir` / `search_files` builtins + V-OUT-5. Aligns Design `2026-10-19a`. |
| 2026-10-18ai | **§10.1 System → Profiles:** first System tab + refined manage-profiles UX; mobile nests Profiles under System. Aligns Design `2026-10-18ai`. |
| 2026-10-18ah | **§4.2.1 multi-folder:** mounts[] + upsert/remove RPCs; desktop/mobile add-folder UX; jail `workspace/<id>/…`. Aligns Design `2026-10-18ah`. |
| 2026-10-18af | **§9.5d File Explore:** `home.listSandboxEntries` + V-OUT-4; mobile Files browser. Aligns Design `2026-10-18af`. |
| 2026-10-18ad | **§9.5d harden:** getArtifactContent stat-before-read; write_file chip-ready path. Aligns Design `2026-10-18ad`. |
| 2026-10-18ac | **§9.5d handoff:** workspace open-by-path; write_file path echo; share/ deferred. V-OUT-2/3. Aligns Design `2026-10-18ac`. |
| 2026-10-18ab | **Mobile Settings:** Profiles + workspace + Owner pairing mint/revoke. Aligns Design `2026-10-18ab`. |
| 2026-10-18aa | **§4.1.1 / §4.2.1 review fixes:** R3 runtime+transfer, Doctor exclusive-bind, seat-or-Owner getWorkspace. Aligns Design `2026-10-18aa`. |
| 2026-10-18z | **§4.1.1 Household Owner:** daemon + protocol + desktop Settings; V-SEC-15…21 green. Aligns Design `2026-10-18z`. |
| 2026-10-16l | **B14 / §5.7.3:** Household device bind — any profile may use bound objects; Shared UI dropped; V-HA-7/14 rewritten. Aligns Design `2026-10-16l`. |
| 2026-10-16k | **B14 / V-UX-6:** Object bind/flags/journal on Connections → HA and MQTT (channel-filtered); Skills Smart home tab removed. Aligns Design `2026-10-16k`. |
| 2026-10-14b | **Product / B10:** Skills UI shows a sample `SKILL.md` (how to write). Aligns Design `2026-10-14b`. |
| 2026-10-14a | **§9.2 / B10:** `home.searchClawHubSkills` + desktop ClawHub search→Install (EnvoyMesh peer). Aligns Design `2026-10-14a`. |
| 2026-10-13v | **§9.2:** Skills `url` + `clawhub` install sources (SSRF/zip-slip). Aligns Design `2026-10-13v`. |
| 2026-10-13u | **Product:** Skills path install — drop zone + native picker; folder or SKILL.md. Aligns Design `2026-10-13u`. |
| 2026-10-13t | **Product:** Sidebar Automation → Skills label (tabs unchanged). Aligns Design `2026-10-13t`. |
| 2026-10-13s | **LLM Settings polish:** Routing in-place extras; Advanced autosave + latency + Unset clears; durable flush cues narrowed. Aligns Design / Memory Design `2026-10-13s`. |
| 2026-10-13r | **§8.5:** llama.cpp default when unset; Ollama only after Connect, then restored on boot. Aligns Design `2026-10-13r`. |
| 2026-10-13q | **Memory §8 soft-flush:** soft-threshold preview + oldest-half fallback; fixed unknown-context keep window. Aligns Design / Memory Design `2026-10-13q`. |
| 2026-10-13p | **Memory §8:** flush-cycle / durable-filter / same-turn byte compact / `home:session-compacted`. Aligns Design / Memory Design `2026-10-13p`. |
| 2026-10-13o | **Memory §8:** daemon pre-turn session pressure (flush + L0 compact); harness receives history window only. Aligns Design / Memory Design `2026-10-13o`. |
| 2026-10-13n | **Routing:** `shared: true` only on enter/leave Local only; `setSharedLocalOnly(false)` no-op when already off. Aligns Design `2026-10-13n`. |
| 2026-10-13c | Local only is one switch for every profile (`shared: true` on setPlacementFilter). Aligns Design `2026-10-13c`. |
| 2026-10-13b | Local model (llama.cpp / Ollama) is one selection shared by every profile. Aligns Design `2026-10-13b`. |
| 2026-10-13m | **Memory:** unknown-local HARD_MIN; never inflate above affordable; inject auto-save queues latest. Aligns Memory Design / Design `2026-10-13m`. |
| 2026-10-13l | **Memory:** OpenClaw-aligned inject caps (L1 4k / L2·L3 20k / total 60k); auto scale-down for small windows. Aligns Memory Design / Design `2026-10-13l`. |
| 2026-10-13k | **Memory:** aggressive §4.2.1 constants; configurable inject via `setMemorySettings` (mode + caps); Caps UI. Package numbers superseded by `2026-10-13l`. |
| 2026-10-13j | **Memory:** model-aware cloud/local inject profiles (V-MEM-22). Derivation + `listMemory.injectProfiles` + turn placement + Caps UI. Aligns Memory Design / Design `2026-10-13j`. |
| 2026-10-13f | **Harness:** ship **envoy-harness only**; remove `codex-adapter` catalogue row; ACP adapters deferred. Aligns Design `2026-10-13f`. |
| 2026-10-13a | Local Model: per-item download progress + Stop/Continue (Range resume). Aligns Design `2026-10-13a`. |
| 2026-10-12q | Local Model: Hugging Face search + list GGUF files + URL download. Aligns Design `2026-10-12q`. |
| 2026-10-12p | Local Model: select active GGUF (`activeModelFile` + Use this); spawn prefers last selection. Aligns Design `2026-10-12p`. |
| 2026-10-12o | `listProviders` newest-first (with newest cloud as default). Aligns Design `2026-10-12o`. |
| 2026-10-12n | MiniMax default = M3; Design §8.2 vision opt-in wording. Aligns Design `2026-10-12n`. |
| 2026-10-12m | Google Gemini OpenAI-compat preset + `joinProviderUrl` `/openai` mount. Aligns Design `2026-10-12m`. |
| 2026-10-12l | Preset catalog re-check (order, Moonshot intl, Anthropic Sonnet 4.5 omitted). Aligns Design `2026-10-12l`. |
| 2026-10-12k | DeepSeek V4.1-Flash labels + GLM overview sync + model picker labels. Aligns Design `2026-10-12k`. |
| 2026-10-12j | Preset catalog re-audit (OpenAI/Grok/MiniMax/Kimi corrections). Aligns Design `2026-10-12j`. |
| 2026-10-12i | Preset catalog audit (context/params/vision-off-default). Aligns Design `2026-10-12i`. |
| 2026-10-12h | Preset cost default = Subscription included (manual override to pay-per-use). Aligns Design `2026-10-12h`. |
| 2026-10-12g | Cost level **Subscription included** (already-paid monthly/yearly → prefer over usage APIs). Aligns Design `2026-10-12g`. |
| 2026-10-12f | Cost level select (Free…Flagship → costRank); every preset has paramCountB + contextTokens. Aligns Design `2026-10-12f`. |
| 2026-10-12e | Curated preset model profiles + Add Provider auto-fill Advanced. Aligns Design `2026-10-12e`. |
| 2026-10-12d | Daemon default `stateDir` = `~/.envoyhome` (align Tauri). Design `2026-10-12d`. |
| 2026-10-16i | **Schedules nav label** (tab id stays `jobs`). Aligns Design `2026-10-16i`. |
| 2026-10-16h | **Schedules authoring UX:** Reminder/Workflow/Tool create; `home.putSchedule` + confirm payload override; list payloadKind + Workflow badge (V-UX-12). Aligns Design `2026-10-16h`. |
| 2026-10-16g | **Workflows list:** remove redundant Create with AI button; New + in-editor Draft/Revise only. Aligns Design `2026-10-16g`. |
| 2026-10-16f | **AI draft/revise whole workflow:** optional `currentYaml` on `home.draftWorkflow`; Settings Draft/Revise with AI (V-UX-10). Aligns Design `2026-10-16f`. |
| 2026-10-16c | **LLM step templates:** `home.list/put/removeWorkflowStepTemplates` + Settings Save as step / Add step ▾ (V-UX-11). Aligns Design `2026-10-16c`. |
| 2026-10-16a | **Workflow DAG canvas + draft RPCs:** Diagram\|YAML dual editor (V-UX-9); `home.draftWorkflow` / `home.draftWorkflowPrompt` (V-UX-10). Aligns Design `2026-10-16a`. |
| 2026-10-16e | **First-party IM plugins:** Discord, Slack, Feishu, DingTalk, WeCom (+ Telegram); Channels catalog UI; Chat-only. |
| 2026-10-16d | **IM = Chat only** + start Discord: `plugins/channel-discord` (DM Gateway), daemon bundle, Channels UI card, `docs/discord-setup.md`. Aligns Design `2026-10-16d`. |
| 2026-10-16c | **First-party IM set locked:** Telegram, Discord, Slack, Feishu/Lark, DingTalk, WeCom; WhatsApp + WeChat personal deferred. Product order: desktop → mobile → IM epic. Aligns Design §5.0 `2026-10-16c`. |
| 2026-10-15f | **Home chat hidden** until HA configured+enabled (V-UX-8). Aligns Design `2026-10-15f`. |
| 2026-10-15e | **§5.7.8 P1/P2:** no per-turn LLM home-classifier by default; Home chat + sticky + local hits for recall. Aligns Design `2026-10-15e`. |
| 2026-10-15c | **§5.7.8 / §10 HA NL control:** home-intent routing, bound-only inject, Home chat (`purpose: "home"`), V-HA-21…24 + V-UX-8 owned by B14. Aligns Design `2026-10-15c`. |
| 2026-10-12c | **§8.2:** newest added cloud → `defaultProviderId`. Aligns Design `2026-10-12c`. |
| 2026-10-17 | **Mobile §10.1 IA:** Flutter Chat|Home|Settings hub (+ tablet rail); LLM/Connections/Skills/System slim Settings; Chat attach+STT; host HF/GGUF + workflow AI draft/YAML. Aligns Design `2026-10-17`. |
| 2026-10-12b | **§8.2:** cloud-only `defaultProviderId` (card action, not Routing); single enabled local; cloud-only pool uses cloud default. Aligns Design `2026-10-12b`. |
| 2026-10-12a | **§8.2 safe defaults:** adaptive `placementFilter` (`cloud` if any cloud else `local`); UI **Smart Routing** = `any` (opt-in); `placementPreference` lock; auto-switch only under `any`. Aligns Design `2026-10-12a`. |
| 2026-10-09af | **V-LLM-11:** GPU llama.cpp runtime (Win CUDA 12.4 + cudart / Linux Vulkan / Mac Metal); missing `runtime-accel.json` on NVIDIA forces one-shot re-download; spawn prefers recommended GGUF when installed. Aligns Design §8.5 `2026-10-09af`. |
| 2026-10-09ae | **V-LLM-10:** hardware-based curated GGUF recommendations + `home.downloadLocalModel` (Adapt EnvoyMesh Envoy Local hw/catalog). |
| 2026-10-09ad | **V-LLM-7:** EnvoyHome Local independent — never attach Mesh `:18790`; spawn `:18792` / Ollama only. Aligns Design §8.5 `2026-10-09ad` (`protocolApiVersion` → 2). |
| 2026-10-09o | **B9.1 ScheduleService:** `at`/`every`/`cron`, NL propose→confirm, IANA/DST, miss skip for admin workflows, protocol schedule RPCs + `home:schedule-fired`. Design §7.4. |
| 2026-10-09n | **§8 Slice B:** needClass + weighted scorer in `@envoyhome/providers`; MixRouter `auto_switch`; Slice A fixes (persist auto-switch across load; defaultProvider without cloud bias on `any`). |
| 2026-10-09m | **§8 Slice A:** provider pool + `defaultProviderId` / `placementFilter` / `autoModelSwitch` (default off); model properties; `home:route-decided`; Design §8 rewrite. Scorer = Slice B. |
| 2026-10-09l | **Models preset UX.** `cloud_anthropic_compat` + `home.testProvider`; Settings preset Save (OpenAI/Anthropic/DeepSeek/GLM/MiniMax/Ollama/llama.cpp); `hasSecret` on list. |
| 2026-10-09k | **Desktop §10.1 + mobile artifacts.** Smart-home V-UX-6 UI; bindings/skills/workflows/artifacts/harness nav; Approvals actuation badge (V-UX-7); Flutter Artifacts tab + `getArtifactUrl`. |
| 2026-10-09j | **Reprioritize + depth:** Demo IM `[>]`; desktop revoke pairing + grants (V-UX-2); `home.hello.accountIds` + mobile chat subscribe/transcript. |
| 2026-10-09i | **Demo IM (Telegram).** Channels Settings (setChannelConfig/enable/bind); plugin getMe + pairing reply; mock poll tests; [`docs/telegram-demo-setup.md`](../docs/telegram-demo-setup.md). |
| 2026-10-09h | **Push delivery + operator doc.** Daemon APNs/FCM dispatch on `home:approval-needed`; `home.sendTestPush`; tap → Approvals; [`docs/mobile-ios-android-setup.md`](../docs/mobile-ios-android-setup.md). |
| 2026-10-09g | **Flutter shell + push.** `apps/mobile` bundle/applicationId `com.envoymesh.envoyhome`; QR/paste pair; Chat/Approvals; iOS APNs MethodChannel + Android FCM; `home.registerPushToken` / `unregisterPushToken`. |
| 2026-10-09f | **Mobile scaffold + HA C.4 status.** Live HA C.4 → `[>]` (no hub creds; fixture still green). `packages/mobile-client` Dart thin-client skin (`envoy_thin_client` path dep); `pnpm mobile:test` / `mobile:live`. Active epic → mobile. |
| 2026-10-09e | **Desktop close-out.** Pairing QR (esbuild+qrcode); `home.setMemorySettings` + Memory caps/flush/review/compact; OS service install/uninstall/restart; `home.health` listen ports; Playwright V-UX-1..5 smoke. Pull 0 → `[x]`. |
| 2026-10-09d | **Desktop quality pull.** Settings: Chat view; Accounts create; Pairing mint with required params; Models setProvider/mode/secret; `home.getServiceStatus` reads claim; README. Plan milestone checkboxes updated. |
| 2026-10-09c | **G6 Accepted** with Design G1 for `2026-10-08f`. Plan front rewritten in EnvoyMesh style: Status Legend, Current Milestone, Key Decisions, stage board + release bar with `[x]`/`[~]`/`[ ]`/`[>]`. Desktop = active epic; mobile next; demo IM last. |
| 2026-10-09b | Owner product order: desktop → EnvoyMesh mobile → demo IM last. |
| 2026-10-09a | v1.1 product-completeness track (inbound→turns, events, Settings, supervise, policy/privacy stub). |
| 2026-10-08h | Status + §1.1 bar board after waves; harden-first before Accept. |
| 2026-10-08f | Stage text matched Design 08f (B1/B2/B3/B7/B9/B12/B14, §4 IDs). |
| 2026-10-08e | B14 smart home added; release bar B0–B14. |
| 2026-10-08c | B0 real; peers-check; stage ownership rewrite. |
| 2026-10-08b | Soft-risk table expanded. |
| 2026-10-08 | Initial Build Stages plan (then B0–B13). |