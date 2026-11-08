# Owner acceptance packet — Design changelog `2026-11-04`

**Status: ACCEPTED 2026-11-04** (owner: Allen Peng) — product thread locked observe→act→verify harden; implement P2-G (V-OUT-11…15) cleared.

Changelog `2026-11-04` accepts **P2-G Browser observe→act→verify** (§9.5g.2). It does **not** reopen CAPTCHA solving, CN native-app connectors, or device nodes (§19.3 deferral). Chrome DevTools MCP remains rejected as the §9.5g browser backend.

**Code gate:** Cleared — harden `packages/daemon/src/browser-control.ts` (+ tests V-OUT-11…15; harness summaries for `wait`/`press`; optional `browser-automation` skill text).

---

## What was accepted

| Section | Epic | One-line |
|---------|------|----------|
| §9.5g.2 | **P2-G** | Same builtin `browser`; `snapshotId` freshness; `act.verify`; `wait`/`press`; richer snapshot; structured `blocked` |
| §9.5g (delta) | — | Actions add `wait`\|`press`; args document `snapshotId`/`verify` |
| Plan board | **P2-G** | Soft risks + V-OUT-11…15 owned by P2-G (spine V-OUT-8…10 stay B11) |

**Defaults locked**

1. One tool — harden the loop; no second browser plane.  
2. `act` without matching `snapshotId` → `stale_snapshot` (no side effect).  
3. Verify inside the same ask: attended default `text`, unattended `none`.  
4. `wait` `ms` ≤ 15 s; action ≤ 30 s; ≤3 detach retries.  
5. CAPTCHA / login wall / challenge → honest `blocked` + Owner handoff — **never solve**.  
6. MCP stays the durable specialist import path; browser stays the fragile generalist for websites.

**Out of scope (v1 / this epic):** CAPTCHA solving; WeChat/Meituan native apps; computer-use / device nodes; MCP-as-browser; `requests`/`errors`/`emulate`.

---

## Decision record

**Accept** — Design `2026-11-04` §9.5g.2 + Plan P2-G board, owner Allen Peng, **2026-11-04**.

Further Normative change after Accept requires a **new** changelog row.
