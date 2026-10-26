# EnvoyHome Knowledge + RAG Design

| Field | Value |
|-------|--------|
| **Document** | Normative design for **Doc KB (L6)**, **KnowYou episodic (L4′)**, **local hybrid RAG**, and the **Home embed engine** |
| **Status** | Living draft — Owner direction 2026-10-25 |
| **Last updated** | 2026-10-27 |
| **Parent** | [`EnvoyHome-Design.md`](EnvoyHome-Design.md) — product-wide ground truth (§2.4 ports, §8.5 Local, §9 Memory summary) |
| **Sibling** | [`EnvoyHome-Memory-Design.md`](EnvoyHome-Memory-Design.md) — L0–L7 standing, flush, LearnQueue |
| **Peer research** | [`analysis/peer-memory-systems.md`](analysis/peer-memory-systems.md); OSS survey notes in §14 |
| **Conflict rule** | Sandbox / Mesh / harness / Local-engine independence → **Design.md wins**. Standing L1–L3 write ownership → **Memory Design wins**. Doc KB index, KnowYou engine, embed sidecar, hybrid retrieve → **this file wins** unless Design.md explicitly overrides. |

**Product north star:** EnvoyHome should **know you and understand you better over time** — inspectable standing facts, a compounding Doc KB under `knowledge/`, and related past chats that surface without the user begging the model to call `session_search`.

**Intent:** Ship a **self-contained** memory/RAG stack. Learn from Mem0 / Graphiti / Cognee / HomeClaw / EnvoyMesh **patterns**, but do **not** take mem0, Cognee, Neo4j, or Mesh Envoy Local as core dependencies. Files remain source of truth; SQLite (+ optional local vectors) is derived and rebuildable.

---

## 0. Changelog

| Date | Change |
|------|--------|
| 2026-10-27 | **Ship defaults → `auto`:** `knowledgeInject` / `episodicInject` default **`auto`** after live eval gates (`pnpm agent:eval:kb`, incl. auto-inject + standing-filter cases). Owner may set `tool`/`off` in Settings. |
| 2026-10-26 | **Ship defaults + hardening:** `knowledgeInject` / `episodicInject` default **`tool`** until eval gates green; KnowYou extract **user-turn only**; standing contradiction widened (allergy / quiet-hours / drink / food) and applied on tool retrieve; Doc KB section soft cap 2000 + KnowYou active soft cap 5000; index writes under account lock + atomic rename; Home embed `prefer=attach` refused at router; embed HTTP retry-once. |
| 2026-10-25b | **Day-one persistence:** indexes MAY live as rebuildable JSON under `memory-backend/knowledge-index/` and `memory-backend/episodic-index/` (pure-JS trigram + float vectors). Conceptual `*.sqlite` paths remain the long-term target; hit shape unchanged on FTS5/`sqlite-vec` swap. |
| 2026-10-25 | **Initial Normative.** Doc KB tiers A–C; per-account SQLite indexes; section FTS; optional local embed (Adapt Mesh Phase 57E — Home `:18793`); KnowYou L4′ extract ADD\|SUPERSEDE\|SKIP + summarize/TTL + budgeted auto-inject; authority + Settings + V-KB / V-KY / V-EMB IDs. Rejects mem0/Cognee-as-core; revises Memory Design “no auto-inject” for **bounded** L4′/L6 only. |

---

## 1. Why this design exists

### 1.1 Problems we must solve

1. **Doc KB** — User drops documents into `knowledge/` and asks questions; answers must cite real paths (Open chips).  
2. **Know you better** — Related *old* chats and durable facts should compound; tool-only `session_search` is too weak (model often skips).  
3. **Size / duplication / update** — Raw chat and clips grow; near-dupes and contradicted prefs poison retrieval. HomeClaw/mem0-style **UPDATE** has been weak (store-everything + ADD-only / thin `update(id)`).  
4. **Weight** — Cognee / Graphiti / Mem0 Platform are too heavy as **required** core for a household daemon.

### 1.2 What we adopt from peers (fitness)

| Source | Keep | Reject as core |
|--------|------|----------------|
| **EnvoyMesh Knowledge + embed sidecar** | Second `llama-server` for embed GGUF; curated Qwen3-Embedding; boot provision; idle unload; OpenAI-compat `/v1/embeddings`; never share process with chat | Attaching to Mesh `:18790`/`:18791` |
| **OpenClaw** | Hybrid FTS + vectors; Markdown truth; scarce bootstrap | Full dreaming / always-on active-memory |
| **Hermes** | Session FTS; scarce standing | Frozen mid-session standing; tool-only depth as the only story |
| **HomeClaw** | Standing vs conversation-RAG vs Doc KB split; summarize+TTL idea; per-user paths | Cognee-required; store-every-message default; authority only in prompt text; weak update |
| **Mem0** | Retrieve→enrich→reply→extract loop; hybrid search signals | OSS v3 ADD-only extraction; Platform-only graph; cloud as default |
| **Graphiti** | Temporal supersede / “what was true when” *idea* | Neo4j/FalkorDB in v1 core |
| **Letta** | Core vs archival tiers *idea* | Second agent runtime |

### 1.3 Goals (Normative)

1. **`knowledge/` is the Doc KB source of truth** — human- and agent-editable Markdown (plus extract sidecars); Open chips work.  
2. **Derived index only** — per-account SQLite under `memory-backend/`; delete/rebuild never destroys originals.  
3. **FTS-first, embed progressive** — Doc KB and KnowYou work with embed **off**; hybrid when local embed is ready.  
4. **Home-owned embed engine** — Adapt Mesh: spawn embed sidecar **or** BYO Ollama; never Mesh ports.  
5. **KnowYou write FSM** — extract candidates → `ADD` \| `SUPERSEDE(key)` \| `SKIP`; keyed facts; summarize under size pressure.  
6. **Budgeted auto-inject** — related Doc KB + episodic snippets may enter the prompt under caps; labeled; **below** L1–L3 authority.  
7. **No cross-account bleed**; Privacy Mode → local-or-skip for embed/review jobs.  
8. **Heavy backends optional** — Cognee/Graphiti only as future MemoryBackend plugins, never sole copy of standing or KB files.

### 1.4 Non-goals

| Reject / defer | Why |
|----------------|-----|
| mem0 / Cognee / Neo4j **required** in core | Ops + opacity + Design already rejected |
| Embed GGUF in the **chat** `:18792` process | Contention; Mesh deliberately splits |
| Opaque embedding-only standing memory | Violates inspectability (Memory Design §2.2) |
| Unbounded every-turn deep Tree walk | Latency; Memory Design non-goal |
| Auto-promote chat → L2/`knowledge/` without gates | Privacy + LearnQueue |
| Cloud embed by default | Privacy; household-local first |

---

## 2. Architecture overview

```text
                    ┌──────────────────────────────────────────────┐
                    │              EnvoyHome daemon                │
                    │  turn prologue · Settings · Doctor           │
                    └───────────────────┬──────────────────────────┘
                                        │
         ┌──────────────────────────────┼──────────────────────────────┐
         ▼                              ▼                              ▼
┌─────────────────┐          ┌──────────────────┐          ┌────────────────────┐
│ Standing L1–L3  │          │ KnowYou (L4′)    │          │ Doc KB (L6)        │
│ profile/MEMORY/ │          │ episodic engine  │          │ knowledge/ files   │
│ daily (core)    │          │ + session FTS L4 │          │ + section index    │
└────────┬────────┘          └────────┬─────────┘          └─────────┬──────────┘
         │                            │                              │
         │                   ┌────────▼─────────┐           ┌────────▼──────────┐
         │                   │ SQLite           │           │ SQLite            │
         │                   │ episodic-index   │           │ knowledge-index   │
         │                   │ FTS + vectors?   │           │ FTS + vectors?    │
         │                   └────────┬─────────┘           └────────┬──────────┘
         │                            │                              │
         │                            └──────────┬───────────────────┘
         │                                       ▼
         │                            ┌────────────────────┐
         │                            │ Embed engine       │
         │                            │ spawn :18793 XOR   │
         │                            │ Ollama :11434 XOR  │
         │                            │ off (FTS only)     │
         │                            └────────────────────┘
         ▼
   Prompt inject order (Normative §6):
   this turn > L1 > L2 > L3 > KnowYou block > Doc KB block > tools
```

**Two corpora, two derived stores per account (isolation MUST be logical). Day-one MAY use rebuildable JSON; long-term MAY use SQLite/FTS5 — hit shape stable either way:**

| Store | Path (day-one / conceptual) | Source of truth |
|-------|-----------------------------|-----------------|
| Doc KB index | `memory-backend/knowledge-index/index.json` (→ `knowledge-index.sqlite`) | `accounts/<id>/files/knowledge/**` (+ extract md) |
| KnowYou / episodic | `memory-backend/episodic-index/index.json` (→ `episodic-index.sqlite`) | transcripts + derived fact rows (not a replacement for `sessions/`) |

L4 legacy `session-fts/` (trigram files) MAY migrate into `episodic-index` FTS tables; until migration completes, `session_search` MUST keep working (V-MEM-9).

---

## 3. Doc KB (L6) — Normative

### 3.1 Source tree

```text
accounts/<accountId>/files/knowledge/
  _index.md                 # optional wiki map (Tier B); agent/job may refresh
  **/*.md                   # canonical text for search
  raw/                      # optional originals (pdf/docx); not primary index corpus
  archive/                  # summarized/rolled clips (still Markdown)
```

**Rules**

1. Tools resolve via the account sandbox jail (`safeJoin` / Design §4.2).  
2. Office/PDF intended for KB MUST be extracted to GFM (`extract_document` or chat extract) before indexing as primary corpus. Originals may remain for download.  
3. Agent SHOULD write durable reference docs under `knowledge/` (not only `documents/`); cite backtick paths for Open chips (V-OUT-3).  
4. `share/` remains deferred/jail-refused for agent writes.

### 3.2 Delivery tiers

| Tier | Name | Mechanism | Default |
|------|------|-----------|---------|
| **A** | Agentic | `list_dir` / `search_files` / `read_file` under `knowledge/` | Always available |
| **B** | Section FTS + wiki map | SQLite FTS over heading sections; `_index.md` blurbs; optional budgeted inject | **Ship target** for “query my KB” |
| **C** | Hybrid embed | Same SQLite + local vectors; RRF with FTS | When embed engine ready / Settings `on`\|`auto` |

Heavy plugins (Cognee, Graphiti) = **Tier D optional MemoryBackend** — out of Normative core.

### 3.3 Section indexing (Tier B — Normative)

**Unit of retrieval** = a Markdown **section**, not an arbitrary token window:

| Field | Meaning |
|-------|---------|
| `docId` | Stable id (hash of account-relative path) |
| `path` | Virtual path e.g. `knowledge/handbook.md` |
| `heading` | Nearest `#`/`##`/… title (empty = preamble) |
| `level` | Heading depth |
| `startLine` / `endLine` | 1-based line range in file |
| `text` | Section body (capped per section; oversized sections split on blank lines) |
| `contentHash` | Hash of file bytes or section text for invalidate |
| `mtime` | Source mtime |
| `isSummary` | true for archive/summary nodes |
| `covers` | optional list of prior `sectionId`s when summarizing |

**Tokenizer:** FTS5 `trigram` (or equivalent) + short-CJK scan fallback — **same rules as Memory Design §4.5** (V-MEM-13 class). Hits report `engine: "fts" | "scan" | "vec" | "hybrid"`.

**Invalidate:** on `write_file` / external edit / extract completion under `knowledge/`, reindex that path (mtime/hash). Full rebuild via Settings / Doctor / `home.reindexKnowledge`.

### 3.4 Wiki map `_index.md` (Tier B)

- Optional but **recommended**. Format: bullet list of `path` — one-line blurb + keywords.  
- Maintained by: (a) user edit; (b) daemon job after material KB writes; (c) agent tool with risk `write`.  
- Retrieve MAY boost files listed in `_index.md` that match the query.

### 3.5 Hybrid retrieve (Tier C — Normative when embed on)

1. Embed query via Home embed engine (§5).  
2. Vector top‑k ∪ FTS top‑k → **RRF** (or equivalent stable fusion).  
3. Optional: cheap local rerank of top‑N (same review/flush model policy).  
4. Return snippets with `path`, heading, line range, `score`, `engine`.  
5. If embed unavailable → degrade to Tier B; never fail the turn.

### 3.6 Doc KB auto-inject (optional)

| Knob | Default | Behavior |
|------|---------|----------|
| `knowledgeInject` | **`auto`** \| `tool` \| `off` | Ship default **`auto`** (eval gates green 2026-10-27); `tool` = retrieve only via `knowledge_search` |
| `knowledgeInjectBudget` | model-aware sibling of L1–L3 (fixed small default e.g. **4000** chars) | Exact serialized block size |
| Trigger | User message (+ optional “knowledge/” cue boost) | Skip for workflow turns / restricted as policy says |

Block label (Normative):

```text
## Knowledge base (derived; non-authoritative vs profile/MEMORY)
```

Citations in the assistant reply SHOULD use backtick `knowledge/…` paths.

### 3.7 Size / dup / update for Doc KB

| Concern | Policy |
|---------|--------|
| **Size** | Cap indexed sections per account; archive job may fold old clips into `knowledge/archive/YYYY-Qn.md` summaries; originals TTL or keep under `raw/` |
| **Duplication** | Near-dup section text at ingest → skip or merge evidence; prefer editing the canonical md file |
| **Update** | **Edit the Markdown** (human or `edit_file`/`write_file`); index follows contentHash. Do **not** invent a parallel “vector UPDATE” as source of truth |

Agent enhancement of KB (save clips, merge notes) MUST follow trust/taint gates; background inventiveness → PendingLearn or explicit user ask (Memory Design §7 / §13).

### 3.8 Tools & RPCs (Doc KB)

| Surface | Role |
|---------|------|
| `search_files` / `list_dir` / `read_file` | Tier A (existing) |
| `knowledge_search` (builtin) | Tier B/C retrieve; risk `read`; fence-safe; in workflow catalogue |
| `home.searchKnowledge` | RPC mirror for Settings/tests |
| `home.reindexKnowledge` | Owner/seat rebuild |
| `home.getKnowledgeStatus` | index stats, last reindex, embed readiness for KB |

---

## 4. KnowYou episodic engine (L4′) — Normative

### 4.1 Purpose

Compound **“what we’ve talked about / what I prefer”** beyond the L0 window — **without** requiring the model to remember to call `session_search`.

L4 file FTS (`session_search`) remains for dig-deeper and citation of session ids. L4′ adds:

1. Derived **fact/memory rows** with keys and supersede.  
2. Optional **chunk** rows for recent raw context.  
3. **Budgeted auto-inject** of related episodic hits.  
4. **Summarize + TTL** under size pressure.

### 4.2 Write path (after attended turn — async OK)

```text
transcript upsert (existing)
    → candidate extract (heuristic and/or cheap local LLM)
    → for each candidate:
         SKIP   (near-dup / chatter / tainted / low confidence)
         ADD    (new key or unkeyed chunk)
         SUPERSEDE(key)  (replace prior active row; keep replacesId chain)
    → embed new/updated rows when embed engine ready
```

**Stable keys (examples):** `pref.drink`, `allergy.peanut`, `person.<slug>.relation`, `decision.quiet_hours`.  
Unkeyed chunks are retrieve-only; they MUST NOT pretend to be profile facts.

**Conflict with L1/L2:** do **not** silent-write standing stores; enqueue PendingLearn (`memory_append` / profile patch) or skip.

**Trust:** Memory Design §13 + Design §5.7.4 — `untrusted` / sensitive / event-source → no direct durable KnowYou fact writes (chunks MAY be omitted entirely).

### 4.3 Update semantics (fix HomeClaw / mem0 v3 debt)

| Signal | Action |
|--------|--------|
| Exact hash match | SKIP |
| Cosine ≥ high threshold OR (LLM linked + cosine ≥ mid) on same key | SUPERSEDE |
| Same key, explicit contradiction | SUPERSEDE; old `status=superseded` |
| No key, paraphrase dup | SKIP or merge `sourceTurnIds` |

Superseded rows: excluded from retrieve by default; retained briefly for audit then TTL-purged.

**Explicit APIs:** `home.updateKnowYou` / tool path for operator correction; natural-language “forget X” → forget/supersede empty.

### 4.4 Summarize + size (Normative)

Triggers (any): chunk count > cap; age > `minAgeDays`; index bytes > soft cap; Settings “Compact KnowYou”.

Job (daemon-owned, like consolidate):

1. Select oldest non-summary chunks older than `minAgeDays`, batch ≤ `maxPerBatch`.  
2. Local/cheap model summarizes → `isSummary=true` row(s) with `covers[]`.  
3. **TTL originals:** delete covered raw chunks after `keepOriginalDays` (default long, e.g. 180 aligned with session retention); **summaries retained** until explicit forget or account delete.  
4. Prefer recent raw over summary in ranking for last `recentPreferDays` (e.g. 7).

Privacy Mode / `reviewInCloud: false` → local-or-skip (no silent cloud summarize).

### 4.5 Auto-inject (Normative)

| Knob | Default |
|------|---------|
| `episodicInject` | **`auto`** (ship default after P5 live eval; Owner may set `tool`/`off`) |
| `episodicInjectBudget` | small fixed / model-aware (e.g. **3000–6000** chars) |

Label:

```text
## Related past context (episodic; non-authoritative vs profile/MEMORY)
```

Pre-turn hybrid retrieve on user message; skip workflow-only turns. `session_search` remains available for deeper dig.

### 4.6 Relationship to L0 / L1–L3

| Store | Job |
|-------|-----|
| L0 transcript | Working window; flush→L3 under §8 |
| L1–L3 | Scarce authoritative standing |
| L4 `session_search` | Episodic **tool** over transcripts |
| L4′ KnowYou | Derived facts/chunks + **auto** related context |
| Promote | flush / remember / consolidate / PendingLearn only |

---

## 5. Home embed engine — Normative (Adapt EnvoyMesh Phase 57E)

### 5.1 Independence (hard rule)

| Process | Port | Role |
|---------|------|------|
| Mesh Envoy Local chat | `:18790` | **Out of scope** for Home |
| Mesh Envoy Local embed | `:18791` | **Out of scope** for Home |
| Home Local **chat** | `:18792` | Design §8.5 — chat/completions |
| Home Local **embed** | **`:18793`** `/v1` | This design — embeddings only |
| Ollama BYO | `:11434` | Chat **or** embeddings via Ollama APIs |

Home **MUST NOT** attach to or reuse Mesh embed/chat sidecars (same independence as Design §8.5 `2026-10-09ad`).

Embed GGUF **MUST NOT** load into the chat `:18792` process.

### 5.2 Modes

| Mode | When | Behavior |
|------|------|----------|
| **`off`** | Default until Owner enables Knowledge/KnowYou embed | FTS-only; Doctor may hint |
| **`spawn`** | Owner enables Home embed | Download/runtime under `stateDir/local-engine/`; second `llama-server` on `127.0.0.1:18793` with **embedding** GGUF; OpenAI-compat `/v1/embeddings` |
| **`ollama`** | Owner Connects Ollama + selects embed model id | Call Ollama embeddings; fail-closed if down |
| **`auto`** | Settings | Prefer healthy `spawn`; else healthy `ollama`; else `off` |

### 5.3 State layout

Under `stateDir/local-engine/` (extend §8.5):

```text
local-engine/
  config.json              # chat mode (existing) + embed: { mode, modelId, modelPath, ollamaModel, enabled, … }
  runtime/                 # shared llama-server binary (chat + embed may share download)
  models/                  # chat GGUFs
  embed-models/            # embedding GGUFs only
  embed-config.json        # optional split file if cleaner; MUST stay daemon-wide
```

**One embed selection for the household** (daemon-wide), same as chat local model sharing (§8.5). Per-account indexes consume the same embedder; vectors are still account-scoped in SQLite.

### 5.4 Curated catalog (Adapt Mesh)

Default (Normative starting catalog — bump with smoke tests):

| Id | File (illustrative) | Notes |
|----|---------------------|-------|
| Qwen3-Embedding-0.6B Q8_0 | ~0.6 GB | **Default** — keep-warm friendly; multilingual |
| Qwen3-Embedding-4B Q4_K_M | ~2.5 GB | Optional quality |

Pooling: Qwen3-Embedding → **`last`** (Mesh `embedPoolingForModel`); nomic/jina → `mean`.

Download: Owner confirm in Settings (Knowledge / Memory → Embed); progress events; sha256 verify like chat runtime. Boot may **resume** previously enabled spawn (never silent first-time multi‑GB without prior enable — align with chat: no surprise downloads). Tiny default MAY be offered as one-click “Enable Knowledge embed” that discloses size.

### 5.5 Lifecycle

1. **Lazy-start** before first embed batch if enabled.  
2. **Idle unload** after configurable quiet ms (Adapt Mesh) to free RAM.  
3. **Doctor:** `embed: off | downloading | starting | ready | error` + model id.  
4. Chat Local busy ≠ block embed forever; prefer defer embed batches on severe memory pressure.  
5. Reindex hooks: when embed first becomes ready, schedule KB + KnowYou backfill (bounded concurrency).

### 5.6 RPCs (owner-scope; additive discovery via `home.hello.methods[]`)

| Method | Role |
|--------|------|
| `home.getEmbedEngineStatus` | mode, ready, model, port, catalog, lastError |
| `home.enableEmbedEngine` | `prefer: auto\|spawn\|ollama`; model selection; may download |
| `home.disableEmbedEngine` | stop `:18793` child; clear enable |
| `home.downloadEmbedModel` | curated embed GGUF (async progress) |

Ollama embed uses existing Ollama connectivity rules (loopback `baseUrl`, fail-closed).

### 5.7 Client API (internal)

```text
embedTexts(texts: string[]): Promise<number[][]>
```

- Timeout + retry once; on failure callers degrade to FTS.  
- Dimension recorded in SQLite meta; **model change ⇒ full re-embed** of affected corpus (Doctor warns).

---

## 6. Prompt authority & inject (Normative)

**Order (extends Memory Design §4.1):**

1. This turn’s explicit user instruction  
2. L1 Profile  
3. L2 MEMORY  
4. L3 daily  
5. **KnowYou episodic block** (if `episodicInject=auto`)  
6. **Doc KB block** (if `knowledgeInject=auto`)  
7. Tool results (`knowledge_search`, `session_search`, `recall`, …)

**Rules**

1. L5/L6/L4′ **never** silently overwrite L1/L2.  
2. Pre-inject **code** filter: drop episodic/KB snippets that directly contradict active L1/L2 keys when detectable (HomeClaw’s “prompt-only authority” is insufficient).  
3. Truncation of standing still shows recall/session_search/`knowledge_search` duty line (extend V-MEM-10).  
4. Labels MUST appear so the model knows hierarchy.

---

## 7. Settings & Doctor

**Settings → Memory / Knowledge** (one surface — avoid HomeClaw four-store confusion):

| Control | Meaning |
|---------|---------|
| Knowledge inject | off / tool / auto + budget preview |
| KnowYou / episodic inject | off / tool / auto + budget |
| Embed engine | off / spawn / ollama / auto + catalog download |
| Reindex Knowledge | button |
| Compact KnowYou | button + schedule |
| Session retention | existing 180d |
| Caps | section count, vector rows, summarize TTL |

**Doctor issues (examples):** `knowledge.index_stale`, `knowledge.embed_model_mismatch`, `embed.sidecar_down`, `knowyou.over_cap`, `knowyou.summarize_skipped_privacy`.

---

## 8. Security & isolation

1. All indexes and retrieves scoped by `accountId`.  
2. Embed HTTP only on loopback.  
3. Path jail for every indexed file path.  
4. Account delete removes `memory-backend/*` for that account (V-MEM-20 class).  
5. Session delete purges derived episodic rows for that session in the same job.  
6. Unattended summarize/reindex: no exec/network/smart-home tools.  
7. Tainted turns: no KnowYou fact ADD/SUPERSEDE; Doc KB agent writes still go through normal tool disposition.

---

## 9. Phased delivery

| Phase | Deliver |
|-------|---------|
| **P0** | Tier A steers + agent scenarios (exists); document this design |
| **P1** | Tier B: `knowledge-index.sqlite` section FTS + `knowledge_search` + `_index.md` job + status RPC |
| **P2** | Embed engine spawn `:18793` + catalog + Ollama embed mode + Doctor |
| **P3** | Tier C hybrid KB retrieve + optional `knowledgeInject=auto` |
| **P4** | KnowYou extract ADD\|SUPERSEDE\|SKIP + episodic SQLite + summarize/TTL |
| **P5** | `episodicInject=auto` + pre-inject contradiction filter vs L1/L2 |
| **Later** | Optional Cognee/Graphiti MemoryBackend; Graphiti-like validity windows if needed |

Standing L1–L3 and flush/LearnQueue remain Memory Design ownership throughout.

---

## 10. Verification IDs

### Doc KB — V-KB-*

| ID | Criterion |
|----|-----------|
| V-KB-1 | `knowledge/` files remain readable after deleting `knowledge-index.sqlite`; reindex restores search |
| V-KB-2 | Section FTS finds a heading-local fact; short CJK run uses scan/fts per §3.3 |
| V-KB-3 | `knowledge_search` never returns another account’s hit |
| V-KB-4 | Office/PDF not in primary corpus until GFM extract exists |
| V-KB-5 | Embed off → search still works (Tier B); embed on → hybrid reports `engine` including vec/hybrid |
| V-KB-6 | Auto-inject respects `knowledgeInjectBudget` and label; L2 wins on scripted contradiction test |
| V-KB-7 | Open chip path from citation resolves via `home.getArtifactContent` |

### KnowYou — V-KY-*

| ID | Criterion |
|----|-----------|
| V-KY-1 | Same key preference change → SUPERSEDE; retrieve returns only active row |
| V-KY-2 | Near-dup ADD → SKIP (no second row) |
| V-KY-3 | Untrusted/event-source turn does not ADD keyed facts |
| V-KY-4 | Summarize creates `isSummary` with `covers`; raw TTL purge removes covered chunks only |
| V-KY-5 | Auto-inject budget enforced; label present |
| V-KY-6 | `session_search` still works with KnowYou off (V-MEM-9 preserved) |
| V-KY-7 | PendingLearn path when candidate conflicts with L1/L2 |

### Embed engine — V-EMB-*

| ID | Criterion |
|----|-----------|
| V-EMB-1 | `prefer=attach` to Mesh `:18791` refused; Home spawn uses `:18793` only |
| V-EMB-2 | Embed GGUF not loaded into chat `:18792` process |
| V-EMB-3 | `enableEmbedEngine` spawn downloads/runs; status ready; `/v1/embeddings` returns dims |
| V-EMB-4 | Ollama mode fail-closed when down |
| V-EMB-5 | Disable stops child; FTS-only path remains green |
| V-EMB-6 | Model switch marks indexes stale and Doctor warns until re-embed |
| V-EMB-7 | Loopback-only embed baseUrl |

---

## 11. Wire / catalogue notes

- Additive tools/RPCs → discover via `home.hello.methods[]` / tool catalogue; **no** `protocolApiVersion` bump unless a breaking field is removed (Design §3.7).  
- New port **18793** listed in Design §2.4.  
- camelCase wire fields.

---

## 12. Implementation ownership (guidance)

| Package | Owns |
|---------|------|
| `@envoyhome/memory` | KnowYou FSM, SQLite schemas, hybrid retrieve, summarize plan, inject block builders |
| `@envoyhome/daemon` | Embed sidecar lifecycle, RPCs, turn prologue inject, reindex jobs, Settings/Doctor |
| `@envoyhome/providers` | OpenAI-compat embed client; Ollama embed client |
| Thin clients | Knowledge Settings, embed download UX, Open chips (existing) |

Cite Mesh peers when adapting:  
`../EnvoyMesh/apps/node/src/envoy-local-embed-runtime.ts`,  
`envoy-local-embed-catalog.ts`.

---

## 13. Open decisions (non-blocking)

| Item | Lean |
|------|------|
| Ship `episodicInject` default `tool` until P5 eval green? | **Resolved 2026-10-27** — default `auto`; Settings override remains |
| One SQLite file vs two per account | Two files for blast-radius; or one with prefixed tables |
| sqlite-vec vs float blob + JS cosine | Prefer sqlite-vec when native OK; pure JS OK for P3 |
| Exact default budgets | Tune with agent-eval knowledge + live KnowYou packs |

---

## 14. Related documents

| Doc | Role |
|-----|------|
| [EnvoyHome-Design.md](EnvoyHome-Design.md) §2.4, §8.5, §9 | Ports, Local chat, memory summary |
| [EnvoyHome-Memory-Design.md](EnvoyHome-Memory-Design.md) | L0–L3, flush, LearnQueue, recall FTS |
| [analysis/peer-memory-systems.md](analysis/peer-memory-systems.md) | Peer fitness |
| EnvoyMesh `envoy-local-embed-*.ts` | Embed sidecar precedent |
| HomeClaw `docs_design/RAGMemorySummarizationDesign.md` | Summarize+TTL inspiration (not code import) |

---

## 15. Fitness register (this subsystem)

| Idea | Source | Decision | Home |
|------|--------|----------|------|
| Files = KB truth; index derived | Invent / OpenClaw | **Adopt** | §3 |
| Section-native chunks | Invent | **Invent** | §3.3 |
| Wiki map `_index.md` | Invent (hierarchical RAG as md) | **Invent** | §3.4 |
| Hybrid FTS + local vec | OpenClaw / Mem0 | **Adopt** lite | §3.5, §5 |
| Dedicated embed sidecar | EnvoyMesh | **Adapt** `:18793` | §5 |
| ADD/SUPERSEDE/SKIP keys | Graphiti idea + fix mem0/HomeClaw | **Invent** | §4.3 |
| Summarize + TTL originals | HomeClaw RAG summarize design | **Adapt** | §4.4 |
| Budgeted auto-inject | HomeClaw outcome | **Adapt** with caps | §3.6, §4.5 |
| Authority in code | Fix HomeClaw debt | **Invent** | §6 |
| Cognee/mem0 core | HomeClaw / ecosystem | **Reject** | §1.4 |
