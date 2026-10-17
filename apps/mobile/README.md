# EnvoyHome mobile (`com.envoymesh.envoyhome`)

Flutter thin client for EnvoyHome (Design §11.3 / §19.2 / V-P2-MOB-1).

Repo overview: [`../../README.md`](../../README.md) · Hands-on: [`../../QuickStart.md`](../../QuickStart.md).

- **iOS bundle ID / Android applicationId:** `com.envoymesh.envoyhome` (locked in Xcode `PRODUCT_BUNDLE_IDENTIFIER` + Android `applicationId` / Kotlin package)
- **Pairing:** scan desktop QR or paste `envoy://pair?…&app=EnvoyHome`
- **Dial:** hosting / LAN WS from the pairing URI (never attach-as-phone-route). On iOS, **Allow Local Network** when prompted (needed for `ws://192.168.…`).
- **Push:** iOS APNs (`Runner.entitlements` + `remote-notification` background mode + MethodChannel) · Android FCM (`POST_NOTIFICATIONS` + `envoyhome_alerts` channel; needs `android/app/google-services.json`). Tokens → `home.registerPushToken`. Operator checklist: [`docs/mobile-ios-android-setup.md`](../../docs/mobile-ios-android-setup.md).

Depends on `packages/mobile-client` → sibling `envoy_thin_client`.

## Run

```bash
cd apps/mobile
flutter pub get
flutter run          # device / simulator
flutter test
```

Daemon must be reachable (desktop Settings → Mint pairing → QR).

## Navigation (Design §10.1 mirror)

**Phone:** bottom **Chat · Home · Settings** (Home hidden until Home Assistant is configured + enabled).

**Settings hub:** LLM · Connections · Skills · System (same groups as desktop sidebar). Nested screens cover Models/Local (HF·GGUF download on host)/Routing/Memory, HA·MQTT bind, IM channels, Skills/Workflows (AI draft + YAML)/Schedules, Artifacts/Doctor/Grants.

**Chat / Home:** attach (`home.uploadChatMedia`), OS speech dictation, inline approvals. Pairing **mint** stays on desktop; phone joins via QR / host / SSH.

## Push setup

**Full checklist:** [`docs/mobile-ios-android-setup.md`](../../docs/mobile-ios-android-setup.md)

| Platform | Config |
|----------|--------|
| **iOS** | Xcode Push capability; daemon `APNS_*` (topic = `com.envoymesh.envoyhome`) |
| **Android** | `android/app/google-services.json`; daemon `FCM_*` |

Daemon sends APNs/FCM on `home:approval-needed`; Advanced → `home.sendTestPush` for a dry check.

## Demo IM

Telegram / other IM channels stay **last** in the product order — this app is the EnvoyMesh phone path, not a bot.
