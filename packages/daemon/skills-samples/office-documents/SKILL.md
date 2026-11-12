---
name: office-documents
description: Parse, understand, and generate Office documents via Markdown pivot (Design §9.5j / §9.5k).
---

# Office documents

EnvoyHome keeps **Markdown as the only interop pivot**.

## Parse (understand)

1. Chat uploads auto-extract to `uploads/<stem>.extract.md`.
2. For sandbox files, call `extract_document` with `sourcePath`.
3. Optional targeting:
   - `startPage` / `endPage` — PDF/page markers
   - `sheetName` — Excel-like H1/H2 section
   - `slideIndex` — 1-based PowerPoint section

## Generate

Call `export_document` with `format` + `markdown` (or `sourcePath` to a `.md`):

| format | Use when |
|--------|----------|
| `docx` | Word |
| `xlsx` | Excel |
| `pptx` | PowerPoint deck |
| `pdf` | PDF |
| `csv` | Spreadsheet CSV |
| `md` | Normalized Markdown under `output/exports/` |
| `html` | Self-contained HTML |
| `rtf` | Rich Text |
| `odt` | OpenDocument Text |
| `ods` | OpenDocument Spreadsheet |
| `epub` | EPUB ebook |

Outputs land under `output/exports/` — cite the `uri` so thin clients can Open/Download.

Optional `engine`: `"auto"` (default; LibreOffice when installed, else JS), `"js"`, or `"libreoffice"` (fails if soffice missing). Result includes `engine` and `quality` (`print` \| `structure`). Prefer `auto` unless the user asks to force one.

When the result has `quality: "structure"` and `installHint`, tell the user the file is ready but layout is structure-only, and point them to **Settings → System → Files** (or the `installHint` command on the home computer) for print-quality LibreOffice.

### Deck from outline (pptx — §9.5k / P2-N / P2-O)

H1/H2 start slides. Optional layout / notes directives **immediately after** the heading:

```markdown
# Q3 Review
<!-- slide layout=section -->
<!-- slide notes: Welcome; keep under 60s -->

## Highlights
<!-- slide layout=title_bullets -->
- Revenue up 12%
- Churn down

## Split view
<!-- slide layout=two_column -->
- Left point
- Another
- Right point
- More

## Build vs buy
<!-- slide layout=comparison -->
Build
Buy
- Faster iterate
- Own the stack
- Lower ops
- Vendor roadmap

## Customer voice
<!-- slide layout=quote -->
Customers love the simplicity.
— Jane, Owner

## Numbers
<!-- slide layout=table -->

| Metric | Value |
|--------|-------|
| NPS | 62 |

## Chart slide
<!-- slide layout=title_only -->
![Sales](output/charts/sales-abc.png)
```

Closed layouts: `title_bullets` | `section` | `two_column` | `title_only` | `table` | `quote` | `comparison`. Unknown → soft-default to `title_bullets` (see `layoutNotes` in the tool result).

**Comparison headers:** prefer two short one-liners (`Build` then `Buy`), or one line `Build | Buy` / `Build vs Buy`. Blank line between headers is fine but not required.

**Quote attribution:** put `— Name` on its own line (or after an em-dash inline). Do not mash it into the quote sentence without a dash.

Speaker notes: `<!-- slide notes: … -->` (≤2000 chars) → PowerPoint notes pane. Notes / layouts / images force `engine: auto` → **JS**.

**Visual fidelity (P2-O):** JS decks are 16:9 with body ≥18pt; `section` uses a full-bleed accent panel; `comparison` uses card columns; `title_only`+image is image-dominant. Built-in presets: `theme.id` `default` | `dark`.

Jail images: `![alt](relative/path.png)` under the account sandbox / workspace only (≤8 images, ≤2 MiB each).

Owner template packs (optional): `templateId` → account `files/templates/office/<id>/theme.json` (or household `stateDir/templates/office/<id>/`). Optional blank `master.pptx` in the same pack surfaces `masterNote`; chrome still comes from `theme.json` (footer / slide numbers) — no OOXML merge. Missing pack → default theme + `templateNote`.

## Thin compute (§9.5k / P2-R)

- `table_transform` — closed ops on GFM / `.csv` (quoted newlines OK) / `.xlsx` (`sheetName` optional) → `output/tables/*.csv`
  - Prep: `normalize` | `filter` (`equals`/`notEquals`/`contains`/`gt`/`gte`/`lt`/`lte`/`values`/`isEmpty`) | `dedupe` | `rename_columns` | `top_n` | `head` | `tail`
  - Analyze: `summarize` | `sort` | `aggregate` | `select_columns`
  - Chain: `pipeline` with `steps[]` (≤16; no nested pipeline)
- `chart_table` — `bar` | `line` | `pie` → `output/charts/*.png` (then embed in pptx via jail image path)
- `render_diagram` — closed Mermaid (`flowchart`/`graph`, `sequenceDiagram`, `pie`, `mindmap`) → `output/diagrams/*.png`. Refuse `click` / `%%{init` / scripts. Caps: 8 KiB source, 30 s, edge/line limits.
- `render_table` — styled presentation table PNG from GFM/csv/xlsx → `output/diagrams/*.png` (use when the deck needs a *looks* table; small plain tables can stay as editable pptx `layout=table`)

### Prep → chart → pptx recipe

```text
1) table_transform  op: pipeline
     steps:
       - { op: normalize }
       - { op: filter, column: Sales, gte: "1000" }
       - { op: top_n, column: Sales, n: 8 }
2) chart_table  chartType: bar  sourcePath: <uri from step 1>
3) export_document pptx with title_only + ![Chart](output/charts/…)
```

### Diagram → pptx recipe

```text
1) render_diagram  mermaid: |
     flowchart LR
       A[Lead] --> B[Qualify]
       B --> C[Close]
2) export_document pptx with:
     ## Flow
     <!-- slide layout=title_only -->
     ![Flow](output/diagrams/<uri from step 1>)
```

### Core vs local SQL vs Owner MCP (honesty — Design `2026-11-12h` / P2-S)

Prefer in order (see `docs/office-bi-paths.md`):

1. **Core** — tidy ≤10k×64 prep + deck charts (`normalize` / `pipeline` / …)
2. **Local SQL** — when DuckDB is Owner-installed / ready (Settings → System → Files): `sql_load` then `sql_query`. Tools are **absent from the catalogue** until ready. Never silent install; never invent paths
3. **Owner MCP** (`mcp__…`) — remote sheets / SaaS BI / Test-ok servers

#### Pick the path in one sentence

| Ask | One-sentence path |
|-----|-------------------|
| Clean a CSV and chart it | Core `table_transform` (`pipeline`) → `chart_table` → optional pptx |
| Join two local CSVs offline | `sql_load` ×2 → `sql_query` (only when DuckDB ready); else tell Owner to Install under System → Files |
| Analyze a Google Sheet / cloud BI | Owner Test-ok `mcp__…` — never invent a server |
| >10k rows or window functions | Local SQL when ready; else Owner MCP; never invent pandas/notebook |

#### Canned `sql_query` (after `sql_load`)

Group-by:

```sql
SELECT region, SUM(amount) AS total
FROM sales
GROUP BY region
ORDER BY total DESC
```

Two-table join (load both names first):

```sql
SELECT r.region, SUM(s.amount) AS total
FROM sales s
JOIN regions r ON s.region_id = r.id
GROUP BY r.region
ORDER BY total DESC
```

If `sql_*` is absent from the tool catalogue, DuckDB is not ready — do **not** invent MCP/SQL; point the Owner to **System → Files → Install DuckDB**.

**MUST prefer** Test-ok `mcp__…` for remote/SaaS BI. **Never** invent MCP or local-SQL installs / server ids; **never** inject sandbox credentials into MCP env.

**Privacy Mode:** local DuckDB / `sql_*` stay OK (on-box). Remote MCP (`http`/`sse`) stays blocked.

## Doc KB

To keep an extract in Doc KB, call `promote_knowledge` with the Markdown `sourcePath` (or use Settings / chat Promote). Never promote binaries or passwords.

## Do not

- Invent host absolute paths
- Overwrite originals in `uploads/`
- Claim print-perfect layout when `engine` is `js` (or LibreOffice is absent)
- Learn file bytes into standing memory
- Invent slide layouts outside the closed enum
- Run arbitrary code / pandas / unsandboxed SQL for “data analysis” — use `table_transform`, or `sql_query` when DuckDB is ready, or Owner MCP
- Auto-install or invent MCP servers / DuckDB installs for BI
- Call cloud from local SQL — DuckDB stays on-box; under Privacy Mode local SQL is OK, remote MCP is not
- Invent Mermaid kinds outside the closed set, or use click/init/script in diagrams
- Promise editable SmartArt / complex OOXML tables — diagrams and styled tables are PNGs
