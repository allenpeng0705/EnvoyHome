# EnvoyHome — WeCom (企业微信) Chat setup

| Item | Value |
|------|--------|
| Channel id | `wecom` |
| Kind | `chat` (1:1 via 微信客服 sync) |
| Secrets | `corpId`, `secret` |
| Config | `agentId` (required); `openKfid` (optional) |
| Settings | Connections → Channels |

1. Create a WeCom app; note Corp ID, Secret, Agent ID.
2. Enable **微信客服** and note the Open KF ID (`open_kfid`).
3. Paste Corp ID + Secret + Agent ID (and Open KF ID if you have it) — config autosaves and enables.
4. Message the KF account → link `external_userid` under **Link a sender**.

Inbound uses `kf/sync_msg` (no public callback URL). Outbound uses `kf/send_msg` with the same `external_userid` / `open_kfid` — not application `message/send`.

Chat only — not Home chat or smart-home hubs. Personal WeChat remains deferred.
