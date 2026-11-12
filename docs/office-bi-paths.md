# Office / data paths: core vs MCP vs local SQL

Ground truth: Design §9.5k (`2026-11-12h` Owner Accept **C1 + C2**).

## Prefer in this order

1. **Core thin compute** (always available) — `table_transform` / `chart_table` / `render_table` / `render_diagram` → `export_document`. Caps: ≤10 000 rows × 64 cols; closed ops only (`normalize`, `filter`, `pipeline`, …).
2. **Local SQL** (optional, Owner install — Plan **P2-S**, not silent) — offline joins / SQL on jail files when the local DuckDB-class runtime is enabled and ready.
3. **Owner MCP** (`mcp__…`) — remote sheets, SaaS BI, or any server the Owner added under **Connections → MCP**, **Test**-ok, and enabled (§9.5h).

## C1 — Owner MCP (shipped honesty)

- Add **any** MCP server (no quality allow-list).
- **Test** = initialize + `tools/list` only (does not run mutating tools).
- Agent **MUST prefer** Test-ok MCP when the ask needs remote/SaaS BI or a dedicated sheets server.
- Agent **MUST NOT** invent server ids, auto-install MCP, or put sandbox secrets into MCP env.
- Under **Privacy Mode**, remote MCP stays blocked; stdio-local MCP may still apply per Privacy rules.

## C2 — Local SQL (P2-S0…S4 shipped)

- **Install:** Settings → System → Files → **Install DuckDB**, or RPCs `home.installLocalSql` / `home.getLocalSqlStatus` / `home.cancelLocalSqlInstall`.
- Explicit Owner install under `stateDir/localsql/` — **no silent first-boot**. Override: `ENVOYHOME_DUCKDB`.
- Pin: DuckDB CLI **2.0.0** (sha256-verified from GitHub releases).
- Tools: `sql_load` + `sql_query` — **absent from the turn catalogue** until DuckDB is ready (`available: false` in `home.listWorkflowTools` meanwhile).
- Prefer order: core `table_transform` → local SQL (when ready) → Owner `mcp__…` for remote/SaaS.
- **Privacy Mode:** local DuckDB OK (no cloud). Remote MCP stays blocked (V-P2-PRIV-1).
- Statement policy frozen (no `ATTACH` / `COPY` / remote URLs / multi-statement / `read_*` in user SQL).

## C3 — Core `join` (Deferred)

Two-table closed join inside `table_transform` was **not** chosen. Do not implement without a new Design Accept.

## Dogfood checklist

| Ask | Path (one sentence) |
|-----|------|
| Clean a CSV and chart it | Core `table_transform` (`pipeline`) → `chart_table` (always on) |
| Join two local CSVs offline | `sql_load` ×2 → `sql_query` when DuckDB ready; else System → Files → Install DuckDB |
| Analyze a Google Sheet / cloud BI | Owner Test-ok MCP — never invent a server id |
| >10k rows or window functions | Local SQL when ready, else Owner MCP |

### Where to click (Owner UX)

- **Install joins:** Settings → System → Files → Offline SQL (DuckDB) → Install (desktop **and** mobile).
- **What to do with this CSV (Chat):** attach `.csv`/`.xlsx` → strip **Clean & chart** / **Ask** / **Join / SQL** (or Install DuckDB when missing). Seeds the composer only; writes still need Allow. Same strip on phone Chat.
- **Recent results:** System → Files → Browse `output/tables` / `output/charts`.
