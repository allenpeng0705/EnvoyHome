# EnvoyHome Mobile — App Store & Google Play release

Operator guide for shipping the phone thin client (`com.envoymesh.envoyhome`) to **Apple App Store** and **Google Play**.  
Layout and process mirror EnvoyDev (`../EnvoyCoder/apps/mobile/store-release`) and EnvoyGo (`../EnvoyMesh/apps/envoygo/store-release`).

| Item | Value |
|------|--------|
| Bundle / applicationId | `com.envoymesh.envoyhome` |
| Version source | `apps/mobile/pubspec.yaml` (`0.1.0+N` → name `0.1.0`, build/versionCode `N`) |
| Store pack | [`apps/mobile/store-release/`](../apps/mobile/store-release/) |
| Brand icons (source) | [`apps/branding/store/`](../apps/branding/store/) |
| Privacy HTML (deploy) | [`sites/envoyhome/`](../sites/envoyhome/) |
| Live verify | [`mobile-live-verify.md`](mobile-live-verify.md) |
| Push / signing setup | [`mobile-ios-android-setup.md`](mobile-ios-android-setup.md) |
| Short listing map | [`store-listing.md`](store-listing.md) |
| Privacy draft | [`privacy-policy.md`](privacy-policy.md) |

---

## 1. What the store pack contains

```
apps/mobile/store-release/
├── README.md                    # pack summary + quick facts
├── apple_google_reviewing.md    # demo home + pairing URI for reviewers
├── appstore/
│   ├── listing.md               # App Store Connect paste text
│   ├── icons/                   # 1024×1024 opaque RGB
│   └── screenshots/             # capture checklist (device shots TODO)
├── googleplay/
│   ├── listing.md               # Play Console paste text
│   ├── icons/                   # 512×512 icon + 1024×500 feature graphic
│   └── screenshots/             # capture checklist (device shots TODO)
├── play-store-assets/           # convenience copies of Play graphics
└── shared/                      # master logo references
```

**Product framing in listings:** core is the home **agent** (envoy-harness, workflows, tools, memory, Approvals). Smart home (HA / MQTT) is an **optional** tool surface — do not lead with it.

Icons in the pack are copies of `apps/branding/store/` (App Store 1024, Play 512, feature graphic 1024×500). If you regenerate the brand pack, re-copy into `store-release/` (or re-run the same copy steps documented in [`apps/branding/store/README.md`](../apps/branding/store/README.md)).

---

## 2. URLs & contacts (fill before submit)

| Field | Value |
|-------|--------|
| Marketing | `https://www.envoymesh.cn/envoyhome/` |
| Privacy policy | `https://www.envoymesh.cn/envoyhome/privacy.html` |
| Support | `https://github.com/allenpeng0705/EnvoyHome/issues` |
| Play contact email | `shilei.peng@qq.com` (alternate `shileipeng@gmail.com`) |

Deploy `sites/envoyhome/` (including `privacy.html` / `privacy-zh.html`) so those URLs are live **before** store submit. Source draft: [`privacy-policy.md`](privacy-policy.md).

---

## 3. Before-submit checklist

Do these in order:

1. **Live verify PASS** — [`mobile-live-verify.md`](mobile-live-verify.md) (pair, Chat, Approvals, Settings).
2. **Privacy URL live** — deploy `sites/envoyhome/` → confirm `https://www.envoymesh.cn/envoyhome/privacy.html`.
3. **Screenshots** — capture on device at store resolutions; drop under  
   `apps/mobile/store-release/appstore/screenshots/` and  
   `apps/mobile/store-release/googleplay/screenshots/`  
   (checklists inside each folder’s `README.md` and the `listing.md` files). Suggested set: Pairing, Chat, Approval, Settings hub, Schedules/Workflows. Do **not** show live pairing secrets or production HA tokens.
4. **Android release signing** — copy [`apps/mobile/android/key.properties.example`](../apps/mobile/android/key.properties.example) → `android/key.properties` (gitignored). Prefer reusing the family upload keystore (EnvoyGo / EnvoyDev) or create a new one. Steps in [`googleplay/listing.md`](../apps/mobile/store-release/googleplay/listing.md). **Never commit** `*.jks` / `key.properties`.
5. **Prod push** — APNs (Release / TestFlight) + FCM end-to-end; see [`mobile-ios-android-setup.md`](mobile-ios-android-setup.md). Daemon: unset `APNS_SANDBOX` for production.
6. **Demo home for review** — dedicated machine/profile; mint `envoy://pair?…&app=EnvoyHome`; keep daemon reachable from cellular. Paste URI into App Review / Play App access notes. Full script: [`apple_google_reviewing.md`](../apps/mobile/store-release/apple_google_reviewing.md). Lead with the thin-client / Guideline **2.5.2** sentence (agent runs on the home daemon, not on the phone).
7. **Bump version** — edit `apps/mobile/pubspec.yaml` (`0.1.0+N`; `N` must increase every upload).
8. **Claims hygiene** — stay inside the early-adopter claim sheet; do not overclaim Privacy Mode, IM zoo, or agentskills.io.

---

## 4. Build & upload

### Apple App Store

```bash
cd apps/mobile
# bump pubspec version first: 0.1.0+N
flutter build ipa   # signing / certificates configured in Xcode
```

- Paste text from [`appstore/listing.md`](../apps/mobile/store-release/appstore/listing.md) into App Store Connect.
- Upload `icons/app-icon-1024.png` (opaque RGB).
- Attach screenshots for the required iPhone size class.
- Paste review notes + pairing URI (from `apple_google_reviewing.md`).
- Export compliance: standard TLS / mesh encryption — usually exempt; answer the questionnaire accordingly.
- Release entitlements: `RunnerRelease.entitlements` (`aps-environment` = production).

### Google Play

```bash
cd apps/mobile
# bump pubspec version first: 0.1.0+N
flutter build appbundle --release
# → build/app/outputs/bundle/release/app-release.aab
```

- Create the app (`com.envoymesh.envoyhome`) if needed.
- First upload: enable **Play App Signing**, upload the AAB signed with the **upload** key.
- Paste text from [`googleplay/listing.md`](../apps/mobile/store-release/googleplay/listing.md).
- Upload `icons/app-icon-512.png` + `icons/feature-graphic-1024x500.png` (or `play-store-assets/` copies).
- Complete Data safety, content rating, and App access (demo URI).
- Ads: **No**.

---

## 5. Reviewer path (what they should do)

1. Install from TestFlight / Play testing / store build.
2. Pair → scan QR or paste `envoy://pair?…&app=EnvoyHome`.
3. Open **Chat** → send a short message → read the reply.
4. If an Approval appears → **Deny** or **Allow** (answers the home daemon only).
5. Optionally open Settings / Schedules.

HA / MQTT is **not** required for review. Prefer Chat + Approvals as the demo path.

Do **not** send EnvoyGo or EnvoyDev pairing URIs — wrong product `app=` will fail closed.

---

## 6. After review

- [ ] Revoke the review paired-device record (or wipe the demo profile) if the URI should stop working.
- [ ] Keep or rotate the upload keystore offline backup.
- [ ] Bump `+N` before the next binary upload.
- [ ] Update What’s New / release notes in both `listing.md` files for the next version.

---

## 7. Related docs

| Doc | Role |
|-----|------|
| [`apps/mobile/store-release/README.md`](../apps/mobile/store-release/README.md) | Pack index |
| [`store-listing.md`](store-listing.md) | Short map + claim checklist |
| [`privacy-policy.md`](privacy-policy.md) | Operator privacy draft |
| [`mobile-live-verify.md`](mobile-live-verify.md) | Functional PASS before submit |
| [`mobile-ios-android-setup.md`](mobile-ios-android-setup.md) | APNs / FCM / Local Network |
| [`apps/mobile/README.md`](../apps/mobile/README.md) | App overview |
| [`apps/branding/store/README.md`](../apps/branding/store/README.md) | Icon regeneration |
| Early-adopter claims | [`design_doc/reviews/2026-10-22-early-adopter-claims.md`](../design_doc/reviews/2026-10-22-early-adopter-claims.md) |
