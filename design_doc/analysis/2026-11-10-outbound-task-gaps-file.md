# Outbound task gaps — file upload (P2-J)

| Area | Was | Now |
|------|-----|-----|
| Form `input[type=file]` | Partial / Miss (Defer) | **Hit** — `kind: file` + Choose file / jail browse |
| Apply | — | `setInputFiles` after jail + R3 mounts |
| Caps | — | ≤8 MiB; ext allow-list; MIME deny; PE/ELF/Mach-O magic |
| `multiple` | — | Newline-separated paths ≤8 |
| Unattended | — | Refuse any file field |
| Memory | — | Never Learn file bytes |

Verification: **V-OUT-25…27**. See Design `2026-11-10` / `2026-11-10b` and Plan **P2-J**.
