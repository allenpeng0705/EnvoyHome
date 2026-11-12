# Store listing pack (iOS / Android)

**Full release guide:** [`mobile-store-release.md`](mobile-store-release.md) — checklist, builds, reviewer path.  
**Canonical pack:** [`apps/mobile/store-release/`](../apps/mobile/store-release/) — App Store + Google Play listing copy, icons, review notes (same layout as EnvoyDev / EnvoyGo).

| Item | Path |
|------|------|
| Pack README | [`apps/mobile/store-release/README.md`](../apps/mobile/store-release/README.md) |
| App Store Connect text | [`apps/mobile/store-release/appstore/listing.md`](../apps/mobile/store-release/appstore/listing.md) |
| Play Console text | [`apps/mobile/store-release/googleplay/listing.md`](../apps/mobile/store-release/googleplay/listing.md) |
| Review demo home + QR | [`apps/mobile/store-release/apple_google_reviewing.md`](../apps/mobile/store-release/apple_google_reviewing.md) |
| Icons (brand source) | [`apps/branding/store/`](../apps/branding/store/) |
| Privacy HTML (deploy) | [`sites/envoyhome/privacy.html`](../sites/envoyhome/privacy.html) |
| Privacy draft | [`privacy-policy.md`](privacy-policy.md) |

**Bundle / applicationId:** `com.envoymesh.envoyhome`  
**App version (preview):** `0.1.0+1` — bump before each store upload.  
**Privacy policy URL (after deploy):** `https://www.envoymesh.cn/envoyhome/privacy.html`

## Short description (≤80 chars)

```
Self-hosted home agent on your phone. Pair by QR — no central account.
```

## Full description

Use the paste-ready blocks in the store-release `listing.md` files (agent / harness / workflows first; HA optional).

## Data safety / App Privacy (map)

| Store category | Answer |
|----------------|--------|
| Chat / messages | Yes — processed on device → your daemon |
| Location | Optional, approximate, app-linked, not for tracking |
| Device ID / push tokens | Yes — for notifications to your daemon |
| Diagnostics | Optional OS crash reporters only if you enable them |
| Tracking / advertising | No |
| Data used to track you | No |

## Screenshots (operator)

Capture on a physical device after [`mobile-live-verify.md`](mobile-live-verify.md) PASS: pair, chat+approval, Settings hub, Schedules/Workflows. Drop files under `apps/mobile/store-release/{appstore,googleplay}/screenshots/`.

## Release signing

| Platform | Doc |
|----------|-----|
| Android | [`apps/mobile/android/key.properties.example`](../apps/mobile/android/key.properties.example) — never commit real keystores; Play steps in `store-release/googleplay/listing.md` |
| iOS | Archive / TestFlight; Release uses `RunnerRelease.entitlements` (`aps-environment` = production). Daemon: unset `APNS_SANDBOX` |

## Checklist before submit

- [ ] Live verify PASS ([`mobile-live-verify.md`](mobile-live-verify.md))
- [ ] Privacy policy URL live (`sites/envoyhome/` deployed)
- [ ] Release signing configured
- [ ] Prod push verified end-to-end
- [ ] Demo home online + pairing URI in review notes (`apple_google_reviewing.md`)
- [ ] Screenshots at store resolutions
- [ ] Marketing matches early-adopter claim sheet (no Privacy Mode / IM-zoo overclaim)
