# EnvoyHome Mobile — Google Play listing

Paste these fields into [Google Play Console](https://play.google.com/console). Character limits are noted.

Replace every `TODO:` before submit.

---

## Store listing

| Field | Value |
|-------|--------|
| App name (30) | EnvoyHome |
| Package name | `com.envoymesh.envoyhome` |
| Default language | English (United States) — or your locale |
| Application type | App |
| Category | Productivity |
| Tags (optional) | Tools, Lifestyle, Home |
| Free / paid | Free |

### App name alternatives (≤30)

- EnvoyHome
- EnvoyHome Mobile

---

## Short description (80)

```
Self-hosted home agent on your phone. Pair by QR — no central account.
```

Alternatives (≤80):

```
EnvoyHome companion: chat, Approvals, schedules — keys stay at home.
```

```
Thin client for your home agent. Pair once. Chat and approve on the go.
```

---

## Full description (4000)

```
EnvoyHome is the Android companion for the EnvoyHome home agent — a security-first, self-hosted agent that runs on a computer you own.

Pair once, then chat with your household agent, answer Approvals, and check schedules and workflows from your phone. The home daemon runs the agent (envoy-harness), tools, memory, and policy; the phone is a thin window into the same house.

PAIR IN SECONDS
• Scan the pairing QR shown in EnvoyHome desktop Settings
• Or paste a host address and short token when you are on the same network
• Or reach a machine over SSH when you are away from home
• No central EnvoyHome account — identity and sessions stay with your home

CHAT & APPROVALS
• Talk to your household profiles over home.*
• Answer Allow / Deny when a tool needs consent
• Optional push alerts when an Approval is waiting (FCM)
• Attach files or dictate into Chat when you need them

WORKFLOWS & SCHEDULES
• Browse skills, workflows, and standing schedules configured on the home
• The same tool catalogue powers chat turns and workflows on the daemon
• The phone does not run a second agent engine

OPTIONAL SMART HOME
• When Home Assistant or MQTT is connected on the home daemon, related tools and Home chat can appear
• EnvoyHome enhances AI for hubs you already run — it is not a hub replacement
• Actuation stays gated by Approvals and safety-class rules on the daemon

THIN CLIENT BY DESIGN
• The phone never runs the home agent and never holds model API keys
• Memory, Doc KB, and KnowYou stay on the home computer
• Reconnect over LAN, mesh, or SSH — the work keeps running if the phone drops

REQUIREMENTS
• EnvoyHome daemon running on a Mac, Windows, or Linux machine
• A pairing QR or invite from that desktop (Settings → Connections → Pair devices)

EnvoyHome Mobile is part of the EnvoyMesh apps group: it shares mesh pairing and reachability with the family, and keeps EnvoyHome agent state separate on your home machine.
```

---

## What’s new (release notes)

```
Initial public release of EnvoyHome Mobile.

• Pair to your EnvoyHome daemon with a QR code, host:port, or SSH hop
• Chat with household profiles; answer Approvals inline
• Browse Settings, Skills, Workflows, and Schedules
• Optional push for Approvals (FCM)
• Secure pairing tokens stored in Android Keystore-backed storage
```

---

## Contact details

| Field | Value |
|-------|--------|
| Email | `shilei.peng@qq.com` (alternate: `shileipeng@gmail.com`) |
| Phone | optional |
| Website | `https://www.envoymesh.cn/envoyhome/` |
| Privacy policy | `https://www.envoymesh.cn/envoyhome/privacy.html` |

Deploy `sites/envoyhome/` before submit.

---

## Graphics

| Asset | Spec | Path |
|-------|------|------|
| App icon | 512×512 PNG, **32-bit, opaque** | `icons/app-icon-512.png` |
| Feature graphic | 1024×500 PNG/JPEG | `icons/feature-graphic-1024x500.png` |

Convenience copies also live in `../play-store-assets/` (same files).

### Icon / graphic checklist

- [ ] App icon uploaded (512×512, no transparency)
- [ ] Feature graphic uploaded (1024×500)
- [ ] Phone screenshots (min 2; max 8) — see below
- [ ] Optional: 7" / 10" tablet screenshots
- [ ] Optional: promo video

---

## Screenshots checklist

Minimum **2** phone screenshots. Recommended **5**:

1. Pairing — QR / paste URI
2. Chat — household conversation
3. Approval card (if available)
4. Settings hub
5. Schedules or Workflows

Use a recent phone resolution (e.g. 1080×1920 or device native). Avoid status-bar secrets.

Overlay caption ideas:

1. Your home agent, from your phone
2. Pair once with a QR code
3. Chat and Approvals on the go
4. Keys and memory stay at home
5. Same tools for chat and workflows

Brand colors: indigo `#211962` / `#6366f1`, cyan `#22d3ee`, charcoal `#0c0f1d`, white text.

---

## Data safety form — draft answers

Play Console → App content → Data safety. Align with your real setup.

| Data type | Collected? | Shared? | Purpose | Optional? | Encrypted in transit? |
|-----------|------------|---------|---------|-----------|------------------------|
| User IDs (pairing / session) | Yes | With your EnvoyHome daemon | App functionality | No | Yes |
| Device or other IDs (FCM) | Yes when push is enabled | With your daemon (for push) | Notifications | Yes | Yes |
| Messages / chat / attachments | Yes (via your home) | Via your home daemon | App functionality | No | Yes |
| Photos / files (attachments / QR) | Yes | Via daemon when sending | App functionality | Yes | Yes |
| Audio (microphone / speech recognition) | Yes — optional dictation; may use the device speech service | With the platform speech service while dictating; resulting text to your daemon | App functionality | Yes | Yes |
| Approx / precise location | Yes — only if user shares for a chat turn | With your home daemon for that turn | App functionality | Yes | Yes |
| Crash logs | Only if you enable Play / Firebase Crashlytics | — | — | — | — |

**Data deletion**: users can unpair / uninstall; home memory and grants are controlled by the home owner — state that clearly in the privacy policy.

**Security practices**:

- [x] Data encrypted in transit (TLS / secure WebSocket / mesh crypto)
- [ ] Users can request deletion — document: unpair on phone + revoke paired device on desktop + optional wipe of `stateDir`
- [ ] Committed to Play Families Policy — N/A (not a kids app)

---

## App access / restricted features

If reviewers cannot pair without a home daemon:

```
EnvoyHome Mobile requires an EnvoyHome daemon on a computer.

Demo credentials / QR for Google review:

Full guide: apple_google_reviewing.md (sibling of this file).

1. Open EnvoyHome → Pair → Scan QR or paste URI.
2. Pairing URI:
   TODO: paste the live envoy://pair?…&app=EnvoyHome URI for this submission
3. After pair: open Chat → send a short message → read the reply.
4. Demo home is online during review. Contact: TODO: you@example.com
```

Play Console → App content → App access.

---

## Permissions justification (for review / declarations)

| Permission | Why |
|------------|-----|
| INTERNET | Connect to EnvoyHome daemon / mesh / relay |
| CAMERA | Pairing QR scan |
| RECORD_AUDIO | Optional dictate into Chat (`speech_to_text`) |
| ACCESS_COARSE/FINE_LOCATION | Optional “share location for this turn” only |
| POST_NOTIFICATIONS | Approval alerts when you enable them (Android 13+) |
| RECEIVE_BOOT_COMPLETED | FCM / push reliability |

Camera usage string suggestion:

> EnvoyHome uses the camera to scan the pairing QR from your home Settings.

---

## Content rating

Complete the IARC questionnaire in Play Console. Expected result roughly **Everyone** / **PEGI 3**, depending on answers about user-generated content (here: the user’s own household agent chat on paired machines).

---

## Target audience & news

- Target age: 18+ or 13+ as appropriate (home agent companion; not a kids app)
- Not a news app

---

## Ads

Does this app contain ads? **No**

---

## Build & submit reminders

### Sign for Google Play (upload key)

Play uses **Play App Signing**: you sign the AAB with an **upload key**; Google re-signs with the **app signing key** for devices.

`android/app/build.gradle.kts` loads `android/key.properties` when present.

1. **Reuse the family upload key** (recommended), or create a new one:

```bash
cd apps/mobile/android
# Option A — same cert as EnvoyGo / EnvoyDev (different applicationId → separate Play signing keys):
cp ../../../../EnvoyMesh/apps/envoygo/android/upload-keystore.jks .
cp ../../../../EnvoyMesh/apps/envoygo/android/key.properties .
# ensure storeFile=upload-keystore.jks in key.properties

# Option B — new keystore:
# keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
# cp key.properties.example key.properties   # then fill passwords
```

2. **Build the Play bundle** (prefer AAB over a raw APK):

```bash
cd apps/mobile
# Bump pubspec version first: 0.1.0+N  (N = versionCode, must increase every upload)
flutter build appbundle --release
# → build/app/outputs/bundle/release/app-release.aab
```

3. **Play Console**
   - Create the app (`com.envoymesh.envoyhome`) if needed
   - First upload: enable **Play App Signing** → upload `app-release.aab`
   - Keep `upload-keystore.jks` offline

Do **not** commit `key.properties`, `*.jks`, or `*.keystore`.

Current IDs:

- `applicationId` / namespace (Android) and bundle ID (iOS): `com.envoymesh.envoyhome`
- versionName / versionCode: from Flutter `pubspec.yaml` (`0.1.0+N` → name `0.1.0`, code `N`)
