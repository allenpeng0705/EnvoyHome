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

### Apple App Store Connect
- **App icon:** `app-store/app-store-icon-1024.png` (1024×1024, no transparency)
- Screenshots: capture from Simulator (not generated here)

### Google Play Console
- **High-res icon:** `google-play/play-icon-512.png` (512×512)
- **Feature graphic:** `google-play/feature-graphic-1024x500.png` (1024×500)
- Screenshots: capture from emulator/device

## Regenerate

```bash
magick apps/branding/envoyhome-simple-b.jpg -strip -resize 1024x1024 \
  -alpha off -fill '#211962' -fuzz 12% -opaque black \
  apps/branding/store/master-1024-opaque.png
# then re-run this pack script / tauri icon + resize steps
```
