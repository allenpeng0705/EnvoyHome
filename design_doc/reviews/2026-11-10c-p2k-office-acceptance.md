# Owner acceptance packet — Design changelog `2026-11-10c`

**Status: SHIPPED 2026-11-10c** (owner: Allen Peng)

Changelog `2026-11-10c` ships **P2-K Office File Pipeline** (§9.5j) on top of existing §9.5a–c.

It does **not** add Pandoc/LibreOffice, cloud OCR, odt/epub generate, print-perfect layout, or auto-Learn of document bytes.

---

## What was shipped

| Slice | Epic | One-line |
|-------|------|----------|
| Design umbrella | **P2-K0** | §9.5j MD pivot + format matrix + V-OFFICE-1…8 |
| Generate pptx | **P2-K1** | `export_document` `format: pptx` |
| Harden + md | **P2-K2** | docx tables / xlsx multi-sheet; `format: md` |
| Understand | **P2-K3** | `sheetName` / `slideIndex` / page slice; office skill |
| More formats | **P2-K4** | `html` \| `rtf` (odt/epub Deferred) |
| Product + KB | **P2-K5** | chips + `promote_knowledge` / `home.promoteKnowledgeFile` |

**Defaults locked**

1. Markdown is the only interop pivot.  
2. Pure JS engines; caps 2 MiB MD / 8 MiB out.  
3. Exports only under `output/exports/`; extracts under `output/extracts/` / upload sidecars.  
4. Promote copies Markdown into `knowledge/` then reindexes — refuse non-md / escape.  
5. Never Learn file bytes into standing memory.

**Follow-through (`2026-11-10d` / P2-K6):** `odt` / `ods` / `epub` generate (V-OFFICE-9). PDF generate was already Normative.

**Out of scope (v1):** cloud OCR; pixel-perfect Office templates; legacy `.doc`/`.xls` generate.

---

## Verification

| ID | Evidence |
|----|----------|
| V-OFFICE-1 | `document-export.test.ts` pptx |
| V-OFFICE-2 | md/html/rtf export tests |
| V-OFFICE-3 | docx/xlsx multi-table fixtures |
| V-OFFICE-4 | extract sheet/slide/page slice tests |
| V-OFFICE-5 | multi-attach sidecar paths (chat extract) |
| V-OFFICE-6…7 | promote_knowledge / RPC tests |
| V-OFFICE-8 | desktop artifact chip Promote/Download affordance |

---

## Decision record

**Ship** — Design `2026-11-10c` §9.5j + Plan **P2-K0…K5**, V-OFFICE-1…8, **2026-11-10c**.

Further Normative change after Ship requires a **new** changelog row.
