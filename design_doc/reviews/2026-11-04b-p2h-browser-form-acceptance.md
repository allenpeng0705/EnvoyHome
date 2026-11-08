# Owner acceptance packet — Design changelog `2026-11-04b`

**Status: SHIPPED 2026-11-04c** (Accepted 2026-11-04; owner: Allen Peng)

Changelog `2026-11-04b` accepted **P2-H Browser form assist** (§9.5g.3). Implementation landed under Design Ship `2026-11-04c` with V-OUT-16…19 green.

It does **not** reopen CAPTCHA solving, password vaults, file-upload fields, native apps, or device nodes.

---

## What was accepted / shipped

| Section | Epic | One-line |
|---------|------|----------|
| §9.5g.3 | **P2-H** | Dynamic form card from snapshot fields (N fields); not login-only template |
| V-UX-14 delta | — | Additive `selection: "form"` + `fieldValues` on answer |
| Plan board | **P2-H** `[x]` | Soft risks + V-OUT-16…19 |

**Defaults locked**

1. Fields come from the **current** page snapshot — 2-field login or multi-field booking/settings.  
2. Bound to `snapshotId`; stale Submit fails closed.  
3. One attended Allow fills all mapped refs (+ optional submit).  
4. `password` / `otp` one-shot; never LearnQueue / L1–L2; redact chat; unattended refuse sensitive.  
5. No form card on CAPTCHA/`blocked`. Prefer personal session when already logged in.  
6. Cap ≤24 fields; no password vault in v1.

**Out of scope (v1):** CAPTCHA; file upload; native apps; third-party password-manager autofill; computer-use.

---

## Decision record

**Accept** — Design `2026-11-04b` §9.5g.3 + Plan P2-H board, owner Allen Peng, **2026-11-04**.  
**Ship** — Design `2026-11-04c`, V-OUT-16…19, **2026-11-04**.

Further Normative change after Accept requires a **new** changelog row.
