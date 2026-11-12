# EnvoyHome release icons

Repo overview: [`../../../README.md`](../../../README.md) · Hands-on: [`../../../QuickStart.md`](../../../QuickStart.md).

Source: `../envoyhome-simple-b.jpg` → `master-1024-opaque.png` (indigo fill, no alpha).

## Wired into apps

| Target | Path |
|--------|------|
| Desktop (Tauri) | `apps/desktop/src-tauri/icons/` + `public/logo.png` |
| iOS | `apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/` |
| Android | `apps/mobile/android/app/src/main/res/mipmap-*` + adaptive `mipmap-anydpi-v26/` |
| In-app asset | `apps/mobile/assets/logo.png` |

## Upload to stores

Full listing copy, review notes, and convenience icon copies live in
[`apps/mobile/store-release/`](../../mobile/store-release/) (EnvoyDev / EnvoyGo layout).  
Operator guide: [`docs/mobile-store-release.md`](../../../docs/mobile-store-release.md).

### Apple App Store Connect
- **App icon:** `app-store/app-store-icon-1024.png` (1024×1024, no transparency) — also copied to `apps/mobile/store-release/appstore/icons/`
- Screenshots: capture from Simulator / device (checklist in store-release)

### Google Play Console
- **High-res icon:** `google-play/play-icon-512.png` (512×512)
- **Feature graphic:** `google-play/feature-graphic-1024x500.png` (1024×500)
- Screenshots: capture from emulator/device (checklist in store-release)

## Regenerate

```bash
magick apps/branding/envoyhome-simple-b.jpg -strip -resize 1024x1024 \
  -alpha off -fill '#211962' -fuzz 12% -opaque black \
  apps/branding/store/master-1024-opaque.png
# then re-run this pack script / tauri icon + resize steps
```
