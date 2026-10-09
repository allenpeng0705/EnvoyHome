# EnvoyHome Implementation Plan

Living plan for **active** EnvoyHome build work. Style aligned with EnvoyMesh [`docs/implementation-plan.md`](../../EnvoyMesh/docs/implementation-plan.md): status legend, Current Milestone, checkbox boards; stage **narratives** stay in [§3](#3-build-stages-b0b14).

| Field | Value |
|-------|-------|
| **Role** | Subordinate to [`EnvoyHome-Design.md`](EnvoyHome-Design.md) and [`EnvoyHome-Memory-Design.md`](EnvoyHome-Memory-Design.md). **Design wins.** |
| **Last updated** | 2026-10-09l |
| **Owner** | Allen Peng |
| **G6** | **Accepted 2026-10-09** for Plan text matching Design `2026-10-08f` (with G1) |

**Start here:** [Current Milestone](#current-milestone) · **Ground truth:** [Design](EnvoyHome-Design.md) · [Memory Design](EnvoyHome-Memory-Design.md) · **08f Accept:** [`reviews/2026-10-08f-acceptance.md`](reviews/2026-10-08f-acceptance.md)

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
- [§2 Repo layout](#2-repo-layout-target)
- [§3 Build Stages (detail)](#3-build-stages-b0b14)
- [§4 Verification ID index](#4-verification-id-index)
- [Changelog](#changelog-this-document)

## Current direction

EnvoyHome is a self-hosted **home agent control plane** (Design §1). Spine **B0–B14** is implemented on `main` against Design **`2026-10-08f`** (**G1/G6 Accepted 2026-10-09**).

**Active epic:** **Desktop + mobile product depth** `[~]` — Settings completeness (V-UX-2/6, Models presets, §10.1) + Flutter thin-client chat/artifacts  
**Parked:** **Demo IM (Telegram)** `[>]` — Channels UI exists; live @BotFather deferred  
**Optional:** Live HA C.4 `[>]` — fixture green; needs `ENVOYHOME_HA_*` on an operator machine

**Last shipped (docs):** Owner reprioritize: desktop + mobile before Demo IM (2026-10-09j)

## Key Decisions

- `[x]` Package manager: pnpm workspaces; `@envoymesh/*` via `link:` + `overrides:` (not npm, not `workspace:*`).
- `[x]` Envelope: adopt `@envoymesh/protocol`; host via `@envoymesh/reuse-host` (R11).
- `[x]` Mesh phone path: **hosting default**; attach dual-if-needed; never phone-via-attach; no Social in EnvoyHome (P2-Q4).
- `[x]` Smart home is **v1 Core** (B14); integrate hubs, do not become one.
- `[x]` Safety class is data-driven on resolved object `class` (08f); regex list withdrawn.
- `[x]` Approvals: durable + TTL + fail-closed; claim≠consume for grants (08f).
- `[x]` Memory + gated LearnQueue are **v1 Normative** (not Phase 2).
- `[x]` G1/G6 for Design/`Plan` through **`2026-10-08f`** — Accepted 2026-10-09.
- `[x]` Owner product order: **desktop → EnvoyMesh mobile → demo IM last**.
- `[ ]` Tag `v1.0.0` — when [release bar](#release-bar-8--design-21) items (1)–(8) all `[x]` with honest evidence.
- `[>]` Demo Telegram live bot — Settings path parked; resume after desktop + mobile feel solid.
- `[ ]` Phase 2 Privacy Mode RPC / automation authoring UX — after mobile path is clear.

## Current Milestone

**Milestone:** Spine shipped; **deepen desktop Settings + mobile thin client** (Demo IM parked).

| Track | Status | Notes |
|-------|--------|-------|
| Design `2026-10-08f` G1 | `[x]` | Accepted 2026-10-09 |
| Plan G6 (08f text) | `[x]` | Accepted 2026-10-09 |
| B0–B14 code on `main` | `[x]` | Every-ID e2e not claimed for all V-HA/V-UX |
| Desktop product shell | `[~]` | V-UX-2/6 + §10.1 nav (bindings/skills/workflows/artifacts/harness); live HA inventory still operator |
| Tauri supervise | `[x]` | Spawn/reap; OS service install/uninstall/restart RPCs + Advanced controls |
| Inbound → turns + product events | `[x]` | Daemon + Settings subscribe/`on` |
| policy.json / forceLocalForEventSource | `[x]` | PolicyStore |
| Privacy Mode preview file | `[~]` | `privacy-mode.json` stub; RPC = Phase 2 |
| Live HA C.4 | `[>]` | Fixture `[x]` (`pnpm ha:c4-diff`); live needs hub creds — unset here |
| EnvoyMesh mobile thin client | `[~]` | Pair + push + chat stream + artifacts open; Store polish operator-side |
| Demo IM (Telegram) | `[>]` | Parked — Channels UI kept; live bot later |

### Next planning pulls

0. **Desktop depth** `[~]` — V-UX-2/6 + Models presets `[x]`; live HA inventory / V-UX-7 deny e2e when hub present.  
1. **Mobile thin client** `[~]` — accountIds + chat + artifacts `[x]`; Store/TestFlight polish.  
2. **Optional live HA C.4** `[>]` — when hub creds available.  
3. **Demo IM channel** `[>]` — parked.  
4. **Tag `v1.0.0`** `[ ]` — when release bar holds.

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
| **B7** Channel SDK + Telegram demo | `[~]` | SDK `[x]`; Settings path `[x]`; live @BotFather `[>]` parked |
| **B8** Memory depth | `[x]` | LearnQueue, flush, L4 FTS, compact |
| **B9** Static workflows | `[x]` | matcher/executor; V-DAG-4 real model `[ ]` optional |
| **B9.1** ScheduleService | `[x]` | clock + NL propose/confirm + workflow sync; V-CRON-1..6 |
| **B10** Skills verify | `[x]` | gate; agentskills.io unverified (residual) |
| **B11** Artifacts + signing | `[x]` | HMAC URLs |
| **B12** Settings UI (Tauri) | `[x]` | Thin Settings + QR + Memory/Advanced + V-UX Playwright smoke |
| **B13** Doctor + HomeClaw migrate | `[x]` | fresh + fixture dry-run green |
| **B14** Smart home | `[~]` | Library + C.4 + RPC `[x]`; live HA/MQTT + Settings depth `[~]` |

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
| Privacy Mode RPC (+ smart-home egress) | `[ ]` | §19.4, V-P2-PRIV-* |
| Automation authoring UX | `[ ]` | §19.8 |
| Demo IM channel (Telegram) | `[>]` | §5.3 — parked after Channels UI; live bot later |
| Memory Tree / fleets / TokenJuice | `[>]` | §19.7 — not core |

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
  plugins/                            # bundled channel plugins: channel-telegram (B7); channel-mqtt, channel-homeassistant (B14)
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
| Deliverable | `packages/memory/src/{standing-store,memory-facade,profile,notes,writer-lock,recall-fts,external-reload,bootstrap-inject}.ts`; `home.getProfile`, `home.updateProfile` (Appendix A.9 supersede-by-key); `home.recall` (keyword/FTS over L2+L3, account-scoped, **CJK-capable tokenizer**); `home.forget`; tools `profile_get`, `profile_update`, `remember`, `recall`, `forget`. Bootstrap inject enforces the **exact** caps of Memory Design §4.2 (L1 2000 / L2 4000 / L3 2000 chars) and adds the **fixed duty line** when any standing inject is truncated. **Per-account writer lock** at `accounts/<id>/memory/.lock` (or an in-process mutex) — not a `memories/` directory, which does not exist in Design §4.2. **External edit reload** by mtime/hash before inject and before write. |
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

### B7 — Channel SDK + Telegram demo `[~]` **[parallel-eligible with B6]** · live IM `[>]`

**Scope:** `@envoyhome/channel-api` package; in-process plugin loader; sidecar spawner; Telegram demo plugin.

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

### B9 — Static workflows (matcher + executor) `[x]` **[parallel-eligible with B10]** · V-DAG-4 live model `[ ]`

**Scope:** Static-workflow executor + YAML loader + global/overlay semantics. Design §7. **These are linear ordered step lists, not edge graphs** — keep the name honest until `depends_on`/edges exist.

| Item | Detail |
|------|--------|
| Deliverable | `packages/workflows/src/{loader,executor,steps/llm-fill,steps/tool,steps/llm-summarize,matcher}.ts`; `home.listWorkflows`, `home.getWorkflow`, `home.reloadWorkflows`. Load order: global `workflows/*.yml` first, then `accounts/<id>/workflows/*.yml` overlays (same `id` replaces global). `llm_fill` / `llm_summarize` are narrow calls — not open tool loops — and go through the **same `provider_handle` + `approval_sink`** as a harness turn (Design §6.1), so a workflow's `tool` step is subject to Design §4.3 risk tiers exactly like a harness tool call. |
| Acceptance | A matched **keyword/rule** trigger routes to the workflow and does not open a free tool loop; unmatched input falls through to the harness; a `tool` step's side effects are sandboxed and gated by policy; a sample workflow runs on a small local model. |
| Verification IDs | V-DAG-1, V-DAG-2, V-DAG-3, V-DAG-4, V-DAG-5. |
| Risk | **The scheduler is new here.** `match.schedule` runs unattended with no turn text, so it must not depend on keywords; `match.event` fires on a **registered** object (Design §5.7.3) and its rendered text is untrusted. **There is still no intent classifier in v1** (Design §8.3, Q3 closed), so `match.keywords` remains the only text trigger — do not write a matcher that requires `match.intents` to be produced by a model, or V-DAG-1/2/4 are unreachable. Keep the matcher conservative: a positive match wins, otherwise the harness. |
| Depends on | B3 (sandbox), B5 (memory reads), B6 (turn pipeline routes here; `provider_handle` + `approval_sink`) |

### B10 — Skills (verify gate) `[x]` **[parallel-eligible with B9]**

**Scope:** AgentSkills / SKILL.md loader with progressive disclosure; verify/review gate before enable.

| Item | Detail |
|------|--------|
| Deliverable | `packages/daemon/src/skills.ts`; `home.listSkills`, `home.installSkill` (`source: "path"\|"clawhub"\|"url"`), `home.verifySkill`, `home.removeSkill`. Catalog → load body → `references/` on demand. Operator-installed skills work from day one; agent-authored skill create/patch/delete goes through PendingLearn (B8). |
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
| Verification IDs | V-UX-1, V-UX-2, V-UX-3, V-UX-4, V-UX-5, V-UX-MEM-1, V-SEC-6. |
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

**Scope:** Design §5.7. The smart-home surface: a tool bundle, two `kind: "event-source"` channel plugins, and example workflows. **No core device model, no new `home.*` methods** (Design §5.7.1). This stage exists because "home agent" without the home is a misnomer (Design §1.1, Design §1.3).

| Item | Detail |
|------|--------|
| Deliverable | `packages/smarthome/src/{ha-client,mqtt-client,object-resolver,safety-class,tools/{ha,mqtt},actuation-journal}.ts` — the `ha_*` (`ha_list_entities`, `ha_get_state`, `ha_list_services`, `ha_call_service`) and `mqtt_*` (`mqtt_subscribe`, `mqtt_read`, `mqtt_publish`) tools, each declaring its Design §4.3.2 tier **and** `idempotent`, and each taking a **resolved object handle** from `object-resolver` (never a raw `entity_id`/topic). `safety-class` implements Design §5.7.2 as data (object class + service deny list + script/scene/button indirection + MQTT allow-list + `neverUnattended`), defaulting unknown to safety-class. `actuation-journal` writes the intent record **before** dispatch and reconciles on restart (Design §5.7.7). `plugins/channel-mqtt/` + `plugins/channel-homeassistant/` as `kind: "event-source"` plugins with **read-only credentials**, `registerSources` inventory, and notification-only `outbound`. `home.listSources`, `home.setSourceBinding`, `home.removeSourceBinding`, `home.listActuations` (Design §3.4, A.3, A.5); `objects.json` registry; **`apps/desktop/src/views/smarthome.tsx`** — the object registry, unbound list, sharing/`neverUnattended` flags, actuation journal and credential warning, added to B12's nav shell (Design §10.1). Doctor hooks for `objects.json` drift, unregistered sources, stale actuation rows and the write-credential warning. Example workflows: morning brief (**`schedule` trigger**) and motion → notify (**`event` trigger**). |
| Acceptance | **V-HA-1..20** pass (V-CH-8/V-CH-9 belong to B7). Specifically: a topic/state event opens a turn **only** for the bound account and **only** for a source registered by that plugin instance; an unbound object opens none; **every** object access — reads included — goes through `resolveObject`, and a foreign object fails `envoyhome.object_not_bound`; actuation is `admin` and blocked when attended-with-no-answer; unattended actuation without a grant fails closed (`envoyhome.actuation_not_granted`); a broad grant is refused (`envoyhome.grant_too_broad`); the safety class is refused at creation **and** dispatch (`envoyhome.actuation_never_unattended`) and the whole Appendix C.4 corpus is denied; non-idempotent services are refused unattended; the journal has an intent record for every dispatch and reconciles `pending` records after a crash without re-issuing; the `smarthome` screen binds an unbound object, refuses `shared` on a presence class, and toggles `neverUnattended` without editing files (V-UX-6), and an actuation approval renders its **target summary** (V-UX-7); object state reaches no store outside Design §5.7.4; tokens never surface in reads or logs; with the broker down a local turn still works and actuation fails closed with a classified error. |
| Verification IDs | V-HA-1 … V-HA-20, V-SEC-11, **V-UX-6, V-UX-7** (the `smarthome` screen and its approval-target rendering — owned here because this is the stage that builds them). |
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
| V-LLM-7 | **B6** | `home.enableLocalEngine` attaches Mesh Envoy Local `:18790` when healthy |
| V-LLM-8 | **B6** | `home.enableOllama` fail-closed when down; registers `ollama` when healthy |
| V-LLM-9 | **B6** | Home spawn uses `:18792`; missing GGUF ⇒ `envoyhome.local_engine_no_model` |
| V-DAG-1 | **B9** | a matched keyword/rule trigger does not open a free tool loop |
| V-DAG-2 | **B9** | unmatched input falls through to the harness |
| V-DAG-3 | **B9** | a `tool` step's side effects are sandboxed and policy-gated |
| V-DAG-4 | **B9** | sample workflow runs on a small local model (nightly/local suite) |
| V-DAG-5 | **B9** | `schedule` trigger fires unattended without a model call; `event` trigger fires on a registered object change; two trigger classes rejected at load |
| V-MEM-1 | **B5** | no cross-account recall / forget |
| V-MEM-3 | **B5** | prompt authority ordering; supersede-by-key profile |
| V-MEM-4 | **B5** | bootstrap caps (L1 2000 / L2 4000 / L3 2000) enforced; Settings shows truncation |
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
| V-LEARN-1 | **B8** | skill unchanged until `acceptLearn` |
| V-LEARN-2 | **B8** | background review: skills always pending; L1/L2 pending by default |
| V-LEARN-3 | **B8** | provenance recorded on flush/consolidate/learn writes |
| V-SKILL-1 | **B10** | install + verify before skill tools are available |
| V-OUT-1 | **B11** | replay after TTL → 403; long artifact → summary + openable URL |
| V-UX-1 | **B12** | new account + channel bind without raw config edit |
| V-UX-2 | **B12** | view/revoke pairings, pending approvals, grants in the UI |
| V-UX-3 | **B12** | Telegram enable + token via Settings only |
| V-UX-4 | **B12** | Advanced shows ports 4780/4781, `publicBaseUrl`, service state |
| V-UX-5 | **B12** | Memory screen shows pending learns, exact caps, flush/review toggles + compact now |
| V-UX-6 | **B14** | Smart-home screen binds an unbound object, marks shared/read-only, toggles `neverUnattended` |
| V-UX-7 | **B14** | An actuation request appears in Approvals labelled as actuation and can be denied |
| V-UX-MEM-1 | **B12** | Memory screen: view, pending, caps, compact, flush/review toggles, active backend |
| V-P2-MESH-1 | **B4** | phone path works with hosting only (no Social, attach not required) |
| V-P2-MESH-2 | **B4** | if attach is enabled, the dial target stays the hosting peer; dual-mode ports/mDNS do not collide |
| V-HA-1 | **B14** | an MQTT topic event starts a turn for the **bound** account only |
| V-HA-2 | **B14** | a Home Assistant state change does the same via `channel-homeassistant` |
| V-HA-3 | **B14** | reads need no approval; any actuation is `admin` and blocked when `ask` goes unanswered |
| V-HA-4 | **B14** | a workflow whose `tool` step actuates is subject to Design §4.4 — blocked unattended with no grant, never an approval bypass |
| V-HA-5 | **B14** | the safety list (unlock/garage/valve/gate/disarm) is not grant-satisfiable; such a grant is refused |
| V-HA-6 | **B14** | an event from an unbound object opens no turn and actuates nothing; it lists in Settings |
| V-HA-7 | **B14** | a workflow for account A cannot actuate an object bound to account B |
| V-HA-8 | **B14** | device state / entity names never auto-enter L1/L2/L3 |
| V-HA-9 | **B14** | HA/MQTT credentials never appear in `getChannelStatus`, `listChannels`, or logs |
| V-HA-10 | **B14** | broker down → local turn still works; actuation fails closed with a classified error |
| V-HA-11 | **B14** | broad grant refused for an actuating tool; a lamp grant cannot be replayed against a door |
| V-HA-12 | **B14** | grant expired/revoked between check and effect cannot actuate (CAS at dispatch) |
| V-HA-13 | **B14** | `sourceId` spoofing dropped before account resolution; no cross-account turn via a claimed id |
| V-HA-14 | **B14** | the resolver holds for reads — foreign object read fails `envoyhome.object_not_bound` |
| V-HA-15 | **B14** | a read-only-credential plugin cannot change state via `outbound`; write credential raises Doctor `channel.write_credential` |
| V-HA-16 | **B14** | non-idempotent service refused unattended; crash ⇒ `unconfirmed`, never re-issued; duplicate delivery does not double-apply |
| V-HA-17 | **B14** | presence reaches no L4 row, COMPACT.md, artifact, foreign `turn-delta` subscriber, notification, or default log |
| V-HA-18 | **B14** | event turns are privacy-tagged: local in `mix`, fail closed in `cloud` without a local provider |
| V-HA-19 | **B14** | the whole Appendix C.4 required-deny corpus is denied |
| V-HA-20 | **B14** | approvals state their target; a mismatched `argsDigest` answer is rejected |
| V-P2-PRIV-1 | *(Phase 2 — unowned by design)* | Privacy Mode → cloud fails closed |
| V-P2-PRIV-2 | *(Phase 2 — unowned by design)* | Privacy Mode also stops outbound smart-home calls **and** notifications (Design §19.4) |
| V-P2-MOB-1 | *(Phase 2 — unowned by design)* | Dart thin client; no local model; dials the hosting peer |
| V-P2-HA-1, V-P2-HA-2 | *(Phase 2 — unowned by design)* | home-automation via the Channel contract + static workflow, no approval bypass (Design §19.8) |
| Design Appendix C.2 (pre-MVP floor) | **B0–B14 (gate)** | every C.2 row green, including the smart-home safety IDs (V-HA-4/5/7/8/11/13/14/19) in the every-PR `smarthome` suite |

**Not owned by any single stage, on purpose:** `V-P2-PRIV-1`, `V-P2-PRIV-2`, `V-P2-MOB-1` and `V-P2-HA-*` are Design §19.6 **Phase 2** IDs. They are listed here so the index is complete, and explicitly marked unowned so nobody claims them for v1.

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
| V-P2-* | Design §19.6 | Phase 2; mesh-host test for the v1-relevant half |

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

- Phase 2 (after v1 spine) — Design §19 owns this.
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