# EnvoyHome Mobile — Store Release Pack

Ready-to-paste listing copy and icon/screenshot assets for **Apple App Store** and **Google Play**.  
Layout matches EnvoyDev (`../EnvoyCoder/apps/mobile/store-release`) and EnvoyGo (`../EnvoyMesh/apps/envoygo/store-release`).

**Start here for upload:** [`SUBMIT.md`](SUBMIT.md)  
**Operator guide:** [`docs/mobile-store-release.md`](../../../docs/mobile-store-release.md)

```
store-release/
├── SUBMIT.md                 ← paste & upload one-pager
├── README.md                 ← this summary
├── apple_google_reviewing.md ← store review: demo home daemon + pairing QR
├── appstore/
│   ├── listing.md            ← App Store Connect text (EN + zh-Hans)
│   ├── icons/                ← 1024×1024 opaque
│   └── screenshots/          ← 6.7" + 6.5" + framed captions
├── googleplay/
│   ├── listing.md            ← Play Console text (EN + zh-Hans)
│   ├── icons/                ← 512 icon + 1024×500 feature graphic
│   └── screenshots/          ← 1080×1920 + framed captions
├── play-store-assets/        ← convenience copies of Play graphics
└── shared/                   ← master logo references

Brand source of truth: `apps/branding/store/` (wired into iOS/Android/desktop).
```

## Quick facts

| Field | Value |
|-------|--------|
| App name | **EnvoyHome** |
| Version (current) | `1.0.0+1` (`apps/mobile/pubspec.yaml`) |
| iOS bundle ID | `com.envoymesh.envoyhome` |
| Android application ID | `com.envoymesh.envoyhome` |
| Category (suggested) | Productivity / Lifestyle |
| Price | Free |
| Age rating (suggested) | 4+ / Everyone |
| Marketing / Website | https://www.envoymesh.cn/envoyhome/ |
| Privacy Policy | https://www.envoymesh.cn/envoyhome/privacy.html |
| Support | https://github.com/allenpeng0705/EnvoyHome/issues |
| Play contact email | `shilei.peng@qq.com` (alternate `shileipeng@gmail.com`) |

## What EnvoyHome Mobile is (one line)

Thin-client companion for the **EnvoyHome** self-hosted home agent — pair by QR, then chat, approve tools, run workflows/schedules, and (optionally) use smart-home tools on a daemon you already run. No central account.

## Icons & listing — status

| Asset | Status | Notes |
|-------|--------|--------|
| App Store `1024×1024` | ready | Opaque RGB — `appstore/icons/app-icon-1024.png` |
| Play Store `512×512` | ready | Opaque RGB — `googleplay/icons/app-icon-512.png` |
| Play feature graphic `1024×500` | ready | `googleplay/icons/feature-graphic-1024x500.png` |
| Screenshots 6.7" / Play phone | ready | Pairing / Chat / Settings (raw + framed) |
| Screenshots 6.5" | ready | `appstore/screenshots/iphone-6.5/` |
| EN + zh-Hans listing copy | ready | Both `listing.md` files |
| Android signing | ready (local) | `android/key.properties` + family upload keystore (gitignored) |
| Privacy / Marketing URLs | set | Confirm live before submit |
| Support URL | set | GitHub Issues |

## Suggested next steps

1. Confirm https://www.envoymesh.cn/envoyhome/privacy.html is live (deploy via `./scripts/deploy-envoyhome-site.sh` if needed).
2. Optionally re-capture Chat **without** the keyboard; add Approval / Schedules shots.
3. Mint a demo `envoy://pair?…&app=EnvoyHome` and paste into review notes (`apple_google_reviewing.md`).
4. Upload AAB / IPA; paste text from [`SUBMIT.md`](SUBMIT.md).
5. Keep claims inside the early-adopter sheet — do not overclaim Privacy Mode / IM zoo / agentskills.io.

## Related

| Path | Role |
|------|------|
| [`SUBMIT.md`](SUBMIT.md) | Paste & upload one-pager |
| [`docs/mobile-store-release.md`](../../../docs/mobile-store-release.md) | Full release guide |
| [`apps/branding/store/README.md`](../../branding/store/README.md) | Icon pack wired into apps |
| [`docs/store-listing.md`](../../../docs/store-listing.md) | Short operator summary |
| [`docs/privacy-policy.md`](../../../docs/privacy-policy.md) | Operator privacy draft |
| [`sites/envoyhome/`](../../../sites/envoyhome/) | Marketing + privacy HTML |
| [`docs/mobile-live-verify.md`](../../../docs/mobile-live-verify.md) | Live verify before submit |
