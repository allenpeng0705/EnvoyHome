---
name: office-documents
description: Parse, understand, and generate Office documents via Markdown pivot (Design §9.5j).
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

## Doc KB

To keep an extract in Doc KB, call `promote_knowledge` with the Markdown `sourcePath` (or use Settings / chat Promote). Never promote binaries or passwords.

## Do not

- Invent host absolute paths
- Overwrite originals in `uploads/`
- Claim print-perfect layout when `engine` is `js` (or LibreOffice is absent)
- Learn file bytes into standing memory
