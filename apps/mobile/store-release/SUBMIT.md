# EnvoyHome Mobile — paste & upload (App Store + Play)

One-page operator sheet. Full prose lives in `appstore/listing.md` and `googleplay/listing.md`.  
Demo home / review notes: `apple_google_reviewing.md`.

| | |
|--|--|
| App name | **EnvoyHome** |
| Bundle / applicationId | `com.envoymesh.envoyhome` |
| Version (from `pubspec.yaml`) | **1.0.0+1** |
| Price | Free |
| Category | Productivity (+ Lifestyle secondary on Apple) |
| Age | 4+ / Everyone |
| Ads | No |

---

## URLs (use these)

| Field | URL |
|-------|-----|
| Marketing | https://www.envoymesh.cn/envoyhome/ |
| Privacy | https://www.envoymesh.cn/envoyhome/privacy.html |
| Family privacy (fallback) | https://www.envoymesh.cn/privacy.html |
| Support | https://github.com/allenpeng0705/EnvoyHome/issues |
| Play contact email | `shilei.peng@qq.com` |

Confirm the marketing/privacy URLs return 200 before submit (`./scripts/deploy-envoyhome-site.sh` if needed).

---

## Google Play — paste

**App name:** `EnvoyHome`

**Short description (≤80):**
```
Self-hosted home agent on your phone. Pair by QR — no central account.
```

**Full description:** copy the block under “Full description” in `googleplay/listing.md`.

**What’s new:**
```
Initial public release of EnvoyHome Mobile.

• Pair to your EnvoyHome daemon with a QR code, host:port, or SSH hop
• Chat with household profiles; answer Approvals inline
• Browse Settings, Skills, Workflows, and Schedules
• Optional push for Approvals (FCM)
• Secure pairing tokens stored in Android Keystore-backed storage
```

### Graphics to upload

| Asset | Path |
|-------|------|
| Icon 512×512 | `googleplay/icons/app-icon-512.png` |
| Feature graphic 1024×500 | `googleplay/icons/feature-graphic-1024x500.png` |
| Phone screenshots (raw) | `googleplay/screenshots/01-pairing.png` … `03-settings.png` |
| Phone screenshots (captioned, optional) | `googleplay/screenshots/framed/*-framed.png` |

Prefer **raw** device shots for the required slots; use framed as extras if you want marketing captions.

### Build

```bash
cd apps/mobile
# bump version in pubspec.yaml first if re-uploading (1.0.0+N)
flutter build appbundle --release
# → build/app/outputs/bundle/release/app-release.aab
```

---

## App Store Connect — paste

**Name:** `EnvoyHome`  
**Subtitle (≤30):** `Your home agent on the go`  
**SKU:** `envoyhome-ios`

**Promotional text (≤170):**
```
Pair EnvoyHome on your phone to the home agent on your computer. Chat, answer Approvals, check schedules — keys and memory stay on the machine you host.
```

**Description:** copy the block under “Description” in `appstore/listing.md`.

**Keywords (≤100):**
```
home,agent,self-hosted,AI,chat,approve,pair,QR,workflow,schedule,HA,MQTT,envoy,mesh
```

**What’s New:**
```
Initial public release of EnvoyHome Mobile.

• Pair to your EnvoyHome daemon with a QR code, host:port, or SSH hop
• Chat with household profiles; answer Approvals inline
• Browse Settings, Skills, Workflows, and Schedules
• Optional push for Approvals (APNs)
• Secure pairing tokens stored in the device Keychain
```

### Graphics to upload

| Asset | Path |
|-------|------|
| App Store icon 1024×1024 | `appstore/icons/app-icon-1024.png` |
| iPhone 6.7" (1290×2796) | `appstore/screenshots/01-pairing.png` … `03-settings.png` |
| iPhone 6.5" (1242×2688) | `appstore/screenshots/iphone-6.5/` |
| Captioned (optional) | `appstore/screenshots/framed/` |

### Build

```bash
cd apps/mobile
flutter build ipa
```

---

## Review notes (both stores)

1. Mint a fresh `envoy://pair?…` on the **demo** desktop (or keep the current demo mint).
2. Point reviewers at the QR page (after deploy):
   `https://www.envoymesh.cn/envoyhome/app-review.html`
   Override: `?uri=` + `encodeURIComponent(envoy://pair?…)` or `?pairing=` + payload.
   Local file: `sites/envoyhome/app-review.html`.
3. Also paste the URI + Guideline **2.5.2** thin-client sentence from `apple_google_reviewing.md`.
4. Keep the demo daemon reachable from cellular for the whole review window.

---

## Chinese (zh-Hans) — optional locale

Play Console / App Store Connect → add **Chinese (Simplified)** and paste from the “Chinese (zh-Hans)” sections in each `listing.md`.
