---
name: browser-automation
description: How to use the EnvoyHome builtin browser tool (snapshot → wait → act with snapshotId → verify; form assist; outbound handoff). Design §9.5g / §9.5i.
---

# Browser automation

Use the builtin tool `browser` (Design §9.5g / §9.5g.1 / §9.5g.2 / §9.5g.3 / §9.5i). Do **not** use `web_search` for free navigation. MCP is not the browser backend — but for food/travel/shop/rides, **prefer Owner MCP tools when they exist** (see `outbound-daily` skill).

## Profiles

- Default: household `defaultProfile` (usually `managed` — isolated Chromium).
- Pass `"profile":"personal"` only when the Owner enabled personal CDP and you need their logged-in Chrome (Owner account turns only).
- Pass `"profile":"remote"` for the Owner’s remote CDP host.
- Never invent a CDP URL — endpoints come from Settings only.

## Loop (observe → act → verify)

1. `{"tool":"browser","args":{"action":"navigate","url":"https://…"}}` — opens/focuses a tab; result includes `snapshotId` + `snapshot.elements[]`.
2. Optional wait for SPAs: `{"tool":"browser","args":{"action":"wait","until":"networkidle","ms":5000}}` (`until`: `load`|`networkidle`|`selector`|`timeout`; `ms` ≤ 15000).
3. Read elements (`ref`, `role`, `name`, `text`). Keep the `snapshotId`.
4. Act **must** pass that id:  
   `{"tool":"browser","args":{"action":"act","kind":"click","ref":"3","snapshotId":"s1"}}`  
   or `kind":"type","ref":"…","text":"…","snapshotId":"s1"}`.  
   Optional `"verify":"text"` (attended default) / `"screenshot"` / `"none"`.
5. Form keys: `{"tool":"browser","args":{"action":"press","key":"Enter"}}` (`Enter`|`Tab`|`Escape`|arrows|…).
6. **Human form values** (login, booking, settings — **not** payment):  
   `{"tool":"browser","args":{"action":"propose_form","snapshotId":"s1"}}`  
   Parks a dynamic form card from the snapshot. Owner Submit fills all refs under one Allow; never paste passwords into `ask_user`.  
   Never call `apply_form` — that action is daemon-internal only.
7. **Multi-step wizards:** after apply, `wait` → `snapshot` → `propose_form` again on the next page (chain 2+ cards).
8. **Commit wall / pay:** on `blocked: "payment"` (or card/wallet fields) — stop filling. Hand off:  
   `{"tool":"browser","args":{"action":"propose_handoff","openUrl":"https://…","steps":["Confirm in the app","Pay there"],"question":"Finish and pay in your app"}}`  
   `openUrl` MUST be **https** (Universal Links may open Uber/Meituan/Taobao/Amazon). Never claim the daemon cart is already in the phone app.
9. On `stale_snapshot` or `stale_ref` or `snapshotConsumed` — call `snapshot` again and retry with the **new** `snapshotId`. Successful `act` / form apply consumes the id.
10. Optional: `text` for readable prose; `screenshot` writes under `output/browser/`.

## Rules

- Only `http`/`https` page URLs; private/link-local hosts are refused. Handoff `openUrl` is **https-only**.
- Prefer `navigate` + `snapshot` + `act(snapshotId)` over guessing CSS selectors.
- On `blocked` (`captcha`|`login_wall`|`challenge`|`payment`) — stop; never solve CAPTCHAs; never open a form card on captcha/challenge/payment; never fill card/CVV/wallet fields even attended.
- OTP: only via form card when the Owner types the code — never invent or receive SMS.
- Prefer `propose_form` when the Owner must supply non-payment field values; secrets are one-shot and never enter standing memory. Do **not** invent `apply_form` or put passwords in tool args.
- Close tabs with `action":"close"` when done; `stop` tears down the session (managed) or disconnects (personal/remote).
