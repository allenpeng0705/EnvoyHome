# Analysis: OpenClaw

**Status:** Draft — learn / summarize.  
**Sources:** [docs.openclaw.ai](https://docs.openclaw.ai/), sibling `../openclaw` (`VISION.md`, channel/plugin SDK).

## What it is

Self-hosted **Gateway**: one always-on process bridges **chat apps ↔ agent runtime**. MIT, OpenClaw Foundation. Positioning: *trusted gateway, untrusted execution, policy as code* (sandbox **off by default** — EnvoyHome should choose safer defaults for shared-home).

```text
Chat apps / plugins → Gateway (sessions, routing, auth, WS/HTTP)
                         → Agent runtime(s) / harness plugins
                         → Control UI, CLI, nodes
```

## Pinned learnings (keep)

1. Gateway as single control plane  
2. ClawHub / AgentSkills / verify — stay ecosystem-compatible  
3. Trusted control plane vs sandboxed/approved execution  
4. Pairing (people + devices) + capability gating  
5. Multi-agent bindings + operator-approved agent spawn  
6. File memory + dreaming (+ optional wiki)  
7. Harness-as-plugin (own policy, swap runtimes)  
8. Nodes for device actions (not only chat clients)  
9. Doctor-owned config migrations  
10. Safer defaults than upstream for shared-home use  

## Themes (summary)

### Gateway control plane

Single multiplexed port; auth by default; `doctor --fix` migrations; discovery / remote patterns. Clearer ops story than Core + many channel processes.

### Channels

In-process `ChannelPlugin` via plugin-sdk: accounts, pairing, outbound, monitor. Core owns routing/bindings and the shared `message` tool. Compare HomeClaw sidecars — see [agreed/channels-and-harness.md](../agreed/channels-and-harness.md).

### Skills / ClawHub

AgentSkills `SKILL.md`; install + **verify**; per-agent allowlists. EnvoyHome should stay compatible.

### Trust / sandbox

Exec can move to Docker/SSH/…; exec approvals; DM pairing; device pairing ≠ capability approval.

### Multi-agent

Isolated agents + **bindings** (channel account → agent); spawn needs operator approval.

### Memory

File-visible USER/MEMORY/daily notes + **dreaming** consolidation; optional memory-wiki; import from other agents.

### Active-memory (pre-turn recall)

Optional plugin: bounded memory sub-agent before eligible replies (`escalate` / `always` / `off`). Cousin of OpenHuman auto-fetch flavour B. EnvoyHome: opt-in escalate later; default off (P2-Q6). See [memory-tree-and-autofetch.md](memory-tree-and-autofetch.md).

### TokenJuice

Optional `@openclaw/tokenjuice`: compact noisy exec/bash **tool_result** after run; does not rewrite exit codes. EnvoyHome: optional harness middleware; default off (P2-Q7). See [tokenjuice-and-fleets.md](tokenjuice-and-fleets.md).

### Harness plugins

Built-in loop **or** Codex / Claude CLI / ACPX etc. Gateway keeps channels/policy/state — same stance EnvoyHome takes with `envoy-harness` + others.

### Nodes

Phone/desktop as **capability edge** (camera, screen, local exec), not only chat UI.

## Debts / caution

Channel zoo; sandbox off by default; in-process plugin trust; team Gateway ≠ HomeClaw family sandbox; easy to over-adopt complexity.
