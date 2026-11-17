# Screenshots (App Store)

| Path | Size | Notes |
|------|------|--------|
| `01-pairing.png` / `02-chat.png` / `03-settings.png` | **1290×2796** (6.7") | Primary upload set |
| `iphone-6.9/04-schedules.png` | **1290×2796** (6.9") | Adds Schedules → Jobs to the primary set |
| `iphone-6.5/` | **1242×2688** (6.5") | Same three screens, scaled |
| `ipad-13/01-pairing.png` … `04-settings.png` | **2064×2752** (13" iPad) | Full iPad set (required — device family is `1,2`) |
| `framed/*-framed.png` | 1290×2796 | Captioned marketing frames (optional extras) |

## Targeted spec (checked 2026-11-17)

Source: Apple App Store Connect screenshot specifications
(`developer.apple.com/help/app-store-connect/reference/screenshot-specifications`).

| Slot | Accepted portrait sizes | Count |
|------|------------------------|-------|
| iPhone 6.9" | 1320×2868 or 1290×2796 | 1–10 |
| iPad 13" | 2064×2752 or 2048×2732 | 1–10 |

PNG or JPEG; App Store accepts PNG with alpha, but the files here are shipped as
24-bit RGB (alpha flattened) so the same masters can be reused elsewhere.

## iPad set (new)

Captured from the running app on an iPad Pro 13-inch (M4) simulator, iOS 18.4
(native 2064×2752 — no scaling):

1. `01-pairing.png` — Connect screen, empty Pairing URI field (no token, no QR)
2. `02-chat.png` — "Home help" thread with a real assistant reply
3. `03-schedules.png` — Schedules → Jobs with two armed repeating jobs
4. `04-settings.png` — System → Profiles ("Home", generic Owner profile)

## iPhone 6.9" addition (new)

`iphone-6.9/04-schedules.png` — Schedules → Jobs with the same two jobs.
Captured on an iPhone 16 Pro Max simulator (1320×2868), then downscaled with
`sips -z 2796 1290` to match the 1290×2796 primary set (the other accepted 6.9"
size). The existing `01–03` files were not touched.

## Captions in framed set

1. Pair once with a QR code
2. Chat with your home agent
3. Keys and memory stay at home

## Sensitivity

Every image above comes from a temporary local daemon and a throwaway test
build under `/tmp`; the pairing token was never on screen, no provider key or
key field value is visible, the chat title is generic, and the conversation and
schedule names are seeded placeholders. Each file was visually inspected before
being copied here.

Re-capture on device before final submit if the UI has changed. Prefer Chat
**without** the soft keyboard. Do not show live pairing tokens.
