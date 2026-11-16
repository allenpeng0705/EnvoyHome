# EnvoyHome Mobile — Store Release Pack

Ready-to-paste listing copy and icon assets for **Apple App Store** and **Google Play**.
Layout matches EnvoyDev (`../EnvoyCoder/apps/mobile/store-release`) and EnvoyGo (`../EnvoyMesh/apps/envoygo/store-release`).

**Operator guide (checklist + builds):** [`docs/mobile-store-release.md`](../../../docs/mobile-store-release.md)

```
store-release/
├── README.md                 ← this summary
├── apple_google_reviewing.md ← store review: demo home daemon + pairing QR
├── appstore/
│   ├── listing.md            ← all App Store Connect text
│   ├── icons/                ← App Store icon assets
│   └── screenshots/          ← capture checklist (re-capture at store sizes)
├── googleplay/
│   ├── listing.md            ← all Play Console text
│   ├── icons/                ← Play icon + feature graphic
│   └── screenshots/          ← same checklist
├── play-store-assets/        ← convenience copies of Play graphics
└── shared/                   ← master logo references

Brand source of truth: `apps/branding/store/` (wired into iOS/Android/desktop).
```

## Quick facts

| Field | Value |
|-------|--------|
| App name | **EnvoyHome** |
| Version (current) | `0.2.0+1` (`apps/mobile/pubspec.yaml`) |
| iOS bundle ID | `com.envoymesh.envoyhome` |
| Android application ID | `com.envoymesh.envoyhome` |
| Category (suggested) | Productivity / Lifestyle |
| Price | Free |
| Age rating (suggested) | 4+ / Everyone |
| Marketing / Website | https://www.envoymesh.cn/envoyhome/ (deploy `sites/envoyhome/`) |
| Privacy Policy | interim htmlpreview (in listings) → canonical https://www.envoymesh.cn/envoyhome/privacy.html after deploy |
| Support | https://github.com/allenpeng0705/EnvoyHome/issues |
| Play contact email | `shilei.peng@qq.com` (alternate `shileipeng@gmail.com`) |

## What EnvoyHome Mobile is (one line)

Thin-client companion for the **EnvoyHome** self-hosted home agent — pair by QR, then chat, approve tools, run workflows/schedules, and (optionally) use smart-home tools on a daemon you already run. No central account.

## Icons & listing — status

| Asset | Status | Notes |
|-------|--------|--------|
| App Store `1024×1024` | present | Opaque RGB from `apps/branding/store/app-store/`. |
| Play Store `512×512` | present | Opaque RGB (Play rejects transparency). |
| Play feature graphic `1024×500` | present | From `apps/branding/store/google-play/`. |
| Screenshots | **ready** | `appstore/screenshots/` + `googleplay/screenshots/` (01–03 from real Flutter captures). |
| Android signing | **ready (local)** | `android/key.properties` + family `upload-keystore.jks` (gitignored).
| Privacy Policy URL | **live interim** | htmlpreview in listings. Canonical: `./scripts/deploy-envoyhome-site.sh`. Family: www.envoymesh.cn/privacy.html (EnvoyHome section staged in EnvoyMesh). |
| Support / Marketing URLs | filled | See listing.md files. |

## Suggested next steps

Follow the ordered checklist in [`docs/mobile-store-release.md`](../../../docs/mobile-store-release.md) §3–§4. Short version:

1. Privacy interim URL is live (htmlpreview). Canonical: `./scripts/deploy-envoyhome-site.sh` after `npx wrangler login`.
2. Screenshots are under `appstore/screenshots/` and `googleplay/screenshots/` (re-capture if UI changes).
3. Android release signing is configured locally (`key.properties` + family upload keystore, gitignored).
4. Spin up a **demo EnvoyHome daemon** with a long-lived pairing QR — see `apple_google_reviewing.md` — and paste the URI into store review notes.
5. Confirm prod **APNs / FCM** end-to-end (`docs/mobile-ios-android-setup.md`, `docs/mobile-live-verify.md`).
6. Upload builds via App Store Connect / Play Console and paste text from the listing files.
7. Keep claims inside the early-adopter sheet — do not overclaim Privacy Mode / IM zoo / agentskills.io.

## Related

| Path | Role |
|------|------|
| [`docs/mobile-store-release.md`](../../../docs/mobile-store-release.md) | Full App Store / Play release guide |
| [`apps/branding/store/README.md`](../../branding/store/README.md) | Icon pack wired into apps |
| [`docs/store-listing.md`](../../../docs/store-listing.md) | Short operator summary (points here) |
| [`docs/privacy-policy.md`](../../../docs/privacy-policy.md) | Operator privacy draft |
| [`sites/envoyhome/`](../../../sites/envoyhome/) | Marketing + privacy HTML to deploy |
| [`docs/mobile-live-verify.md`](../../../docs/mobile-live-verify.md) | Live verify before submit |
