# Agreed: multi-account, sandbox, and security from day one

**Status:** Agreed in discussion.  
**Method:** Fitness-checked for EnvoyHome — not a late bolt-on, not a wholesale copy of any peer.

## Requirement

EnvoyHome must support a **family network**: **multiple accounts** (household members) **share one home agent**, each with isolated memory/files/policy, bound via channels/devices. Therefore **sandbox and security are core from day one**, not a post-MVP patch.

| Yes (core) | No (reject / later) |
|------------|---------------------|
| Multi-account share of one daemon | EnvoyMesh **Social** product (feeds/graph UI) |
| Per-account sandbox + Settings | Federation / multi-home peer chat (optional later) |
| Bindings: person → account | Phone dial via attach-to-node (P2-Q4: hosting default; attach dual-if-needed only) |

**Accounts + isolation + approvals** are not optional.

## Why this fits EnvoyHome

- A home agent shared across people without isolation is a privacy incident (HomeClaw lesson).
- EnvoyMesh thin clients + other IM channels multiply identity surfaces — the daemon must own the trust boundary.
- Harness plugins (envoy-harness and others) must **inherit** daemon policy; they must not bypass account sandbox.

## Layers (day-one expectation)

| Layer | Expectation |
|-------|-------------|
| **Identity gate** | Who may talk: account allowlists, channel↔account binding, pairing for unknowns. Safer defaults than “empty allowlist = everyone.” |
| **Data sandbox** | Chat, memory, profile, files scoped by account (and agent/friend where needed). |
| **Filesystem jail** | Tools cannot escape account root; cross-account share only by explicit intent. |
| **Tool / harness policy** | Risk tiers + human approvals; unattended paths deny-by-default. |
| **Device / mesh** | Pairing ≠ capability approval for clients/nodes. |
| **UX** | Settings-first account & permission admin; config export for power users only. |

## Peer ideas — adopt / adapt / invent / reject

| Idea | Source | Decision |
|------|--------|----------|
| Gate + scoped storage + path jail + tool risk | HomeClaw | **Adapt** structure; **invent** Settings-first UX |
| Exec sandbox off by default | OpenClaw | **Reject** as default for shared-home; harden by default |
| DM pairing / device vs capability approval | OpenClaw | **Adapt** for channels + EnvoyMesh clients |
| Profile isolation / smart approvals | Hermes | **Adapt** where it fits unattended + self-edit paths |
| Privacy Mode hard switch | OpenHuman | **Adapt** as optional local-only inference mode later |
| Full crypto multi-tenant / E2E everything | — | **Not day-one** unless product requires; be honest about host-access threat model |

## Honest threat-model boundary

One daemon on one machine ≈ one OS user. Physical access to the host can still see on-disk trees. Sandbox is **software isolation for accounts and tools**, not a substitute for OS/disk encryption or hostile co-tenants on the same box.

## Related docs

- [channels-and-harness.md](channels-and-harness.md) — daemon owns policy; harnesses inherit it  
- [analysis/homeclaw.md](../analysis/homeclaw.md) — sandbox / multi-user themes  
