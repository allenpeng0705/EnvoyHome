# First-party IM live verify (B7)

**Status:** **Deferred** from early-adopter marketing.  
**Claim sheet:** [`design_doc/reviews/2026-10-22-early-adopter-claims.md`](../design_doc/reviews/2026-10-22-early-adopter-claims.md).  
**Primary phone path for early-adopter:** EnvoyMesh thin client (not Telegram/Discord/…).

Plugins + Channels Settings catalog are shipped. Live bot proof is a **separate epic** (Plan: Telegram first → Discord, Slack, Feishu, DingTalk, WeCom).

## Order (when Owner opens the epic)

1. Telegram — [`telegram-demo-setup.md`](telegram-demo-setup.md)
2. Discord — [`discord-setup.md`](discord-setup.md)
3. Slack — [`slack-setup.md`](slack-setup.md)
4. Feishu/Lark — [`feishu-setup.md`](feishu-setup.md)
5. DingTalk — [`dingtalk-setup.md`](dingtalk-setup.md)
6. WeCom — [`wecom-setup.md`](wecom-setup.md)

## Per-bot minimum

| Check | Pass? |
|-------|-------|
| Enable + `setChannelConfig` secrets never echoed | |
| Unknown sender denied / paired binding works | |
| Inbound text → turn → outbound on same thread | |
| Disable channel stops intake | |
| Approvals reachable for write/admin tools | |

## Sign-off

| Bot | Date | Operator | Result |
|-----|------|----------|--------|
| Telegram | _pending_ | | DEFER |
| Discord | _pending_ | | DEFER |
| Slack | _pending_ | | DEFER |
| Feishu | _pending_ | | DEFER |
| DingTalk | _pending_ | | DEFER |
| WeCom | _pending_ | | DEFER |

Until Telegram is **PASS**, do not claim “production Telegram for the household.” Until all six are PASS, do not claim a production IM zoo.
