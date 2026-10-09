# EnvoyHome Memory Design

| Field | Value |
|-------|--------|
| **Document** | Dedicated Normative design for the **memory + learning** subsystem |
| **Status** | Living draft |
| **Last updated** | 2026-10-07 (R8–R10 closed) |
| **Parent** | [`EnvoyHome-Design.md`](EnvoyHome-Design.md) — product-wide ground truth |
| **Summary in parent** | Design §9 |
| **Peer research** | [`analysis/peer-memory-systems.md`](analysis/peer-memory-systems.md) |
| **Conflict rule** | Product invariants (sandbox, Mesh, harness) → **Design.md wins**. Memory-layer detail → **this file wins** unless Design.md explicitly overrides. |

**Intent:** Design memory **carefully from day one**, learning from OpenClaw, Hermes, OpenHuman, and HomeClaw — without cloning any one of them, and without stuffing a Memory Tree engine into core.

---

## 0. Changelog

| Date | Change |
|------|--------|
| 2026-10-07 | Initial: layers, MemoryBackend slot, consolidate/learn. |
| 2026-10-07m | Peer comparative pass: flush-before-compact, scarce bootstrap, session_search, COMPACT diary, store split (standing vs RAG vs KB), refresh-after-write, fitness table. |
| 2026-10-07n | Design review hardenings: standing vs backend ownership; truncate→recall duty; writer locks; remember routing; defaults for pending notes; COMPACT rotate; open issues Design §19. |
| 2026-10-07o | Close R1–R4/R6/R7: profile schema, recall FTS, session FTS retention, GPU defer review; Design §9.6 + Design Appendix A.9. |
| 2026-10-07p | Close R8–R10: per-account LearnQueue; external edit reload; flush L2/L3 policy. |
| 2026-10-08f | **Safety/consistency remediation (memory side).** §4.5 CJK trigger is now **per-CJK-run** rather than query length (`花生 allergy` must match), `trigram` is required for the **L4 session index** as well as L2/L3, and cross-engine hits carry a per-hit `engine` and are ordered `(engineRank, score)`. §4.2 gains the **caps contract**: `injectBudget` measured on the exact serialized block, `rawSoftCap` + its defined action per asset, and a **section-aware** L2 inject builder (this is what makes V-MEM-4 falsifiable). §8.1's L3 row is no longer unconditional — it shares **one** taint gate with Design §5.7.4 and names `event-source` turns and `sensitive` results explicitly. §13 gains **trust derivation** (previously undefined, which made the gate unimplementable), **result-level taint**, and a single `source` enum (adds `review` and `migrate`; Design A.9's divergent enum is removed). §7.2 gains LearnQueue **overflow** (`reject-with-event`, never silent eviction), a byte-equal **`diffKey`**, and **staleness** re-validation at accept. §4.6 **defines** session retention (180 days). §12 surfaces the new controls. New IDs: V-MEM-18..21. |
| 2026-10-08e | §4.5 gains a **short-CJK** rule: FTS5 `trigram` requires ≥3 characters, so 1–2 character Chinese queries (`过敏`, `花生`) need a substring-scan fallback reporting `engine: "scan"`. §4.7 specifies **which model** runs background review (per-account `reviewModel` → account provider; cloud only with `reviewInCloud: true`; Privacy Mode forces local-or-skip) and that the review may not call a smart-home tool. §9 pins the **consolidate schedule** (nightly at `consolidateAt` jittered, idle after 15 min, `Compact now`, optional long-session) and that the daemon owns it. §12 aligned with Design §10.1 and extended (caps, `reviewInCloud`/`reviewModel`/`consolidateAt`, reload-standing, soft-loss signal). |
| 2026-10-08 | **Review remediation.** §4.2 replaced "~" ranges with **exact v1 caps** (L1 2000 / L2 4000 / L3 2000 chars; PendingLearn cap 50 per account, 30-day expiry; COMPACT rotate 20 entries or 20 000 chars) so V-MEM-4 is testable. §4.5 corpus **excludes `memory/compact/**`** and now requires a **CJK-capable tokenizer** (`trigram`) because `preferred_language: zh` is first-class in Design A.9; `paths` is bounded to the corpus. §5.2/§5.3 **resolve the StandingStore-vs-backend ownership conflict**: core is the sole writer of L1–L3, `appendNote` on standing paths is removed, a backend may only read them and write its own L5/L6 state. §5.4/§1 re-sourced: OpenHuman v0.57.52 **still ships** the Memory Tree, so the reject-in-core decision rests on ops cost, multi-source scope and inspectability — not on a roadmap claim. V-MEM-13 extended. |

---

## 1. Why this design exists

A home agent that forgets is not a home agent. Peers prove both what works and what hurts:

| Peer | Keep | Avoid copying wholesale |
|------|------|-------------------------|
| **OpenClaw** | USER/MEMORY/daily split; bootstrap budgets; dreaming + review diary; flush before compact; memory plugin slot; action-sensitive notes | Always-on active-memory; full 3-phase dreaming day one |
| **Hermes** | Scarce always-on facts; facts vs skills; write approval; session FTS search; learning loop | Frozen mid-session snapshot; silent skill overwrite; tiny fixed caps with no Settings |
| **OpenHuman** | Provenance; human-readable vault spirit (Markdown bodies as source of truth); on-demand deep walk | Tree engine as **core** (still shipped in v0.57.52); integration sync as an always-on default |
| **HomeClaw** | Standing vs RAG vs KB separation; authority rule; per-user paths; flush turn | Cognee-required; four stores without one Settings story |

Full matrix: [analysis/peer-memory-systems.md](analysis/peer-memory-systems.md).

---

## 2. Goals and non-goals

### 2.1 Goals (Normative)

1. Agent can **remember**, **recall**, **forget**, and **learn** under operator control.  
2. Standing knowledge is **inspectable** (Markdown/JSON + Settings).  
3. **Scarce bootstrap** + **tools/search for depth** (Hermes/OpenClaw).  
4. **Save before compaction** (OpenClaw/HomeClaw flush).  
5. **No cross-account bleed** (HomeClaw).  
6. Consolidation and skill learning are **gated / reviewable**.  
7. Stable **MemoryFacade + MemoryBackend slot** so Tree/RAG can plug in later.  
8. Standing inject **refreshes** after successful remember in the same session (fix Hermes freeze debt).

### 2.2 Non-goals (v1)

| Reject / defer | Why |
|----------------|-----|
| Full Memory Tree in core | P2-Q5; ops cost + multi-source scope + inspectability — **not** a claim that OpenHuman dropped theirs |
| Eager every-turn deep recall | Latency; escalate later only |
| Silent auto-fetch into standing | Privacy; Channel/DAG jobs later |
| TokenJuice as memory | Harness tool_result middleware |
| Required Cognee/heavy graph | Optional backend |
| Opaque embedding-only standing memory | Violates inspectability |
| One undifferentiated “memory blob” | Peer debt everywhere |

---

## 3. Architecture overview

```text
                    ┌─────────────────────────────────────┐
                    │           EnvoyHome daemon          │
                    │  turn pipeline · policy · Settings  │
                    └───────────────┬─────────────────────┘
                                    │
                    ┌───────────────▼─────────────────────┐
                    │     MemoryFacade (core, Normative)  │
                    │  remember / recall / forget         │
                    │  session_search · flush · compact   │
                    │  pending learn · listMemory RPCs    │
                    └───────────────┬─────────────────────┘
     ┌──────────────┬───────────────┼───────────────┬──────────────┐
     ▼              ▼               ▼               ▼              ▼
 WorkingStore  StandingStore   SessionIndex   LearnQueue    CompactDiary
 (transcript)  (profile+md)    (FTS/episodic) (pending)     (COMPACT.md)
                    │
           ┌────────▼────────┐
           │ MemoryBackend   │  optional deep (RAG / Tree / …)
           │  default: files │
           └─────────────────┘
```

**Core owns:** Facade, **StandingStore (L1–L3 files always)**, session index (L4), LearnQueue, CompactDiary, flush/consolidate jobs, Settings.  
**MemoryBackend owns only L5/L6 (deep/KB), plus its own state under `accounts/<id>/memory-backend/`.** The default `files` backend may implement `searchNotes` as a **read-only** convenience over the same L2/L3 paths, but it does **not** write them and does **not** replace StandingStore (§5.3 rule 2). Tree/RAG plugins must not become the sole copy of standing facts.

---

## 4. Layers — do not conflate (Normative)

Peers that mix “everything is memory” become unmaintainable. EnvoyHome names **eight** layers (L0–L7):

| Layer | Store | Job | Bootstrap inject? | Peer inspiration |
|-------|-------|-----|-------------------|------------------|
| **L0 Working** | Session transcript | Live conversation | Yes (window + compact) | all |
| **L1 Profile** | `profile.json` (USER-like) | Stable prefs / identity facts | Yes, **capped** | OpenClaw USER.md, Hermes USER.md, HomeClaw profile |
| **L2 Standing notes** | `MEMORY.md` | Durable non-profile facts/decisions | Yes, **capped** | OpenClaw/Hermes MEMORY.md |
| **L3 Daily** | `memory/YYYY-MM-DD.md` | Working observations | Today+yesterday **capped** | OpenClaw/HomeClaw daily |
| **L4 Episodic search** | Session FTS / chat index | “What did we say last week?” | No — **tool** | Hermes `session_search` |
| **L5 Deep / RAG / Tree** | MemoryBackend | Semantic / hierarchical / multi-source | No — **recall tool** only | OpenClaw engines, HomeClaw RAG, OpenHuman tree |
| **L6 Doc KB** | Optional KB backend | Saved docs/clips (**not** chat stream) | No — tool / gated inject | HomeClaw Knowledge base |
| **L7 Skills** | Skill packages | Procedural “how” | Progressive disclosure | Hermes skills |

### 4.1 Authority / conflict (Normative — Adapt HomeClaw + OpenClaw)

1. This turn’s explicit user instruction wins for the reply.  
2. **L1 Profile** > **L2 MEMORY** > **L3 daily** > **L5/L6** deep/KB.  
3. L5/L6 never silently overwrite L1/L2.  
4. System prompt labels each injected block so the model knows the hierarchy.

### 4.2 Bootstrap budgets (Normative — Adapt Hermes/OpenClaw)

Standing memory is **scarce by design**. Two budgets per asset, both exact and both enforced — a build that does not enforce them fails V-MEM-4:

| Asset | `injectBudget` (chars) | `rawSoftCap` (file on disk) | Action on crossing `rawSoftCap` |
|-------|------------------------|------------------------------|----------------------------------|
| L1 `profile.json` | **2000** | **20 000** | Doctor issue `memory.profile_raw_oversize`; consolidate proposes supersede/removal. Never auto-delete a fact. |
| L2 `MEMORY.md` | **4000** | **40 000** | **Consolidate rewrites L2** (merge duplicates, retire stale entries to L3/COMPACT). At 2× cap → Doctor `memory.memory_raw_oversize` severity=warn. |
| L3 daily (today + yesterday) | **2000 combined** | **10 000 per file** | Older days stay on disk but leave the inject window; past 20 000 → Doctor issue. |
| COMPACT.md | not injected | **20 000 chars or 20 entries** | Rotate to `memory/compact/` (§9 rule 6). |
| PendingLearn | n/a | **50 entries / 30 days** | **Reject the new proposal** with event `home:learn-rejected-full`; never evict silently (§7.2). |
| L4 session FTS | no inject | session retention (§4.6) | Purge with the session. |
| L5/L6 | **off** (tool-only in v1) | backend-owned | — |

**Definition of `injectBudget` (Normative).** It is the character count of the **exact serialized block that is placed in the prompt, including that block's label/header and all JSON punctuation**. So L1's budget is measured on the rendered JSON, not on the sum of fact strings; L2's on the rendered Markdown; L3's on the sum of the two rendered daily blocks. Two implementations that disagree on the serialization will disagree on truncation — this definition is what makes V-MEM-4 falsifiable.

**Definition of the L2 inject builder (Normative).** The builder is **section-aware, not prefix truncation**: it walks `MEMORY.md` in file order, keeps whole sections that fit (whole sections and whole bullets only, never a half line), and prefers the sections named by `policy.json` → `injectPrioritySections` (default `["## Standing"]`). Sections that do not fit are replaced by a one-line `§ <heading> — N entries omitted` marker. This is what makes §4.2's "prefer high-signal head sections" achievable rather than aspirational.

**`home.listMemory` MUST report the contract**, not just the current sizes: per asset `{ rawChars, injectChars, truncated, injectBudget, rawSoftCap }`, and a `truncated` flag on `profileSummary` as well as on `notes[]` (see Design Appendix A.9).

The L3 recall corpus is `MEMORY.md` + `memory/*.md` **excluding** `memory/compact/**` — rotated consolidation diaries are not daily notes (§4.5).

**Truncate ≠ delete.** Full files remain on disk. Caps are measured in **characters** as a v1 proxy; Settings may later expose token estimates. When any standing inject is truncated, the system prompt **must** include a fixed one-liner: standing bootstrap may be partial — use `recall` / `session_search` for more. (Verification: V-MEM-10.)

**Inject policy (Normative):** prefer keeping **high-signal head sections** of MEMORY.md (e.g. `## Standing` / bullet facts) inside the cap; push long narrative into daily files. Consolidate’s job is to **reshape** L2 so the injectable set stays useful — not to rely on blind tail truncation forever.

### 4.3 Refresh after write (Normative invent — fix Hermes)

After a successful `remember` / `profile_update` / `acceptLearn` that mutates L1/L2/L3:

- Next model call in the **same session** must see updated standing inject (rebuild standing prefix), **or**  
- Explicitly append a short “memory updated” system note with the new fact.

Do **not** require `/new` for the agent to “know” what it just saved.

### 4.4 Profile schema (Normative — supersede-by-key)

`accounts/<accountId>/profile.json`:

```json
{
  "version": 1,
  "updatedAt": "ISO-8601",
  "facts": {
    "<key>": {
      "value": "string|number|boolean|string[]",
      "updatedAt": "ISO-8601",
      "source": "user_tool|flush|consolidate|review|learn_accept|migrate|backend_ingest"  // §13 — one enum, not two
    }
  }
}
```

| Rule | Behavior |
|------|----------|
| Write same `key` | **Replace** prior fact (supersede); do not append a second contradictory active value |
| `removeKeys` | Delete keys |
| Inject | Serialize facts under char/token budget; prefer stable identity keys first |
| Lists | Whole-array replace on update (caller sends full list) |

Wire: `home.getProfile` / `home.updateProfile` — Design Appendix **A.9**.

### 4.5 `recall` v1 (Normative)

| Rule | v1 |
|------|-----|
| Corpus | **L2 `MEMORY.md` + L3 `memory/*.md` only** (account-scoped). **Excludes `memory/compact/**`** — rotated consolidation diaries are not daily notes (§4.2, §9 rule 6) |
| Engine | **Keyword + FTS** (SQLite FTS5 or equivalent). No embedding model required. |
| **Tokenization (Normative — both indexes)** | FTS5's default `unicode61` tokenizer does **not** segment CJK — it treats a whole Chinese run as a single token, so search silently returns nothing. Configure **`tokenize='trigram'`** (or an equivalent CJK-capable tokenizer) for **both** the L2/L3 file index *and* the **L4 session index** (`session_search`). `preferred_language: "zh"` is a first-class value in Design Appendix A.9, so a Chinese query MUST match Chinese content in **both** `recall` and `session_search`; an L4 index left on `unicode61` is a silent, untested failure. Precedent: Hermes ships `messages_fts` **and** `messages_fts_trigram` for exactly this (`hermes_state.py:612,641`). |
| **Short CJK runs (Normative)** | FTS5's `trigram` tokenizer indexes **3-character** sequences, so it cannot match a query whose CJK run is **1–2** characters — and very common Chinese terms are 2 (`过敏` allergy, `花生` peanut) or even 1. **The trigger is the length of a CJK run, not the length of the query.** A mixed query such as `花生 allergy` (6 chars, 2-char CJK run) MUST still find `花生`; testing total query length gets this wrong and passes a naive test while failing the bilingual case that `preferred_language: "zh"` exists to serve. Required behaviour: if the query contains **any CJK run shorter than 3 characters** (or any CJK run not fully covered by trigrams), fall back to a **substring scan** (`instr`/`LIKE`) over the whole query text and report `engine: "scan"`.

**The fallback covers both indexes, or `V-MEM-13` is unsatisfiable on `session_search`.** An earlier revision defined the scan only "across the L2+L3 corpus", while the tokenization rule above requires the session index to be trigram-tokenised as well — and trigram cannot match a 1–2 character run in *any* index. So:

| Index | Scan scope | Bound |
|-------|-----------|-------|
| L2 + L3 (`recall`) | `MEMORY.md` + `memory/*.md`, whole corpus | small and in-process by design; no bound needed |
| **L4 sessions** (`session_search`) | the **current session first**, then the most recent `N` sessions whose retention window is open (default `N = 20`), newest first | the session index is *not* small, so the scan is bounded and reports `truncatedSearch: true` when it stops early rather than silently returning a subset |

`session_search` hits carry the same per-hit `engine` (`"fts"` \| `"scan"`) and are merged with the same `(engineRank, score)` ordering, so a caller can always tell which path served a hit. |
| **Merging two engines (Normative)** | When a call can be served by both paths, hits MUST carry the per-hit `engine` (`"fts"` \| `"scan"`), and the merged list MUST NOT be ordered by raw score across engines: BM25 is a corpus statistic and a raw scan score is not comparable to it. Order by `(engineRank, score)` — FTS hits first, scan hits appended — so `limit` is meaningful and results are stable. The caller can always re-rank. |
| API | Tool `recall` + RPC `home.recall` → hits with `path`, line range, `snippet`, `score`, `engine: "fts"` \| `"scan"` |
| Ranking | Within an engine: BM25 (fts) / term overlap (scan); `limit` default 8; merged order per the rule above |
| Path bounds | `home.recall`'s optional `paths` narrows **within** the corpus; it is not an arbitrary path list and MUST be jail-checked (Design §4.5 V-SEC-2) |
| Not in v1 | Hybrid embed, L5 Tree walk, cross-account, auto-inject of hits |

Hybrid embed search → **v1.x** (still file-owned). L5 `MemoryBackend.recall` only when a deep backend is enabled.

### 4.6 Session FTS retention (Normative)

`session_search` (L4) indexes session transcripts.

| Rule | Behavior |
|------|----------|
| **Retention default (Normative)** | Sessions and their FTS rows are kept **180 days** (`sessionRetentionDays`, per-account, Settings-tunable; `0` = forever). This is the definition V-MEM-14 tests against — retention is no longer a dangling reference. |
| Lifetime | FTS rows **live and die with session retention** |
| Purge | When a session is deleted/expired by Settings retention, drop its FTS rows in the same job |
| PII | Same account sandbox as transcripts; no cross-account search |
| Not a standing store | Hits are episodic; promote to L2/L3 only via flush/remember/consolidate |

Retention is Normative and defined above (180 days, `sessionRetentionDays`), so there is no "if Settings has no retention yet" case: a build that keeps FTS rows without a retention policy fails V-MEM-14. Doctor still warns on index orphans (rows whose session file is gone) as a corruption signal.

### 4.7 Background review vs local GPU (Normative)

After-turn learning review (aux model):

1. If the **main local model is busy** (active turn / model loading) → **defer** the review to an idle queue (Hermes-style).  
2. **The aux model is resolved like any other model call and the account's mode wins.** Order: (a) an explicit per-account `reviewModel` in `accounts/<id>/policy.json` if set; (b) otherwise the account's current provider in `local`/`mix` mode; (c) in `cloud` mode, the account's cloud provider **only if** `reviewInCloud: true` is set for that account — otherwise the review is skipped, not silently sent to the cloud. Privacy Mode forces local-or-skip regardless (Design §8.3, Design §19.4).  
3. **Defer must not drop forever:** the idle queue is bounded (default **50 pending reviews per account**), and multiple pending reviews for one account **coalesce into one** rather than queueing N.  
4. **The review runs unattended** (Design §4.3.3): it may read recent session text and write only through the §7 write paths — L3 append, or PendingLearn. It may not `exec`/`network`, and it may not call a smart-home tool (Design §5.7.2).  
5. Verification: V-MEM-15.

---

## 5. MemoryBackend slot (Normative)

### 5.1 Why

Stable contracts from day one; default files; Tree/RAG without rewriting the daemon. Mirrors OpenClaw memory engines / Hermes providers — **one active deep backend**.

### 5.2 Interface (conceptual v0)

```text
MemoryBackend {
  id, name, version
  capabilities[]   // "read_standing" | "search" | "ingest" | "tree_walk" | "kb" | …

  // Read-only over core-owned standing paths (L2/L3). A backend NEVER writes them.
  readNotes(accountId, path?) -> NoteBundle
  searchNotes?(accountId, query, opts) -> Hit[]

  // Writes are confined to backend-owned state (L5/L6, `memory-backend/`).
  ingest?(accountId, source, payload) -> IngestResult
  recall?(accountId, query, opts) -> Hit[]   // provenance required
  walk?(accountId, cursor) -> WalkPage

  health() -> { ok, detail? }
}
```

### 5.3 Rules

1. One deep backend active per account (Settings).
2. **Write ownership is not shared.** `StandingStore` (core) is the *only* writer of L1 `profile.json`, L2 `MEMORY.md` and L3 `memory/*.md`. A backend may **read** those paths (via `readNotes` / `searchNotes`) and may write only its own state under `accounts/<id>/memory-backend/` and its L5/L6 stores. There is **no** `appendNote` on a core standing path in v1 — this resolves the §3-vs-§5.2 conflict, and it is what V-MEM-6 and Plan §4 B8 assert.

   *Why:* §9 rule 7's writer lock covers "flush, consolidate, acceptLearn, and standing tool writes". A backend appending to L2 would be a second writer outside that lock, which is exactly how MEMORY.md gets torn (V-MEM-11).
3. The **default `files` backend** does not need `ingest`/`walk`: core already is the file store. It exists so `capabilities` has an honest zero-plugin answer (V-MEM-5), and it may expose `searchNotes` over L2/L3 as a read-only convenience.
4. `ingest` / `walk` require explicit enable; unattended cannot exec.
5. Sandbox / account path only.
6. Profile/skill mutations still go through **LearnQueue** — including when a backend proposes them.
7. Conversation RAG ≠ Doc KB — advertise separate capabilities if both exist.
8. Disabling a deep backend must leave L1–L3 intact and readable (V-MEM-12).

### 5.4 Memory Tree (later)

Optional backend only. See **Design §19.7** + [memory-tree-and-autofetch.md](analysis/memory-tree-and-autofetch.md). **Re-verified 2026-10-08:** OpenHuman v0.57.52 still ships the tree (`memory_tree/tree/bucket_seal.rs`, `mem_tree_*` tables) with Markdown `content/` as the source of truth. The reason to keep a tree engine out of EnvoyHome core is **ops cost (job queue + workers + seal cascade), multi-source scope we do not have at v1, and inspectability** — not a claim that OpenHuman abandoned it. Do not vendor it either way.

---

## 6. Data layout (Normative)

```text
<data>/accounts/<accountId>/
  profile.json              # L1
  MEMORY.md                 # L2
  memory/
    YYYY-MM-DD.md           # L3
  COMPACT.md                # consolidate / dreaming-lite diary (Adapt DREAMS.md)
  sessions/
    <sessionId>/…           # L0 + FTS source
  learns/
    pending/<learnId>.json    # {id, accountId, kind, diff, sourceTurnId?, createdAt, expiresAt,
                              #  trust, baseDigest, diffKey, stale} — §7.2, surfaced by
                              #  home.listPendingLearns (Design A.9)
    accepted/…
    rejected/…
  memory-backend/           # L5/L6 plugin state
```

---

## 7. Write paths (Normative)

| Trigger | Path | Gate |
|---------|------|------|
| User “remember / forget” (clear) | Tools → L1/L2/L3 | Immediate if policy allows; **refresh inject** |
| Pre-compaction | **Memory flush** turn (§8) | Writable workspace; no user-visible housekeeping |
| Background after-turn review | LearnQueue | Skills **always** pending; L1/L2 note proposals **pending by default** (v1); L3 daily append from review may apply direct if under cap |
| Consolidation job | L3/L2 append **or** LearnQueue | §9 |
| Channel sync (later) | Backend ingest / note | Job policy |
| Pre-turn active recall (later) | Read-only | Opt-in escalate; default off |

### 7.0 `remember` routing (Normative invent)

| Shape | Destination |
|-------|-------------|
| Stable preference / identity (“my name is…”, “I prefer…”) | **L1 profile** (`profile_update`) |
| Durable non-profile fact / decision | **L2 MEMORY.md** |
| Ephemeral observation / “today we…” | **L3 daily** |
| Procedure / how-to | **Skill pending learn** — not MEMORY |

Ambiguous → L3 daily (safer); consolidate may later promote L3 → L2.

### 7.1 Action-sensitive notes (Adapt OpenClaw)

When a note changes future **behavior** (approvals, expiry, “don’t act until…”), prefer structured fields or clear prose: **what / when applies / expires / avoid / owner**. Memory does not enforce policy — Approvals / sandbox do.

### 7.2 LearnQueue across sessions (Normative — was R8)

| Rule | Behavior |
|------|----------|
| Scope | **One pending queue per `accountId`** — shared by all sessions/devices for that account |
| Not per-session | Do not create separate queues per `sessionId` |
| UX | Settings Memory lists all pending for the account; optional filter by `sourceTurnId` / session |
| Accept | Applies to shared L1/L2/L7; **all** open sessions for that account refresh standing inject on next turn (same as §4.3) |
| Dedup | Coalesce pending items whose **`diffKey`** is equal (defined below) while queued |
| **Overflow** | At the §4.2 cap (50) a new proposal is **rejected, not queued and not evicting**: the daemon emits `home:learn-rejected-full` with `{accountId, kind, reason: "queue_full"}` and the turn's review records the drop. Silent eviction of the oldest is forbidden — losing a proposal the agent judged worth keeping is worse than a full queue. |
| **Staleness** | A PendingLearn stores **`baseDigest`** = `sha256:` + lowercase hex of the canonical form (Design §4.4) of `{path, byteLength, content}` where `content` is the target file's full UTF-8 text at queue time. At `acceptLearn`, if the target's current digest differs, the item is **re-validated**: it is marked `stale`, and accept either (a) re-applies cleanly if the patch still applies, or (b) fails with `envoyhome.learn_stale: …` and stays pending with `stale: true` so the operator can re-review. Never patch against a base that moved. The canonical form is deliberately the same one grants use — one implementation, so a digest can never mean two things. |
| **`diffKey`** | `sha256(kind + "\u0000" + normalizedTargetPath + "\u0000" + normalizedAddedText)`, where `normalizedAddedText` lowercases, collapses whitespace, and strips trailing punctuation. Two proposals coalesce **iff** their `diffKey` is byte-equal — "similar" is deliberately not a distance metric, because a threshold would be untestable. |

Verification: V-MEM-16, V-MEM-19.

### 7.3 External / human edits (Normative — was R9)

Standing files may be edited outside the agent (Settings editor, Obsidian, vim).

1. All agent/daemon writers take the **per-account writer lock** (§9).  
2. Before inject and before any standing write, daemon reads **mtime (or content hash)** of L1/L2/L3; if changed since last load → reload StandingStore.  
3. Settings **Reload standing** button forces reload + refreshes open sessions.  
4. If reload detects conflict with an in-flight tool write → fail the tool with a clear error; do not silently clobber human edits.  
5. Optional: watch `MEMORY.md` / daily for mtime (debounce) while Settings memory screen is open.

Verification: V-MEM-17.

---

## 8. Pre-compaction memory flush (Normative — Adopt OpenClaw/HomeClaw)

Before session compaction discards detail:

1. Run a **silent flush turn** (or tool-only flush plan) with a private conversation copy.  
2. Allow only memory persistence tools (+ read lookup).  
3. Persist per **§8.1** (L3 vs L2 vs pending).  
4. Failure/skip must **not** block compaction.  
5. Prefer local/cheap model override for flush when configured.  
6. Default **on**; Settings can disable per account.

This is distinct from nightly consolidate (§9) and from TokenJuice.

### 8.1 Flush write policy (Normative — was R10)

**The taint gate is one rule, applied to every target.** `trust` is derived per §13 (it is *not* the turn's trust if the turn carried tainted results — see §13's result-level taint), from the binding flags defined in Design Appendix A.3. If `trust == "untrusted"` — which includes **every turn originating from a `kind: "event-source"` channel** (Design §5.7.4 rule 2) — flush may write **nothing** directly; it proposes PendingLearn or drops.

| Target | When flush may write |
|--------|----------------------|
| **L3 daily** | **Always allowed** when `trust ∈ {owner, agent}` and the append stays under the L3 `rawSoftCap`. **Not allowed when `trust == "untrusted"`** → PendingLearn (`memory_append`) or drop. Preferred parking for flush output. |
| **L2 MEMORY.md** | Direct append/merge **only if** (a) the result stays under `rawSoftCap` (§4.2) **and** (b) `trust ∈ {owner, agent}` |
| **L1 profile** | **Never** direct from flush → **PendingLearn** (`profile_patch`) |
| **L7 skills** | **Never** from flush → PendingLearn if suggested at all |
| Over cap / untrusted / ambiguous durable fact | **PendingLearn** (`memory_append` / `memory_edit`) |
| **Any turn that read a `sensitive`-classified tool result** (secrets, presence/lock/camera state — Design §4.3) | The affected spans are **untrusted regardless of who asked**; the question is not an instruction to remember. PendingLearn only. |

Rationale: flush must not lose context before compact, but must not silently rewrite the curated injectable MEMORY or profile — and it must not launder tainted content into standing memory simply because the turn looked attended.

Cross-reference: Design §5.7.4 rule 1 states the same gate for device/presence state and names every store it covers (L0, L1, L2, L3, COMPACT.md, L5/L6, artifacts). If the two ever disagree, **Design §5.7.4 wins** for smart-home-derived content.

---

## 9. Consolidation — dreaming-lite (Normative)

**Purpose:** Promote strong short-term signal → durable L2 without dumping transcripts.

**Triggers (Normative — who runs this):** the **daemon** owns the schedule, not a plugin or an external cron.

| Trigger | Fires when |
|---------|-----------|
| Nightly | Once per account per local day, at `consolidateAt` (default **03:30 local**, jittered ±15 min per account) if the machine is awake and no turn is active |
| Idle | 15 continuous minutes with no active turn and no queued review, and at least one session was touched since the last run |
| Settings **Compact now** | Operator-triggered (`home.compactMemory`) — always allowed, ignores idle gating |
| Optional after long session | A session longer than `longSessionTurns` (default **80**) closes |

Missed nightly runs coalesce into the next run (one pass, not N). A disabled account is skipped entirely. Unattended policy applies (§4.3 of the parent).

**Adapt OpenClaw dreaming, simplify:**

| OpenClaw | EnvoyHome v1 |
|----------|--------------|
| Light / REM / Deep | Single consolidate pass + optional cheap rewrite |
| Score + recall + diversity gates | Simple gates: min length, not greeting, optional min repeats |
| `DREAMS.md` | **`COMPACT.md`** diary + Settings summary |
| Only Deep writes MEMORY | Consolidate may append L3 always; L2 MEMORY / L1 profile via **safe append** or **PendingLearn** |
| Taint gate | Untrusted channel content → pending only |

**Rules**

1. One `accountId`.  
2. Unattended: no exec/network unless grant.  
3. Profile/skill mutations → LearnQueue.  
4. Emit `home:memory-compacted`; append COMPACT.md summary.  
5. Disable per account.  
6. **COMPACT.md rotate:** keep last N entries or max chars (Settings); older under `memory/compact/` or drop.  
7. **Writer lock:** per-account mutex across flush, consolidate, acceptLearn, and standing tool writes.

---

## 10. Gated learning loop (Normative — Adapt Hermes)

```text
Turn ends
  → optional review (aux model ok): update profile / MEMORY / skill?
  → PendingLearn { accountId, kind, diff, sourceTurnId, createdAt }
  → Settings / home.listPendingLearns
  → acceptLearn | rejectLearn
  → mutate L1/L2/L7 only after accept (skills always)
```

**Kinds:** `profile_patch` | `memory_append` | `memory_edit` | `skill_create` | `skill_patch` | `skill_delete`

**Default:** background review **on**; skills require accept; explicit user remember may write L1/L2 via tools immediately.

**Split:** memory = **what/who**; skills = **how** (Hermes). Do not stuff procedures into MEMORY.md.

Optional later: nudge every N turns if no memory tool used (Hermes nudge) — Provisional.

---

## 11. Tools and RPCs

### 11.1 Agent tools (v1)

| Tool | Role |
|------|------|
| `profile_get` / `profile_update` | L1 (supersede-by-key, §4.4) |
| `remember` | L2/L3 append (route fact-shaped → profile when clear) |
| `recall` | v1 keyword/FTS over L2+L3 (§4.5); + L5 only if backend enabled |
| `forget` | Edit/remove L1/L2/L3 |
| `session_search` | L4 episodic FTS — retention = session retention (§4.6) |

### 11.2 `home.*` RPCs (v1)

Full JSON schemas: Design **Appendix A.9**.

| Method | Role |
|--------|------|
| `home.getProfile` / `home.updateProfile` | L1 supersede-by-key |
| `home.listMemory` | Notes listing + raw vs inject sizes |
| `home.recall` | FTS/keyword over L2+L3 |
| `home.forget` | Remove profile key or note content |
| `home.compactMemory` | Consolidate now |
| `home.listPendingLearns` | Queue |
| `home.acceptLearn` / `home.rejectLearn` | Apply / discard |

Provisional later: deep `home.memorySearch` when L5 enabled.

---

## 12. Settings (Normative)

Screen **`memory`** — this is the authoritative list; Design §10.1's `memory` row is a summary of it and must match:

- View L1 / L2 / L3, with **raw vs injected sizes** and the `truncated` flag per asset
- **Exact caps** — both budgets per asset: `injectBudget` (L1 2000 / L2 4000 / L3 2000 combined) **and** `rawSoftCap` (L1 20 000 / L2 40 000 / L3 10 000 / COMPACT 20 000 or 20 entries), PendingLearn 50 @ 30 d — editable per account, defaults shown (§4.2)
- **Session retention** (`sessionRetentionDays`, default 180, `0` = forever) and the resulting FTS purge (§4.6; field schema in Design §8.3)
- **Trust lists**: `policy.json` → `trustedChannels[]` (which channels may produce `agent`-trust writes) and `searchTainted` (whether `session_search` may return tainted spans — default off) (§13, §4.6)
- **LearnQueue state**: depth vs cap; a **stale badge** per proposal (`stale: true`, with the base that moved) and a re-review action (§7.2); the coalescing group key (`diffKey`); and the last `home:learn-rejected-full` event if the cap was hit (§7.2)
- COMPACT.md and the last consolidate summary; **rotation size**
- Pending learns: list, filter by session/turn, accept, reject, coalesce state
- **Compact now**; **flush on/off**; **review on/off**; `reviewInCloud`, `reviewModel`, `consolidateAt`
- **Active MemoryBackend** and its capabilities/health; switching it must state that L1–L3 are unaffected (V-MEM-12)
- "Reload standing" (external-edit reload, §7.3)
- A **soft-loss signal**: turns since the last standing write, so an operator can see that `remember` is never being called

---

## 13. Provenance (Normative)

**One `source` enum, used by both provenance and the profile fact schema.** Design Appendix A.9 previously carried a second, narrower enum (`user_tool | learn_accept | migrate`) — that was a bug. There is exactly one:

```json
{
  "source": "user_tool" | "flush" | "consolidate" | "review" | "learn_accept" | "migrate" | "backend_ingest",
  "turnId?": "…",
  "channel?": "mesh|telegram|…",
  "at": "ISO-8601",
  "backendId?": "files|…",
  "trust": "owner" | "agent" | "untrusted",
  "taintSpans?": [{ "toolName": "ha_get_state", "reason": "presence" }]
}
```

`review` was missing although background review is a real L3 writer (§4.7); `migrate` was missing although the HomeClaw import writes profiles (Design Appendix B).

**`trust` derivation (Normative — this was previously undefined, which made the whole gate unimplementable).**

| Origin of the write | `trust` |
|---------------------|---------|
| Loopback owner-window session (`home.*` over loopback, no device token) | `owner` |
| A paired device with `ownerTrusted: true` (Design Appendix A.3) | `owner` |
| Scheduled/unattended daemon jobs: consolidate, flush, scheduled review | `agent` |
| A turn submitted by a user over a transport whose binding is `trustedChannel: true` (Design Appendix A.3; surfaced as `policy.json` → `trustedChannels[]`, Design §8.3) | `agent` |
| A turn submitted over any other channel binding (Telegram DM, HTTP hatch, sidecar) | `untrusted` |
| **Any turn originating from a `kind: "event-source"` channel** (MQTT, Home Assistant) | `untrusted` — always, even for the owner's own devices (Design §5.7.4 rule 2) |
| Anything a backend ingests (`backend_ingest`) | `untrusted` until reviewed |

**Result-level taint (Normative).** Trust is not purely a property of the turn: a write that includes spans derived from a `sensitive`-classified tool result (Design §4.3 — secrets, presence/occupancy/lock/camera state) is `untrusted` **for those spans**, even if the surrounding turn is `owner`. Otherwise "Alice asked whether the door was locked, then said remember" launders presence into L2. Tools declaring a `sensitive` class MUST mark their results, and flush/consolidate MUST honour `taintSpans`.

**Accepted learns keep their origin's taint.** `acceptLearn` MUST copy the PendingLearn's originating `trust` into the resulting write's provenance; an accepted proposal does not become `agent` merely because a human clicked accept (Design Appendix A.9's `trust: "agent"` on the pending row is a rendering of the pending record, not a laundering step).

`untrusted` → cannot auto-promote to L1/L2 (OpenClaw taint spirit); it may only enter through an explicit user instruction or an accepted PendingLearn.

---

## 14. Security & isolation

1. All APIs scoped by `accountId`.  
2. Backend sees only account memory paths.  
3. Flush/compact/learn = unattended policy.  
4. No cross-account recall/search.  
5. Export links account-bound signed tokens.

---

## 15. Phased delivery

| Phase | Deliver |
|-------|---------|
| **v1** | Facade + L1–L3 files + L4 session_search + LearnQueue + flush + consolidate + COMPACT.md + tools/RPCs/Settings + refresh-after-write |
| **v1.x** | Stronger note search (hybrid keyword+embed) still file-owned |
| **Later** | MemoryBackend (light RAG / Tree); Channel ingest jobs; opt-in escalate recall; soft nudges |
| **Not memory** | TokenJuice; fleets |

---

## 16. Verification

| ID | Criterion |
|----|-----------|
| V-MEM-1 | No cross-account recall / compact / session_search |
| V-MEM-2 | Compact/flush cannot exec/network without grant |
| V-MEM-3 | Prompt authority L1 > L2 > L3 > L5/L6 |
| V-MEM-4 | Bootstrap caps enforced; Settings shows truncation |
| V-MEM-5 | Default files backend works with zero plugins |
| V-MEM-6 | Tree/RAG backend cannot bypass LearnQueue for skills |
| V-MEM-7 | After `remember`, same session sees updated standing fact |
| V-MEM-8 | Flush runs before compact when enabled; skip does not block compact |
| V-MEM-9 | session_search does not require L5 backend |
| V-LEARN-1 | Skill unchanged until `acceptLearn` |
| V-LEARN-2 | Background review: skills always pending; L1/L2 proposals pending by default (no silent skill/profile write) |
| V-LEARN-3 | Provenance on flush/consolidate/learn writes |
| V-UX-MEM-1 | Settings: view, pending learns (with stale badge), compact, caps and the exact §4.2 defaults, flush/review toggles, active backend
| V-MEM-10 | When inject truncated, prompt contains recall/session_search duty line |
| V-MEM-11 | Concurrent flush + remember cannot corrupt MEMORY.md |
| V-MEM-12 | Disabling L5 backend leaves L1–L3 intact |
| V-MEM-13 | `recall` v1 is keyword/FTS over L2+L3 only (no embed required); **a CJK query matches CJK content** — including a **1–2 character CJK run inside a longer mixed query** (`花生 allergy`), and including **`session_search`** (both indexes trigram-tokenised, both covered by the bounded scan of Memory Design §4.5); merged `fts`+`scan` hits carry a per-hit `engine` and are ordered by `(engineRank, score)`; `memory/compact/**` is excluded from the corpus |
| V-MEM-14 | Session FTS rows are purged with session retention, using the **defined** default of 180 days (`sessionRetentionDays`, §4.6) |
| V-MEM-15 | Background review defers when local main model is busy (no GPU fight) |
| V-MEM-16 | One LearnQueue per account; accept refreshes all sessions |
| V-MEM-17 | External MEMORY.md edit reloads before inject; no silent clobber (check performed **inside** the writer lock; last-writer-wins with a Doctor warning on a detected external-during-agent-write) |
| V-MEM-18 | **Caps contract enforced**: inject truncation is measured on the serialized block including labels; `rawSoftCap` is enforced with its defined action; the L2 inject builder is section-aware (whole sections/bullets, `§ <heading> — N entries omitted` marker); `home.listMemory` returns `injectBudget`/`rawSoftCap`/`truncated` per asset **and** a `truncated` flag on `profileSummary` |
| V-MEM-19 | **LearnQueue discipline**: a proposal over the cap is rejected with `home:learn-rejected-full` (no silent eviction); equal `diffKey`s coalesce and unequal ones do not; accepting against a moved base either re-applies cleanly or fails `envoyhome.learn_stale` and stays pending |
| V-MEM-20 | **Backend containment**: disabling a deep backend leaves L1–L3 intact **and** deletes nothing; deleting a session purges its derived L5 documents in the same job; deleting an account removes `memory-backend/` state; a backend cannot return another account's chunk (tested with two accounts sharing one backend instance) |
| V-MEM-21 | **Trust derivation**: an `event-source` turn is `untrusted` for memory regardless of who owns the device; a `sensitive`-classified tool result makes the affected spans untrusted even inside an owner turn; an accepted learn keeps its originating `trust` |

---

## 17. Fitness register (memory-only)

| Idea | Source | Decision | Home |
|------|--------|----------|------|
| USER / MEMORY / daily split | OpenClaw, Hermes, HomeClaw | **Adopt** | §4 L1–L3 |
| Scarce bootstrap + tools for depth | Hermes, OpenClaw | **Adopt** | §4.2 |
| Refresh after write | Invent (fix Hermes) | **Invent** | §4.3 |
| Flush before compact | OpenClaw, HomeClaw | **Adopt** | §8 |
| Dreaming + review diary | OpenClaw | **Adapt** lite + COMPACT.md | §9 |
| Score/taint gates | OpenClaw | **Adapt** light | §9, §13 |
| Facts vs skills | Hermes | **Adopt** | §10 |
| Pending learn / write approval | Hermes | **Adopt** | §10 |
| session_search episodic | Hermes | **Adopt** | §4 L4, §11 |
| Standing > RAG/KB authority | HomeClaw | **Adopt** | §4.1 |
| Separate RAG vs doc KB | HomeClaw | **Adopt** | §4 L5/L6 |
| Memory plugin/engines | OpenClaw, Hermes | **Adapt** | §5 |
| Memory Tree core | OpenHuman | **Reject** | §5.4 |
| Auto-fetch default | OpenHuman | **Defer** jobs | Design §19.7 |
| Active-memory always | OpenClaw | **Reject** default | Design §19.7 |
| Cognee required | HomeClaw | **Reject** | §5 |
| Action-sensitive notes | OpenClaw | **Adapt** | §7.1 |

---

## 18. Related documents

| Doc | Role |
|-----|------|
| [EnvoyHome-Design.md](EnvoyHome-Design.md) §9, §10, Design §19.7 | Parent |
| [analysis/peer-memory-systems.md](analysis/peer-memory-systems.md) | Comparative research |
| [agreed/advanced-memory-and-fleets.md](agreed/advanced-memory-and-fleets.md) | Tree / auto-fetch / TokenJuice / fleets |
| [analysis/memory-tree-and-autofetch.md](analysis/memory-tree-and-autofetch.md) | Tree depth |
| [analysis/tokenjuice-and-fleets.md](analysis/tokenjuice-and-fleets.md) | Adjacent non-memory |
| [analysis/synthesis.md](analysis/synthesis.md) | Cross-peer spine |

---

## 19. Design review — status

**Verdict:** Direction sound. **R1–R10 closed** through 2026-10-07p; the 2026-10-08 remediation **re-opened and re-closed** R10 (the flush policy is now one taint gate shared with Design §5.7.4) and added the CJK, caps-contract, trust-derivation and LearnQueue rules. See the 2026-10-08 and 2026-10-08e changelog rows.

| # | Issue | Status |
|---|--------|--------|
| R1 | Design §9.6 verify sync | **Closed** — Design §9.6 + Design Appendix C |
| R2 | profile.json supersede-by-key | **Closed** — §4.4 + Appendix A.9 |
| R3 | recall v1 = FTS/keyword L2+L3 | **Closed** — §4.5; V-MEM-13 |
| R4 | Session FTS = session retention | **Closed** — §4.6; V-MEM-14 |
| R5 | Token vs char budgets | **Closed** — chars v1 proxy; §4.2 |
| R6 | Defer review when local GPU busy | **Closed** — §4.7; V-MEM-15 |
| R7 | Appendix A memory JSON schemas | **Closed** — Design Appendix **A.9** |
| R8 | Multi-session LearnQueue | **Closed** — §7.2; V-MEM-16 |
| R9 | Human edit + agent write | **Closed** — §7.3; V-MEM-17 |
| R10 | Flush L2 vs pending | **Closed** — §8.1 |

**Strengths (keep):** L0–L7 split; truncate≠delete; flush; gated skills; refresh-after-write; backend slot; multi-account.

**Watch in implementation:** soft loss if models skip `recall`; pending-learn fatigue; StandingStore vs L5 backend ownership.
