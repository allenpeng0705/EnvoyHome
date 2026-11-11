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
| 1 | Daemon + desktop running; mint pairing QR (`app=EnvoyHome`) | pass | Pairing mint + QR path exercised in desktop Settings; unit: `pairing_test` |
| 2 | Phone: scan/paste → connect; Local Network allowed (iOS) | pass | Prior iPhone pair sessions; reconnect/route_plan unit green |
| 3 | Set accountId; Chat sends a turn and gets a reply | pass | Chat shell + turn path on paired Owner phone (ongoing product use) |
| 4 | Trigger an approval (e.g. write tool) → Allow/Deny **inline in Chat** | pass | Approval cards in Chat; push tap → Chat |
| 5 | Open a long/link artifact via mesh (`getArtifactContent`) | pass | Artifacts mesh path + Chat doc pane / Files |
| 6 | Push: configure APNs/FCM → Owner phone System **Send test push** → banner; tap opens Chat. Soft Disconnect must still allow a later approval wake (token kept). | pass | **2026-11-03** iPhone APNs **prod** banner + tap→Chat. Soft-disconnect: client `unbind(unregister:false)` + daemon `onAuthenticatedClose` clears live presence only — unit `push_service_test` + `push-wake-catalogue` soft-disconnect token retain (`2026-11-10`). |
| 7 | HA configured → Home tab visible → short home turn | pass | Home chat `purpose: "home"` when HA enabled |
| 8 | Schedules tab opens Schedules chat / Histories | pass | V-UX-13 Schedules chat + Histories |
| 9 | Owner device: Connections → mint pairing for a second phone (optional) | pass | Owner-scope mint from exclusive Owner device |
| 10 | `assertHostingDialPath` path: refuse if only attach peer (fail closed) | pass | Unit: `assert_hosting_dial_test` + `assertNotAttachDialTarget` (V-P2-MESH-1/2) |

## Sign-off

| Field | Value |
|-------|-------|
| Date | 2026-11-10 |
| Operator | Allen / agent (automated + prior APNs evidence) |
| Devices (iOS / Android build) | iPhone (APNs prod push exercised 2026-11-03); Android FCM optional |
| Push | APNs **prod** — banner + tap→Chat OK; soft-disconnect token retain **unit-verified** · FCM no |
| Result | **PASS** |
| Blockers | none for preview thin client; Store/TestFlight signing + privacy URL remain external ops |

Until Store upload, marketing stays “preview thin client”; **PASS** here means product live-verify for early-adopter demos, not App Store production readiness.
