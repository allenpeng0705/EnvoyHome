# Spec — Store screenshot pack (iPad / iPhone extras / Android status)

Owner: Allen Peng · Status: draft for approval · Scope: `apps/mobile/store-release/`

## 1. Goal

Extend the existing three-screen store pack with:

1. iPad coverage (required — Xcode device family is `1,2`).
2. More iPhone 6.9" screens beyond pairing / chat / settings (Schedules).
3. Android phone / 7" / 10" tablet coverage **if** an emulator can boot; otherwise state the blocker plainly and ship iOS/iPad only.

No mockups. Every image comes from the running app, paired to a temporary local daemon.

## 2. Verified store requirements (checked 2026-11-17)

| Store | Slot | Accepted sizes | Count |
|---|---|---|---|
| App Store | iPhone 6.9" | 1320×2868 or **1290×2796** (portrait) | 1–10 |
| App Store | iPad 13" | **2064×2752** or 2048×2732 (portrait) | 1–10 |
| Google Play | Phone | 320–3840 px per side, 16:9 / 9:16, JPEG or 24-bit PNG **no alpha** | 2–8 per type |
| Google Play | 7" / 10" tablet | same constraints, separate upload per type | 2–8 per type |

Apple: developer.apple.com/help/app-store-connect/reference/screenshot-specifications (verified).
Play: official help page could not be fetched from this environment (curl timeout / empty fetch); numbers above are cross-checked from current 2026 Play guides and must be re-verified in Play Console at upload time — recorded as a caveat in the README.

## 3. Existing files (must not be overwritten)

- `appstore/screenshots/01-pairing.png`, `02-chat.png`, `03-settings.png` (1290×2796)
- `appstore/screenshots/iphone-6.5/*`, `appstore/screenshots/framed/*`
- `googleplay/screenshots/01..03.png` (1080×1920), `googleplay/screenshots/framed/*`

## 4. Deliverables

New files only, in per-device-class subfolders:

```
appstore/screenshots/iphone-6.9/
  04-schedules.png            1290×2796
appstore/screenshots/ipad-13/
  01-pairing.png              2064×2752
  02-chat.png                 2064×2752
  03-schedules.png            2064×2752
  04-settings.png             2064×2752
```

`appstore/screenshots/README.md` — add rows for `iphone-6.9/` and `ipad-13/`, targeted spec, capture method, sensitivity note.
`googleplay/screenshots/README.md` — record Android capture blocker (hypervisor unavailable), keep existing set described as pending re-capture.

## 5. Capture method (temporary, outside the repo)

- Copy `apps/mobile` + `packages/mobile-client` to `/tmp/eh-store-mobile`; symlink `../EnvoyMesh`.
- Add `integration_test` dev dependency + `test_driver/integration_test.dart` (temporary copy only; repo sources untouched).
- Temporary test-only patches: chat thought `ExpansionTile` transparency wrapper; delayed New-chat controller dispose; skip `PushService.instance.bindSession`; unfocus keyboard before capture.
- Driver screenshots via `xcrun simctl io <udid> screenshot` after a 3 s settle (in-process `takeScreenshot` returns blank PNGs on iOS 18.4).
- Devices: iPad Pro 13-inch (M4), iOS 18.4 `2123FAEB-E033-44CB-A291-8AF318EDF9F5` (2064×2752); iPhone 16 Pro Max iOS 18.4 `5F59E9C9-B205-4EFE-8607-BF9014E1B69E` (needs 1290×2796 output — downscale only if native differs; record exact transform).
- Run: `flutter drive --no-enable-impeller --driver=test_driver/integration_test.dart --target=integration_test/<test>.dart -d <udid>`.

## 6. Pairing + conversation (temporary, never shipped)

- Temp daemon: `startDaemon` with `stateDir=/tmp/eh-store-capture/state`, `wsPort: 0`, account `home1` displayName `Home`.
- Provider: `home.setProvider` `{id:'deepseek', kind:'cloud_openai_compat', baseUrl:'https://api.deepseek.com', model:'deepseek-chat', cost:{inputPerMTok, outputPerMTok, currency}}`; `home.setProviderSecret` from `DEEPSEEK_API_KEY`; `home.setDefaultProvider`.
- `home.mintPairing` → URI written to `/tmp/eh-store-capture/pair-uri.txt` (mode 0600), never printed or committed.
- Generic chat title; benign prompt only (e.g. "What can you help with around the home?").
- Seed one real exchange via the app so the chat screenshot shows actual assistant output.

## 7. Sensitivity gate (per image, before it lands)

Reject any image containing: pairing QR/token, provider key or Settings key field with value, real household/person names, device entity IDs, real conversation content. Inspect every candidate with an image read; reject blanks/error snacks. If a screen cannot be shown cleanly, omit it rather than crop ambiguously.

## 8. Verification / acceptance

- `sips -g pixelWidth -g pixelHeight` on every shipped file matches §2/§4.
- No file overwritten: `git status --porcelain apps/mobile/store-release` shows only new files + 2 modified READMEs.
- No alpha channel for any Play asset (if Android lands).
- Each image visually inspected; no secret or household content.
- Temp builds/sims/daemon shut down/removed.

## 9. Known blocker

Android emulator cannot start: `HVF error: HV_DENIED`, then `HV_NO_DEVICE` with `-qemu -accel tcg`; `kern.hv_support=1` but the hypervisor device is unavailable to this process (nested-virtualization restricted). AVDs `eh_tablet7` / `eh_tablet10` were created but are unusable. Per task instruction, Android is reported as blocked instead of faked.
