---
name: browser-automation
description: How to use the EnvoyHome builtin browser tool (snapshot → ref → act; profiles).
---

# Browser automation

Use the builtin tool `browser` (Design §9.5g / §9.5g.1). Do **not** use `web_search` for free navigation.

## Profiles

- Default: household `defaultProfile` (usually `managed` — isolated Chromium).
- Pass `"profile":"personal"` only when the Owner enabled personal CDP and you need their logged-in Chrome (Owner account turns only).
- Pass `"profile":"remote"` for the Owner’s remote CDP host.
- Never invent a CDP URL — endpoints come from Settings only.

## Loop

1. `{"tool":"browser","args":{"action":"navigate","url":"https://…"}}` — opens/focuses a tab and returns a snapshot with `ref` ids.
2. Read `snapshot.elements[]` (`ref`, `text`, `tag`).
3. Act: `{"tool":"browser","args":{"action":"act","kind":"click","ref":"3"}}` or `kind":"type","ref":"…","text":"…"`.
4. If you get `stale_ref`, call `snapshot` again before retrying.
5. Optional: `text` for readable prose; `screenshot` writes under `output/browser/`.

## Rules

- Only `http`/`https` page URLs; private/link-local hosts are refused.
- Prefer `navigate` + `act` over guessing CSS selectors.
- Stop on CAPTCHA / login walls — do not try to solve them.
- Close tabs with `action":"close"` when done; `stop` tears down the session (managed) or disconnects (personal/remote).
