# Agent scenario catalogue

Prompt/scenario packs for Schedule + General agent automation.

| Runner | When | Gate |
|--------|------|------|
| Deterministic | Every `pnpm --filter @envoyhome/daemon test` | Always |
| Live LLM | Operator / nightly | `pnpm agent:eval` (reuses `~/.envoyhome` LLM settings; not CI) |

## Layout

```text
catalogue/schedule/*.json   # NL / tool / turn / compose (+ locales, multi-round)
catalogue/general/*.json    # skills, files, search/export, ask_user, live soft-checks
schema.mjs                  # validate case objects
lib/load-catalogue.mjs
lib/expect.mjs              # soft live asserts
lib/fence.mjs               # $skillId / $proposalId substitution
```

Roughly **100+** catalogue cases; **50+** are `live: true` and hit a **real LLM** via `pnpm agent:eval` (not CI). Includes web_search journeys (`pnpm agent:eval:web`).

## Case fields

| Field | Notes |
|-------|--------|
| `id` | Unique across packs |
| `pack` | `schedule` \| `general` |
| `mode` | `nl` \| `tool` \| `turn` \| **`compose`** (multi-round scripted model) |
| `prompt` | User text (also used by live eval) |
| `live` | `true` → included in live runner |
| `purpose` | `general` \| `schedules` \| `home` (turn surface tools) |
| `tool` | Single tool for `mode=tool` |
| `toolSequence` | ≥2 sequential tools (composition without a model) |
| `rounds` | ≥2 `{ reply }` strings for `mode=compose` (use `$skillId` / `$proposalId`) |
| `allowTools` | Compose allow-list |
| `setup` | `installSampleSkill`, `seedFiles`, `seedExports` (generate PDF/docx into sandbox), `sandboxFiles` |
| `expect` | Structured outcomes (`dispatchOrder`, `step0`…, `finalMatching`, `requireHonesty`, …) |
| `toolSequence[].argsFromPrev` | Map arg → previous JSON field (e.g. `{ "path": "uri" }` after extract) |

## Multi-round + composition

- **`toolSequence`** — deterministic chain (skills_list → skill_view, propose → list → confirm, write → read, refuse then honest propose).
- **`mode: compose`** — `HomeModelAdapter` + mesh submitter; each round may emit an `envoyhome-tools` fence; asserts `dispatchOrder` and final text. Covers multi-round tool/skill calling and parallel tools in one fence.

## Add a case

1. Drop a JSON object into `catalogue/<pack>/…json` (array or single object).
2. Run `pnpm agent:scenarios` (daemon `test:agent-scenarios` only — not the full suite).
3. For live soft-check, set `"live": true` and `expect.liveTools` and/or `expect.honestyMatching`.

## Soft IDs

- **V-AGENT-SCENARIO-1** — deterministic catalogue green in daemon tests  
- **V-AGENT-SCENARIO-2** — live eval via existing LLM settings  

### Live eval (real LLM — V-AGENT-SCENARIO-2)

These are the tests that call your configured model directly (tool choice + honesty soft-checks). Deterministic CI still uses a scripted model.

```bash
pnpm agent:eval
# same as: ./scripts/agent-eval.sh

# Subset (ids, pack names, or substrings):
pnpm agent:eval:live-direct
# same as: ENVOYHOME_AGENT_EVAL_FILTER=live-llm pnpm agent:eval
ENVOYHOME_AGENT_EVAL_FILTER=sched-live-llm-vague-must-ask,gen-live-llm-write-then-read pnpm agent:eval
```

Uses `ENVOYHOME_STATE_DIR` (default **`~/.envoyhome`**). Reuses a running daemon when healthy; otherwise starts `envoyhome-daemon`, runs live cases, then stops it. Account: first `home.listAccounts` row, or `ENVOYHOME_ACCOUNT=…`.

Live packs include `catalogue/*/live-llm-direct.json` and **`catalogue/general/docs-user-journeys.json`** (meeting notes → summary, quotes → decision, CSV extract → cheapest, notes → PDF/docx path back to user, PDF extract round-trip).  

`setup.seedFiles` / `setup.seedExports` land under `accounts/<id>/files/` before the turn. Set `expect.requireHonesty: true` when the user must see facts in the assistant reply (not only tool calls).

```bash
# Document / return-results journeys only:
pnpm agent:eval:docs
# Web search journeys (live LLM + household provider):
pnpm agent:eval:web
# P0 packs (browser + memory inject + ask_user multi-turn):
pnpm agent:eval:p0
pnpm agent:eval:browser
pnpm agent:eval:memory
pnpm agent:eval:ask
```

### P0 packs (browser / memory / ask_user)

| Pack | Covers |
|------|--------|
| `browser-journeys.json` | navigate/text, SSRF refuse, mock + optional Chromium, live soft |
| `memory-journeys.json` | `memory_remember` / `memory_recall` / `session_search` (facade helpers until Design tools land), live standing inject |
| `ask-user-multiturn.json` | compose auto-answer → schedule/write; live `liveAnswer` via `home.answerChoice` |
| `knowledge-journeys.json` | Sandbox **`knowledge/`** Doc KB: `knowledge_search` / files / cite / export; standing wins vs guest notes |
| `knowyou-journeys.json` | KnowYou L4′: `knowyou_search`, seed via `setup.seedKnowYou`, standing outranks episodic |
| `home-journeys.json` | `purpose: home` + demo HA get_state; general chat refuses HA; live approval honesty |
| `edit-patch-journeys.json` | `edit_file` / `apply_patch` (+ path jail / multi-match refuse) |
| `cross-tool-workflows.json` | Multi-tool compose + live (web→KB→schedule, quotes→decide, KB→remind) |
| `honesty-abstain.json` | Unknown facts, missing files, conflicting goals, do-nothing |
| `user-job-journeys.json` | NL “do this for me” jobs (remind, KB, decide, research+remind, remember) |
| `proactive-ambient.json` | Heartbeat silent OK, enable heartbeat job, notify propose→confirm, live explain |
| `exec-terminal-journeys.json` | `exec` echo / write+cat multi-round / live approve + refuse `/etc/passwd` |

```bash
pnpm agent:eval:knowledge
pnpm agent:eval:knowyou
pnpm agent:eval:kb          # knowledge + knowyou live packs
pnpm agent:eval:home
pnpm agent:eval:edit
pnpm agent:eval:workflows
pnpm agent:eval:abstain
pnpm agent:eval:general-p0  # home + edit + workflows + abstain
pnpm agent:eval:jobs
pnpm agent:eval:proactive
pnpm agent:eval:exec
pnpm agent:eval:user-agent  # jobs + proactive + exec
```

Live setup extras (also honored by deterministic runner): `reindexKnowledge`, `seedKnowYou` (`[{key,text}]` → `home.updateKnowYou` supersede), `knowledgePolicy`, `demoHa` (`home.startDemoHa`), `enableHeartbeat`. Doc KB is `files/knowledge/` (+ section index); KnowYou is episodic — not chat-stream MEMORY. Parent attended turns may fence-propose `exec` (ApprovalSink still asks).

### Web search + Playwright / Chromium

Unit + fixture Chromium tests (V-OUT-7):

```bash
pnpm test:web-search-browser
# Real Bing via Chromium (flaky / CAPTCHA-tolerant):
ENVOYHOME_LIVE_BROWSER_SERP=1 pnpm test:web-search-browser
# Install browsers once on the daemon host:
npx playwright install chromium
```

Catalogue cases under `web-search-browser-fallback.json` cover empty primary → browser fallback (HTML fixture), deny ask, unattended skip, and optional real-Chromium fixture (`useChromium: true`, skipped when Chromium missing).

Smart-home prompt packs are out of scope here (see Design V-HA / V-UX-6–8).
