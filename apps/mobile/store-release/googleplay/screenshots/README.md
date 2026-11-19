# Screenshots (Google Play)

| Path | Size | Notes |
|------|------|--------|
| `01-pairing.png` / `02-chat.png` / `03-settings.png` | **1080×1920** | Existing primary phone set (preserved) |
| `phone/` | **1080×1920** | New Android phone set |
| `tablet-7/` | **1200×1920** | New 7-inch tablet set |
| `tablet-10/` | **1600×2560** | New 10-inch tablet set, real portrait capture |
| `framed/*-framed.png` | 1080×1920 | Captioned marketing frames (optional extras) |

Each new device folder contains four screens: `01-pairing.png`, `02-chat.png`,
`03-schedules.png`, and `04-settings.png`.

## Android capture status: complete

Captured on 2026-11-17 from the real EnvoyHome app in a temporary capture build,
paired to a temporary local daemon over Android emulator host loopback. The
AVDs used Android 36 Google Play arm64 system images with these hardware
profiles:

- Nexus 5: 1080×1920 phone
- Nexus 7 (2013): 1200×1920 7-inch tablet
- Nexus 10: 1600×2560 10-inch tablet in portrait orientation

The profile, `Home help` conversation, and two Jobs entries use generic capture
data. Every candidate was visually inspected before being copied here: no
pairing URI/token or QR payload, provider key, real personal or household data,
or device/entity identifiers are shown. All new PNGs are flattened to opaque
24-bit RGB. The existing three root screenshots and framed set were not
modified.

The earlier `HV_DENIED` emulator failure was specific to the Trae-launched
process context. The same signed Hypervisor.framework probe and emulator succeed
when launched independently by Terminal on this Mac; no system security setting,
SIP configuration, kernel extension, or reboot was required.

## Targeted spec (checked 2026-11-17 — re-verify in Play Console)

The official Play help page could not be fetched from this environment, so
these numbers are cross-checked from current 2026 Play guidance and **must be
confirmed in Play Console at upload time**:

- 2–8 screenshots per device type
- each side 320–3840 px, with the long side no more than twice the short side
- JPEG or 24-bit PNG **without alpha**

Each new set contains four images and satisfies the checked dimension and
opacity constraints.

## Captions in framed set

1. Pair once with a QR code
2. Chat with your home agent
3. Keys and memory stay at home

Re-capture on device before final submit if the UI has changed. Prefer Chat
**without** the soft keyboard. Do not show live pairing tokens.
