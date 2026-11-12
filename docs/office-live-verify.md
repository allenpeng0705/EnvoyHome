# Office live verify (§9.5k — deck + thin compute)

**Purpose:** Dogfood the P2-L→M→N→O→P pipeline (deck + thin compute + polish + diagram/table PNG).  
**Normative:** Design §9.5j / §9.5k, V-OFFICE-15…33.  
**Related:** Settings → Workflows **Deck from data** sample; skill `office-documents`.

## Automated fixture (always runnable)

Requires a built daemon (`pnpm --filter @envoyhome/daemon build`):

```bash
pnpm office:live-verify
```

This runs **table_transform → chart_table → render_diagram → render_table → export_document pptx** (layouts + jail image embed) in a temp state dir and asserts `ppt/media/` is present in the OOXML zip. Exit 0 = fixture PASS. Prep ops (`normalize` / `pipeline` / …) are covered by unit V-OFFICE-34…38; heavy BI stays Owner MCP.

## Real-home dogfood (operator)

Use your running home’s state dir and an account id:

```bash
ENVOYHOME_STATE_DIR=~/Library/Application\ Support/EnvoyHome \
ENVOYHOME_ACCOUNT_ID=<accountId> \
pnpm office:live-verify
```

(Adjust `ENVOYHOME_STATE_DIR` for your OS / install. Desktop default is often under Application Support / XDG.)

Then in desktop Chat (attended, sandbox tools allowed):

| # | Step | Pass? | Notes |
|---|------|-------|-------|
| 1 | Ask for a short deck from an outline with `<!-- slide layout=… -->` | | |
| 2 | Ask to summarize / chart a small table → embed PNG in pptx | | |
| 3 | Open the pptx chip / Files → confirm slides + chart image look usable | | |
| 4 | Confirm `quality` / `engine` honesty (layout decks → JS) | | |
| 5 | Heavy BI ask: prefer Owner **MCP** (Test-ok) if configured — core tools stay thin | | |

## P2-N / P2-O / P2-P status

**P2-N** polish, **P2-O** visual fidelity, and **P2-P** diagram/table→PNG (`render_diagram` Mermaid subset, `render_table` styled GFM) shipped. Still **not** Excel formulas, OCR, Office round-trip, SmartArt, or notebook product — those stay Deferred; heavy BI stays **Owner MCP**.

## Sign-off

| Field | Value |
|-------|-------|
| Date | 2026-11-12 |
| Operator | automated + allen home |
| Fixture `pnpm office:live-verify` | **PASS** |
| Real-home tool chain (`ENVOYHOME_STATE_DIR=~/.envoyhome` `ACCOUNT_ID=allen`) | **PASS** — wrote `output/charts/live-verify-sales.png` + pptx under allen sandbox |
| Real-home Chat dogfood (attended agent) | _pending — open Files / Chat and eyeball the pptx_ |
| Open P2-N? | **Yes** — Owner opened 2026-11-12d |
| Heavy BI path | Owner MCP (not more core) |
