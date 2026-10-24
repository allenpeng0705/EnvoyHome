# EnvoyHome privacy policy (store / preview)

**Product:** EnvoyHome mobile thin client (`com.envoymesh.envoyhome`) and desktop Settings shell.  
**Model:** Self-hosted — chat, memory, and smart-home control run on **your** home daemon, not an EnvoyHome cloud brain.

This document is the operator-facing privacy summary for App Store / Play Data safety forms. It is **not** legal advice; replace the contact line before public listing.

## Data the phone may process

| Category | Examples | Leaves the phone? |
|----------|----------|-------------------|
| Pairing & session | Pair URI, device credential, WS endpoint | To **your** daemon / EnvoyMesh hosting peer only |
| Account id | Selected household profile | Same |
| Chat & media | Messages, attachments you pick, speech dictation audio (on-device STT) | Chat/media to daemon; STT stays on device unless the OS cloud dictation is used |
| Optional location | Lat/lon when “Share location with Home” is on **and** OS permission granted | Ephemeral turn inject to daemon only — not standing memory by default (Design §3 chat) |
| Push tokens | APNs / FCM device tokens | Registered on your daemon via `home.registerPushToken` |
| Local network | LAN discovery / `ws://` to home | Local network only |

## Data we do **not** collect as a vendor

EnvoyHome Inc. (or the publisher named in the store listing) does **not** operate a mandatory cloud that receives household chat, HA tokens, or model API keys for the self-hosted product. Cloud LLM keys live on the **home daemon** when you configure them. Channel bot tokens are Owner-configured on the daemon.

## Third parties

- **Apple APNs / Google FCM** — delivery of push notifications when you enable them.
- **Optional** model / search / image providers you configure on the daemon (OpenAI-compat, Brave, etc.) — traffic originates from the home machine per your Settings.
- **Firebase** (Android) — only if you add `google-services.json`; used for FCM messaging.

## Children’s privacy

EnvoyHome is not directed at children under 13 (or the age required in your jurisdiction).

## Retention & deletion

Revoke the paired device from desktop/mobile Owner Settings; uninstall the app; clear daemon `stateDir` on the home machine to remove local memory and tokens.

## Contact

Replace before Store submit: `privacy@example.com` (publisher).

## Related

- Early-adopter claims: [`design_doc/reviews/2026-10-22-early-adopter-claims.md`](../design_doc/reviews/2026-10-22-early-adopter-claims.md)
- Mobile setup: [`mobile-ios-android-setup.md`](mobile-ios-android-setup.md)
