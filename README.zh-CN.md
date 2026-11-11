<p align="center">
  <img src="docs/screens/envoyhome-logo.png" alt="EnvoyHome 标识" width="144" height="144" />
</p>

<p align="center">
  <strong>EnvoyHome — 自托管家庭智能体</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="Apache 2.0" />
  <img src="https://img.shields.io/badge/node-%3E%3D22-green.svg" alt="Node.js" />
  <img src="https://img.shields.io/badge/pnpm-workspace-orange.svg" alt="pnpm" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows%20%7C%20iOS%20%7C%20Android-lightgrey.svg" alt="Platforms" />
</p>

<p align="center">
  <a href="#快速开始">⬇ 快速开始</a>
  ·
  <a href="README.md">English</a>
  ·
  <strong>简体中文</strong>
</p>

# EnvoyHome

**跑在你家电脑上的、安全优先的家庭智能体。**

EnvoyHome 是 [EnvoyMesh](https://github.com/allenpeng0705/EnvoyMesh) 应用族里的**家庭智能体**。核心是**智能体循环本身**：**envoy-harness**、**静态工作流**、**记忆**、**审批**，以及智能体可用的一整套**工具目录**——文件、网页、浏览器、办公文档、技能、计划任务、MCP 等。桌面 / 手机轻客户端只是窗口，并不跑智能体。

智能家居（Home Assistant / MQTT）是这些能力里的**一个工具面**——接上网关时很有用，但不是产品定义。EnvoyHome 不当网关，也不交付 EnvoyMesh Social。

- **守护进程 + envoy-harness** — 每次聊天 / 工作流回合都经家用守护进程，且仅交付这一套 harness。
- **工作流 + 工具** — 图解 \| YAML 流程；同一目录服务聊天、计划任务与工作流节点。
- **谨慎学习的记忆** — 常驻笔记、Doc KB、KnowYou；需写时常经 PendingLearn / 审批。
- **家庭多账号** — 一套智能体、隔离档案；手机经 `home.*` 配对到「这套家」。
- **可选智能家居** — 需要致动时再绑定 HA/MQTT；安全 class 闸门仍在。
- **与 EnvoyDev 同族** — 配对 / 拨号阶梯参考 [EnvoyCoder](https://github.com/allenpeng0705/EnvoyCoder)；编程 IDE 仍归 EnvoyDev。

📖 **[QuickStart.md](QuickStart.md)** — 几分钟跑起守护进程、桌面与手机。

<p align="center">
  <img src="docs/screens/envoyhome-architecture-zh.svg" alt="EnvoyHome 架构 — 轻客户端、智能体守护进程、工具、可选网关" width="900" />
</p>
<p align="center"><em>轻客户端经 <code>home.*</code> 拨入家用智能体。中心是 harness + 工作流 + 工具；网关可选。</em></p>

---

## 目录

- [能做什么？](#能做什么)
- [工作原理](#工作原理)
- [在 Envoy 应用族中的位置](#在-envoy-应用族中的位置)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [设计文档](#设计文档)
- [当前状态](#当前状态)
- [更多阅读](#更多阅读)
- [许可证](#许可证)

---

## 能做什么？

### 核心 — 智能体

| 部分 | 是什么 |
|------|--------|
| **守护进程**（`packages/daemon`） | 拥有回合、策略、审批、记忆与工具调度（`home.*`，WS `:4780/ws`） |
| **envoy-harness** | 唯一交付的 harness — 智能体循环 / 工具调用 / 子智能体（`task`、`spawn_helper`） |
| **工作流** | 静态 DAG（图解 \| YAML）；自然语言草稿；与聊天共用工具 |
| **工具目录** | 内置 + 已验证技能 + Owner MCP（`mcp__…`）+ 可选 HA/MQTT（接通后） |
| **记忆** | L1–L3 常驻、Doc KB（`knowledge/`）、KnowYou；门控 PendingLearn |
| **审批 / 授权** | 持久 ask · TTL · 失败即拒绝 — 工作流不是审批旁路 |

### 智能体工具（示例）

- **文件与沙箱** — `read_file` / `write_file` / `edit_file` / `apply_patch` / `list_dir` / `search_files`
- **知识** — `knowledge_search` / `knowyou_search` / `promote_knowledge`
- **网页与浏览器** — `web_search` / `web_extract` / `web_research` / `browser`（表单卡片；永不破解验证码）
- **办公** — `extract_document` / `export_document`（可选 LibreOffice 打印级）
- **技能与计划** — `skills_list` / `skill_view` / `skill_propose` / `schedule`
- **会话与助手** — `message` / 会话工具 / `task` / `spawn_helper`
- **Owner MCP** — 测试成功且启用的服务器以 `mcp__…` 进入目录
- **智能家居（可选）** — 频道就绪时的 `ha_*` / `mqtt_*`

### 产品面

| 面 | 路径 | 职责 |
|----|------|------|
| **守护进程** | `packages/daemon` | 家庭智能体 — WS `:4780/ws`，HTTP `:4781` |
| **桌面** | `apps/desktop` | Tauri Settings 壳（聊天、审批、模型、工作流、技能、计划、连接…） |
| **手机** | `apps/mobile` | Flutter 轻客户端 — 扫码 / `host:port` / SSH 跳板进入同一 `home.*` |
| **品牌** | `apps/branding` | 产品标识与商店图标包 |

### 可选 — 智能家居

需要观察或致动已绑定对象时，再在 **连接** 里配置 Home Assistant 或 MQTT。EnvoyHome 增强这些网关上的 AI，并不替代网关。

- 指南：[`docs/smart-home.md`](docs/smart-home.md) · [`docs/homeassistant-setup.md`](docs/homeassistant-setup.md) · [`docs/mqtt-setup.md`](docs/mqtt-setup.md)
- 致动（`ha_call_service`、`mqtt_publish`）为 **`admin`**；无人值守需 grant；安全类对象永不被 grant 覆盖。

---

## 工作原理

```
  桌面 / 手机                    EnvoyHome 守护进程                       模型
  ┌──────────────┐  home.*    ┌─────────────────────────────┐         ┌──────────┐
  │ 轻客户端     │◀──────────▶│ envoy-harness · 工作流      │────────▶│ 云 /     │
  │ 聊天 · 运维  │  :4780/ws  │ 记忆 · 审批                 │         │ Local    │
  └──────────────┘            │ 工具目录                    │         └──────────┘
                              └──────────────┬──────────────┘
                     文件 · 网页 · 浏览器 · 办公 · 技能 · MCP · …
                                             │
                                             ▼  （可选）
                                      HA / MQTT 网关
```

- **智能体住在家用电脑上** — harness、工具、密钥与沙箱都留在那里。
- **轻客户端**讲 `home.*`（EnvoyMesh 托管信封）；配对一次即可远程聊天 / Settings。
- **工作流复用同一套工具**；不是第二引擎，也不是审批旁路。
- **智能家居工具**仅在配置网关后出现；没有网关时其余能力照常可用。

完整图：[`docs/screens/envoyhome-architecture-zh.svg`](docs/screens/envoyhome-architecture-zh.svg)。

---

## 在 Envoy 应用族中的位置

EnvoyHome 复用 EnvoyMesh 传输与 EnvoyDev 风格的轻客户端模式——**不** fork `@envoymesh/*`，也**不**交付 Mesh Social。

<p align="center">
  <img src="docs/screens/envoyhome-family-zh.svg" alt="EnvoyMesh、EnvoyDev 与 EnvoyHome 在应用族中的位置" width="820" />
</p>
<p align="center"><em>共享配对 / 拨号阶梯 — 产品大脑各自独立。</em></p>

| 产品 | 职责 | 「大脑」 |
|------|------|----------|
| **[EnvoyMesh](https://github.com/allenpeng0705/EnvoyMesh)** | Mesh 身份、建联、Social、可选 Ext Agent | 不拥有 EnvoyHome 的智能体循环 |
| **[EnvoyDev](https://github.com/allenpeng0705/EnvoyCoder)** | 编程代理控制平面（多种 harness） | 编程代理 / envoy-harness + CLI |
| **EnvoyHome**（本仓库） | 自托管家庭智能体：harness、工作流、工具、记忆 | **自有守护进程** + 仅 **envoy-harness** |
| **EnvoyGo / 轻客户端** | 手机 / 已配对 UI | 拨入产品守护进程 — 手机上无大脑 |

并列目录（`link:` 链接，不上 npm）：

```text
parent/
  EnvoyHome/       ← 本仓库
  EnvoyMesh/       ← @envoymesh/*（必需）
  envoy-harness/   ← 唯一交付的 harness（桌面可按 pin 拉取）
  EnvoyCoder/      ← 仅参考模式（可选）
```

---

## 快速开始

**动手步骤：** [`QuickStart.md`](QuickStart.md)。

```bash
# 失败即退出的并列仓库检查（或设置 ENVOYHOME_PEERS_GIT_BASE 后 ./scripts/fetch-peers.sh）
./scripts/peers-check.sh

# 切勿在 CI=true 下安装（pnpm 严格模式陷阱 — 约定 R9）
env -u CI pnpm install

./scripts/ci.sh                   # docs-lint → peers → install → build → test → lint
pnpm desktop:dev                  # 必要时构建守护进程 → Tauri Settings
pnpm version:desktop -- 0.1.0     # bump 桌面 VERSION（见 scripts/README.md）
./scripts/build-desktop.sh macos  # DMG → release/（Linux: linux；Windows: .\scripts\build-desktop.ps1）
```

端口（设计 §2.4）：WebSocket `4780` 路径 `/ws`，HTTP `4781`（`GET /health`）。

手机：

```bash
cd apps/mobile
flutter pub get
flutter run    # 经桌面「配对」扫码 / host:port / SSH 跳板
```

---

## 项目结构

```text
EnvoyHome/
├── apps/
│   ├── desktop/     # Tauri Settings 壳
│   ├── mobile/      # Flutter 轻客户端
│   └── branding/    # 标识与商店图标
├── packages/
│   ├── daemon/      # 家庭智能体守护进程（home.*）
│   ├── protocol/    # @envoyhome/protocol
│   ├── harness-host/
│   ├── memory/
│   ├── workflows/
│   ├── providers/
│   ├── channel-api/
│   ├── smarthome/    # 可选 HA + MQTT 工具
│   └── …
├── plugins/         # 聊天与事件源通道插件
├── design_doc/      # 设计 + 记忆 + Knowledge-RAG + 实施计划
├── docs/            # 运维指南
├── QuickStart.md
└── AGENTS.md
```

---

## 设计文档

| 文档 | 角色 |
|------|------|
| [`design_doc/EnvoyHome-Design.md`](design_doc/EnvoyHome-Design.md) | **事实来源** — 规范性产品与安全 |
| [`design_doc/EnvoyHome-Memory-Design.md`](design_doc/EnvoyHome-Memory-Design.md) | 记忆层 L0–L7、flush、LearnQueue |
| [`design_doc/EnvoyHome-Knowledge-RAG-Design.md`](design_doc/EnvoyHome-Knowledge-RAG-Design.md) | Doc KB + KnowYou + Home 向量 `:18793` |
| [`design_doc/EnvoyHome-Implementation-Plan.md`](design_doc/EnvoyHome-Implementation-Plan.md) | 构建阶段 **B0–B14**、验证 ID |
| [`tests/min/conventions.md`](tests/min/conventions.md) | 规则 **R1–R13**（改包代码前必读） |
| [`AGENTS.md`](AGENTS.md) | AI 编程代理说明 |

---

## 当前状态

脊柱 **B0–B14** 已在 `main`。设计门 **G1** 与计划门 **G6** 已接受。**尚未打 `v1.0.0` 标签** — 见计划发布门槛（§8）与早期用户声明表：

[`design_doc/reviews/2026-10-22-early-adopter-claims.md`](design_doc/reviews/2026-10-22-early-adopter-claims.md)

预览姿态：桌面 + 手机；可选 HA/MQTT **演示 / 夹具**。在对应门槛关闭前，**不要**宣称 Privacy Mode 为成品开关、生产级 IM 动物园，或 agentskills.io 符合性。手机实地验证：[`docs/mobile-live-verify.md`](docs/mobile-live-verify.md)。

品牌 / 商店包：[`apps/branding/store/README.md`](apps/branding/store/README.md)。

---

## 更多阅读

- **从这里开始：** [`QuickStart.md`](QuickStart.md)
- **图示：** [`docs/screens/`](docs/screens/)（标识 · 架构 · 应用族）
- **Harness：** [envoy-harness](https://github.com/allenpeng0705/envoy-harness)
- **智能家居（可选）：** [`docs/smart-home.md`](docs/smart-home.md) · HA · MQTT · [实地清单](docs/smart-home-live-checklist.md)
- **手机：** [`apps/mobile/README.md`](apps/mobile/README.md) · [`docs/mobile-live-verify.md`](docs/mobile-live-verify.md) · [iOS/Android 配置](docs/mobile-ios-android-setup.md)
- **桌面：** [`apps/desktop/README.md`](apps/desktop/README.md) · [`scripts/README.md`](scripts/README.md)
- **同族仓库：** [EnvoyMesh](https://github.com/allenpeng0705/EnvoyMesh) · [EnvoyDev / EnvoyCoder](https://github.com/allenpeng0705/EnvoyCoder)
- **官网（应用族）：** [www.envoymesh.cn](https://www.envoymesh.cn)

---

## 许可证

[Apache License 2.0](LICENSE)
