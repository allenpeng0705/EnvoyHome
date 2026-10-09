# Agreed: deterministic static workflows / rules + local LLM engines

> **Naming note (2026-10-08e).** This snapshot is the historical "DAG" note. The v1 schema is a **linear ordered step list**, not an edge graph — Design §7.1 records the rename and reserves "DAG" for a later version that actually has edges. HomeClaw's own `planner_executor` is likewise fixed step chains per intent category (`base/planner_executor.py:1-10`), not a graph.

**Status:** Agreed in discussion (from HomeClaw practice).  
**Refs (HomeClaw):** `base/planner_executor.py`, `docs_design/PlannerExecutorAndDAG.md`, `config/intent_category/`, mix mode / llama.cpp docs.

## Why static workflows / rules matter

Free-form tool loops need strong models. Smaller **local** models fail more on open planning. HomeClaw’s answer: classify intent → run a **predefined, ordered step chain** (fixed steps, `args_from`, narrow LLM fill helpers) so accuracy comes from **structure**, not model IQ.

Same pattern fits **enterprise** where workflows are known and stable (e.g. ticket → lookup → draft → approve), not open-ended chat.

## EnvoyHome stance

- Keep a **rules / static workflow** layer **alongside** the free harness loop — not instead of it.
- Route: **keyword/rule match** → static workflow; else harness. (v1 has **no** intent classifier — Design §8.3 makes triage an optional plugin, so `match.keywords` is the only v1 trigger.)
- Steps may still call small local models for **narrow** slots (extract place, fill subject, summarize) — not for inventing the whole chain.
- A workflow's `tool` step is a real tool call: account sandbox, §4.3 risk tiers, §4.4 approvals/grants. **A workflow is never an approval bypass** — which matters most now that a step can actuate a device (Design §5.7.2).
- **Local inference remains a product pillar** (privacy, cost, offline/home).
- Baseline: **llama.cpp** / GGUF (HomeClaw path) + mix-style local/cloud routing ideas.
- **Investigate** higher-throughput local engines (**vLLM**, and peers / OpenAI-compatible local servers) as alternate backends behind the **same** model-provider interface — choose by deploy target (desktop GGUF vs GPU server), not by dropping llama.cpp for everyone.

```text
User message → keyword / rule match
                 ├─ matched  → static workflow executor (small LLM OK)
                 └─ else     → harness free tool-loop (stronger / mix model)
```

**Home automation (`§5.7`, B14) is the flagship consumer of this layer:** a motion event or a schedule triggers a static workflow, and the workflow's actuation step still passes the §4.4 gate.

## Related HomeClaw pins

- 3-layer mix local/cloud routing (heuristic → semantic → SLM/perplexity)
- Local LLM first-class; cloud optional via mix
