# EnvoyHome — Feishu / Lark Chat setup

| Item | Value |
|------|--------|
| Channel id | `feishu` |
| Kind | `chat` (p2p only) |
| Secrets | `appId`, `appSecret` |
| Settings | Connections → Channels |

1. Create an app at [open.feishu.cn](https://open.feishu.cn/) (or Lark open platform).
2. Enable bot capability; subscribe to `im.message.receive_v1`.
3. Prefer **long connection** for events (no public URL required).
4. Paste App ID + App Secret — config autosaves and enables.
5. DM the bot → link `open_id` sender under **Link a sender**.

Group chats are ignored (Chat only).
