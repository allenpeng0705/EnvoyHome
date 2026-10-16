# EnvoyHome — Slack Chat setup

Operator checklist for the bundled **Slack** channel (`plugins/channel-slack`, Design §5.0).

| Item | Value |
|------|--------|
| Channel id | `slack` |
| Kind | `chat` (DM / IM only — Socket Mode) |
| Secrets | `botToken` (`xoxb-…`) + `appToken` (`xapp-…`) |
| Settings | Desktop → **Connections** → **Channels** |

---

## 1. Create a Slack app

1. [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → From scratch.
2. **OAuth & Permissions** → Bot Token Scopes: `chat:write`, `im:history`, `im:read`, `users:read`.
3. **Install to Workspace** → copy **Bot User OAuth Token** (`xoxb-…`).
4. **Basic Information** → **App-Level Tokens** → Generate with `connections:write` → copy (`xapp-…`).
5. **Socket Mode** → Enable.
6. **Event Subscriptions** → Enable → Subscribe to bot events: `message.im`.

---

## 2. Configure EnvoyHome

1. **Connections** → **Channels** → **Slack (Chat / DM)**.
2. Paste **bot token** and **app token** — config autosaves and enables.
3. Status should show `enabled · healthy · slack @ YourWorkspace`.

---

## 3. Link a sender

1. Open a **DM** with the bot (not a channel).
2. If unbound, the bot replies with Slack user id (`U…`).
3. **Link a sender** → channel = Slack → paste id → profile.

---

## Chat only

Bound DMs open attended Chat turns. Channel / group messages are ignored. Not Home chat or smart-home hubs.
