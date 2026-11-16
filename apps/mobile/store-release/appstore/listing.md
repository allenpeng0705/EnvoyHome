# EnvoyHome Mobile — Apple App Store listing

Paste these fields into [App Store Connect](https://appstoreconnect.apple.com). Character limits are noted.

**Operator shortcut:** [`../SUBMIT.md`](../SUBMIT.md). Fill the live pairing URI before submit (contact emails below are set).

Version: **1.0.0+1** (`apps/mobile/pubspec.yaml`).

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
Pair EnvoyHome on your phone to the home agent on your computer. Chat, answer Approvals, check schedules — keys and memory stay on the machine you host.
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

## What’s New (1.0.0)

```
Initial public release of EnvoyHome Mobile.

• Pair to your EnvoyHome daemon with a QR code, host:port, or SSH hop
• Chat with household profiles; answer Approvals inline
• Browse Settings, Skills, Workflows, and Schedules
• Optional push for Approvals (APNs)
• Secure pairing tokens stored in the device Keychain
```

---

## Chinese (zh-Hans) — optional locale

**名称:** `EnvoyHome`  
**副标题 (≤30):** `随身携带的家庭智能体`

**宣传文本:**
```
把手机上的 EnvoyHome 配对到你电脑上的家庭智能体。对话、审批、日程与工作流 — 密钥与记忆留在你自己托管的机器上。
```

**描述:**
```
EnvoyHome 是 EnvoyHome 家庭智能体的移动伴侣应用 — 安全优先、自托管，运行在你自己的电脑上。

配对一次后，即可在手机上与家庭智能体对话、处理审批，并查看日程与工作流。家庭守护进程运行智能体（envoy-harness）、工具、记忆与策略；手机只是同一家庭的轻量窗口。

几秒配对
• 扫描桌面端 EnvoyHome「设置」中的配对二维码
• 或在同一网络下粘贴主机地址与短令牌
• 或在外出时通过 SSH 跳转访问
• 无中央 EnvoyHome 账号 — 身份与会话留在你家中

对话与审批
• 通过 home.* 与家庭配置文件对话
• 工具需要同意时选择允许 / 拒绝
• 可选推送提醒（APNs）
• 需要时可附加文件或语音输入

工作流与日程
• 浏览家庭端配置的技能、工作流与日程
• 手机不运行第二套智能体引擎

可选智能家居
• 当家庭守护进程已连接 Home Assistant 或 MQTT 时，相关工具可出现
• EnvoyHome 增强你已有的中枢，而不是取代它们
• 执行仍受审批与安全等级规则约束

按设计为轻客户端
• 手机从不运行家庭智能体，也不保存模型 API 密钥
• 记忆与知识库留在家中电脑
• 可通过局域网、mesh 或 SSH 重连

要求
• 在 Mac / Windows / Linux 上运行的 EnvoyHome 守护进程
• 来自该桌面的配对二维码或邀请（设置 → 连接 → 配对设备）
```

**关键词:**
```
家庭,智能体,自托管,AI,对话,审批,配对,二维码,工作流,日程,envoy
```

---

## Support & marketing URLs

| Field | Value |
|-------|--------|
| Support URL | `https://github.com/allenpeng0705/EnvoyHome/issues` |
| Marketing URL | `https://www.envoymesh.cn/envoyhome/` |
| Privacy Policy URL | `https://www.envoymesh.cn/envoyhome/privacy.html` (family fallback: `https://www.envoymesh.cn/privacy.html`) |

Deploy `sites/envoyhome/` before submit if those URLs are not live yet. Source drafts: `docs/privacy-policy.md`, `sites/envoyhome/privacy.html`.

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
   Mint fresh before submit (desktop Settings → Connections → Pair devices) and paste the full envoy://pair?…&app=EnvoyHome URI here.
   Operator contact: shilei.peng@qq.com
3. After pair: open Chat → send a short message → read the reply.
   If an approval is pending, tap Deny (or Allow); that only answers the home daemon.
4. Demo home is online during review. Contact: shilei.peng@qq.com (alt: shileipeng@gmail.com)

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

Apple requires device-sized screenshots (at least one size class). Pack includes:

| Size | Path |
|------|------|
| iPhone 6.7" **1290×2796** (primary) | `screenshots/01-pairing.png`, `02-chat.png`, `03-settings.png` |
| iPhone 6.5" **1242×2688** | `screenshots/iphone-6.5/` |
| Captioned marketing frames | `screenshots/framed/` |

Upload the **raw** 6.7" set first. Add framed / 6.5" as needed.

Recommended to add later (re-capture on device): Approval card, Schedules. Prefer Chat **without** the soft keyboard. Optional HA screen only if demo home has HA — do not imply HA is required.

Brand colors: indigo `#211962` / `#6366f1`, cyan `#22d3ee`, charcoal `#0c0f1d`, white text.

---

## Build & submit reminders

```bash
cd apps/mobile
# Bump pubspec version first: 1.0.0+N
flutter build ipa   # after signing / certificates configured in Xcode
```

- Version: `CFBundleShortVersionString` from Flutter `version` name (`1.0.0`)
- Build: `CFBundleVersion` from Flutter build number (`N`)
- Camera, mic, speech, location, and local-network usage strings are in `ios/Runner/Info.plist`
- Release push: `RunnerRelease.entitlements` (`aps-environment` = production); daemon unset `APNS_SANDBOX`
- Export compliance: uses encryption (HTTPS / TLS / mesh) — usually **exempt** standard encryption; answer the questionnaire accordingly
