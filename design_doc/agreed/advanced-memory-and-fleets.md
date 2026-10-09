# Agreed snapshot: Memory Tree / auto-fetch / TokenJuice / fleets

**Status:** Subordinate to [`../EnvoyHome-Design.md`](../EnvoyHome-Design.md) **§19.7** (locked P2-Q5…Q8).  
**Role:** Short explanations for implementers. Normative v1 memory depth: [`../EnvoyHome-Memory-Design.md`](../EnvoyHome-Memory-Design.md) (summary in Design **§9**).

## Relation to v1 (§9)

| v1 Normative | This investigation |
|--------------|--------------------|
| Profile, session, MEMORY.md, remember/recall/forget | Memory Tree = heavier multi-source hierarchy |
| Consolidate (dreaming-lite) + gated learn | Auto-fetch = background ingest / pre-turn recall |
| Context/session compact (product) | TokenJuice = post-exec tool_result shrink |
| Multi-account on **one** home daemon | Fleets = **N** homes/instances |

## 1. Memory Tree (OpenHuman)

Hierarchical summary forest — not “RAG with a label.”

1. Ingest sources (mail, chat, docs, sessions).  
2. Chunk → score → append **L0 leaves** into a bucket.  
3. Bucket full or stale flush → **seal** → summary becomes **L1**, cascade upward.  
4. Trees by source / hot entity / global day.  
5. Agent tools: walk, drill_down, fetch_leaves (provenance).  
6. Same content mirrored as Markdown vault (human-editable).

**Verified 2026-10-08:** this is **still shipping** in `../openhuman` v0.57.52 (`memory_tree/tree/bucket_seal.rs`; `mem_tree_*` tables; `memory_store/content/` Markdown is the source of truth; SQLite is index + vectors). There is no "CortexDB" and the tree was **not** removed.

**EnvoyHome:** No tree engine in core v1. Optional later plugin if multi-source KB is a product goal. Reject on **ops cost, multi-source scope, and inspectability** — not on a claim that OpenHuman abandoned theirs.

## 2. Auto-fetch (two flavours)

| Flavour | Meaning | Peer |
|---------|---------|------|
| **A. Integration sync** | Timer pulls Gmail/Slack/docs into memory without user “remember” | OpenHuman |
| **B. Pre-turn recall** | Before main reply, bounded memory search/sub-agent injects hits | OpenClaw active-memory (`escalate` / `always`) |

**EnvoyHome:** (A) Channel/DAG jobs, not core memory. (B) Opt-in escalate later; default off (latency + surprise). OpenHuman itself moved away from eager every-turn memory pre-fetch toward on-demand delegation.

## 3. TokenJuice (OpenClaw)

Optional `@openclaw/tokenjuice` — **tool-result middleware**, not memory.

- After `exec`/`bash`, compact noisy stdout before it re-enters the session.  
- Does not change command, exit code, or re-run.  
- Inventory-style may compact; exact file-content reads stay raw.

**EnvoyHome:** Optional harness middleware; default off. Complements §9 consolidate (memory) — does not replace it.

## 4. Fleets

**N EnvoyHome (or peer) instances** with identity, trust, optional remote call.

- Not multi-account on one daemon (already v1).  
- Not mesh **attach** (one thin client → one home).  
- Peers: HomeClaw multi-instance / `peer_call`; **EnvoyMesh `fleetId` + `fleet:apply`** (`fleet.example.yaml`, `docs/fleet-bootstrap.md`) — already implemented, so do not build a second federation stack.  
- **OpenHuman is not a fleet peer.** It has no fleet concept; its `agent_orchestration` (phase-DAG `workflow_runs` + `agent_teams`) is multi-agent orchestration, a different axis.

**EnvoyHome:** Defer product until single-home solid; mesh-first if ever shipped; do not hard-block instance identity in v1 layout.

## Locked decisions

See Design §19.7 — P2-Q5…Q8 closed (2026-10-07j lock).
