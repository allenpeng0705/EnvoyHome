# Acceptance — P2-E3 parent Agent (`2026-10-20t`)

| Field | Value |
|-------|-------|
| **Epic** | P2-E3 — Parent turn = envoy-harness `Agent` |
| **Design** | §19.13 E3; changelog `2026-10-20t` |
| **Verify** | V-P2-AGENT-4 |

## Bar

- Parent harness turns use `Agent.run` (HomeModelAdapter + `buildParentToolRegistry` + `meshSubmitter` + `HomeAgentSession`).
- TurnService preambles (`plannedTools` / schedule affirm / home recover) stay outside Agent; `runTurn` fallback for injects + `ENVOYHOME_PARENT_AGENT=0`.
- Tools still gate through ApprovalSink / `dispatchTool`; `task` depth ≤ 1 (no nested mesh on children).
- Q10 + `sessions_spawn` Reject unchanged. No wire bump.

## Evidence

- Unit: `packages/daemon/test/parent-agent.test.ts` (V-P2-AGENT-4).
- Regression: `harness-subagents.test.ts` (V-P2-AGENT-3), `harness-b6.test.ts`, `phase2-cde.test.ts`.

## Follow-ups (post-review)

- Recover → then claimsActuation (match `runTurn`); soft offer stash restored.
- Live Tracer queue: `tool_call` / `tool_result` / `error` yield during `Agent.run`.
- Parent `task` fence → `LocalMeshSubmitter` integration test.
- TurnService emits `home:turn-delta` for `tool_call` / `tool_result` / `error` (protocol `tool: { name }`).

## Status

**Accepted for coding ship** — Owner direction via plan implement (`2026-10-20t`); follow-ups green.
