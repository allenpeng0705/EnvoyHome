# Deep dive: TokenJuice + fleets

**Status:** Non-normative research. Decisions locked in [`../EnvoyHome-Design.md`](../EnvoyHome-Design.md) §19.7 (P2-Q7, P2-Q8).  
**Peers:** OpenClaw `@openclaw/tokenjuice`; HomeClaw multi-instance / `peer_call`; EnvoyMesh bonds / capability nodes. OpenHuman’s “TokenJuice-class” compression is a related *idea*, not the OpenClaw package.

## TokenJuice (OpenClaw)

### What it is

Optional plugin (`clawhub:@openclaw/tokenjuice`) implementing **agent tool-result middleware**.

| Does | Does not |
|------|----------|
| Compact noisy `exec` / `bash` **tool_result** after the command ran | Rewrite shell input |
| Keep exit codes and original execution | Re-run commands |
| Prefer inventory-style compaction; keep exact file-content reads raw | Replace session/memory consolidation |
| Stay opt-in | Change harness policy by itself |

Docs: [docs.openclaw.ai/tools/tokenjuice](https://docs.openclaw.ai/tools/tokenjuice).

### Why it matters

Long `git status`, `find`, `ls -R` dumps burn the context window and confuse the model. Compacting **after** exec is safer than truncating blindly mid-stream: policy can keep raw reads when the model asked for file content.

### Relation to EnvoyHome §9

| Mechanism | Compresses |
|-----------|------------|
| §9 consolidate / dreaming-lite | Standing memory files / notes |
| Session / context compact | Chat transcript for the next turn |
| TokenJuice | **Tool result** payloads in the live harness loop |

### Fitness

| Criterion | Assessment |
|-----------|------------|
| envoy-harness shell tools | High value when noisy |
| Default-on | No — surprise + hard to debug tool output |
| First-party hard dep on `@openclaw/tokenjuice` | Reject; adapt the **middleware idea** |
| Exit-code rewrite | Reject always |

**Decision (P2-Q7):** Optional harness middleware/plugin; **default off**; never rewrite exit codes.

## Fleets

### Definition (EnvoyHome)

**Fleet** = coordinating **N agent homes / instances** (identity, trust, optional remote invoke).

| Concept | Scope |
|---------|-------|
| Multi-account (v1) | Many users on **one** EnvoyHome daemon |
| Mesh attach (Phase 2a) | Thin client dials **one** home node |
| Fleet (later) | **Multiple** homes or peer Cores work together |
| Capability nodes | Device edges (camera, screen) — mesh-owned; not fleets |

### Peer patterns

**HomeClaw:** `instance_identity`, peer roster, pairing invite/consume, `peer_call` tool — Core–Core HTTP trust. Docs: multi-instance peers.

**EnvoyMesh:** Bonds, Social, optional Ext Agent bridge — **and it already ships a fleet bootstrap**: `fleet.example.yaml` (`fleetId`, `sponsor`/`member` roles, `lanAutoBond`, Fleet Manifest) applied by `npm run fleet:apply` (`docs/fleet-bootstrap.md`). That is the natural home for multi-home reachability; do not invent a second federation stack.

**OpenHuman:** it has **no "fleet" product** — `grep -ri fleet` over its source and docs returns only incidental comments. What does exist is an **orchestrator**: `agent_orchestration/workflow_runs` (phase DAG walked in dependency order, bounded concurrency, persisted per phase, stop/resume) plus `agent_orchestration/agent_teams` (durable teams, CAS task claiming, teammate messaging, sub-agent spawn). That is **multi-agent orchestration** — a different axis from home-to-home identity. Steal sparingly as orchestration ideas, and stop calling it "fleets".

### Fitness

| Criterion | Assessment |
|-----------|------------|
| Before single-home v1 solid | Premature |
| Mesh already in product spine | Prefer mesh bonds for reachability |
| HomeClaw Core–Core | Only if product needs remote LLM/tool to another Core |
| Hard-block instance id in v1 layout | Avoid — keep `instanceId` in `home.hello` |

**Decision (P2-Q8):** **Mesh-first.** Defer fleet product. Core–Core only if a clear need appears after single-home + mesh attach.

## Non-goals

- Shipping OpenClaw TokenJuice as a required dependency  
- Treating multi-account as “fleet done”  
- Equating mesh attach with multi-home fleets  
- Silent skill overwrite via any compression or peer path
