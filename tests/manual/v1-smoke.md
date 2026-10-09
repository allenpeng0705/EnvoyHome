# v1 manual smoke — Design §10.2 (eight flows)

**Bar:** Design §21 item 4 / Plan §8 item 4.  
**Last automated run:** 2026-10-08 (`node scripts/smoke-v1.mjs` → **8/8 PASS** with live-deferred notes).  
**Operator:** fill the Pass column for any live-only gaps you care about before tagging `v1.0.0`.

| # | Flow | Pass? | Notes |
|---|------|-------|-------|
| 1 | Add household member (Accounts → Create → Bindings → Telegram sender) | ✅ RPC | `smoke-v1.mjs`: createAccount + setBinding |
| 2 | Pair phone (Mint → QR → phone `home.hello`) | ✅ partial | mint URI with `app=EnvoyHome`; **physical phone hello deferred** |
| 3 | Approve exec (Allow once → turn resumes) | ✅ RPC | planned `exec` → pending approval → allow once |
| 4 | Enable Telegram demo (`setChannelConfig` → health green) | ✅ partial | Settings Channels + mock poll tests; **live @BotFather token** on operator machine |
| 5 | Local-only (mode `local` → chat works) | ✅ stub | mode=local + stub completionText (no GPU) |
| 6 | Accept a learn (Pending → Accept → file updates) | ✅ API | proposeLearn + acceptLearn → MEMORY.md |
| 7 | Connect the home (MQTT → bind lamp → actuation approval → device) | ✅ partial | registerSources + setSourceBinding; **live MQTT/HA actuation deferred** |
| 8 | Refuse unattended actuation (`neverUnattended` + grant refuse) | ✅ unit/API | grantRefusedForSafety + assertGrantCreatable |

**Automated helper**

```bash
node scripts/smoke-v1.mjs          # self-contained temp daemon — preferred
# or against a running daemon:
pnpm smoke:rpc
```

**Related harden gates**

| Bar | Command / check | Status (2026-10-08) |
|-----|-----------------|---------------------|
| 5 Doctor fresh | `pnpm doctor:fresh` | ✅ green |
| 6 HomeClaw dry-run | `ENVOYHOME_HOMECLAW_ROOT=./tests/fixtures/homeclaw-sample pnpm doctor:homeclaw` | ✅ sensible plan (4 copies, chat opt-in false). `~/.homeclaw` reports absent Appendix B sources (nonstandard tree) — still a valid dry-run |
| 7 Tauri macOS | `pnpm desktop:tauri:build` | ✅ `.app` + `.dmg` built |
| HA C.4 fixture | `pnpm ha:c4-diff` | ✅ green |
| HA C.4 live | `ENVOYHOME_HA_URL=… ENVOYHOME_HA_TOKEN=… pnpm ha:c4-diff` | `[>]` operator — unset in this environment (2026-10-09) |
| Mobile thin client | `pnpm mobile:test` / `pnpm mobile:live` | ✅ unit; live dial when Dart present |

**Sign-off row (operator)**

- Date: 2026-10-08
- Operator: automated smoke-v1 + doctor/ha scripts (Allen Peng env)
- Flows 1–8: **8 / 8** automated (live phone / Telegram / MQTT-HA device / live HA registry still optional for Accept)
- Blockers for full live: `ENVOYHOME_HA_*` unset; no phone present; no live bot/broker in CI host
