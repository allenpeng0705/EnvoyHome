# Owner acceptance packet — Design changelog `2026-11-10`

**Status: SHIPPED 2026-11-10** (owner: Allen Peng)

Changelog `2026-11-10` ships **P2-J Browser form file upload** as an extension of §9.5g.3 (lifts the prior file-upload Defer from P2-H).

It does **not** reopen CAPTCHA solving, password vaults, native apps, OS file-dialog driving, unattended file apply, or device nodes / computer-use.

---

## What was shipped

| Section | Epic | One-line |
|---------|------|----------|
| §9.5g.3 file | **P2-J** | `kind: "file"` from `input[type=file]`; Choose file → jail path; `setInputFiles` |
| Plan board | **P2-J** `[x]` | Soft risks + V-OUT-25…27 |
| Clients | desktop + mobile | Choose file → `home.uploadChatMedia` → `fieldValues` path |

**Defaults locked**

1. Field derived from snapshot (`accept?` hint); hidden file inputs stamped.  
2. `fieldValues[id]` is sandbox-relative (`uploads/…` or existing jail / `workspace/…` under R3 mounts) — never host absolute / bytes on the choice wire.  
3. Apply via Playwright `setInputFiles` after `safeJoin` / `resolveSandboxPath`; ≤8 MiB; extension allow-list.  
4. Unattended refuses any card with a `file` field (V-OUT-27).  
5. Basename-only in choice labels / approval summary names file labels without paths.  
6. Never Learn file bytes into standing memory.

**Follow-through (`2026-11-10b`):** HTML `multiple` (newline-separated paths ≤8); PE/ELF/Mach-O magic + MIME deny; jail browse via `home.listSandboxEntries`; R3 workspace mounts on apply.

**Out of scope (v1):** cloud-SDK / canvas / drag-drop uploaders without a file input; driving the site’s OS file dialog; unattended file apply.

---

## Verification

| ID | Evidence |
|----|----------|
| V-OUT-25 | `browser-form.test.ts` + `browserFormFileMock` agent scenario |
| V-OUT-26 | jail/size/ext refuse; ChoiceStore basename labels; client preflight |
| V-OUT-27 | unattended `file_unattended` on propose/apply |

---

## Decision record

**Ship** — Design `2026-11-10` §9.5g.3 file upload + Plan **P2-J**, V-OUT-25…27, **2026-11-10**.

Further Normative change after Ship requires a **new** changelog row.
