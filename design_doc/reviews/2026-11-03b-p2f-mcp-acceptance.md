# Owner acceptance packet — Design changelog `2026-11-03b`

**Status: ACCEPTED 2026-11-03** (owner: Allen Peng) — product thread locked Owner-add any MCP + Test + gated act; implement F1–F4 cleared.

Changelog `2026-11-03b` accepts **P2-F MCP servers** (§9.5h). It does **not** reopen browser (§9.5g) or device nodes (§19.3 deferral).

**Code gate:** Cleared — F1 `McpHub` + RPCs may proceed (then F2 turn catalogue, F3 Connections UI, F4 scenarios).

---

## What was accepted

| Section | Epic | One-line |
|---------|------|----------|
| §9.5h | **P2-F** | Owner-driven MCP; any server; Test = initialize+tools/list; `mcp__*` under Approvals |
| §10.1 | Connections → MCP | List / Add / Test / Enable / Remove |
| §4.3.1 / §3.4 | RPCs | Owner-scope list/upsert/remove/enable/test/listTools |
| §19.3 | Scope change | MCP runtime in core via §9.5h (not “investigate only”); DevTools MCP still not browser backend |

**Defaults locked**

1. No quality allow-list — Owner decides what to add.  
2. Open to add, gated to act (ask / grant; default risk `network`).  
3. Fail closed until Test ok once.  
4. Transports: `stdio` + `http`/`sse` with SSRF.  
5. Caps ≤16 servers / ≤128 tools; MCP off child `task`/`spawn_helper` allow-lists in v1.

**Out of scope (v1):** marketplace; MCP-as-browser; auto-grant; injecting sandbox/HA write creds into MCP env.

---

## Decision record

**Accept** — Design `2026-11-03b` §9.5h + Plan P2-F board, owner Allen Peng, **2026-11-03**.

Further Normative change after Accept requires a **new** changelog row.
