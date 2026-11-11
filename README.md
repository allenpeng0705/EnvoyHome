<p align="center">
  <img src="docs/screens/envoyhome-logo.png" alt="EnvoyHome logo" width="144" height="144" />
</p>

<p align="center">
  <strong>EnvoyHome — Self-hosted home agent</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="Apache 2.0" />
  <img src="https://img.shields.io/badge/node-%3E%3D22-green.svg" alt="Node.js" />
  <img src="https://img.shields.io/badge/pnpm-workspace-orange.svg" alt="pnpm" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows%20%7C%20iOS%20%7C%20Android-lightgrey.svg" alt="Platforms" />
</p>

<p align="center">
  <a href="#getting-started">⬇ Getting started</a>
  ·
  <strong>English</strong>
  ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

# EnvoyHome

**A security-first home agent you run on your own computer.**

EnvoyHome is the **household agent** in the [EnvoyMesh](https://github.com/allenpeng0705/EnvoyMesh) apps group. The core is the **agent loop** itself: **envoy-harness**, **static workflows**, **memory**, **Approvals**, and a rich **tool catalogue** the agent can use — files, web, browser, office docs, skills, schedules, MCP, and more. Thin clients (desktop + phone) are windows onto that agent; they do not run it.

Smart home (Home Assistant / MQTT) is **one tool surface** among those capabilities — useful when you connect a hub, not the definition of the product. EnvoyHome is not a hub, and it does not ship EnvoyMesh Social.

- **Daemon + envoy-harness** — every chat/workflow turn runs through the home daemon with the only shipped harness.
- **Workflows + tools** — Diagram \| YAML procedures; the same catalogue powers chat turns, schedules, and workflow nodes.
- **Memory that learns carefully** — standing notes, Doc KB, KnowYou; writes go through PendingLearn / Approvals where required.
- **Family multi-account** — one agent, isolated profiles; phones pair to the house over `home.*`.
- **Optional smart home** — bind HA/MQTT objects when you want actuation; safety-class gates still apply.
- **Same family as EnvoyDev** — pairing / dial ladder from [EnvoyCoder](https://github.com/allenpeng0705/EnvoyCoder); coding IDE stays EnvoyDev’s job.

📖 **[QuickStart.md](QuickStart.md)** — daemon, desktop, and phone in minutes.

<p align="center">
  <img src="docs/screens/envoyhome-architecture.svg" alt="EnvoyHome architecture — thin clients, agent daemon, tools, optional hubs" width="900" />
</p>
<p align="center"><em>Thin clients dial the home agent over <code>home.*</code>. The center is harness + workflows + tools; hubs are optional.</em></p>

---

## Table of contents

- [What can it do?](#what-can-it-do)
- [How it works](#how-it-works)
- [In the Envoy family](#in-the-envoy-family)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [Design docs](#design-docs)
- [Current status](#current-status)
- [Want to read more?](#want-to-read-more)
- [License](#license)

---

## What can it do?

### Core — the agent

| Piece | What it is |
|-------|------------|
| **Daemon** (`packages/daemon`) | Owns turns, policy, Approvals, memory, and tool dispatch (`home.*` on WS `:4780/ws`) |
| **envoy-harness** | Only shipped harness — agent loop / tool calls / sub-agents (`task`, `spawn_helper`) |
| **Workflows** | Static DAGs (Diagram \| YAML); NL draft; same tools as chat |
| **Tool catalogue** | Builtins + verified skills + Owner MCP (`mcp__…`) + optional HA/MQTT when connected |
| **Memory** | L1–L3 standing, Doc KB (`knowledge/`), KnowYou; gated PendingLearn |
| **Approvals / grants** | Durable ask · TTL · fail-closed — the agent is not an approval bypass |

### Agent tools (examples)

- **Files & jail** — `read_file` / `write_file` / `edit_file` / `apply_patch` / `list_dir` / `search_files`
- **Knowledge** — `knowledge_search` / `knowyou_search` / `promote_knowledge`
- **Web & browser** — `web_search` / `web_extract` / `web_research` / `browser` (form cards; never solve CAPTCHAs)
- **Office** — `extract_document` / `export_document` (optional LibreOffice for print quality)
- **Skills & schedules** — `skills_list` / `skill_view` / `skill_propose` / `schedule`
- **Sessions & helpers** — `message` / session tools / `task` / `spawn_helper`
- **Owner MCP** — Test-ok + enabled servers appear as `mcp__…` in the catalogue
- **Smart home (optional)** — `ha_*` / `mqtt_*` when those channels are ready

### Surfaces

| Surface | Path | Role |
|---------|------|------|
| **Daemon** | `packages/daemon` | Home agent — WS `:4780/ws`, HTTP `:4781` |
| **Desktop** | `apps/desktop` | Tauri Settings shell (Chat, Approvals, Models, Workflows, Skills, Schedules, Connections, …) |
| **Mobile** | `apps/mobile` | Flutter thin client — QR / `host:port` / SSH hop into the same `home.*` channel |
| **Branding** | `apps/branding` | Product mark + store icon pack |

### Optional — smart home

Connect Home Assistant or MQTT under **Connections** when you want the agent to observe or actuate bound objects. EnvoyHome enhances AI for those hubs; it does not replace them.

- Guides: [`docs/smart-home.md`](docs/smart-home.md) · [`docs/homeassistant-setup.md`](docs/homeassistant-setup.md) · [`docs/mqtt-setup.md`](docs/mqtt-setup.md)
- Actuation (`ha_call_service`, `mqtt_publish`) is **`admin`**; unattended needs a grant; safety-class objects never ride a grant.

---

## How it works

```
  Desktop / Phone              EnvoyHome daemon                         Models
  ┌──────────────┐  home.*    ┌─────────────────────────────┐         ┌──────────┐
  │ Thin client  │◀──────────▶│ envoy-harness · workflows   │────────▶│ Cloud /  │
  │ Chat · Ops   │  :4780/ws  │ memory · Approvals          │         │ Local    │
  └──────────────┘            │ tool catalogue              │         └──────────┘
                              └──────────────┬──────────────┘
                     files · web · browser · office · skills · MCP · …
                                             │
                                             ▼  (optional)
                                      HA / MQTT hubs
```

- **The agent lives on the home computer** — harness, tools, keys, and sandboxes stay there.
- **Thin clients** speak `home.*` (EnvoyMesh-hosted envelope); pair once, then remote Chat / Settings.
- **Workflows reuse the same tools** as attended chat; they are not a second engine and not an approval bypass.
- **Smart-home tools** only appear when a hub is configured; everything else works without them.

Full diagram: [`docs/screens/envoyhome-architecture.svg`](docs/screens/envoyhome-architecture.svg).

---

## In the Envoy family

EnvoyHome reuses EnvoyMesh transport and EnvoyDev-style thin-client patterns — it does **not** fork `@envoymesh/*`, and it does **not** ship Mesh Social.

<p align="center">
  <img src="docs/screens/envoyhome-family.svg" alt="EnvoyMesh, EnvoyDev, and EnvoyHome in the apps family" width="820" />
</p>
<p align="center"><em>Shared pairing / dial ladder — separate product brains.</em></p>

| Product | Job | Brain |
|---------|-----|-------|
| **[EnvoyMesh](https://github.com/allenpeng0705/EnvoyMesh)** | Mesh identity, bonds, Social, optional Ext Agent | Does not own EnvoyHome’s agent loop |
| **[EnvoyDev](https://github.com/allenpeng0705/EnvoyCoder)** | Coding-agent control plane (many harnesses) | Coding agents / envoy-harness + CLIs |
| **EnvoyHome** (this repo) | Self-hosted home agent: harness, workflows, tools, memory | **Own daemon** + **envoy-harness** only |
| **EnvoyGo / thin clients** | Phone / paired UI | Dial product daemon — no brain on the phone |

Sibling layout (linked with `link:`, not npm):

```text
parent/
  EnvoyHome/       ← this repo
  EnvoyMesh/       ← @envoymesh/* (required)
  envoy-harness/   ← only shipped harness (desktop may pin-fetch)
  EnvoyCoder/      ← reference patterns only (optional)
```

---

## Getting started

**Hands-on walkthrough:** [`QuickStart.md`](QuickStart.md).

```bash
# Fail-closed sibling check (or set ENVOYHOME_PEERS_GIT_BASE and ./scripts/fetch-peers.sh)
./scripts/peers-check.sh

# Never install with CI=true (pnpm strict-mode trap — conventions R9)
env -u CI pnpm install

./scripts/ci.sh                   # docs-lint → peers → install → build → test → lint
pnpm desktop:dev                  # build daemon if needed → Tauri Settings
pnpm version:desktop -- 0.1.0     # bump desktop VERSION (see scripts/README.md)
./scripts/build-desktop.sh macos  # DMG → release/ (Linux: linux; Windows: .\scripts\build-desktop.ps1)
```

Ports (Design §2.4): WebSocket `4780` at `/ws`, HTTP `4781` (`GET /health`).

Mobile:

```bash
cd apps/mobile
flutter pub get
flutter run    # pair via desktop Pairing QR / host:port / SSH hop
```

---

## Project structure

```text
EnvoyHome/
├── apps/
│   ├── desktop/     # Tauri Settings shell
│   ├── mobile/      # Flutter thin client
│   └── branding/    # Mark + store icons
├── packages/
│   ├── daemon/      # Home agent daemon (home.*)
│   ├── protocol/    # @envoyhome/protocol
│   ├── harness-host/
│   ├── memory/
│   ├── workflows/
│   ├── providers/
│   ├── channel-api/
│   ├── smarthome/    # optional HA + MQTT tools
│   └── …
├── plugins/         # Chat + event-source channel plugins
├── design_doc/      # Design + Memory + Knowledge-RAG + Implementation Plan
├── docs/            # Operator guides
├── QuickStart.md
└── AGENTS.md
```

---

## Design docs

| Doc | Role |
|-----|------|
| [`design_doc/EnvoyHome-Design.md`](design_doc/EnvoyHome-Design.md) | **Ground truth** — Normative product + security |
| [`design_doc/EnvoyHome-Memory-Design.md`](design_doc/EnvoyHome-Memory-Design.md) | Memory layers L0–L7, flush, LearnQueue |
| [`design_doc/EnvoyHome-Knowledge-RAG-Design.md`](design_doc/EnvoyHome-Knowledge-RAG-Design.md) | Doc KB + KnowYou + Home embed `:18793` |
| [`design_doc/EnvoyHome-Implementation-Plan.md`](design_doc/EnvoyHome-Implementation-Plan.md) | Build Stages **B0–B14**, verification IDs |
| [`tests/min/conventions.md`](tests/min/conventions.md) | Rules **R1–R13** (read before package edits) |
| [`AGENTS.md`](AGENTS.md) | Instructions for AI coding agents |

---

## Current status

Spine **B0–B14** is on `main`. Design gate **G1** and plan gate **G6** are accepted. **`v1.0.0` is not tagged yet** — see Plan release bar (§8) and the early-adopter claim sheet:

[`design_doc/reviews/2026-10-22-early-adopter-claims.md`](design_doc/reviews/2026-10-22-early-adopter-claims.md)

Preview posture: desktop + phone; optional HA/MQTT **demo/fixture**. Do **not** claim Privacy Mode as a finished product toggle, a production IM zoo, or agentskills.io conformance until those bars close. Mobile live verify: [`docs/mobile-live-verify.md`](docs/mobile-live-verify.md).

Branding / store pack: [`apps/branding/store/README.md`](apps/branding/store/README.md).

---

## Want to read more?

- **Start here:** [`QuickStart.md`](QuickStart.md)
- **Diagrams:** [`docs/screens/`](docs/screens/) (logo · architecture · family)
- **Harness:** [envoy-harness](https://github.com/allenpeng0705/envoy-harness)
- **Smart home (optional):** [`docs/smart-home.md`](docs/smart-home.md) · HA · MQTT · [live checklist](docs/smart-home-live-checklist.md)
- **Mobile:** [`apps/mobile/README.md`](apps/mobile/README.md) · [`docs/mobile-live-verify.md`](docs/mobile-live-verify.md) · [iOS/Android setup](docs/mobile-ios-android-setup.md)
- **Desktop:** [`apps/desktop/README.md`](apps/desktop/README.md) · [`scripts/README.md`](scripts/README.md)
- **Family peers:** [EnvoyMesh](https://github.com/allenpeng0705/EnvoyMesh) · [EnvoyDev / EnvoyCoder](https://github.com/allenpeng0705/EnvoyCoder)
- **Website (family):** [www.envoymesh.cn](https://www.envoymesh.cn)

---

## License

[Apache License 2.0](LICENSE)
