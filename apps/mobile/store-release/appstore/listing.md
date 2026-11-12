# EnvoyHome Mobile — Apple App Store listing

Paste these fields into [App Store Connect](https://appstoreconnect.apple.com). Character limits are noted.

Replace every `TODO:` before submit.

---

## App information

| Field | Value |
|-------|--------|
| Name (30) | EnvoyHome |
| Subtitle (30) | Your home agent on the go |
| Bundle ID | `com.envoymesh.envoyhome` |
| SKU (suggested) | `envoyhome-ios` |
| Primary category | Productivity |
| Secondary category | Lifestyle |
| Content rights | Does not contain third-party content |
| Price | Free |

### Subtitle alternatives (≤30)

- Self-hosted home agent
- Pair. Chat. Approve. From phone
- Thin client for EnvoyHome

---

## Promotional text (170) — editable anytime

```
Pair EnvoyHome on your phone to the home agent on your computer. Chat, answer Approvals, check schedules and workflows — your keys and memory stay on the machine you host.
```

---

## Description (4000)

```
EnvoyHome is the mobile companion for the EnvoyHome home agent — a security-first, self-hosted agent that runs on a computer you own.

Pair once, then chat with your household agent, answer Approvals, and check schedules and workflows from your phone. The home daemon runs the agent (envoy-harness), tools, memory, and policy; the phone is a thin window into the same house.

PAIR IN SECONDS
• Scan the pairing QR shown in EnvoyHome desktop Settings
• Or paste a host address and short token when you are on the same network
• Or reach a machine over SSH when you are away from home
• No central EnvoyHome account — identity and sessions stay with your home

CHAT & APPROVALS
• Talk to your household profiles over home.*
• Answer Allow / Deny when a tool needs consent
• Optional push alerts when an Approval is waiting (APNs)
• Attach files or dictate into Chat when you need them

WORKFLOWS & SCHEDULES
• Browse skills, workflows, and standing schedules configured on the home
• The same tool catalogue powers chat turns and workflows on the daemon
• The phone does not run a second agent engine

OPTIONAL SMART HOME
• When Home Assistant or MQTT is connected on the home daemon, related tools and Home chat can appear
• EnvoyHome enhances AI for hubs you already run — it is not a hub replacement
• Actuation stays gated by Approvals and safety-class rules on the daemon

THIN CLIENT BY DESIGN
• The phone never runs the home agent and never holds model API keys
• Memory, Doc KB, and KnowYou stay on the home computer
• Reconnect over LAN, mesh, or SSH — the work keeps running if the phone drops

REQUIREMENTS
• EnvoyHome daemon running on a Mac, Windows, or Linux machine
• A pairing QR or invite from that desktop (Settings → Connections → Pair devices)

EnvoyHome Mobile is part of the EnvoyMesh apps group: it shares mesh pairing and reachability with the family, and keeps EnvoyHome agent state separate on your home machine.
```

---

## Keywords (100 chars max, comma-separated, no spaces after commas preferred)

```
home,agent,self-hosted,AI,chat,approve,pair,QR,workflow,schedule,HA,MQTT,envoy,mesh
```

Count check: keep under 100 characters total (Apple counts commas).

Shorter backup if over limit:

```
home,agent,AI,chat,approve,pair,QR,workflow,self-hosted,envoy
```

---

## What’s New (0.1.0)

```
Initial public release of EnvoyHome Mobile.

• Pair to your EnvoyHome daemon with a QR code, host:port, or SSH hop
• Chat with household profiles; answer Approvals inline
• Browse Settings, Skills, Workflows, and Schedules
• Optional push for Approvals (APNs)
• Secure pairing tokens stored in the device Keychain
```

---

## Support & marketing URLs

| Field | Value |
|-------|--------|
| Support URL | `https://github.com/allenpeng0705/EnvoyHome/issues` |
| Marketing URL | `https://www.envoymesh.cn/envoyhome/` |
| Privacy Policy URL | `https://www.envoymesh.cn/envoyhome/privacy.html` |

Deploy `sites/envoyhome/` before submit. Source drafts: `docs/privacy-policy.md`, `sites/envoyhome/privacy.html`.

Suggested privacy policy topics (covered under **EnvoyHome**):

- Pairing / session tokens stored on device (Keychain)
- Camera for QR pairing
- Microphone / speech recognition for optional dictation
- Optional location for a single chat turn (not standing memory)
- Optional file attachments sent to **your** home daemon
- Push tokens registered on your daemon (APNs)
- Chat / memory / tools processed on your home daemon — not an EnvoyHome cloud inbox
- No central EnvoyHome account

---

## App Privacy (nutrition labels) — draft answers

Use App Store Connect → App Privacy. Adjust if your push / analytics setup differs.

| Data type | Collected? | Linked to identity? | Used for tracking? | Purpose |
|-----------|------------|---------------------|--------------------|---------|
| Contact Info | No | — | — | — |
| Identifiers (Device / User ID) | Yes (pairing / session / push tokens on device) | Yes (your home’s pairing record) | No | App functionality |
| Usage Data | No (unless you add analytics) | — | — | — |
| Diagnostics | Optional (crash only if you enable) | — | — | — |
| Other User Content (chat / attachments) | Processed via your home daemon | Yes | No | App functionality |
| Photos / Camera | Yes (QR scan; optional file attach) | No | No | App functionality |
| Audio Data | Yes (optional composer dictation; may use Apple speech recognition, not an EnvoyHome backend) | No (not to EnvoyHome cloud) | No | App functionality |
| Location | Yes — optional, when user shares for a chat turn | No | No | App functionality |
| Product Interaction | No third-party tracking | — | — | — |

**Data Not Collected** vs **Collected**: declare what the phone sends to the user’s own daemon and Apple push services — not a third-party EnvoyHome backend.

---

## Age rating

Suggested: **4+**. Confirm with Apple’s questionnaire. There is no unrestricted social UGC feed; content is the user’s own household agent chat on machines they pair.

---

## Review notes (for App Review team)

For a normal submission, use the short notes below (and the longer block in
[`../apple_google_reviewing.md`](../apple_google_reviewing.md)).

```
IMPORTANT (Guideline 2.5.2): EnvoyHome Mobile does not download, install, or execute
agent/tool code on the iPhone. The home agent and tools run only on the paired
EnvoyHome daemon. The phone is a thin companion (chat + Approvals over home.*).

EnvoyHome Mobile requires an EnvoyHome daemon on a computer. Without pairing it
shows the pair UI only. No login/password — QR or paste URI.

Demo path for reviewers:
See apple_google_reviewing.md in this folder (demo home + long-lived pairing QR).

1. Open EnvoyHome → Pair → Scan QR (or paste the pairing URI).
2. Pairing URI:
   TODO: paste the live envoy://pair?…&app=EnvoyHome URI for this submission
3. After pair: open Chat → send a short message → read the reply.
   If an approval is pending, tap Deny (or Allow); that only answers the home daemon.
4. Demo home is online during review. Contact: TODO: you@example.com

Permissions:
• Camera — scan the desktop pairing QR
• Microphone / Speech Recognition — optional dictate into Chat
• Location — optional “share for this turn” only
• Local Network — reach the home computer on Wi‑Fi (ws://)

No account creation on a central server. The credential is a pairing token for the user’s own home.
```

---

## Icons

| File | Spec | Path |
|------|------|------|
| App Store icon | 1024×1024 PNG, **RGB, no alpha** | `icons/app-icon-1024.png` |
| Full-bleed approx | Same square (Apple applies the mask) | `icons/app-icon-1024-fullbleed-approx.png` |

### Icon checklist

- [ ] Upload **1024×1024** with **no transparency**
- [ ] Prefer artwork that fills the square; Apple applies the mask
- [ ] No competing logos / “beta” banners

Source mark: `apps/branding/store/` (`envoyhome-simple-b` → opaque indigo).

---

## Screenshots checklist

Apple requires device-sized screenshots (at least one size class).

### iPhone (required) — capture on a recent device / simulator

Suggested set (6.7" or 6.9" primary):

1. **Pairing** — QR scan / paste-link screen
2. **Chat** — household conversation with a reply
3. **Approval** — Allow / Deny card (if available)
4. **Settings hub** — LLM / Connections / Skills / System
5. **Schedules** or **Workflows** — standing work on the home

Optional: Home (HA) screen only if the demo home has HA configured — do not imply HA is required.

### Caption ideas (for your design overlays — not App Store text fields)

1. “Your home agent, from your phone”
2. “Pair once with a QR code”
3. “Chat and Approvals on the go”
4. “Keys and memory stay at home”
5. “Workflows and schedules, same tools”

Brand colors: indigo `#211962` / `#6366f1`, cyan `#22d3ee`, charcoal `#0c0f1d`, white text.

---

## Build & submit reminders

```bash
cd apps/mobile
# Bump pubspec version first: 0.1.0+N
flutter build ipa   # after signing / certificates configured in Xcode
```

- Version: `CFBundleShortVersionString` from Flutter `version` name (`0.1.0`)
- Build: `CFBundleVersion` from Flutter build number (`N`)
- Camera, mic, speech, location, and local-network usage strings are in `ios/Runner/Info.plist`
- Release push: `RunnerRelease.entitlements` (`aps-environment` = production); daemon unset `APNS_SANDBOX`
- Export compliance: uses encryption (HTTPS / TLS / mesh) — usually **exempt** standard encryption; answer the questionnaire accordingly
