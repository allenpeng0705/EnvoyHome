# Peer harness systems — comparative analysis

**Status:** Research (non-normative). Feeds [`../EnvoyHome-Design.md`](../EnvoyHome-Design.md) §6 and [`../agreed/channels-and-harness.md`](../agreed/channels-and-harness.md).  
**Peers:** OpenClaw, Hermes Agent, OpenHuman (+ default sibling `../envoy-harness`).  
**Method:** Extract → fitness for EnvoyHome → adopt / adapt / invent / reject.  
**Date:** 2026-10-07.

---

## 0. Vocabulary (EnvoyHome)

| Term | Meaning |
|------|---------|
| **Control plane** | Daemon: accounts, channels, sessions, policy, approvals, providers, memory |
| **Harness** | Turn / tool-loop **engine** only — not channels or memory |
| **Shape A** | Pluggable runtimes at the product boundary (swap engines) |
| **Shape B** | One shared in-process loop all surfaces call |

**EnvoyHome stance (already Normative):** Shape **A** at the daemon boundary; **envoy-harness** is a complete Shape-**B** engine shipped as the **default built-in** plugin. Other harnesses (ACP adapters, CLI subprocesses, community packages) plug in via the same `HarnessPlugin` contract.

---

## 1. One-page comparison

| Axis | OpenClaw | Hermes | OpenHuman | EnvoyHome (target) |
|------|----------|--------|-----------|-------------------|
| **Names the “harness”** | Yes — `AgentHarness`, plugins | Rarely; `AIAgent` + `run_conversation` | Yes — `agent::harness`, `run_turn_engine` | Yes — `HarnessPlugin` |
| **Shape** | **A** (registry + built-in) | **B** + one alternate-runtime gate | **B** (one engine, many entries) | **A** + default Shape-B plugin |
| **Default engine** | Built-in id `openclaw` → `packages/agent-core` `runAgentLoop` | `conversation_loop.py` | `run_turn_engine` (Rust) | **envoy-harness** (`Agent.run` / ACP) |
| **Plugin swap** | `registerAgentHarness` + `supports()` | No harness marketplace; `api_mode` / providers | No second harness binary | `home.setHarness` + manifest `kind: harness` |
| **Alternate full runtime** | Codex app-server, Copilot, acpx | `codex_app_server` bypass | Claude Agent SDK = **provider**, not loop | ACP/CLI adapters as harness plugins |
| **Outer vs inner loop** | Outer: failover/compact; inner: tools | Prologue + tool while-loop | One engine; stop hooks mid-turn | Daemon: admit/route; harness: tool loop |
| **Host authority** | `AgentHarnessHostCapabilities` | Approvals in `tools/approval.py` | `ApprovalGate` + `AgentTurnOrigin` | `TurnContext.approval_sink` + Policy Snapshot |
| **Session pin engine** | Persist `agentHarnessId` | Cache `AIAgent` by config signature | Stateful `Agent` vs bus `agent.run_turn` | Per-account default + pin (Design §6 / Settings) |
| **Biggest lesson** | Split orchestration from `runAttempt` | Turn prologue + transport ≠ harness | One engine, fail-closed origin | Keep OpenClaw-style A; wrap envoy-harness |

---

## 2. OpenClaw — detail

**Sources (local):** `openclaw/src/agents/harness/*`, `embedded-agent-runner/*`, `packages/agent-core`, `docs/plugins/codex-harness.md`, `docs/tools/acp-agents.md`.

### Make

- **Contract:** `AgentHarness` — `supports(ctx)`, `runAttempt(params)`, optional compact / finalize / side-question hooks (`src/agents/harness/types.ts`).
- **Built-in:** `createOpenClawAgentHarness()` — reserved id **`openclaw`**; not registered as a plugin.
- **Registry:** plugins call `api.registerAgentHarness`; missing `supports` / `runAttempt` → registration error.
- **Host capabilities:** tools grants, approvals, model binding, `assertActive` after awaits.
- **Inner loop:** extracted `packages/agent-core` `runAgentLoop` (not channel-owned).

### Use

```text
Channel inbound → auto-reply → runReplyAgent → runEmbeddedAgent
  → runPreparedEmbeddedLoop (outer while: failover / compact / retry)
    → runAgentHarnessAttempt → harness.runAttempt
      → (openclaw) runEmbeddedAttempt → AgentSession → runAgentLoop
```

Also: Gateway WS `agent`, CLI, cron — same embedded stack.

### Multi-harness

| Path | Mechanism |
|------|-----------|
| Plugin harnesses | Codex, Copilot, agentsapi, … — native `runAttempt` |
| Auto selection | `supports()` probe + config / session pin `agentHarnessId` |
| Fallback | Declared fallback to `openclaw` when plugin can’t run route |
| ACP | Separate session path via `@openclaw/acpx` (external agents) |
| CLI backends | Thin subscription-auth fallback — **not** full harness |
| Legacy | Config alias `pi` → `openclaw` |

### Fitness

| Idea | Decision |
|------|----------|
| Explicit `AgentHarness` + registry | **Adopt** (maps to Design §6) |
| Built-in reserved id + plugins | **Adopt** (`envoy-harness` reserved) |
| `supports()` + auto/pin/fallback | **Adapt** for Settings + session pin |
| Host capabilities object | **Adopt** → Policy Snapshot + `approval_sink` + `provider_handle` |
| Outer orchestration vs inner tool loop | **Adopt** (daemon vs harness) |
| Persist harness id on session | **Adopt** |
| Lazy-load heavy harness plugins | **Adapt** |
| ACP + CLI as distinct paths | **Adapt** (document three paths) |
| Full OpenClaw harness API surface (compact/fork hooks day one) | **Simplify** — start with `startTurn` / `cancel` |

---

## 3. Hermes — detail

**Sources (local):** `hermes-agent/run_agent.py`, `agent/conversation_loop.py`, `agent/turn_context.py`, `agent/transports/*`, `agent/codex_runtime.py`, `hermes_cli/plugins.py`.  
**Note:** `../hermes` is empty; product code is **`hermes-agent`**.

### Make

- **No harness product term.** Runtime = **`AIAgent`** + extracted **`run_conversation()`**.
- **Turn prologue:** `build_turn_context()` — session DB, compression preflight, `pre_llm_call` hooks, memory prefetch, system prompt.
- **Tool choke point:** `model_tools.handle_function_call` → `tools/registry.py`.
- **LLM shape:** `api_mode` + **transport registry** (`chat_completions`, `anthropic_messages`, …) — normalizes to one internal response type. **Transport ≠ harness.**

### Use

| Surface | Entry |
|---------|--------|
| CLI / one-shot | `AIAgent.run_conversation(...)` |
| Gateway | Cached `AIAgent` per `session_key` + config signature |
| TUI | JSON-RPC → same agent |
| ACP | `acp_adapter` wraps `AIAgent` (Hermes *is* the ACP agent) |

### Multi-“harness”

- **One primary loop** unless `api_mode == "codex_app_server"` → early return; Codex subprocess owns the turn; Hermes tools via MCP bridge.
- Pluggable: providers, context engines, memory plugins, terminal backends — **not** N copies of the turn loop.
- Subagents = nested `AIAgent` with scoped toolsets.

### Fitness

| Idea | Decision |
|------|----------|
| Extract loop from fat orchestrator class | **Adopt** (daemon thin; harness owns loop) |
| Turn prologue as first-class phase | **Adapt** (daemon builds `TurnContext` before `startTurn`) |
| Transport registry for providers | **Adopt** at **provider** layer (§8), not as harness swap |
| Explicit alternate-runtime gate (Codex) | **Adapt** → ACP/CLI harness plugins |
| One tool dispatch + pre/post hooks | **Adapt** inside default harness / daemon policy |
| Unified approval module | **Adopt** (daemon `approval_sink`) |
| Gateway agent cache by config signature | **Adapt** for warm sessions |
| Harness marketplace | **Reject** Hermes’s absence — EnvoyHome keeps Shape A |

---

## 4. OpenHuman — detail

**Sources (local):** `openhuman/src/openhuman/agent/harness/`, `gitbooks/developing/architecture/agent-harness.md`, `agent/bus.rs`, `approval/`.

### Make

- Explicit package **`agent::harness`**.
- **One engine:** `run_turn_engine` with seams (`ToolSource`, `ProgressReporter`, `TurnObserver`, `CheckpointStrategy`, `ResponseParser`).
- Tools: `dyn Tool` + `ToolPolicy` + `SecurityPolicy` + **`ApprovalGate`**.
- Models: `dyn Provider` factory (cloud, Ollama, `claude_agent_sdk:` subprocess = **inference**, not second loop).

### Use — three entries, one engine

```text
UI / agent.chat     → Agent::turn          → run_turn_engine
Channels            → agent.run_turn (bus) → run_tool_call_loop → run_turn_engine
Subagents           → run_subagent         → same engine
```

**Trust:** every turn must set `AgentTurnOrigin`; missing → **Unknown** → approval **fails closed**.

### Multi-harness

**No.** Pluggable providers, tool dialects (`ToolDispatcher`), sandboxes, agent archetypes (TOML) — still **one** turn engine. Not OpenClaw-style harness plugins.

### Fitness

| Idea | Decision |
|------|----------|
| Unify all surfaces on one engine API | **Adopt** for **default** envoy-harness path |
| Native bus `agent.run_turn` (typed) | **Adapt** → daemon `home.*` / internal turn dispatch (not HTTP to harness) |
| Fail-closed turn origin for approvals | **Adopt** |
| Engine seams (observer, checkpoint) | **Adapt later** inside envoy-harness |
| Archetype TOML agents | **Adapt** as account/agent presets, not as harness swap |
| Second competing harness in-core | **Reject** OpenHuman’s monopoly — EnvoyHome needs Shape A |
| ACP as product harness slot | OpenHuman doesn’t have it; EnvoyHome **invents** via adapters |

---

## 5. Default built-in: envoy-harness

**Repo:** `../envoy-harness` (`@envoymesh/envoy-harness`).

| Fact | Detail |
|------|--------|
| Role | Standalone **home-team coding agent** (CLI, WebUI, TUI, ACP) |
| Library turn API | **`Agent.run(prompt)`** → `AgentResult` (not named `startTurn`) |
| Host protocol | ACP/JSON-RPC: `session/prompt`, permissions, user questions, streaming updates |
| Embedding | In-process library **or** subprocess `--acp` **or** full product shell |
| Host vs harness | Host: cwd, keys/`ModelAdapter`, permission UI, cancel; Harness: loop, tools, hooks, session transcript |
| EnvoyHome bridge | Wrap `Agent.run` / ACP stream → Design `startTurn` → `TurnEvent`; map `approval_sink` → ACP permission / `askHandler`; map `provider_handle` → daemon-mediated LLM |

**Do not confuse:** envoy-harness has **no** multi-harness marketplace inside itself. EnvoyHome daemon owns Shape A; envoy-harness is **one** plugin implementation.

---

## 6. Three paths EnvoyHome should document (Adapt OpenClaw)

| Path | What runs | When |
|------|-----------|------|
| **1. Default embedded** | envoy-harness (in-process or ACP child owned by daemon) | Normal home/coding turns |
| **2. External harness plugin** | Codex / Claude Code / Cursor / community via ACP or CLI adapter implementing `HarnessPlugin` | User selected in Settings / `home.setHarness` |
| **3. DAG / no free loop** | Static workflow (§7) | Rule matched — **not** a harness |

Thin CLI “text bridge” (OpenClaw CLI backends) is optional later — do not treat as a first-class harness in v1.

---

## 7. Fitness register → Design §6

| Decision | Source | EnvoyHome action |
|----------|--------|------------------|
| Shape A + default Shape B plugin | OpenClaw + agreed | **Keep** Normative §6 |
| Narrow plugin API: `startTurn` / `cancel` | OpenClaw simplify | **Keep** conceptual v0; grow later |
| Daemon builds `TurnContext` (prologue) | Hermes | **Strengthen** §2.2 / §6.1 wording when next Design edit |
| `provider_handle` + `approval_sink` | OpenClaw host caps + Hermes/OH approvals | **Keep** |
| Session/account harness pin | OpenClaw | **Keep** Settings + `home.setHarness`; pin on session when locked |
| Trust classes: built-in / ACP / opaque | Design already | **Keep** §6.3 |
| Transport ≠ harness | Hermes | **Clarify** in §8 vs §6 (providers swap wire format; harnesses swap engines) |
| Fail-closed turn origin | OpenHuman | **Adapt** into approval path (accountId + harnessId required) |
| One engine for UI+channel+subagent *within default* | OpenHuman | **Adapt** only for envoy-harness; other plugins may differ |
| Hermes-style no marketplace | Hermes | **Reject** |
| OpenHuman single-engine forever | OpenHuman | **Reject** as product constraint |

---

## 8. Recommended mental model (for implementers)

```text
                    ┌─────────────────────────────┐
  Channels / Mesh   │     EnvoyHome daemon        │
  HTTP hatch        │  admit · account · policy   │
                    │  memory · approvals · DAG?  │
                    └──────────────┬──────────────┘
                                   │ TurnContext
                    ┌──────────────▼──────────────┐
                    │     HarnessPlugin slot       │
                    │  default: envoy-harness      │
                    │  also: ACP / CLI adapters    │
                    └─────────────────────────────┘
```

**Make a harness:** implement `HarnessPlugin` (+ manifest); respect sandbox + `approval_sink`; prefer `provider_handle`.  
**Use a harness:** daemon selects (default / Settings / pin) → `startTurn` → stream events.  
**Support different kinds:** registry + trust classes + selection; never put a second brain in a channel.

---

## 9. Key absolute paths (peers)

| Peer | Paths |
|------|--------|
| OpenClaw | `.../openclaw/src/agents/harness/types.ts`, `builtin-openclaw.ts`, `selection.ts`, `embedded-agent-runner/run-loop.ts`, `packages/agent-core/src/agent-loop.ts` |
| Hermes | `.../hermes-agent/agent/conversation_loop.py`, `agent/turn_context.py`, `agent/transports/`, `run_agent.py` |
| OpenHuman | `.../openhuman/src/openhuman/agent/harness/engine/core.rs`, `tool_loop.rs`, `agent/bus.rs` |
| envoy-harness | `.../envoy-harness/packages/envoy-harness/src/agent.ts`, `src/protocol/`, `docs/boundary.en.md` |
