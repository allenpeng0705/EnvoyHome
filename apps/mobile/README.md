# EnvoyHome mobile (`com.envoymesh.envoyhome`)

Flutter thin client for EnvoyHome (Design §11.3 / §19.2 / V-P2-MOB-1).

Repo overview: [`../../README.md`](../../README.md) · Hands-on: [`../../QuickStart.md`](../../QuickStart.md).

- **iOS bundle ID / Android applicationId:** `com.envoymesh.envoyhome`
- **Pairing:** scan desktop QR or paste `envoy://pair?…&app=EnvoyHome`
- **Dial:** hosting / LAN WS from the pairing URI (never attach-as-phone-route)
- **Push:** iOS APNs (native MethodChannel) + Android FCM (`firebase_messaging`); tokens registered via `home.registerPushToken`

Depends on `packages/mobile-client` → sibling `envoy_thin_client`.

## Run

```bash
cd apps/mobile
flutter pub get
flutter run          # device / simulator
flutter test
```

Daemon must be reachable (desktop Settings → Mint pairing → QR).

## Tabs

Chat (subscribe + transcript) · Approvals · **Artifacts** (signed URL via `home.getArtifactUrl`)

## Push setup

**Full checklist:** [`docs/mobile-ios-android-setup.md`](../../docs/mobile-ios-android-setup.md)

| Platform | Config |
|----------|--------|
| **iOS** | Xcode Push capability; daemon `APNS_*` (topic = `com.envoymesh.envoyhome`) |
| **Android** | `android/app/google-services.json`; daemon `FCM_*` |

Daemon sends APNs/FCM on `home:approval-needed`; Advanced → `home.sendTestPush` for a dry check.

## Demo IM

Telegram / other IM channels stay **last** in the product order — this app is the EnvoyMesh phone path, not a bot.
