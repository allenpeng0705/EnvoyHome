# EnvoyHome mobile — iOS & Android setup

One checklist for the phone app (`com.envoymesh.envoyhome`) and home-daemon push delivery.

| Item | Value |
|------|--------|
| Bundle ID / applicationId | `com.envoymesh.envoyhome` |
| App path | `apps/mobile` |
| Pairing | Desktop Settings → Pairing → mint QR / `envoy://pair?…&app=EnvoyHome` |
| Push register | App → `home.registerPushToken` |
| Push delivery | Daemon APNs (iOS) + FCM (Android) on `home:approval-needed`; test via `home.sendTestPush` |

---

## 0. Prerequisites (both platforms)

1. Build & run the daemon (`pnpm --filter @envoyhome/daemon build && pnpm --filter @envoyhome/daemon dev`).
2. Open desktop Settings, create an account, **Mint pairing** (QR shown).
3. On the phone: `cd apps/mobile && flutter pub get && flutter run`.
4. Scan the QR (or paste the URI) → set **accountId** → confirm Chat/Approvals work over WS.

Push alerts only matter after step 4 succeeds and credentials below are configured on the **daemon host**.

---

## 1. iOS (APNs)

### 1.1 Apple Developer

1. Create/confirm an **App ID** with bundle id **`com.envoymesh.envoyhome`**.
2. Enable **Push Notifications** on that App ID.
3. Create an **APNs Auth Key** (.p8) under Keys (Apple Push Notifications service).
4. Note:
   - **Key ID** (10 chars) → `APNS_KEY_ID`
   - **Team ID** (Membership) → `APNS_TEAM_ID`
   - Path to the `.p8` file → `APNS_KEY_PATH`
5. **Topic** must equal the bundle id: `APNS_TOPIC=com.envoymesh.envoyhome`.

### 1.2 Xcode project

1. Open `apps/mobile/ios/Runner.xcworkspace` (after `flutter pub get` / first `flutter run`).
2. Target **Runner** → Signing & Capabilities:
   - Team + unique App ID for `com.envoymesh.envoyhome`
   - Add capability **Push Notifications**
   - **Background Modes** → Remote notifications (already declared in Info.plist)
3. Use a **physical iPhone** for push (Simulator does not get real APNs device tokens).

### 1.3 Sandbox vs production

| Build | Daemon setting |
|-------|----------------|
| Xcode debug / local device | `APNS_SANDBOX=1` (or `"sandbox": true` in `push-config.json`) |
| TestFlight / App Store | unset `APNS_SANDBOX` / `"sandbox": false` |

Mismatch → APNs 400 and a useless token; re-install the app and re-pair after fixing.

### 1.4 Daemon env (iOS send)

```bash
export APNS_KEY_ID="ABC1234567"
export APNS_TEAM_ID="1A2B3C4D5E"
export APNS_KEY_PATH="/secure/AuthKey_ABC1234567.p8"
export APNS_TOPIC="com.envoymesh.envoyhome"
export APNS_SANDBOX=1   # debug builds only
```

Or copy `docs/push-config.example.json` → `<stateDir>/push-config.json` (or repo-root `push-config.json`) and edit paths.

---

## 2. Android (FCM)

### 2.1 Firebase

1. Firebase Console → create/select a project.
2. Add an **Android app** with package name **`com.envoymesh.envoyhome`**.
3. Download **`google-services.json`** → place at:

   `apps/mobile/android/app/google-services.json`

   (gitignored; see `google-services.json.example` for shape.)
4. Project settings → Service accounts → generate a **Firebase Admin SDK** JSON key for the **daemon host**.
5. Note:
   - Project ID → `FCM_PROJECT_ID`
   - Path to service-account JSON → `FCM_SERVICE_ACCOUNT_JSON`

### 2.2 App build

```bash
cd apps/mobile
flutter pub get
flutter run   # device or emulator with Google Play services
```

Without `google-services.json`, the app still builds; FCM init is a silent no-op (no Android token).

### 2.3 Daemon env (Android send)

```bash
export FCM_PROJECT_ID="your-firebase-project-id"
export FCM_SERVICE_ACCOUNT_JSON="/secure/firebase-service-account.json"
```

Same `push-config.json` can hold both `apns` and `fcm` blocks.

---

## 3. End-to-end verification

1. Phone paired + accountId set; wait for log `[push] home.registerPushToken ok`.
2. On the home machine (with APNs/FCM creds loaded), either:
   - Desktop Settings → **Advanced** → **home.sendTestPush**, or
   - RPC: `home.sendTestPush` `{ "title": "EnvoyHome", "body": "hello" }`
3. Expect a banner on the phone; tap opens **Approvals** (`data.type=approval|test`).
4. Trigger a real approval (e.g. tool ask) → daemon emits `home:approval-needed` → push to devices registered for that account.

Tokens live in `<stateDir>/paired-devices/push-tokens.json`. Dead tokens (APNs/FCM 400/403/404/410) are removed automatically.

---

## 4. Operator file layout

```text
<stateDir>/
  push-config.json                 # optional; see docs/push-config.example.json
  paired-devices/push-tokens.json  # written by home.registerPushToken

apps/mobile/
  android/app/google-services.json # Android only; from Firebase
  ios/Runner.xcworkspace           # enable Push capability in Xcode
```

Env vars override `push-config.json` when both are set.

---

## 5. Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| `sent: 0` from `sendTestPush` | No token registered, or APNs/FCM creds missing on daemon |
| `[push] APNs credentials not configured` | Set all four `APNS_*` (or `push-config.json` apns block) |
| APNs status 403 | Wrong Key/Team/Topic, or Push not enabled on App ID |
| APNs status 400 | Sandbox↔prod mismatch, or stale token — toggle `APNS_SANDBOX`, reinstall app |
| Android never registers | Missing `google-services.json` or emulator without Play services |
| FCM 401/403 | Bad service-account JSON or wrong `FCM_PROJECT_ID` |
| Pairing refuses code | URI must have `app=EnvoyHome` (not EnvoyGo / EnvoyDev) |

---

## 6. What the product already does

- Flutter shell: QR / paste pair, Chat, Approvals, push tap → Approvals tab  
- Daemon: register/unregister tokens; **dispatch APNs/FCM on approval-needed**; `home.sendTestPush`  
- Demo IM (Telegram etc.) remains **last** in the product order — not required for this checklist
