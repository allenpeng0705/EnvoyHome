# Analysis: OpenHuman (TinyHumans)

**Status:** Re-verified against the local checkout on 2026-10-08 — this supersedes the earlier
doc-scraped version, which described a "v2 CortexDB" migration that is **not present in
`../openhuman` v0.57.52**.  
**Sources:** local `../openhuman` (Rust core + Tauri/React; `Cargo.toml` → `openhuman` v0.57.52),
plus [docs](https://tinyhumans.gitbook.io/openhuman) and
[Agent Harness](https://tinyhumans.gitbook.io/openhuman/developing/architecture/agent-harness).

## What it is

**Local-first personal AI agent** (Rust core `openhuman-core` + Tauri/React shell; also runs
headless on `:7788`). Desktop is delivery; the core is the brain. Pillars: **Brain** (Markdown
memory vault + Memory Tree), **Orchestrator** (phase-DAG workflows + agent teams), **Deep
researcher** (integration sync / auto-fetch).

## Architecture shape

- In-process Rust core (also a standalone JSON-RPC/socket server); Tauri + mobile shells
- OAuth often brokered by the TinyHumans backend (default `BACKEND_URL=https://api.tinyhumans.ai`); memory stays local
- Model hints (`hint:reasoning` / `hint:fast`); Ollama / LM Studio spawned as managed runtimes
- **Jev / Laya** — tiny typed-decision models for triage before the full chat LLM

## Harness?

**Yes — explicit.** All entry points (chat, channel/CLI, sub-agents) drive one shared `tinyagents`
`AgentHarness` via `run_turn_via_tinyagents_shared`. Product owns providers/tools/middleware;
tinyagents owns the loop. Built-in shape (not OpenClaw-style "swap Codex vs Claude CLI" plugins).
Details: [agreed/channels-and-harness.md](../agreed/channels-and-harness.md).

## Pinned learnings (keep)

1. Readable memory: Markdown bodies as **source of truth**, SQLite as index + vectors, provenance on summaries
2. Proactive integration sync with budgets and deny lists
3. Tool-output compression *idea* (the named **TokenJuice** package is OpenClaw's — see [tokenjuice-and-fleets.md](tokenjuice-and-fleets.md))
4. `recall` / `store` / `forget` tool surface
5. UI-first brain visibility
6. Privacy Mode hard switch
7. **Jev / Laya** typed-decision routing
8. Orchestrator **phase-DAG** + agent teams (idea-level)
9. Durable harness seams (checkpoint/observer, circuit breaker, goals)
10. **Multi-account safety from the foundations of the family** — see below

**EnvoyHome lock:** Memory Tree / auto-fetch → Design §19.7 + [memory-tree-and-autofetch.md](memory-tree-and-autofetch.md).

## Themes (summary)

### Memory Tree (still shipped — corrected)

`memory_tree/tree/bucket_seal.rs` appends leaves into an L0 buffer and **seals** into L1…Ln when the
buffer reaches a token budget; tables `mem_tree_trees` / `mem_tree_summaries` / `mem_tree_buffers`
and `mem_tree_entity_index`. Markdown `memory_store/content/` holds the bodies (*"SOURCE OF TRUTH
for every body"*); SQLite stores `(content_path, content_sha256)` plus chunks/trees/entities/kv and
a local cosine vector index. Recall goes through a `RetrievalFacade` with four modes: tree-walk,
vector, keyword, and param/tag.

**Correction:** there is no "CortexDB" here and the tree/vault are **not** removed. The earlier
"they dropped the tree, so we're right to defer" reasoning was wrong. EnvoyHome's reject-the-tree-in-core
decision stands, but on **ops cost (queue + workers + seal cascade), multi-source scope, and
inspectability** — not on OpenHuman's roadmap. Note also: their own README says keyword/param
search over the body "should be served by grepping the `.md` files", and their FTS5 *episodic*
index is marked as being replaced by `memory_archivist`.

### Auto-fetch

Periodic sync of integrations into the memory pipeline — context before the question (needs budgets
+ privacy story). Distinct from `remember`.

### Tool-output compression (idea)

Compress tool results by content kind; preview + retrieve full via tools — cost control beyond
"pick a cheaper model". Named **TokenJuice** product is OpenClaw's; EnvoyHome adapts as optional
middleware (P2-Q7).

### Orchestrator and agent teams (there is no "fleet" concept)

**Correction:** `grep -ri fleet` over OpenHuman's source and docs returns only incidental comments.
The real machinery is:
- `agent_orchestration/workflow_runs` — a **phase DAG** walked in dependency order, fanning out
  per-phase agents with bounded concurrency, persisted after each phase, with stop/resume
  (`engine.rs`; `WorkflowPhase { name, description, agent_ids, depends_on }`);
- `agent_orchestration/agent_teams` — durable teams, dependency-aware tasks, CAS task claiming,
  teammate messaging, live sub-agent spawn.

"Fleets" is **EnvoyHome's** label for the multi-home idea. When citing OpenHuman, cite the
orchestrator/teams, not a fleet product. EnvoyHome **product fleets** = mesh-first multi-home
(P2-Q8), not this orchestrator roster.

### Consent and sandboxing (the family's strongest — Adopt)

- **Approvals are durable and fail closed.** `ApprovalGate` intercepts every tool with an external
  effect, persists to SQLite `pending_approvals`, publishes `DomainEvent::ApprovalRequested`, and
  parks the turn on a `oneshot` with a **10-minute TTL**; rows survive restart, and an orphaned
  decision cannot fire a side effect. Every turn must set `AgentTurnOrigin`; a missing origin
  resolves to `Unknown` and the approval **fails closed** (`approval/gate.rs:1-33,51`).
- **Autonomy defaults are conservative.** `AutonomyConfig::default()`: `Supervised`,
  `workspace_only: true`, `require_approval_for_medium_risk: true`,
  `block_high_risk_commands: true`, `allow_tool_install: false`, and an `auto_approve` list that is
  **read-only** (`file_read`, `memory_search`, `get_time`, `list_dir`, `glob`, `grep`, …).
- **The OS jail is opt-in per agent**, not the default guard: `cwd_jail` does implement
  Landlock / macOS Seatbelt / Windows AppContainer and `sandbox.enabled` resolves to `true`, but it
  only engages when an agent's `SandboxMode == Sandboxed`, whose default is `None` — and the
  front-line orchestrator sets `sandbox_mode = "none"`.

→ **This, not HomeClaw, is the consent precedent EnvoyHome adopts** (Design §4.4).

### Skills

`SKILL.md` directories with `SkillScope` (user/project/legacy); **project scope requires a trust
marker**; skills run via an isolated `run_skill` worker with capped resources. Extension proper is
MCP: servers installed into SQLite (stdio or HTTP), scoped per agent profile by an
**`allowed_mcp_servers` allow-list** (empty allow-list ⇒ empty registry), secrets passed as opaque
`secret://…` refs, MCP output treated as untrusted.

**Correction:** the earlier "own QuickJS sandbox registry" characterisation is **not supported** by
this checkout. The durable objection to OpenHuman skills is **ecosystem divergence** from
AgentSkills/ClawHub, not the sandbox technology.

## Parked EnvoyHome preference

Prefer a **Jev/Laya-class** typed-decision layer for tool/model/intent routing alongside mix/DAG
ideas — not always ask the main chat model to pick among dozens of tools.

## Debts / caution

Huge surface (channels, voice, meetings, screen, autocomplete); backend-brokered OAuth trust; GPL3
/product model; a Memory Tree that is heavy to reimplement faithfully; FTS5 episodic index
mid-migration; skills/plugins not drop-in compatible with the OpenClaw/AgentSkills ecosystem.
