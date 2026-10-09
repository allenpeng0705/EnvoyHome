# Analysis: model-routing peers (for EnvoyHome §8)

**Status:** Research snapshot 2026-10-09. **Does not Normative.** Design §8 wins.  
**Peers surveyed:** `../ClawRouter`, `../claude-code-router`, `../router` (Weave), `../Switchyard`, `../semantic-router`, HomeClaw `hybrid_router`, OpenHuman hints, Laya/Jev (System One), envoy-harness `DecisionClient`.

## Product lock (EnvoyHome)

1. Config first: one model / local-only / cloud-only / default; auto-switch **off by default**.  
2. Best results first; save cost only when a weaker model still handles the task.  
3. Local = properties (low cost, param count), not a special branch.  
4. Jev/Laya optional, default off.  
5. No embed/HMM/K8s/portfolio gateway in core.

## Steal / skip (summary)

| Peer | Adapt | Reject in core |
|------|-------|----------------|
| ClawRouter | Constraint-first; tiers; route metadata | x402 catalog, always-on portfolio |
| CCR | Policy order; route trace; fallbacks | Electron gateway as requirement |
| Weave | Quality/price dial spirit; eligibility | ONNX/HMM sidecars, Postgres |
| Switchyard | Efficient↔capable; cheap call ≠ cheap task | Mid-loop judge cloud exfil by default |
| vLLM SR | Privacy/location signals; never widen | Operator/Vela stack |
| HomeClaw | Logprob admit probe (opt-in) | Embed + SLM cascade |
| OpenHuman | Hint tables later | Subscription broker |
| Laya/Jev | Typed triage plugin via harness DecisionClient | Required dependency |

Full idea catalogs and score weights live in the implementation plan (`smarter_mix_routing` plan: Locked decisions).
