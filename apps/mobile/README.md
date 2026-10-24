# EnvoyHome mobile (`com.envoymesh.envoyhome`)

Flutter thin client for EnvoyHome (Design §11.3 / §19.2 / V-P2-MOB-1).

Repo overview: [`../../README.md`](../../README.md) · Hands-on: [`../../QuickStart.md`](../../QuickStart.md).

- **iOS bundle ID / Android applicationId:** `com.envoymesh.envoyhome` (locked in Xcode `PRODUCT_BUNDLE_IDENTIFIER` + Android `applicationId` / Kotlin package)
- **Pairing:** scan desktop QR or paste `envoy://pair?…&app=EnvoyHome`
- **Dial:** hosting / LAN WS from the pairing URI (never attach-as-phone-route). On iOS, **Allow Local Network** when prompted (needed for `ws://192.168.…`).
- **Push:** iOS APNs (Debug: `Runner.entitlements` development; Release/TestFlight: `RunnerRelease.entitlements` production) · Android FCM (`google-services.json`). Tokens → `home.registerPushToken`. Operator: [`docs/mobile-ios-android-setup.md`](../../docs/mobile-ios-android-setup.md) · live verify: [`docs/mobile-live-verify.md`](../../docs/mobile-live-verify.md).

Depends on `packages/mobile-client` → sibling `envoy_thin_client`.

## Run

```bash
cd apps/mobile
flutter pub get
flutter run          # device / simulator
flutter test
# from repo root:
pnpm mobile:test && pnpm mobile:flutter
```

Daemon must be reachable (desktop Settings → Mint pairing → QR). Android Play releases: copy [`android/key.properties.example`](android/key.properties.example) → `android/key.properties` (gitignored).

## Navigation (Design §10.1 mirror)

**Phone:** bottom **Chats · Schedules · Home? · Settings** (Home hidden until Home Assistant is configured + enabled).

**Settings hub:** LLM · Connections · Skills · System. System tabs: Profiles · Files · Health · Grants · **This machine** (read-only `home.health`; OS service remains desktop loopback-owner).

**Chat / Home:** attach, OS speech dictation, inline approvals. **Owner** phones may mint/revoke pairing on Connections; members see status only. Workflows: AI draft + **Diagram ↔ YAML** toggle.

## Push setup

**Full checklist:** [`docs/mobile-ios-android-setup.md`](../../docs/mobile-ios-android-setup.md)

| Platform | Config |
|----------|--------|
| **iOS** | Xcode Push capability; daemon `APNS_*` (topic = `com.envoymesh.envoyhome`) |
| **Android** | `android/app/google-services.json`; daemon `FCM_*` |

Daemon sends APNs/FCM on `home:approval-needed`; Advanced → `home.sendTestPush` for a dry check.

## Demo IM

Telegram / other IM channels stay **last** in the product order — this app is the EnvoyMesh phone path, not a bot.
