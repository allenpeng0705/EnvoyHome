# Live HA / MQTT operator checklist (B14)

**Purpose:** Close Plan B14 live evidence (or keep claims narrowed to demo + fixture).  
**Normative:** Design §5.7, Appendix C.4, V-UX-6/7/8, V-HA-*.  
**Related:** [smart-home.md](smart-home.md), [homeassistant-setup.md](homeassistant-setup.md), [mqtt-setup.md](mqtt-setup.md), early-adopter claims ([`design_doc/reviews/2026-10-22-early-adopter-claims.md`](../design_doc/reviews/2026-10-22-early-adopter-claims.md)).

Fixture-only is always green via:

```bash
pnpm ha:c4-diff
```

Live sign-off is **optional for early-adopter** if marketing says “demo + fixture”; **required** before claiming “production-proven on your Home Assistant” or flipping B14 to `[x]` for an honest `v1.0.0` bar.

## Prerequisites

- Running EnvoyHome daemon + desktop Settings.
- Home Assistant URL + long-lived access token (`ENVOYHOME_HA_URL`, `ENVOYHOME_HA_TOKEN`), **or** document that only MQTT was exercised.
- Optional MQTT broker (or **Start demo MQTT** against a real bind target you accept).

## Checklist

| # | Step | Pass? | Notes |
|---|------|-------|-------|
| 1 | Connections → Home Assistant: set URL/token → Test connection green | | |
| 2 | Bind at least one non-safety lamp/switch; class + flags look right | | |
| 3 | Home chat (or Chat): turn on/off → Approvals prompt → Allow once → device state matches | | |
| 4 | Attempt a safety-class / `neverUnattended` path unattended → refused (V-UX-7 / C.4 spirit) | | |
| 5 | Restart daemon → unbound objects stay unbound; journal reconciles (no blind retry of non-idempotent) | | |
| 6 | MQTT (if in scope): bind allow-listed topic → publish via approval → observe | | |
| 7 | `ENVOYHOME_HA_URL=… ENVOYHOME_HA_TOKEN=… pnpm ha:c4-diff` against live hub (or N/A + reason) | | |
| 8 | V-UX-8: Home chat nav appears only when HA ready | | |

## Sign-off

| Field | Value |
|-------|-------|
| Date | _pending_ |
| Operator | |
| HA version / URL host (no secrets) | |
| MQTT | yes / no / demo-only |
| Result | **PASS** / **FAIL** / **DEFER** (keep early-adopter narrow claim) |
| Blockers | |

Until this row is **PASS**, Plan B14 stays `[~]` and the claim sheet forbids “production-proven HA” wording.
