---
name: outbound-daily
description: Daily outbound assist for food, travel, shopping, rides, bookings — prepare then hand off at pay (Design §9.5i / P2-I).
---

# Daily outbound assist

Help a lot with **food, travel, shopping, rides, and bookings** by preparing the job — then **hand off at the commit wall**. Home does **not** complete payment, wallets, CAPTCHA, or native mini-programs.

## Route order (Normative)

1. **Owner MCP first** — if the turn catalogue already has matching `mcp__…` tools (Uber, delivery, shop APIs the Owner added), use them. Do not thrash the browser.
2. **Browser next** — research / shortlist / prefill with `browser` + `propose_form` (multi-step OK).
3. **Elevated profile when login walls matter** — if `blocked: "login_wall"` or the site needs an existing session (bank, airline, Amazon already logged in):
   - Prefer `"profile":"personal"` (Owner CDP, acknowledged) or `"remote"` when ready — do **not** invent CDP URLs.
   - If personal/remote is unavailable, say so and offer `propose_form` (password) + OTP card / handoff — never invent credentials.
4. **Handoff** — payment, wallet, CAPTCHA, app-only OTP, or native-only flows → `propose_handoff` with an **https** destination URL + short checklist.

## Multi-step forms (booking / settings)

1. `propose_form` on step 1 → Owner Submit.
2. `wait` (`networkidle` / `selector`) then fresh `snapshot`.
3. `propose_form` again on step 2 (new `snapshotId`).
4. Stop at payment → `propose_handoff`. Never `act` `type` into card/CVV fields.

## Job classes

| Class | What you do |
|-------|-------------|
| `research` | `web_search` / browse; summarize options |
| `shortlist` | Compare 2–3 picks; ask if needed |
| `prefill` | Multi-step `propose_form` for address, passengers, notes, attachments (`kind: file`) — not card fields |
| `handoff` | `propose_handoff` so the Owner Open → phone app / browser pays |

## Hard stop

- Never fill card number / CVV / expiry / Apple Pay / Google Pay / wallet fields — even attended.
- On `blocked: "payment"` → `propose_handoff` immediately.
- OTP: form `otp` field only if the Owner will type the code; else hand off. Never invent SMS codes.
- CAPTCHA / challenge → stop; never solve.
- Never Learn passwords, OTP, payment data, or uploaded file bytes into standing memory.
- File fields: Owner Choose file only (jail path); never invent host paths; unattended refuse.

## Handoff honesty

```json
{"tool":"browser","args":{"action":"propose_handoff","openUrl":"https://m.uber.com/looking","question":"Open Uber to confirm and pay","steps":["Confirm pickup/dropoff","Pay in the Uber app"]}}
```

- `openUrl` MUST be `https:` (Universal Links / App Links may open the native app).
- Do **not** claim the managed Chromium cart is already in the phone app unless an Owner MCP created a server-side draft.
- Pass product / merchant / ride / booking https URLs, not custom schemes (`taobao://`, `uber://`).

## Playbooks (examples)

- **Food / Meituan / Uber Eats:** shortlist → open site or MCP → fill address/notes forms → handoff to pay in app.
- **Ride / Uber:** build https deep link or MCP request → handoff for confirm + pay.
- **Travel:** search/compare → passenger `propose_form` chain → handoff before 3DS/pay.
- **Taobao / Amazon:** find product https URL → optional note/remind → handoff for checkout/pay.
- **Bank / airline login:** personal CDP or password form card; OTP card or handoff; CAPTCHA → Owner.
