# Checklist — Store screenshot pack

- [x] iPad 13" set exists at `appstore/screenshots/ipad-13/` with pairing, chat, schedules, settings
- [x] iPad files are exactly 2064×2752 (portrait, accepted 13" slot)
- [x] `appstore/screenshots/iphone-6.9/04-schedules.png` exists and is 1290×2796
- [x] Existing `01-pairing` / `02-chat` / `03-settings` unchanged on disk
- [x] No alpha channel in any new PNG (`sips -g hasAlpha` → no)
- [x] Each shipped image visually inspected: no pairing token/QR, provider key, real conversation, or household data
- [x] `appstore/screenshots/README.md` documents new sets, sizes, targeted Apple spec, and capture method
- [x] `googleplay/screenshots/README.md` records the Android emulator blocker and the Play spec caveat
- [x] `git status --porcelain apps/mobile/store-release` shows only the new folders, the two READMEs, and specs
- [x] Temp daemon stopped; both simulators shut down; `/tmp` capture dirs, pairing token file, and tablet AVDs removed
