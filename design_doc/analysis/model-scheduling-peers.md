# Analysis: model scheduling / cron peers

**Status:** 2026-10-09 — fitness analysis for Design §7.4.  
**Peers:** OpenClaw (`../openclaw`), HomeClaw (`../HomeClaw`), OpenHuman (`../openhuman`), Hermes-agent (`../hermes-agent`; `../hermes` empty).

## Stance

Peers are **evidence of failure modes and mechanisms**, not a feature port list. EnvoyHome ships OpenClaw/HomeClaw-**class power** (kinds, NL create, actions, delivery, history) with a **single accurate NL path** and §4.4 grants — inventing the shape, not cloning Automations or allow_all.

## Problem → verdict

| Household problem | Peer signal | EnvoyHome |
|-------------------|-------------|-----------|
| NL paraphrases → wrong fire time | HomeClaw dual NL stacks | One propose→confirm; store instant; never re-parse at fire |
| No daemon clock → schedules never run | All | `ScheduleService` shared by workflows, jobs, consolidate |
| Restart miss stampede / surprise unlock | Hermes grace; OpenClaw stagger | Grace + fast-forward; **skip** missed admin/actuation |
| TZ/DST wrong | OpenClaw croner+tz; OpenHuman chrono_tz | IANA per job, Normative |
| Double fire / blind re-announce | OpenClaw delivery fence | Advance `nextRunAt` at dispatch; exec ≠ delivery |
| Unattended free tool loop | OpenClaw/Hermes agent cron | Workflow steps or notify; optional restricted agentTurn |
| Chat create without gate | OpenHuman ApprovalGate | Confirm before arm |

## Parity (v1 target)

`at` / `every` / `cron` · NL propose/confirm · CRUD + run-now · IANA/DST · durable store · miss policy · notify + workflow + allowlisted tool · delivery target · run history · auto-disable after N · Settings Jobs.  
**Phase 2:** stream/on-exit/condition scripts, `/loop` (events + channels cover home cases).

## Citations

- OpenClaw: `docs/automation/cron-jobs/`, `src/cron/`
- HomeClaw: `core/tam.py`, `reminder_llm_infer.py`, `docs_design/CronComparisonWithOpenClaw.md`
- OpenHuman: `src/openhuman/cron/`
- Hermes-agent: `cron/jobs.py`, `cron/scheduler.py`
