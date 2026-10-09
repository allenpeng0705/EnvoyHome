# Analysis: HomeClaw

**Status:** Re-verified against the local checkout on 2026-10-08. Corrections from that pass are marked ⚠️.  
**Sources:** sibling `../HomeClaw` (docs, `docs_design/`, Core, channels).

## What it is

Self-hosted **home assistant server** (Python 3.11 / FastAPI, Core on `:9000`): clients/channels → `/inbound` → tool-using LLM loop → memory → reply. Channels are separate processes. There is a first-party Flutter client (`clients/HomeClawApp` = "HomeClaw Companion"), a Portal, a vendored `llama.cpp-master/`, and many IM channels.

## Architecture shape

- Monolith brain (`llm_loop`, `core`) + satellite processes (channels, llama.cpp servers)
- Heavy YAML config
- Extension layers: tools, skills (`SKILL.md`), plugins

## Pinned learnings (keep)

1. 3-layer mix local/cloud routing + usage visibility (cascade verified in `hybrid_router/`)  
2. Risk-tier **vocabulary**: read / write / exec / network / user_data / admin / sensitive (`base/tool_permissions.py:9-11`, explicitly "inspired by OpenClaw")  
3. Profile as standing facts (complement RAG)  
4. OpenClaw-compatible skills + ClawHub install path  
5. Multi-user share as **add-on** (isolation to share one agent) — the *file-scoping* discipline  
6. Response output policy — plaintext / Markdown / HTML+VMPrint; Core as web server; remote mobile via public URL + WebView  
7. Deterministic ordered workflows for weak/local models — intent category → fixed step chain  
8. Local LLM first-class — llama.cpp/GGUF; investigate vLLM etc.

⚠️ **Not a learning: HomeClaw's consent model.** See "Debts" below. Take the tier *names*; take the enforcement shape from **OpenHuman** (Design §4.4).

## Themes (summary)

### Mix routing

Modes: `local | cloud | mix`. In mix, pick backend **once per message** before the tool loop. Cascade verified: heuristic (score vs `threshold_heuristic`) → semantic embedding router (max cosine vs intent vectors) → small local classifier / SLM, with a separate **perplexity** signal alongside (`hybrid_router/{heuristic,semantic,slm,perplexity}.py`). Cost/privacy as product, not just "two backends."

### Channels

Two styles: thin `POST /inbound` vs full `BaseChannel` register + `/get_response`. ⚠️ `BaseChannel` has **no `@abstractmethod`** — `initialize()` and `run()` are concrete — so the "contract" is convention, not an enforced interface. Strength: open bot API. Debt: first-party channel zoo (20+ channel dirs; maturity tracked honestly in `channels/CHANNEL_REVIEW.md`).

### Family / multi-user (add-on)

Share one agent with isolation — not the product north star. Gate + scoped storage + file scoping + tool risk tiers. ⚠️ Precision on each layer:
- **Accounts:** `config/user.yml` (`users:` with `id`/`im`/`phone`/`friends`/`type`) — but ⚠️ `base/user_store.py:1-6` says TinyDB `database/users.json` *"Replaces user.yml as the source of truth"*.
- **File scoping:** `homeclaw_root/{user_id}/` private + `homeclaw_root/share/` shared (`tools/builtin.py:461-473`). This is **path scoping, not a sandbox** — there is no seatbelt/landlock/container, and `tools/builtin.py:4557` notes that when the root is unset, absolute paths are allowed.
- **Tool policy:** ⚠️ defaults to **`allow_all`** (`base/tool_permissions.py:1-4,148`), and also `if ctx is None: return PermissionResult(True, …)` (`:216-218`). A hierarchical policy engine exists (`base/tool_policy.py`) but is **not configured on**: `tool_policy.default_mode` is absent from `config/core.yml`/`config/skills_and_plugins.yml`. Tool *profiles* (`full|minimal|messaging|coding`) are prompt-scoping only.
- **Approvals:** ⚠️ effectively inert by default — the only production consumer reads `getattr(meta, "approval", None) or {}` and **skips when empty**, and there is no `approval:` key in config (`base/tools.py:335-348`); even when enabled it only enforces `DENY`, never parking an `ASK`. Pending approvals are **in-memory** (`core/approvals/state.py:19`) and lost on restart.
- **Auth:** `auth_enabled: true` with a committed plaintext default `auth_api_key` (`config/core.yml:80-81`); at-rest encryption is opt-in via `HOMECLAW_AUTH_KEY` + Fernet.

Federation / `peer_call` optionally enlarges this. **UX debt:** YAML-hard; Settings UI must be first-class later.

### Multi-instance / fleets (idea)

`config/instance_identity.yml` + `config/peers.yml`; `base/peer_registry.py` (identity, roster, `peer_call`, pairing invites with `ttl_seconds=900`); `base/federation.py` for cross-instance Companion messaging (`fid = local_user_id@instance_id`). EnvoyHome treats this as **fleet** research: mesh-first, defer product (Design §19.7 P2-Q8) — and note EnvoyMesh already ships `fleetId` + `fleet:apply`. See [tokenjuice-and-fleets.md](tokenjuice-and-fleets.md).

### Skills

OpenClaw-style `SKILL.md` (YAML frontmatter + body, optional `USAGE.md`) + ClawHub install/convert (`base/clawhub_integration.py` scans `~/.openclaw/skills` and rewrites skills). Prefer ecosystem reuse over proprietary islands. ⚠️ Trust/review is **essentially absent**: user-supplied dirs/URLs, plugin code runs in-process, no signing, no allow-list, no sandbox.

### Profile

Standing facts JSON per user (`profiles/{user_id}/HomeClaw.json`, `base/profile_store.py:3,14,44-45`); tool-mediated learn (`profile_update`). Complements RAG. ⚠️ On the reference checkout `database/profiles/` is **empty** despite being the configured root; do not assume rows exist. Debts: no reliable auto-extract; weak Settings surface.

### Memory

`AGENT_MEMORY.md` + daily `memory/YYYY-MM-DD.md` (`config/memory_kb.yml:55-64`) + conversation RAG (`use_memory: true`, `memory_backend: composite`, `memory_check_before_add: false` → *store every message*) + a separate Knowledge base (`knowledge_base:`, `backend: auto` → cognee|chroma) + a Kuzu graph. Chat history is SQLite `database/chats.db`. Flush is real and default-on: `memory_flush_primary: true` (`config/core.yml:47`; `core/llm_loop.py:1971`).

⚠️ **Memory authority is prompt text, not code.** `docs_design/MemorySystemSummary.md:16,65` and `SessionAndDualMemoryDesign.md:74` state that AGENT_MEMORY.md is authoritative over RAG "when the system prompt mentions conflict" — and explicitly that *"we don't resolve it in code"*. Pre-injection dedup is documented as *"possible but not implemented"* (`MemorySystemSummary.md:69`). EnvoyHome's §4.1 authority ordering must therefore be **enforced**, not merely stated.

### Response output

Plain / Markdown / rich link (VMPrint/HTML). Core serves signed `/files/out`. Mobile needs a reachable public URL + WebView/browser. Remote access is user-provided tunnels (Pinggy / Cloudflare / ngrok / Tailscale, `docs/remote-access.md`), plus APNs/FCM push.

### Static workflows + local LLM

⚠️ `planner_executor` is **fixed ordered step chains per intent category**, not a node/edge DAG: `config/skills_and_plugins.yml` → `planner_executor.flows:` (~line 155), categories in `config/intent_category/*.md` (22 files) matched by `match_patterns`, `args_from` placeholders resolved in order, with plan → execute → re-plan (bounded) → summary (`base/planner_executor.py:1-10`). EnvoyHome's §7.2 schema is likewise a linear `steps:` list — call it a static workflow, not a DAG, until edges exist.

Local LLM: `config/llm.yml` `local_models[]` with per-model GGUF `path` (relative to `model_path` in `config/core.yml:11`), host/port, capabilities, optional `mmproj`/`lora`; `llama.cpp-master/` vendored. See [agreed/dag-and-local-llm.md](../agreed/dag-and-local-llm.md).

### EnvoyMesh today

`channels/envoymesh/` is a real bridge process (port 8010, `POST /message` → Core `/inbound`, reply to `/bridge/send`) — an **external-agent preset**, not the target super-channel shape. See [agreed/channels-and-harness.md](../agreed/channels-and-harness.md).

## Strengths to learn from

Mix router; per-user file scoping; profile vs RAG split; ClawHub skills path; output tiers + Core as web server; static workflows for weak models; local LLM pillar; **honest self-reporting** (`channels/CHANNEL_REVIEW.md` flags channels that are inbound- or outbound-only).

## Debts / anti-patterns

Monolithic loop + overlapping routers; channel zoo; four overlapping memory stores / heavy deps (Cognee + Chroma + Kuzu); too many product surfaces; federation + peer_call + EnvoyMesh confusion; YAML-first ops; ClawHub convert friction. And the consent/policy debts that matter most for EnvoyHome:

⚠️ **No OS sandbox; tool default `allow_all`; approvals in-memory and inert by default; memory "authority" only in the prompt.** HomeClaw's isolation is defence-in-depth by *naming*, not by enforcement. EnvoyHome must not inherit this, and must not cite HomeClaw as its consent precedent.

## Key HomeClaw refs

- `docs/mix-mode-and-reports.md`, `docs_design/HybridLocalCloudLLM.md`
- `docs_design/MultiUserSupport.md`, `docs_design/FileSandboxDesign.md`
- `docs/response-output-policy.md`
- `docs_design/PlannerExecutorAndDAG.md` (276 L), `docs_design/UserProfileDesign.md`
- `docs/channels.md`, `docs_design/HowToWriteAChannel.md`
- `docs_design/MemorySystemSummary.md` (246 L), `docs_design/SessionAndDualMemoryDesign.md`
- `docs_design/MultiInstanceIdentityRosterAndPairing.md`, `docs_design/FederatedCompanionUserMessaging.md`
- `base/tool_permissions.py`, `core/approvals/state.py`, `base/planner_executor.py`, `base/user_store.py`
