# EnvoyHome — Telegram demo IM setup

Operator checklist for the bundled **Telegram** channel (`plugins/channel-telegram`, Design §5.3).

| Item | Value |
|------|--------|
| Channel id | `telegram` |
| Kind | `chat` (no actuate) |
| Config RPC | `home.setChannelConfig` → `home.enableChannel` |
| Bind RPC | `home.setBinding` (`channel` + `senderId` → `accountId`) |
| Settings | Desktop → **Channels** |

---

## 1. Create a bot

1. In Telegram, open [@BotFather](https://t.me/BotFather) → `/newbot`.
2. Copy the **bot token** (looks like `123456:ABC-DEF…`).
3. Optional: `/setprivacy` → Disable if you want group messages (demo is DM-first).

---

## 2. Configure EnvoyHome

### Via desktop Settings (preferred — V-UX-3)

1. Run daemon + desktop; create an account under **Accounts**.
2. Open **Channels**.
3. Under **Telegram demo**:
   - `channelAccount` = `default` (unless you run multiple bots)
   - paste **botToken**
   - **home.setChannelConfig** → **home.enableChannel**
4. Status should show telegram `on` / health detail like `telegram @your_bot`.

### Via RPC

```bash
# loopback owner session
home.setChannelConfig {
  "id": "telegram",
  "config": { "channelAccount": "default" },
  "secrets": { "botToken": "<from BotFather>" }
}
home.enableChannel { "id": "telegram" }
home.getChannelStatus { "id": "telegram" }
```

Secrets are write-only (never echoed in `listChannels` / status). Persisted under `<stateDir>/secrets/telegram/botToken` and `channels.json`.

---

## 3. Bind a human sender

1. Open a DM with your bot and send any text.
2. If unbound, the bot replies with a numeric **senderId**.
3. In **Channels** → **Bind Telegram sender → account**:
   - pick the household account
   - paste `senderId`
   - **home.setBinding**

RPC form:

```json
{
  "channel": "telegram",
  "channelAccount": "default",
  "senderId": "123456789",
  "accountId": "alice"
}
```

Unknown senders are refused (`pairingRequired`) — never spoofed into another account (V-CH-2).

---

## 4. End-to-end check

1. Bound user DMs the bot → daemon opens an attended turn → reply returns on the same chat.
2. **Channels** → **home.disableChannel** → further DMs are ignored (V-CH-4).
3. Re-enable when ready; token changes restart the long-poll automatically.

---

## 5. Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| health `botToken missing` | `setChannelConfig` with `secrets.botToken`, then enable |
| health `getMe failed` | Bad token, or host blocked from `api.telegram.org` |
| Bot silent after DM | Channel disabled, or sender not bound |
| Reply never arrives | Turn failed (check Approvals / Models); or missing `rawRef` owner after bind |
| Want a local mock | Use in-tree `fake` channel (V-CH-5) — no Telegram network |

---

## 6. What product already covers

- Long-poll `getUpdates` + `sendMessage` replies
- Pairing hint message with `senderId`
- Desktop Channels enable / bind / disable
- Hatch/`fake` share the same inbound contract (V-CH-1)

Mobile push and Settings loopback Chat are separate paths; Telegram is the demo IM channel.
