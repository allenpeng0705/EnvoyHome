# Early-adopter claim sheet (2026-10-22)

| Field | Value |
|-------|-------|
| **Purpose** | Freeze what EnvoyHome may honestly claim before tagging `v1.0.0` (Design §21 / Plan §8) |
| **Status** | Normative for **marketing, README, and Store copy** until Owner flips the release bar |
| **Ground truth** | Design §1.3 Core, §5.7, §15.2, §19, §21; Plan Current Milestone + Release bar |
| **Track** | **A — early-adopter cut** (not a tag). Track B = honest `v1.0.0` when bars 1–8 are `[x]` |

## In scope (may claim)

Self-hosted **home agent control plane** for a household:

- Daemon + desktop Settings (Tauri macOS primary).
- Pair phone over **EnvoyMesh hosting** (thin client; no Social product).
- Multi-account sandbox, durable approvals/grants, path jail.
- Cloud and/or local LLM + mix routing.
- Memory L1–L3 + gated LearnQueue (PendingLearn).
- Static workflows + ScheduleService (cron / once / NL propose→confirm).
- Skills with **verify gate** (ClawHub/path install; not agentskills.io-certified).
- Smart home via **Home Assistant + MQTT** plugins: object registry, safety class, actuation journal, demo HA/MQTT, fixture C.4 corpus.
- Phase 2 agent tools that already shipped in code (edit/patch, heartbeat/standing orders, message/sessions_*, view_image / image_generate, spawn_helper / task / parent Agent) — as **capabilities**, not as a substitute for B7/B14 live proof.

## Out of scope (must not claim)

| Claim | Why |
|-------|-----|
| **`v1.0.0` / “Normative v1 complete”** | Plan `[ ] Tag v1.0.0`; B7/B14 still `[~]` |
| **Privacy Mode product toggle** | `privacy-mode.json` stub only; `home.setPrivacyMode` is Phase 2 (§19.4). Never advertise until RPC + Settings + V-P2-PRIV-* |
| **Production-ready first-party IM zoo** | Telegram/Discord/Slack/Feishu/DingTalk/WeCom plugins exist; **live bot verify remaining**. OK: “plugins + setup docs”; not OK: “drop-in Telegram for the family” without operator sign-off |
| **agentskills.io conformance** | §9.2 / §15.2 — target only, unverified |
| **OpenClaw-shaped device nodes** | Camera/screen/computer-use / `nodes` — Defer (`2026-10-22`) |
| **We are a home hub** | Integrate HA/MQTT; do not replace HA (§5.7.1) |
| **Windows/Linux desktop parity** | §21 bar 7 is macOS Tauri; other hosts best-effort |
| **Stolen-phone / recovery-code product** | R1/R4 deferred (`2026-10-18y`) |
| **WhatsApp / WeChat personal** | Deferred (§5.0) |
| **EnvoyMesh Social** | Out of product (§14) |

## Smart-home honesty (B14)

| Layer | Status | Claim |
|-------|--------|-------|
| Library + RPC + fake HA/MQTT + C.4 fixture | Green | “Safety corpus and demo path verified” |
| Live household HA/MQTT | Operator checklist | “Works with **your** HA/MQTT after you complete [live checklist](../../docs/smart-home-live-checklist.md)” — only after sign-off row filled |
| Without live sign-off | — | Say **demo + fixture**; do not say “production-proven on Home Assistant” |

## IM honesty (B7)

| Layer | Status | Claim |
|-------|--------|-------|
| Channel SDK + six chat plugins + Channels Settings catalog | Shipped | “First-party plugins available; follow `docs/*-setup.md`” |
| Live Telegram (then five bots) | Deferred for early-adopter | Primary phone path = **EnvoyMesh thin client**, not IM |
| After Telegram live sign-off | Plan epic | May claim that bot; still do not claim the whole zoo until each is verified |

## Release posture

1. **Early-adopter** builds may ship under a **pre-1.0** version / “preview” label using this sheet.
2. Tag **`v1.0.0`** only when Plan Release bar (1)–(8) are honestly `[x]`, including the e2e bar Owner chooses to require for B7/B14.
3. Any Store / website copy that contradicts this sheet is a docs bug — fix the copy, do not widen the claim.

## Mobile phone path

| Layer | Status | Claim |
|-------|--------|-------|
| Flutter thin client + `mobile-client` | Shipped (`0.1.0+1`) | “Pair phone over EnvoyMesh hosting” |
| Live device + push | Operator | [`docs/mobile-live-verify.md`](../../docs/mobile-live-verify.md) |
| App Store / Play production | Not ready until | Release signing + privacy URL ([`docs/store-listing.md`](../../docs/store-listing.md)) + live verify PASS |

## Sign-off

| Role | Date | Notes |
|------|------|-------|
| Docs freeze (this sheet) | 2026-10-22 | Aligns v1 ship review |
| Live HA/MQTT | _pending_ | See `docs/smart-home-live-checklist.md` |
| Live mobile | _pending_ | See `docs/mobile-live-verify.md` |
| Live Telegram | _deferred_ | Mesh phone primary for early-adopter |
| Tag `v1.0.0` | _blocked_ | Plan `[ ]` until bars green |
