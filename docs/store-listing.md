# Store listing pack (iOS / Android)

**Bundle / applicationId:** `com.envoymesh.envoyhome`  
**App version (preview):** `0.1.0+1` — bump before public 1.0.  
**Privacy policy URL:** host [`privacy-policy.md`](privacy-policy.md) (or equivalent HTML) and paste the public URL into App Store Connect / Play Console.

## Short description (≤80 chars)

Self-hosted home agent — pair to your EnvoyHome daemon over EnvoyMesh.

## Full description (draft)

EnvoyHome is the phone thin client for your **self-hosted** home agent.

- Pair with a QR code from desktop Settings (or hostname / SSH hop).
- Chat with your household profiles; approve risky tools inline.
- Open shared files over the home connection (no public URL required).
- Optional push for approvals (APNs / FCM — configure on the home machine).
- Home Assistant–gated Home chat when HA is connected on the daemon.

Requires a running EnvoyHome daemon on your home network (or reachable hop). Not a cloud chatbot. Not a replacement for Home Assistant.

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

Capture on a physical device after [`mobile-live-verify.md`](mobile-live-verify.md) PASS: pair, chat+approval, Home (HA), Settings hub, Files.

## Release signing

| Platform | Doc |
|----------|-----|
| Android | [`apps/mobile/android/key.properties.example`](../apps/mobile/android/key.properties.example) — never commit real keystores |
| iOS | Archive / TestFlight; Release uses `RunnerRelease.entitlements` (`aps-environment` = production). Daemon: unset `APNS_SANDBOX` |

## Checklist before submit

- [ ] Live verify PASS  
- [ ] Privacy policy URL live  
- [ ] Release signing configured  
- [ ] Prod push verified end-to-end  
- [ ] Marketing matches early-adopter claim sheet (no Privacy Mode / IM-zoo overclaim)  
