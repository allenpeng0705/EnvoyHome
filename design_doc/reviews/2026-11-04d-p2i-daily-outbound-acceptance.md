# P2-I Daily Outbound Assist — Owner Accept + Ship

Changelog `2026-11-04d` accepted and shipped **P2-I Daily Outbound Assist** (§9.5i).

## Scope

| Item | Epic | Notes |
|------|------|--------|
| §9.5i | **P2-I** | Prepare food/travel/shop/ride/booking; hard stop at pay/OTP-SMS/CAPTCHA/wallet |
| Handoff card | **P2-I** | `purpose: "outbound_handoff"` + https `openUrl` + `steps[]` |
| Payment wall | **P2-I** | `blocked: "payment"`; no form card for card fields |
| Route | **P2-I** | Prefer Owner MCP → browser → handoff |

## Accept criteria

1. Hard stop before payment / wallet / card fields (even attended).
2. OTP only when Owner types into form card; never invent/receive SMS.
3. Handoff Open launches system https URL (Universal Links MAY open native app).
4. Never claim daemon Chromium cart ≡ phone-app cart without MCP draft.
5. CAPTCHA / native mini-program automation remain Defer.

**Out of scope:** CAPTCHA solve; first-party commerce APIs; custom-scheme registry; computer-use.

**Accept** — Design `2026-11-04d` §9.5i + Plan P2-I board, owner Allen Peng, **2026-11-04**.
