# Analysis: model scheduling / cron peers

**Status:** 2026-10-19 — refreshed after Scope B (`agentTurn` + authoring accuracy) + peer re-read.  
**Peers:** OpenClaw (`../openclaw`), HomeClaw (`../HomeClaw`), OpenHuman (`../openhuman`), Hermes-agent (`../hermes-agent`; **`../hermes` is empty** — use hermes-agent).

## Stance

Peers are **evidence of failure modes and mechanisms**, not a feature port list. EnvoyHome ships OpenClaw/HomeClaw-**class power** (kinds, NL create, actions, delivery, history) with a **single accurate NL path** and §4.4 grants — inventing the shape, not cloning Automations or allow_all.

**Accuracy rule (locked):** Resolver owns WHEN; model must not invent `whenInstant` / `cronExpr` / `everyMs`; fire never re-parses NL; elevated browser never on schedules.

## Problem → verdict

| Household problem | Peer signal | EnvoyHome |
|-------------------|-------------|-----------|
| NL paraphrases → wrong fire time | HomeClaw dual NL stacks (LLM invents ISO) | One propose→confirm; store instant; never re-parse at fire |
| No daemon clock → schedules never run | All | `ScheduleService` shared by workflows, jobs, consolidate |
| Restart miss stampede / surprise unlock | Hermes grace; OpenClaw stagger | Grace + fast-forward; **skip** missed admin/actuation |
| TZ/DST wrong | OpenClaw croner+tz; OpenHuman chrono_tz | IANA per job, Normative (account TZ still a gap — see backlog) |
| Double fire / blind re-announce | OpenClaw delivery fence | Advance `nextRunAt` at dispatch; exec ≠ delivery |
| Unattended free tool loop | OpenClaw/Hermes agent cron | Workflow / tool / restricted `agentTurn` (managed browser only) |
| Chat create without gate | OpenHuman ApprovalGate | Confirm before arm + `resolvedLocal` |

## Peer snapshot (WHEN ownership)

| Concern | EnvoyHome | OpenClaw | OpenHuman | HomeClaw | Hermes-agent |
|---------|-----------|----------|-----------|----------|--------------|
| Owns WHEN | **Resolver** (`resolve-nl.ts`) | Model → structured schedule | Model + limited `resolve_time` | Model + regex + scheduling LLM | Model → `parse_schedule` sugar |
| Confirm before arm | **Yes** (`resolvedLocal`) | No (delivery preview only) | Soft + ApprovalGate | Mostly silent-arm | Suggestions accept; direct create silent |
| Fire re-parses NL | **No** | No | No | No | No |
| NL paraphrase corpus | **EN+ZH (V-CRON-2)** | No | Limited grammar | Regex-ish | No (sugar only) |
| TZ/DST fire tests | Good (V-CRON-5) | **Strongest** (croner) | Strong (chrono_tz) | Weak | Strong grace/TZ |

**Do not port:** HomeClaw dual LLM/regex WHEN stacks; OpenClaw model-owned ISO as the NL path; Hermes marketing “every monday 9am” if code only accepts sugar.

## What EnvoyHome already leads on

1. Deterministic daemon resolver + refuse invented fence specs (V-CRON-11).
2. Propose → confirm → arm with durable proposals and visible `resolvedLocal`.
3. Fire uses frozen `ScheduleSpec` / frozen `agentTurn` prompt only.
4. EN+ZH paraphrase tests under fixed `referenceNow` + TZ.
5. Miss policy + advance-at-dispatch aligned with Hermes/OpenClaw anti-stampede lessons.

## Accuracy backlog (Normative-fit, ranked)

Constraints: resolver owns WHEN; ask never invent; no elevated browser on schedules.

### High — shipped `2026-10-19k`

1. ~~**Close implicit clock guesses**~~ — clock-less day/weekday/recurring → `missing_time`; period-of-day still OK.
2. ~~**Persist per-account IANA TZ**~~ — `AccountRecord.timeZone`; propose prefers account → host default.
3. ~~**Grow deterministic NL corpus**~~ — this/next Friday, in-N-days, 八点半, noon/midnight, TZ wall variance.
4. ~~**Never wire LLM fill for WHEN**~~ — resolver comment is ask-only; no LLM WHEN path.

### Medium (shipped `2026-10-19l`)

5. ~~**Validate cron at write**~~ — `normalizeScheduleSpec` fails before arm.
6. ~~**Proposal preview: `nextRunAt` + relative cadence**~~ — alongside `resolvedLocal`.
7. ~~**DST edge corpus**~~ — spring/fall + civil-hole NL → `ambiguous` (no croner dep).
8. ~~**Chat honesty guard**~~ — reminder promise without propose → disclaimer.
9. ~~**EN+ZH NL expand + candidates**~~ — quarter/差一刻/下下周/date/weekend; near-miss candidates.
10. ~~**Settings account TZ UI**~~ + Doctor `timezone_unset` / `late_fire` (`latenessMs` on receipts).

### Low

11. Dedicated V-CRON-6 emit asserts; document one-shot grace parity with Hermes ~120s.
12. Optional top-of-hour stagger (load only — not WHEN accuracy).

## Suggested ship order

1. ~~Implicit 08:00/09:00~~ · 2. ~~Account IANA TZ~~ · 3. ~~NL + DST corpus~~ · 4. ~~validate-at-write + preview~~ · 5. ~~honesty guard~~ (`2026-10-19l`).

## Parity (v1 target)

`at` / `every` / `cron` · NL propose/confirm · CRUD + run-now · IANA/DST · durable store · miss policy · notify + workflow + allowlisted tool · restricted `agentTurn` · delivery target · run history · auto-disable after N · Settings Jobs.  
**Out of scope / Phase 2:** stream/on-exit/condition scripts, `/loop`, elevated browser on any schedule path.

## Citations

- OpenClaw: `docs/automation/cron-jobs/`, `src/cron/schedule.ts`, `src/cron/normalize.ts`
- HomeClaw: `core/tam.py`, `core/reminder_llm_infer.py`, `core/tool_helpers_fallback.py`, `docs_design/CronComparisonWithOpenClaw.md`
- OpenHuman: `src/openhuman/cron/`, `tools/impl/system/resolve_time.rs`
- Hermes-agent: `cron/jobs.py` (`parse_schedule`), `cron/scheduler.py`, `hermes_time.py`
