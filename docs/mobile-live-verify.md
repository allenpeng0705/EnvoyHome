# Mobile live verify (early-adopter)

**Purpose:** Operator sign-off for the EnvoyMesh phone thin client before demos or Store upload.  
**Normative:** Design §2.3, V-P2-MOB-1, V-P2-MESH-1/2; claim sheet [`design_doc/reviews/2026-10-22-early-adopter-claims.md`](../design_doc/reviews/2026-10-22-early-adopter-claims.md).  
**Setup:** [`mobile-ios-android-setup.md`](mobile-ios-android-setup.md).

Automated helpers (no physical phone):

```bash
pnpm mobile:test          # packages/mobile-client unit
pnpm mobile:flutter       # apps/mobile flutter test
pnpm mobile:live          # mint pair URI + Dart live hello (when daemon up)
```

## Checklist (physical device)

| # | Step | Pass? | Notes |
|---|------|-------|-------|
| 1 | Daemon + desktop running; mint pairing QR (`app=EnvoyHome`) | | |
| 2 | Phone: scan/paste → connect; Local Network allowed (iOS) | | |
| 3 | Set accountId; Chat sends a turn and gets a reply | | |
| 4 | Trigger an approval (e.g. write tool) → Allow/Deny **inline in Chat** | | |
| 5 | Open a long/link artifact via mesh (`getArtifactContent`) | | |
| 6 | Push: configure APNs/FCM → Owner phone System **Send test push** → banner; tap opens Chat. Soft Disconnect must still allow a later approval wake (token kept). | | |
| 7 | HA configured → Home tab visible → short home turn | | |
| 8 | Schedules tab opens Schedules chat / Histories | | |
| 9 | Owner device: Connections → mint pairing for a second phone (optional) | | |
| 10 | `assertHostingDialPath` path: refuse if only attach peer (fail closed) | | |

## Sign-off

| Field | Value |
|-------|-------|
| Date | _pending_ |
| Operator | |
| Devices (iOS / Android build) | |
| Push | APNs sandbox / prod · FCM yes/no |
| Result | **PASS** / **FAIL** / **DEFER** |
| Blockers | |

Until **PASS**, marketing stays “preview thin client”; do not claim App Store production readiness.
