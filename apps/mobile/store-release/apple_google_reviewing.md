# Apple / Google store review — EnvoyHome Mobile demo home

How reviewers try **EnvoyHome Mobile**, and how to run a **dedicated EnvoyHome daemon / desktop** with a pairing QR/URI they can use for the whole review window — without putting review secrets into normal user installs.

EnvoyHome Mobile has **no username/password**. Pairing uses a QR / URI minted by the EnvoyHome desktop (Settings → Connections → Pair devices / Mint pairing).

```text
envoy://pair?…&app=EnvoyHome
```

There is **no special “review build” of the phone app**. Reviewers install the same binary; you keep a demo home online and give them a valid pairing URI.

---

## Recommended review flow

### What you do (operator)

1. Install **EnvoyHome** on a **dedicated** machine or profile (throwaway household is fine).
2. Start the daemon (`pnpm run dev:daemon` or desktop Settings so the daemon is hosting) with LAN + relay / public reachability from cellular if needed.
3. Open **Settings → Connections → Pair devices** (Mint pairing) and show a **QR code**.
4. **Copy the full pairing URI** (must include `app=EnvoyHome`) and optionally save a QR PNG.
5. Paste that URI into App Store Connect / Play Console review notes.
6. Keep the demo home **online** for the whole review window.

Default pairing TTL on the home daemon is long enough for store review — you do not need EnvoyGo’s `ENVOY_REVIEW_PAIRING` machinery unless you choose to add it later.

### What the reviewer does

1. Install EnvoyHome from TestFlight / Play internal testing / store build.
2. Open the app → **Pair** → scan the QR **or paste** the `envoy://pair?…&app=EnvoyHome` URI.
3. After pair: open **Chat** → send a short message → read the reply.
4. If an **approval** card is pending: **Allow** or **Deny**.
5. Optionally open **Settings** (LLM / Connections / Skills / System) and **Schedules**.

### Demo content tips

Reviewers move faster when the demo home already has:

- At least one household **profile**
- A short **Chat** history (one completed turn is enough)
- Optionally a pending **approval** so they can exercise Allow/Deny
- Optional: one saved **workflow** or **schedule** (not required for first submit)

Avoid putting real secrets, production HA tokens, or live model billing keys on the review machine if you can use a sandbox key / local model.

**Do not** require Home Assistant for the review path — HA is optional. Prefer Chat + Approvals as the primary demo.

---

## What to put in store review notes

Lead with the thin-client boundary. Guideline **2.5.2** rejections happen when a reviewer sees tool calls / workflows and assumes the iPhone executes agent code. Put the architecture sentence first.

```text
IMPORTANT (Guideline 2.5.2): EnvoyHome Mobile does not download, install, or execute
agent/tool code on the iPhone. It is a thin companion UI. The home agent
(envoy-harness), workflows, tools, memory, and Approvals run only on the paired
EnvoyHome daemon on the user’s computer. The phone shows chat/transcripts and
sends home.* RPCs (pair, chat, Allow/Deny). There is no on-device agent runtime,
terminal, OTA update, or downloaded native agent code.

EnvoyHome Mobile has no login/password. Pairing is QR-only (or paste the URI).

Demo home for App Review / Play review:

1. Open EnvoyHome → Pair → Scan QR (or paste the URI below).
2. Pairing URI:
   envoy://pair?<PASTE_FULL_URI_INCLUDING_app=EnvoyHome>
3. After pair: open Chat → send “hello” → read the reply.
   If an approval is shown, tap Deny (or Allow); that only answers the home daemon.
4. Demo home is online 24/7 during review. Contact: TODO: you@example.com

Notes for reviewers:
- First connect can take a short time while the app walks LAN / mesh / relay candidates.
- On iOS, Allow Local Network when prompted (LAN ws:// to the home computer).
- Optional SSH in the product is a local port-forward to reach the home daemon, not
  an interactive shell on the phone.
- Optional Home Assistant / MQTT tools appear only when configured on the daemon;
  they are not required for this review.
- This URI is for store review only. Normal users mint their own QR from their own EnvoyHome desktop.
```

Also attach a **QR PNG** if the console allows attachments.

**Demo content tip for 2.5.2:** leave a finished chat turn with ordinary messages; avoid a pending “admin / safety-class” actuation approval if you can. If one must stay, say in the notes that **Deny** is the intended review action.

---

## Safety: will this affect normal users?

**No**, as long as you:

1. Use a **dedicated** demo home / profile for review.
2. Do **not** ship review-only env vars or secrets in end-user desktop builds.
3. Rotate / discard the review pairing (revoke paired device, or wipe the demo profile) after review if you no longer want that URI to work.

The phone app does not contain a backdoor. It only accepts pairing tokens the home daemon issues.

---

## Reachability checklist

Reviewers are rarely on your LAN. Before you submit:

- [ ] Demo EnvoyHome daemon is running (hosting `home.*` on WS `:4780/ws`)
- [ ] Pairing QR minted with `app=EnvoyHome`; full URI copied
- [ ] Phone on cellular can complete pairing (mesh / public / relay path works)
- [ ] Sample Chat turn present for the reviewer
- [ ] Contact email in the notes is monitored
- [ ] After review: stop the demo or revoke the paired-device record / wipe the profile

---

## Differences from sister apps

| | EnvoyGo | EnvoyDev Mobile | **EnvoyHome Mobile** |
|--|---------|-----------------|----------------------|
| Home to pair with | EnvoyMesh home node (Social) | EnvoyDev desktop daemon | **EnvoyHome home agent daemon** |
| Pairing URI | `envoy://invite` / `envoy://pair` (mesh) | `envoy://pair` (EnvoyDev) | `envoy://pair?…&app=EnvoyHome` |
| Special review env | `ENVOY_REVIEW_PAIRING*` | Not required | Not required |
| What reviewers test | Chat, Social, voice | Projects, tasks, transcripts, approvals | **Chat, Approvals, Settings, Schedules** (HA optional) |

Do **not** send EnvoyGo / EnvoyDev pairing URIs to EnvoyHome reviewers — the family’s app check will refuse the wrong product.

---

## Related paths

| Path | Role |
|------|------|
| `docs/mobile-store-release.md` | Full App Store / Play release guide |
| `apps/mobile/` | Flutter phone app |
| `apps/desktop/` | Settings shell that mints pairing |
| `packages/daemon/` | Home agent that issues pairing + runs harness |
| `apps/mobile/store-release/appstore/listing.md` | App Store listing + short review notes |
| `apps/mobile/store-release/googleplay/listing.md` | Play listing + app access notes |
| `docs/mobile-live-verify.md` | Live verify checklist before submit |
