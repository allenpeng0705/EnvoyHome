# Tasks — Store screenshot pack

- [x] 1. Temp daemon + pairing
   - Fix launcher: `cost` must be `{inputPerMTok, outputPerMTok, currency}`.
   - Start daemon, mint pairing to `/tmp/eh-store-capture/pair-uri.txt`, seed one benign turn.
- [x] 2. Temp Flutter build `/tmp/eh-store-mobile` (copy app + mobile-client, symlink `../EnvoyMesh`, add `integration_test`, driver, test-only patches).
- [x] 3. iPad 13" capture → `/tmp/eh-capture/ipad/` (pairing, chat, schedules, settings); inspect each PNG.
- [x] 4. iPhone 6.9" Schedules capture → `/tmp/eh-capture/iphone/04-schedules.png`; inspect.
- [x] 5. Downscale/normalize only if native size ≠ 2064×2752 / 1290×2796; record the transform.
- [x] 6. Copy accepted files to `appstore/screenshots/ipad-13/` and `appstore/screenshots/iphone-6.9/`; never touch 01–03.
- [x] 7. Update `appstore/screenshots/README.md` (new sets, sizes, targeted spec, Play caveat) and `googleplay/screenshots/README.md` (Android blocked, existing set unchanged).
- [x] 8. Audit: dimensions via `sips`, `git status`, secret/household inspection; shut down sims, stop daemon, remove temp dirs/AVDs.
- [x] 9. Report pack + Android blocker.
