# Deep dive: Memory Tree + auto-fetch

**Status:** Non-normative research. Decisions locked in [`../EnvoyHome-Design.md`](../EnvoyHome-Design.md) §19.7 (P2-Q5, P2-Q6).  
**Peers:** OpenHuman Memory Tree / integration sync; OpenClaw active-memory (pre-turn recall cousin).

## Memory Tree (OpenHuman)

### Shape

Not a vector DB with a “memory” label. Pipeline:

1. **Canonicalize** inbound source payloads (mail, Slack, docs, chats).  
2. **Chunk** deterministically; **score** / entity-enrich; optional embed.  
3. Append as **L0 leaves** into an open bucket.  
4. Bucket full or **stale flush** → **seal** → summarize → L1 leaf; cascade until a non-full bucket.  
5. Persist Markdown + SQLite indexes; mirror a **vault** the user can open (Obsidian-compatible).

Tree flavours (product docs; engine can be kind-agnostic):

| Flavour | Role |
|---------|------|
| Source tree | One per connector/source (label, channel, document) |
| Topic / entity | Lazily for hot entities |
| Global | Daily digest across ingest |

### Agent retrieval

Tools (names evolve): `walk` (agentic), `drill_down`, `fetch_leaves`, `query_source`, `search_entities`. Provenance on summaries so claims trace to leaves. In the v0.57.52 checkout these sit behind a `RetrievalFacade` offering four modes (tree-walk, vector, keyword, param/tag).

**Verified 2026-10-08:** the tree is **still shipped** (`memory_tree/tree/bucket_seal.rs`; `mem_tree_*` tables), Markdown `content/` is the source of truth, and SQLite is index + vectors. There is no "CortexDB" and no removal. Their own README also says keyword/param search over the body "should be served by grepping the `.md` files", and the FTS5 *episodic* index is marked as being replaced by `memory_archivist` — both of which argue for a **file-first** core, as §9 already is.

### Fitness for EnvoyHome

| Criterion | Assessment |
|-----------|------------|
| Home chat “remember me” | Overkill — §9 MEMORY.md + consolidate covers it |
| Multi-source personal KB | Strong fit **later** as optional plugin |
| Ops simplicity | Heavy (job queue, workers, seal cascade, vault layout) — **the primary reason to keep it out of core** |
| Privacy / multi-account | Must stay per-account sandbox if ever adapted |
| GPL / product coupling | Do **not** vendor OpenHuman; invent/adapt interfaces |
| Roadmap argument | **Not available.** Do not cite "they dropped the tree" — they did not |

**Decision (P2-Q5):** Stick with §9 for v1. Tree engine = future optional **memory plugin**, not core.

## Auto-fetch — split the name

### A. Integration sync (OpenHuman)

Periodic job (e.g. ~20 min) pulls connected integrations and feeds the memory pipeline. User does not say “remember this.” Needs OAuth, budgets, deny lists, Privacy Mode interaction.

**EnvoyHome home:** Channel plugins or DAG scheduled steps that write into account-scoped notes / a future memory plugin — **not** a core “auto-fetch subsystem.”

### B. Pre-turn recall (OpenClaw active-memory)

Before eligible replies, a **bounded** memory sub-agent may run (`memory_search` / `memory_get` only), then prepend context. Modes: `escalate` (default — intent-gated), `always`, `off`. Session `/active-memory off` pauses.

Cost: latency on the critical path; surprise (“why did it know that?”); prompt pollution if always-on.

**EnvoyHome home:** Opt-in escalate later; **default off**. Explicit `recall` tool + consolidate remain primary.

**Decision (P2-Q6):** Sync = Channel/DAG jobs; pre-turn = opt-in escalate later; neither required for v1 or Phase 2a.

## What EnvoyHome v1 already covers

Profile + session + MEMORY.md + daily caps + remember/recall/forget + consolidate + gated learn — Design §9. Do not regress these while chasing tree/sync features.
