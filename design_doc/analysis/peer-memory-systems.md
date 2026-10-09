# Peer memory systems — comparative analysis

**Status:** Research (non-normative). Feeds [`../EnvoyHome-Memory-Design.md`](../EnvoyHome-Memory-Design.md).  
**Peers:** OpenClaw, Hermes, OpenHuman, HomeClaw.  
**Method:** Extract → fitness for EnvoyHome → adopt / adapt / invent / reject.  
**Scraped:** 2026-10-07. References to "v2" elsewhere in this doc refer to whatever was current at scrape time — recheck before relying on specific v2 details.

---

## 1. One-page comparison

| Axis | OpenClaw | Hermes | OpenHuman | HomeClaw |
|------|----------|--------|-----------|----------|
| **Standing profile** | `USER.md` (directives + supersede) | `USER.md` (bounded) | `content/*.md` bodies + SQLite index | `profile.json` + tools |
| **Standing notes** | `MEMORY.md` bootstrap | `MEMORY.md` (bounded) | Tree summaries (SQLite) over Markdown bodies | `AGENT_MEMORY.md` |
| **Episodic / daily** | `memory/YYYY-MM-DD.md` + search | Session DB + FTS5 `session_search` | Chunks + conversations | Daily `.md` + chat DB |
| **Semantic / RAG** | Hybrid search (FTS5 + sqlite-vec `vec0`) | Optional external providers | Tree walk / local vector (cosine) / keyword / param | Cognee/Chroma RAG |
| **Docs / KB** | Optional `memory-wiki` | Skills + external | Sources + Markdown vault | Separate Knowledge base |
| **Consolidation** | **Dreaming** Light→REM→Deep; `DREAMS.md` review; only Deep → MEMORY | Dreaming = external plugin; curator for skills | Bucket seal cascade (L0 buffer → L1+ summaries) at a token budget | Flush turn + optional cognify |
| **Learning → skills** | Soft; skills separate | **Core loop** + `/learn` + write_approval (**opt-in, default off**) | SKILL.md registry + isolated `run_skill` worker | Weak; profile tools |
| **Pre-compact save** | **Memory flush** silent turn | Nudges + background review | Post-turn extraction via `memory_queue` (job queue) | **memory_flush_primary** |
| **Deep recall** | Active-memory escalate (**default `escalate`**) | Provider prefetch / tools | `RetrievalFacade` (tree/walk/vector/keyword) | Auto RAG inject + tools |
| **Human inspect** | Markdown + Control UI | Files + `/journey` | Markdown vault is source of truth | Files + Portal/YAML debt |
| **Multi-user** | Agents/bindings | Profiles (one credential per platform) | Auth profiles + per-agent sources | Per-user sandbox |
| **Biggest debt** | Complexity (plugins, dreaming knobs); `plugins.allow` is warning-only | Frozen snapshot mid-session; small fixed caps; gated writes off by default | Tree ops cost (queue + workers + seal); FTS5 episodic mid-retirement | Four overlapping stores; Cognee weight; **`allow_all` tool default + in-memory approvals** |

---

## 2. OpenClaw — detail

**Sources:** [Memory overview](https://docs.openclaw.ai/concepts/memory), [Dreaming](https://docs.openclaw.ai/concepts/dreaming), [Active memory](https://docs.openclaw.ai/concepts/active-memory).

### Stores

- `USER.md` — preferences as **directives** with observed-date / active / superseded  
- `MEMORY.md` — durable non-profile facts; session bootstrap; truncate inject if over budget (disk kept)  
- `memory/YYYY-MM-DD.md` — working notes; indexed; not full dump every turn  
- `DREAMS.md` — human review of dreaming sweeps  
- Optional session transcript search; optional wiki / LanceDB / Honcho engines  

### Write / consolidate

- Agent writes Markdown as it works; **dreaming** promotes with score gates (`minScore`, recall count, query diversity)  
- Only **Deep** phase writes `MEMORY.md`; rewrite with preimage in SQLite; append-only fallback  
- **Taint gate:** untrusted/system candidates never promote  
- **Memory flush** before compaction (silent turn)  

### Recall

- Bootstrap USER + MEMORY (+ today/yesterday daily on `/new`)  
- Tools: `memory_search`, `memory_get`, intents  
- **Active memory:** optional escalate deep-recall sub-agent (default not always-on)  

### Fitness

| Idea | Decision |
|------|----------|
| USER vs MEMORY vs daily split | **Adopt/Adapt** |
| Bootstrap budgets + truncate inject | **Adopt** |
| Dreaming + review diary (`DREAMS.md`) | **Adapt** as consolidate + `COMPACT.md` / Settings diary |
| Score/taint gates before promote | **Adapt** lightly |
| Pre-compaction flush | **Adopt** |
| Action-sensitive memory guidance | **Adapt** (prompt + note schema soft) |
| memory plugin slot / engines | **Adapt** → MemoryBackend |
| Active-memory always | **Reject** as default; escalate later |
| Full dreaming 3-phase complexity day one | **Simplify** to dreaming-lite |

---

## 3. Hermes — detail

**Sources:** hermes-agent local + [memory docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory).

### Stores

- Scarce `MEMORY.md` + `USER.md` (hard char budgets) — **always injected**, frozen at session start  
- SQLite sessions + **FTS5** `session_search` (unlimited episodic)  
- Skills as procedural memory; external memory providers (one active)  

### Write / learn

- `memory` tool add/replace/remove; over budget → error (agent must compact)  
- Background review after turns → memory + `skill_manage`  
- Optional `write_approval` → pending files  
- `/learn`, curator, `/journey`  

### Fitness

| Idea | Decision |
|------|----------|
| Scarcity budgets | **Adopt** (tune numbers) |
| Facts (memory) vs procedures (skills) | **Adopt** |
| Gated writes / pending | **Adopt** (already EnvoyHome) |
| FTS5 / session_search separate from standing | **Adopt** |
| Mid-session frozen snapshot | **Reject** — EnvoyHome **refreshes** standing inject after successful remember (or next turn) |
| Tiny caps without Settings | **Adapt** — Settings-tunable |
| External provider zoo | **Defer**; one MemoryBackend at a time |
| Silent skill overwrite | **Reject** |

---

## 4. OpenHuman — detail

**Sources:** `../openhuman` **v0.57.52** read directly on 2026-10-08 (Rust core + Tauri/React; `src/openhuman/memory_store`, `src/openhuman/memory_tree`, `src/openhuman/memory_queue`). The earlier version of this section described a "v2 CortexDB" migration that **is not present in this checkout**; it has been rewritten from code.

### What is actually there

- **Markdown is the source of truth.** `memory_store/content/` holds on-disk `.md`; SQLite stores only `(content_path, content_sha256)`. SQLite is **index + vectors**, not the record. Bodies are immutable; only YAML `tags:` are rewritable. (`src/openhuman/memory_store/README.md`)
- **The Memory Tree still ships.** `memory_tree/tree/bucket_seal.rs` appends leaves into an L0 buffer and **seals** into L1…Ln when the buffer hits a token budget; tables `mem_tree_trees` / `mem_tree_summaries` / `mem_tree_buffers` + `mem_tree_entity_index`. So "L0 → sealed L1+" is live behaviour, not a v1 relic.
- **Four recall modes** behind a `RetrievalFacade`: tree-walk, vector (`vectors/`, cosine brute-force over SQLite), keyword, and param/tag.
- **FTS5 exists but is being retired**: `episodic_fts` and `event_fts` are present, and the module README marks FTS5 episodic as *"replaced by memory_archivist"*. Their stated rule is telling: *"Anything keyword/param-searchable on the body itself should be served by grepping the `.md` files."*
- **`memory_queue` is a job queue, not a review queue** — dedupe-keyed async LLM extraction/sealing/digest work. There is **no human write-approval** for memory (contrast Hermes' `write_approval`).
- **Consent is separate and is the family's strongest:** durable SQLite `pending_approvals` + a parked `oneshot` with a 10-minute TTL, `DomainEvent::ApprovalRequested`, orphaned decisions unable to fire side effects, and **fail-closed** on an unknown `AgentTurnOrigin` (`src/openhuman/approval/gate.rs:1-33,51`). Autonomy defaults are conservative: `Supervised`, `workspace_only: true`, read-only `auto_approve` list, `block_high_risk_commands: true`.
- **OS jail is opt-in per agent**: `cwd_jail` supports Landlock / macOS Seatbelt / Windows AppContainer, and `sandbox.enabled` resolves to `true` — but the jail only engages when an agent's `SandboxMode == Sandboxed`, and the front-line orchestrator sets `sandbox_mode = "none"`. Read the *autonomy* defaults as the real guard, not the jail.

### Fitness

| Idea | Decision |
|------|----------|
| Human-readable vault + provenance | **Adapt** spirit (Markdown standing + provenance meta) |
| Hierarchical walk tools | **Invent later** as MemoryBackend |
| Auto-fetch sync | **Adapt** as Channel/DAG jobs (P2-Q6) |
| Tree engine in core | **Reject** (P2-Q5) — on **ops cost, multi-source scope, and inspectability**, not on a claim that OpenHuman abandoned it |
| On-demand memory agent vs every-turn | **Adopt** lean (on-demand) |
| **Durable approvals + TTL + fail-closed origin** | **Adopt** → Design §4.4 (this, not HomeClaw, is the consent precedent) |

---

## 5. HomeClaw — detail

**Sources:** `docs_design/MemorySystemSummary.md`, SessionAndDualMemoryDesign, agent memory tools.

### Four systems (easy to conflate)

| System | Role |
|--------|------|
| AGENT_MEMORY.md | Curated long-term |
| Daily `memory/YYYY-MM-DD.md` | Short-term notes |
| RAG (Cognee/Chroma) | Conversation-derived semantic recall |
| Knowledge base | Saved docs/clips — **not** chat stream |

### Write / read

- **memory_flush_primary:** dedicated flush turn before compaction (default)  
- Authority: agent/daily **authoritative** over RAG/KB on conflict  
- Auto RAG inject + tools; KB inject tied to `use_memory`  
- Per-user paths for multi-account  

### Fitness

| Idea | Decision |
|------|----------|
| Separate standing / daily / conversation-RAG / doc-KB | **Adopt** as explicit EnvoyHome layers (don’t merge) |
| Authority: standing > RAG/KB | **Adopt** |
| Pre-compaction flush | **Adopt** (with OpenClaw) |
| Per-account isolation | **Adopt** |
| Cognee as required core | **Reject** — optional backend |
| Four stores without Settings clarity | **Invent** — one Memory Settings surface |
| Store-everything RAG default | **Adapt** — opt-in conversation index; prefer flush + tools for standing |

---

## 6. Cross-cutting lessons for EnvoyHome

1. **Split stores by job** — profile, MEMORY, daily, session search, optional deep, optional KB. Never one blob.  
2. **Scarce bootstrap + tools for depth** — Hermes/OpenClaw agree.  
3. **Save before you lose context** — flush before compact.  
4. **Consolidate with review surface** — dreaming + DREAMS.md / Settings pending.  
5. **Gate skill mutation** — Hermes approval; EnvoyHome pending learn.  
6. **Don’t freeze standing memory for the whole IM session** — fix Hermes debt.  
7. **Plugin deep memory** — OpenClaw engines / Hermes providers / OpenHuman tree → one MemoryBackend slot.  
8. **Human inspectability** — Markdown + Settings; opaque-only is reject.  
9. **Multi-account first** — HomeClaw path discipline for *file scoping*; not for consent (its tool default is `allow_all` and its approvals are in-memory).  
10. **A tree is a backend, not the product** — the reason is ops cost (queue + workers + seal cascade), multi-source scope, and inspectability. Do **not** justify it with "OpenHuman dropped theirs": as of v0.57.52 they still ship it.  
11. **Consent needs to be durable and fail closed** — OpenHuman's SQLite `pending_approvals` + TTL + fail-closed origin is the family's only hardened model; copy it (Design §4.4).  
12. **Gated writes are usually opt-in in the field** — Hermes' `write_approval` defaults to `false`. EnvoyHome chooses the stricter default deliberately (background review on, skills always pending), and that is a **divergence to state**, not a peer fact to cite.

---

## 7. Related

- [EnvoyHome-Memory-Design.md](../EnvoyHome-Memory-Design.md)  
- [memory-tree-and-autofetch.md](memory-tree-and-autofetch.md)  
- [tokenjuice-and-fleets.md](tokenjuice-and-fleets.md)  
- Peer notes: [openclaw.md](openclaw.md), [hermes.md](hermes.md), [openhuman.md](openhuman.md), [homeclaw.md](homeclaw.md)  
