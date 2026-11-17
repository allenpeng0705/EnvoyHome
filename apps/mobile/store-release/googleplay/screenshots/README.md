# Screenshots (Google Play)

| Path | Size | Notes |
|------|------|--------|
| `01-pairing.png` / `02-chat.png` / `03-settings.png` | **1080×1920** | Primary phone set (min 2 required) |
| `framed/*-framed.png` | 1080×1920 | Captioned marketing frames (optional extras) |

## Android capture status: blocked

The Android sets (phone, 7" and 10" tablet) could **not** be captured in this
environment. The emulator fails to start:

- `HVF error: HV_DENIED` (Hypervisor.framework denies the VM)
- with `-qemu -accel tcg`: `HV_NO_DEVICE`

`kern.hv_support=1`, but no hypervisor device is available to the process —
nested virtualization is restricted here. AVDs `eh_tablet7` (Nexus 7) and
`eh_tablet10` (Nexus 10) were created on
`system-images;android-36;google_apis_playstore;arm64-v8a` but are unusable.
Per the task instruction the Android side is reported as blocked rather than
faked, so the three existing 1080×1920 files remain the only Play assets.

To finish the Play pack, run the same capture flow (temporary daemon + pairing +
integration test) on a host with working HVF/HAXM and produce:

```
googleplay/screenshots/phone/          (1080×1920 or larger, 16:9/9:16)
googleplay/screenshots/tablet-7/       (separate upload slot in Play Console)
googleplay/screenshots/tablet-10/      (separate upload slot in Play Console)
```

Each device type needs at least 2 images; add Schedules → Jobs as the 4th screen
in every set, mirroring the App Store `ipad-13/` set.

## Targeted spec (checked 2026-11-17 — re-verify in Play Console)

The official Play help page could not be fetched from this environment, so
these numbers are cross-checked from current 2026 Play guidance and **must be
confirmed in Play Console at upload time**:

- 2–8 screenshots per device type
- each side 320–3840 px, aspect ratio 16:9 or 9:16
- JPEG or 24-bit PNG **without alpha**

The three shipped files are 1080×1920 (9:16). Strip alpha before uploading any
new PNG.

## Captions in framed set

1. Pair once with a QR code
2. Chat with your home agent
3. Keys and memory stay at home

Re-capture on device before final submit if the UI has changed. Prefer Chat
**without** the soft keyboard. Do not show live pairing tokens.
