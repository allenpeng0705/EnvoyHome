# EnvoyHome — Discord Chat setup

Operator checklist for the bundled **Discord** channel (`plugins/channel-discord`, Design §5.0).

| Item | Value |
|------|--------|
| Channel id | `discord` |
| Kind | `chat` (DM Chat only — no guild actuation, no Home chat) |
| Config RPC | `home.setChannelConfig` → `home.enableChannel` |
| Bind RPC | `home.setBinding` (`channel` + `senderId` → `accountId`) |
| Settings | Desktop → **Connections** → **Channels** |

---

## 1. Create a bot

1. Open [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **Bot** → **Reset Token** / copy token.
3. Under **Privileged Gateway Intents**, Message Content is optional for **DMs** (Chat path). Enable it later if you expand beyond DMs.
4. Invite the bot to a server only if you want it discoverable; **Chat uses DMs** — open a DM with the bot from a user account.

---

## 2. Configure EnvoyHome

1. **Connections** → **Channels**.
2. Under **Discord (Chat / DM)**, paste the **bot token** — config autosaves and enables.
3. Status should show `enabled · healthy · discord @YourBot`.

---

## 3. Link a sender

1. DM the bot any text.
2. If unbound, the bot replies with a numeric **sender ID** (Discord snowflake).
3. Under **Link a sender**: channel = Discord → paste ID → pick profile → **Link sender**.

Unknown senders are refused (`pairingRequired`) — never spoofed into another account (V-CH-2).

---

## 4. What this channel does / does not

**Does:** attended Chat turns from bound DMs; replies on the same DM thread; Approvals for tools the same as desktop Chat.

**Does not:** Home chat surface; guild moderation; smart-home event-source; WhatsApp/WeChat.

---

## RPC sketch

```json
home.setChannelConfig {
  "id": "discord",
  "config": { "channelAccount": "default" },
  "secrets": { "botToken": "<from Developer Portal>" }
}
home.enableChannel { "id": "discord" }
home.setBinding {
  "channel": "discord",
  "channelAccount": "default",
  "senderId": "123456789012345678",
  "accountId": "alice"
}
```
