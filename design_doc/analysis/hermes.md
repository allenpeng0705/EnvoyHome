# Analysis: Hermes Agent

**Status:** Draft — learn / summarize.  
**Sources:** [Hermes docs](https://hermes-agent.nousresearch.com/docs/), sibling `../hermes-agent`.

## What it is

**Self-improving autonomous agent** (Nous Research): CLI + Desktop + messaging gateway. Positioning: *gets more capable the longer it runs* via a built-in **learning loop**. Skills compatible with **agentskills.io**; OpenClaw migrate path (`hermes claw migrate`).

## Architecture shape

- One **AIAgent** core; edges = CLI, Gateway, ACP, batch, API
- Platform-agnostic core; adapters at the edge
- Large tool registry; terminal with many backends (local/Docker/SSH/Daytona/Modal/…)
- Profiles: `hermes -p name` → isolated home
- Prompt tiers + frozen memory snapshot at session start

## Harness?

Hermes does **not** brand a “harness plugin” marketplace. The **AIAgent** core *is* the turn/tool-loop engine (built-in shape). Terminal **backends** are swappable under tools, not alternate agent harnesses. See [agreed/channels-and-harness.md](../agreed/channels-and-harness.md).

## Smart home (verified 2026-10-08 — the precedent for Design §5.7)

Hermes ships Home Assistant as **both** an edge and a tool set, which is why EnvoyHome's smart-home surface is modelled as a Channel plugin plus a tool bundle rather than a core subsystem:

- **Tools**: `ha_list_entities`, `ha_get_state`, `ha_list_services`, `ha_call_service` via `HASS_URL`/`HASS_TOKEN` (`tools/homeassistant_tool.py:1-12`).
- **Bidirectional platform**: `plugins/platforms/homeassistant/` subscribes to HA's WebSocket event bus and delivers outbound messages as HA persistent notifications (declared via `plugin.yaml` + `register(ctx)`).

What EnvoyHome **adds** (Hermes has no equivalent, and no peer does): actuation as an `admin`-tier tool with a data-driven safety class, an object registry + resolver chokepoint, read-only plugin credentials, and a journalled idempotent actuation path. Hermes' HA platform holds its own credential and can therefore act outside any approval gate — the failure mode Design §5.3.1/§5.7.5 exists to prevent.

## Pinned learnings (keep)

1. Closed learning loop (review + `skill_manage` + `/learn` + `/journey`)  
2. Bounded MEMORY/USER + forced consolidation  
3. Progressive skill disclosure  
4. Standing facts vs procedural skills  
5. Write-approval for agent self-edits  
6. agentskills / OpenClaw migrate  
7. Delegation isolation rules  
8. Platform-agnostic core + profiles  
9. Smart approvals + deny-default unattended  
10. Optional specialist roster (Bot Mode) — idea only  

## Themes (summary)

### Closed learning loop

Background review after turns; agent creates/patches skills; `/learn` from docs; `/journey` user-visible timeline; optional write-approval. Memory = short always-on facts; skills = procedures loaded on demand.

### Progressive skills

`skills_list` → `skill_view` → reference files — don’t dump every SKILL.md into the system prompt.

### Delegation / Bot Mode

Isolated children; block dangerous side effects on leaves. Bot Mode = named durable specialists (compare HomeClaw friends).

### Security

Allowlists + DM pairing; smart command approval; deny-by-default on unattended paths; skill/memory write gates.

### Gateway

Many messaging platforms — **don’t copy the zoo**; do copy “one core, many adapters.”

## Contrast vs HomeClaw

| Axis | HomeClaw | Hermes |
|------|----------|--------|
| North star | Personal home agent (+ share add-on) + mix | Self-improving loop |
| Standing facts | Profile JSON | USER.md + MEMORY.md (bounded) |
| Skills | ClawHub convert | agentskills + agent-authored + `/learn` |
| Family share | Add-on isolation | Profiles / Bot Mode, not household vault |
| Local/cloud | 3-layer mix router | Provider/model switch |

## Debts / caution

Huge surface; learning loop can over-write skills; not a household sandbox product; self-modifying skills need strong review UX.
