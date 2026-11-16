// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Chinese (`zh`).
class AppLocalizationsZh extends AppLocalizations {
  AppLocalizationsZh([String locale = 'zh']) : super(locale);

  @override
  String get appName => 'EnvoyHome';

  @override
  String get appLanguage => '语言';

  @override
  String get appThemePicker => '外观';

  @override
  String get appThemeSystem => '跟随系统';

  @override
  String get appThemeLight => '浅色';

  @override
  String get appThemeDark => '深色';

  @override
  String get pairLede => '通过 EnvoyMesh 加入家中桌面 — 扫描二维码、输入 host:port，或经 SSH 跳转。';

  @override
  String get pairTabLink => '链接';

  @override
  String get pairTabHost => '主机:端口';

  @override
  String get pairTabSsh => 'SSH';

  @override
  String get pairFooter => 'com.envoymesh.envoyhome · 配对后可推送';

  @override
  String get pairCloseScanner => '关闭扫描';

  @override
  String get pairScanQr => '扫描配对二维码';

  @override
  String get pairUriLabel => '配对 URI';

  @override
  String get pairUriHint => 'envoy://pair?…&app=EnvoyHome';

  @override
  String get pairConnect => '连接';

  @override
  String get pairDirectHint => '在本网络（局域网 / Tailscale）访问桌面。需要令牌。';

  @override
  String get pairHostPort => '主机:端口';

  @override
  String get pairHostPortHint => '192.168.1.10:4780';

  @override
  String get pairToken => '配对令牌';

  @override
  String get pairTokenHelper => '来自桌面设置 → 配对设备';

  @override
  String get pairSshHint => '经 SSH 跳转隧道。守护进程看到的是本机回环 — 令牌可选。';

  @override
  String get pairSshHost => 'SSH 主机';

  @override
  String get pairSshUser => '用户';

  @override
  String get pairSshUserHint => 'root';

  @override
  String get pairSshPort => '端口';

  @override
  String get pairSshPassword => 'SSH 密码';

  @override
  String get pairDaemon => '远端守护进程';

  @override
  String get pairDaemonHint => '127.0.0.1:4780';

  @override
  String get pairTokenOptional => '令牌（可选）';

  @override
  String get shellOnline => '在线';

  @override
  String get shellDegraded => '降级';

  @override
  String get shellOffline => '未连接';

  @override
  String get shellConnect => '连接';

  @override
  String get shellReconnect => '重新连接';

  @override
  String get shellDisconnect => '断开';

  @override
  String get shellForgetPairing => '忘记配对';

  @override
  String get connectGuideTitle => '连接家庭主机';

  @override
  String get connectGuideHint => '在桌面端打开 设置 → 配对设备，扫描二维码，或粘贴配对链接 / 主机地址。';

  @override
  String get connectGuideReconnectHint => '此手机已配对。可直接重连桌面；若更换了家庭环境，请重新配对。';

  @override
  String get shellProfilePending => '资料将由此设备的配对关系决定。';

  @override
  String shellProfileOne(String id) {
    return '资料 · $id';
  }

  @override
  String get shellProfile => '资料';

  @override
  String shellMeshHint(String mesh) {
    return 'mesh $mesh · 下拉标签页刷新';
  }

  @override
  String get shellCreateProfile => '创建';

  @override
  String get shellProfileDisplayName => '显示名称';

  @override
  String get shellProfileIdOptional => '账户 ID（可选）';

  @override
  String get shellCancel => '取消';

  @override
  String get shellCreate => '创建';

  @override
  String get shellProfileCreated => '已创建配置文件';

  @override
  String shellProfileCreateFailed(String error) {
    return '创建失败：$error';
  }

  @override
  String get navChat => '对话';

  @override
  String get navHomeChat => '首页';

  @override
  String get navSchedulesChat => '日程';

  @override
  String get navSettings => '设置';

  @override
  String get navLlm => 'LLM';

  @override
  String get navConnections => '连接';

  @override
  String get navSkills => '技能';

  @override
  String get navSystem => '系统';

  @override
  String get navProfiles => '配置文件';

  @override
  String get navApprovals => '审批';

  @override
  String get navModels => '模型';

  @override
  String get navArtifacts => '产物';

  @override
  String get settingsHubHint =>
      'Configure the home daemon from your phone. Some owner-only actions need a trusted device.';

  @override
  String get settingsProfilesSubtitle => '户主、工作区文件夹、工具策略';

  @override
  String get settingsLlmSubtitle => '模型、本地、路由、记忆';

  @override
  String get settingsConnectionsSubtitle =>
      'Pairing, Home Assistant, MQTT, Channels';

  @override
  String get settingsSkillsSubtitle => '安装与管理技能包';

  @override
  String get settingsWorkflowsSubtitle => '工作流 — 起草、校验、运行';

  @override
  String get settingsSystemSubtitle => '配置文件、共享文件、健康、授权';

  @override
  String get settingsNeedConnect => '先连接家庭主机，再配置 LLM、连接、技能与系统。';

  @override
  String get profilesIntro => '每人拥有一个配置文件。户主可配置工作区文件夹并转让所有权。';

  @override
  String get profilesMemberHint => '本设备不是户主 — 此处工作区为只读。';

  @override
  String get profilesRefresh => '刷新';

  @override
  String get profilesAddTitle => '添加配置文件';

  @override
  String get profilesOwnerBadge => '户主';

  @override
  String get profilesActiveBadge => '当前';

  @override
  String get profilesWorkspaceTitle => '工作区文件夹';

  @override
  String get profilesWorkspaceHint =>
      '每个资料仅一个主机文件夹。浏览选择即可；智能体通过 workspace/… 访问。';

  @override
  String get profilesWorkspacePath => '主机路径';

  @override
  String get profilesWorkspaceBrowse => '浏览文件夹';

  @override
  String get profilesWorkspaceBrowseHint => '点按浏览家庭电脑上的文件夹';

  @override
  String get profilesWorkspaceUnset => '未设置（仅沙箱）';

  @override
  String get profilesWorkspaceSet => '已配置';

  @override
  String get profilesWorkspaceWholeMachine => '整台电脑';

  @override
  String get profilesWorkspaceRo => '只读';

  @override
  String get profilesWorkspaceRw => '读写';

  @override
  String get profilesWorkspaceUseRoot => '添加电脑根目录';

  @override
  String get profilesWorkspaceClear => '全部清除';

  @override
  String get profilesWorkspaceRemove => '移除';

  @override
  String get profilesWorkspaceApply => '添加';

  @override
  String get profilesWorkspaceEdit => '添加文件夹';

  @override
  String get profilesWorkspaceRootTitle => '允许访问整台电脑？';

  @override
  String get profilesWorkspaceRootBody =>
      '允许代理通过 workspace/… 读取（若已选则还包括写入）电脑根目录下的文件 — 包括从此手机访问。';

  @override
  String get profilesWorkspaceRootOk => '允许';

  @override
  String get profilesWorkspaceMemberNote => '仅户主可更改工作区文件夹。';

  @override
  String get profilesWorkspaceCrossTitle => '为其他配置文件添加工作区文件夹？';

  @override
  String profilesWorkspaceCrossBody(String name) {
    return '将为 $name 添加主机文件夹。仅在你确要为其配置工作区时继续。';
  }

  @override
  String get profilesWorkspaceDenied => '本设备不可见';

  @override
  String get profilesWorkspaceInactive => '已配置但未激活（仅文件系统根目录对户主生效）';

  @override
  String get profilesRename => '重命名';

  @override
  String get profilesRenameTitle => '重命名配置文件';

  @override
  String get profilesRenameSave => '保存';

  @override
  String get profilesTimeZoneUnset => '时区：未设置（日程使用主机默认）';

  @override
  String profilesTimeZoneValue(String tz) {
    return '时区：$tz';
  }

  @override
  String get profilesTimeZoneEdit => '时区';

  @override
  String get profilesTimeZoneTitle => '账户时区';

  @override
  String get profilesTimeZoneHint => 'IANA 名称，例如 Asia/Shanghai';

  @override
  String get profilesTimeZoneSave => '保存';

  @override
  String profilesTimeZoneDone(String tz) {
    return '时区已设为 $tz';
  }

  @override
  String get profilesShareLocationTitle => '与 Home 共享位置';

  @override
  String get profilesShareLocationSubtitle =>
      '在聊天回合中附带大致 GPS，供日程/上下文使用。仅在此处请求一次系统权限，发送消息时不再弹窗。仅本回合注入，不写入记忆。';

  @override
  String get profilesShareLocationDenied => '未获得定位权限，共享保持关闭。';

  @override
  String get profilesShareLocationOn => '已在本设备开启位置共享';

  @override
  String get profilesDelete => '删除';

  @override
  String get profilesDeleteTitle => '删除配置文件？';

  @override
  String profilesDeleteBody(String name) {
    return '删除 $name？其沙箱与工作区配置将被移除，且无法撤销。';
  }

  @override
  String get profilesDeleteConfirm => '删除';

  @override
  String profilesDeleteDone(String name) {
    return '已删除 $name';
  }

  @override
  String get profilesDeleteOwnerBlocked => '无法删除户主。请先转让所有权。';

  @override
  String get profilesTransferTitle => '转让户主？';

  @override
  String profilesTransferBody(String name) {
    return '将 $name 设为户主。其将管理配对、绑定与家庭设置。';
  }

  @override
  String get profilesTransferConfirm => '转让';

  @override
  String profilesTransferDone(String name) {
    return '户主现为 $name';
  }

  @override
  String profilesTransferFailed(String error) {
    return '转让失败：$error';
  }

  @override
  String profilesTransferTo(String name) {
    return '转让给 $name';
  }

  @override
  String get profilesToolPolicy => '工具策略';

  @override
  String get profilesToolPolicyStandard => '标准';

  @override
  String get profilesToolPolicyRestricted => '受限';

  @override
  String get connMintPairing => '生成配对码';

  @override
  String get connMintOk => '已生成配对码';

  @override
  String get connMintUriHint => '在新设备上扫描或粘贴此 URI。';

  @override
  String get connPairingOwnerOnly => '生成/吊销配对码需要户主设备。';

  @override
  String get connRevokeDevice => '吊销';

  @override
  String get connForgetDevice => '遗忘';

  @override
  String connRevokeConfirm(String id) {
    return '吊销设备 $id？需重新配对。';
  }

  @override
  String connForgetConfirm(String id) {
    return '遗忘设备 $id？配对记录将永久删除。';
  }

  @override
  String get connOwnerWriteOnly => '仅户主设备可更改此设置。';

  @override
  String get connAccountsHint => '家庭配置文件';

  @override
  String get homeChatSessionTitle => '手机家庭聊天';

  @override
  String get homeChatEmptyTitle => '与家庭对话';

  @override
  String get homeChatEmptyHint => '智能家居工具在此可用。执行操作仍需审批。';

  @override
  String get homeChatHint => '可询问灯光、门锁、温控…';

  @override
  String get schedulesChatSessionTitle => '日程';

  @override
  String get schedulesChatEmptyTitle => '提醒';

  @override
  String get schedulesChatEmptyHint => '这个对话专注提醒。时间会在启用前确认。';

  @override
  String get schedulesChatHint => '提醒我…';

  @override
  String get chatAttach => '附加';

  @override
  String chatAttachTooMany(int n) {
    return '最多 $n 个文件';
  }

  @override
  String chatAttachTooLarge(String name, String mb) {
    return '$name 超过 $mb MB';
  }

  @override
  String chatAttachAdded(int n) {
    return '已附加 $n 个文件';
  }

  @override
  String get chatAttachedOnly => '（附件）';

  @override
  String get chatVoiceStart => '听写';

  @override
  String get chatVoiceStop => '停止听写';

  @override
  String get chatVoiceUnsupported => '此设备不支持语音识别。';

  @override
  String get llmTabModels => '模型';

  @override
  String get llmTabLocal => '本地';

  @override
  String get llmTabRouting => '路由';

  @override
  String get llmTabMemory => '记忆';

  @override
  String get llmLocalDownloadHint => '在 Hugging Face 搜索并将 GGUF 文件下载到家庭主机。';

  @override
  String get llmHfSearchHint => '搜索模型…';

  @override
  String get llmSearch => '搜索';

  @override
  String get llmCancelDownload => '取消';

  @override
  String get llmResumeDownload => '继续';

  @override
  String llmGgufFiles(String repo) {
    return '$repo 中的 GGUF';
  }

  @override
  String get llmRoutingHint => '选择此配置文件允许的运行位置。';

  @override
  String get llmFilterAny => '智能 / 任意';

  @override
  String get llmFilterCloud => '仅云端';

  @override
  String get llmFilterLocal => '仅本地';

  @override
  String get llmAutoSwitch => '自动切换模型';

  @override
  String get privacyModeTitle => '隐私模式';

  @override
  String get privacyModeHint => '强制本地推理并阻止云端工具。需户主权限。';

  @override
  String get privacyModeEnabled => '启用隐私模式';

  @override
  String get privacyModeBlockEgress => '同时阻止智能家居执行与事件源通知';

  @override
  String get privacyModeOwnerOnly => '本设备上隐私模式仅限户主。';

  @override
  String get llmCompactNow => '立即压缩记忆';

  @override
  String get llmFlushEnabled => '刷新常驻笔记';

  @override
  String get llmReviewEnabled => '学习写入前先审核';

  @override
  String get llmInjectMode => '注入预算模式';

  @override
  String get llmInjectAuto => '自动';

  @override
  String get llmInjectBaseline => '基线';

  @override
  String get llmInjectCustom => '自定义';

  @override
  String get llmPendingLearns => '待学习项';

  @override
  String get llmNoPendingLearns => '无待学习项。';

  @override
  String get connTabPairing => '配对';

  @override
  String get connTabHa => 'Home Assistant';

  @override
  String get connTabMqtt => 'MQTT';

  @override
  String get connTabChannels => '频道';

  @override
  String get connTabWebSearch => '网页搜索';

  @override
  String get connTabMcp => 'MCP';

  @override
  String get connTabBrowser => '浏览器';

  @override
  String get mcpLede =>
      '可添加任意 MCP 服务器。启用前请先测试连接。Stdio 命令以守护进程主机用户运行。工具调用仍受审批约束。';

  @override
  String get mcpTest => '测试';

  @override
  String get mcpAddServer => '添加服务器';

  @override
  String get mcpSave => '保存';

  @override
  String get mcpReady => '就绪';

  @override
  String get mcpNotTested => '未测试';

  @override
  String mcpServerSubtitle(String transport, String status, int count) {
    return '$transport · $status · $count 个工具';
  }

  @override
  String mcpTestOk(int count) {
    return '成功 — $count 个工具。就绪后可启用。';
  }

  @override
  String mcpTestFailed(String error) {
    return '失败：$error';
  }

  @override
  String get mcpUnknownError => '未知';

  @override
  String get connDeviceRevoked => '已撤销';

  @override
  String connDeviceSubtitle(String id, String accounts, String revokedSuffix) {
    return '$id · $accounts$revokedSuffix';
  }

  @override
  String get mcpLabel => '标签';

  @override
  String get mcpCommand => '命令';

  @override
  String get mcpArgs => '参数（空格分隔，可选）';

  @override
  String get mcpUrl => 'URL';

  @override
  String get mcpAuthToken => '认证令牌（可选）';

  @override
  String get mcpEnv => '环境变量（每行 KEY=value，可选）';

  @override
  String get browserControlLede =>
      '在家庭电脑上控制托管浏览器（自动优先 Obscura，否则 Chromium），或连接个人 Chrome / 远程 CDP。默认关闭。';

  @override
  String get browserControlDaemonHostNote =>
      '浏览器会话在家庭电脑上运行。此处设置与桌面「连接 → 浏览器」同步。';

  @override
  String get browserControlEnabled => '启用 browser 工具';

  @override
  String get browserControlUnattended => '允许托管配置用于计划任务';

  @override
  String get browserControlReady => '就绪';

  @override
  String get browserControlNotReady => '未就绪';

  @override
  String get browserControlSave => '保存';

  @override
  String get browserControlSaved => '浏览器设置已保存。';

  @override
  String get browserControlSaveFailed => '无法保存浏览器设置。';

  @override
  String get browserControlDefaultProfile => '默认配置';

  @override
  String get browserControlProfileManaged => '托管（隔离）';

  @override
  String get browserControlProfilePersonal => '个人 Chrome';

  @override
  String get browserControlProfileRemote => '远程 CDP';

  @override
  String get browserControlElevatedWarn => '个人/远程可在已登录网站以你的身份操作。仅户主；不可定时任务。';

  @override
  String get browserControlAcknowledge => '我了解浏览器高风险模式';

  @override
  String get browserControlPersonalEnabled => '启用个人 Chrome';

  @override
  String get browserControlPersonalCdp => '个人 CDP（本机回环）';

  @override
  String get browserControlPersonalReady => '个人 CDP 已就绪';

  @override
  String get browserControlPersonalNotReady => '个人 CDP 未就绪';

  @override
  String get browserControlRemoteEnabled => '启用远程 CDP';

  @override
  String get browserControlRemoteCdp => '远程 CDP URL';

  @override
  String get browserControlRemoteToken => '远程 CDP 令牌';

  @override
  String get browserControlTokenSet => '已设置';

  @override
  String get browserControlTokenPlaceholder => '留空则保留原值';

  @override
  String get browserControlRemoteReady => '远程 CDP 已就绪';

  @override
  String get browserControlRemoteNotReady => '远程 CDP 未就绪';

  @override
  String get browserControlOwnerOnly => '仅户主设备可更改浏览器控制设置。';

  @override
  String get browserControlAcknowledged => '已确认高风险。禁用个人/远程即可停止使用。';

  @override
  String get webSearchLede =>
      '在对话中搜索公开网页。默认：先 DuckDuckGo，失败或未配置时用浏览器打开 Bing/Google/百度（无需 API 密钥）。Brave / Tavily 需要 Owner 密钥。';

  @override
  String get webSearchEnabled => '启用 web_search';

  @override
  String get webSearchProvider => '提供商';

  @override
  String get webSearchProviderBrowser => '浏览器（Bing / Google / Baidu）';

  @override
  String get webSearchBrowserPrimaryHint =>
      '直接在守护进程主机的无头引擎打开 Bing/Google/百度（有 Obscura 优先，否则 Chromium）。对话中每次搜索会询问一次。';

  @override
  String get webSearchDaemonHostNote =>
      '搜索引擎与页面深入在运行 EnvoyHome 的家庭电脑上执行。手机只查看并由 Owner 编辑共享设置。';

  @override
  String get webSearchEffectiveUnresolved => '尚未就绪';

  @override
  String get webSearchApiKey => 'API 密钥';

  @override
  String get webSearchApiKeyHint => '留空则保留现有密钥';

  @override
  String get webSearchReady => '就绪';

  @override
  String get webSearchNotReady => '未就绪';

  @override
  String get webSearchSave => '保存';

  @override
  String get webSearchSaved => '网页搜索设置已保存。';

  @override
  String get webSearchSaveFailed => '无法保存网页搜索设置。';

  @override
  String get webSearchOwnerOnly => '仅家庭 Owner 设备可修改网页搜索。';

  @override
  String get webSearchBrowserFallback =>
      '浏览器回退（API/DDG 失败或未配置时用 Bing/Google/百度）';

  @override
  String get webSearchBrowserFallbackHint =>
      '默认开启，便于零配置搜索。对话中进入浏览器回退仍会询问。SERP 页面可能验证码或拦截。';

  @override
  String get webSearchResearchEnabled => '网页研究（搜索后再深入抓取前几条）';

  @override
  String get webSearchResearchHint =>
      '默认关闭。开启后提供 web_research：深入抓取前几条结果，返回整理摘要 + 链接列表。';

  @override
  String get webSearchDigDepth => '深入条数（1–10）';

  @override
  String get webSearchExtractBackend => '页面提取后端';

  @override
  String get webSearchExtractBackendAuto => '自动（有 Obscura 则用，否则 HTTP）';

  @override
  String get webSearchExtractBackendFetch => 'HTTP 抓取';

  @override
  String get webSearchExtractBackendObscura => 'Obscura（渲染 JS 后转 Markdown）';

  @override
  String get webSearchExtractBackendHint => '自动优先用守护进程上的 Obscura，否则纯 HTTP 抓取。';

  @override
  String get webSearchEffectiveExtract => '当前实际提取后端';

  @override
  String get webSearchObscuraReady => '守护进程主机上 Obscura 已就绪';

  @override
  String get webSearchObscuraMissing => '守护进程主机上未安装 Obscura';

  @override
  String get webSearchObscuraInstallHintNote =>
      '桌面版自带 Obscura（或守护进程首次启动自动安装）。如需覆盖，请在运行 EnvoyHome 的家庭电脑上设置 ENVOYHOME_OBSCURA / PATH（不要在手机上），然后重新打开设置。';

  @override
  String get webSearchSerpBrowserEngine => '浏览器搜索引擎';

  @override
  String get webSearchSerpBrowserEngineAuto => '自动（有 Obscura 则用，否则 Chromium）';

  @override
  String get webSearchSerpBrowserEngineChromium => 'Chromium';

  @override
  String get webSearchSerpBrowserEngineObscura => 'Obscura';

  @override
  String get webSearchSerpBrowserEngineHint =>
      '自动优先 Obscura 打开 Bing/Google/百度，否则 Playwright Chromium。';

  @override
  String get webSearchEffectiveSerp => '当前实际 SERP 引擎';

  @override
  String get browserControlManagedEngine => '托管浏览器引擎';

  @override
  String get browserControlManagedEngineAuto => '自动（有 Obscura 则用，否则 Chromium）';

  @override
  String get browserControlManagedEngineChromium => 'Chromium';

  @override
  String get browserControlManagedEngineObscura => 'Obscura';

  @override
  String get browserControlManagedEngineHint =>
      '托管配置自动优先 Obscura。个人/远程始终连接真实 Chrome CDP。';

  @override
  String get browserControlEffectiveManaged => '当前实际托管引擎';

  @override
  String get webSearchEngines => '搜索引擎（顺序：Bing → Google → 百度）';

  @override
  String get webSearchEnginesHint => '浏览器回退时按勾选顺序尝试，直到某个引擎返回结果。';

  @override
  String get webSearchEnginesRequired => '请至少选择 Bing、Google 或百度之一。';

  @override
  String get webSearchEngineBing => 'Bing';

  @override
  String get webSearchEngineGoogle => 'Google';

  @override
  String get webSearchEngineBaidu => '百度';

  @override
  String get webSearchBrowserReady => '守护进程主机上 Playwright Chromium 已就绪';

  @override
  String get webSearchBrowserMissing => '守护进程主机上未安装 Playwright Chromium';

  @override
  String get webSearchInstallHintNote =>
      'Playwright 已随守护进程提供。请在运行 EnvoyHome 的家庭电脑上下载 Chromium（不要在手机上），然后重新打开设置；若状态仍显示未安装，请重启守护进程。';

  @override
  String get webSearchCopyHint => '复制安装命令';

  @override
  String get webSearchUnattendedBrowser => '允许计划任务使用浏览器回退';

  @override
  String get connPairingHint => '家庭 Owner 设备可在此签发或撤销配对。成员仅可查看状态。';

  @override
  String get connNoDevices => '暂无已配对设备。';

  @override
  String get connEnabled => '已启用';

  @override
  String get connDisabled => '已禁用';

  @override
  String get connReady => '就绪';

  @override
  String get connHealthy => '健康';

  @override
  String get connUnhealthy => '异常';

  @override
  String get connHaUrl => 'HA 基础 URL';

  @override
  String get connHaToken => '访问令牌';

  @override
  String get connMqttUrl => 'Broker URL';

  @override
  String get connMqttPassword => '密码';

  @override
  String get connSaveEnable => '保存并启用';

  @override
  String get connBindTitle => '对象绑定';

  @override
  String connBoundTo(String id) {
    return '已绑定 $id';
  }

  @override
  String get connUnbound => '未绑定';

  @override
  String get connChannelsHint => '粘贴 Bot 令牌并启用。首次设置建议在桌面端完成。';

  @override
  String get connBotToken => 'Bot 令牌';

  @override
  String get connDisable => '禁用';

  @override
  String get connSenderBinds => '发送方 → 配置文件';

  @override
  String get connSenderBindsHint => '将 IM 发送方 ID 关联到当前配置文件。';

  @override
  String get connBindChannel => '频道';

  @override
  String get connChannelAccount => '频道账户';

  @override
  String get connSenderId => '发送方 ID';

  @override
  String get connBindSender => '绑定发送方';

  @override
  String get skillsTabSkills => '技能';

  @override
  String get skillsVerify => '验证';

  @override
  String get skillsVerified => '技能已验证';

  @override
  String get skillsTabWorkflows => '工作流';

  @override
  String get skillsTabSchedules => '日程';

  @override
  String get skillsTabScenes => '场景';

  @override
  String get schedulesTabJobs => '任务';

  @override
  String get scenesHint => '何时 → 执行家庭自动化（家庭规则）。在场模板需隐私模式。';

  @override
  String get scenesWhenPresence => '在场（无 cron — 传感器触发）';

  @override
  String get scenesNone => '暂无场景。';

  @override
  String get scenesAddMorning => '添加早安';

  @override
  String get scenesPrivacyRequired => '请先启用隐私模式（LLM → 路由）再使用在场场景。';

  @override
  String get skillsInstallUrl => '从 URL 安装';

  @override
  String get skillsInstall => '安装';

  @override
  String get skillsClawHubSearch => 'ClawHub 搜索';

  @override
  String get schedWhenHint => '何时（自然语言）';

  @override
  String get schedMessageHint => '提醒内容';

  @override
  String get schedPropose => '提议';

  @override
  String get schedConfirm => 'Confirm reminder';

  @override
  String get scheduleCardTitle => '设置这个提醒？';

  @override
  String get scheduleCardConfirm => '确认';

  @override
  String get scheduleCardCancel => '取消';

  @override
  String get scheduleCardConfirmedToast => '提醒已设置。';

  @override
  String get scheduleCardCanceledToast => '提醒已取消。';

  @override
  String get scheduleCardFailed => '无法更新该提醒。';

  @override
  String get schedKindNotify => '通知';

  @override
  String get schedKindWorkflow => '工作流';

  @override
  String get schedKindTool => '工具';

  @override
  String get schedWorkflowId => '工作流 ID';

  @override
  String get schedToolName => '工具名称';

  @override
  String get schedKindAgent => '代理';

  @override
  String get schedAgentPrompt => '代理提示词';

  @override
  String get schedTabRepeating => '重复';

  @override
  String get schedTabOnce => '一次';

  @override
  String get schedTabHistory => '历史';

  @override
  String get schedNoneRepeating => '暂无重复日程。可试「每周一上午9点」。';

  @override
  String get schedNoneOnce => '暂无一次性提醒。可试「明天上午8点」。';

  @override
  String get schedNoReceipts => '暂无运行记录。';

  @override
  String get schedHistoryNotSet => '未设置';

  @override
  String get schedHistoryRuns => '运行记录';

  @override
  String get schedNoDismissed => '暂无已取消的提议。';

  @override
  String get schedDismissedCanceled => '已取消';

  @override
  String get schedDismissedExpired => '已过期';

  @override
  String get schedNext => '下次';

  @override
  String get schedKindRepeating => '重复';

  @override
  String get schedKindOnce => '一次';

  @override
  String get schedKindDaily => '每天';

  @override
  String get schedKindWeekdays => '工作日';

  @override
  String get schedKindWeekly => '每周';

  @override
  String get schedKindMonthly => '每月';

  @override
  String get schedKindYearly => '每年';

  @override
  String get schedKindEvery => '每';

  @override
  String schedDayOfMonth(String d) {
    return '$d号';
  }

  @override
  String get wfEditorTitle => '工作流';

  @override
  String get wfEnable => '启用';

  @override
  String get wfDisable => '禁用';

  @override
  String get wfTools => '插入工具';

  @override
  String get wfId => '工作流 ID';

  @override
  String get wfAiPrompt => '描述工作流';

  @override
  String get wfAiPromptHint => '例如：若家中无人则在晚上 11 点关灯';

  @override
  String get wfAiDraft => 'AI 起草';

  @override
  String get wfDiagramNodes => '节点（手机示意图）';

  @override
  String get wfNoNodes => '尚无节点 — 请起草或粘贴 YAML。';

  @override
  String get wfYaml => 'YAML';

  @override
  String get wfSave => '验证并保存';

  @override
  String get wfRun => '试跑';

  @override
  String get wfDrafted => '已应用草稿';

  @override
  String get wfSaved => '已保存';

  @override
  String get wfRan => '已开始运行';

  @override
  String get sysTabFiles => '文件';

  @override
  String get sysTabHealth => '健康检查';

  @override
  String get sysTabGrants => '授权';

  @override
  String get sysTabMachine => '本机';

  @override
  String get sysMachineHint =>
      '来自 home.health 的守护进程监听状态。安装/重启 OS 服务仅限家庭桌面本机回环，不可经 mesh 操作。';

  @override
  String get sysMachineDaemonOk => '守护进程可达';

  @override
  String get sysMachineDaemonBad => '健康检查失败';

  @override
  String get sysMachineWsPort => 'WebSocket 端口';

  @override
  String get sysMachineHttpPort => 'HTTP hatch 端口';

  @override
  String get sysMachinePublicUrl => '公网基础 URL';

  @override
  String get sysMachinePublicUrlEmpty => '未设置';

  @override
  String get sysMachineUptime => '运行时长';

  @override
  String get sysMachineConnections => '客户端 / 进行中回合';

  @override
  String get sysMachineMesh => 'Mesh';

  @override
  String get sysMachineOsServiceNote =>
      '请在桌面 设置 → 系统 → 本机 安装或重启 OS 服务（loopback-owner）。';

  @override
  String get sysMachineRefresh => '刷新';

  @override
  String get sysTestPush => '发送测试推送';

  @override
  String get sysTestPushSent => '已请求测试推送';

  @override
  String get wfModeYaml => 'YAML';

  @override
  String get wfModeDiagram => '图示';

  @override
  String get wfDiagramEmpty => '暂无步骤 — 请草稿或编辑 YAML。';

  @override
  String get wfDiagramEdge => '↓';

  @override
  String get sysDoctorFix => '修复';

  @override
  String get sysDoctorFixAll => '全部修复';

  @override
  String sysDoctorFixed(String ids) {
    return '已修复：$ids';
  }

  @override
  String get sysNoIssues => '无诊断问题。';

  @override
  String get sysNoGrants => '无授权。';

  @override
  String get chatNeedAccount => '请先在上方选择资料再聊天。';

  @override
  String get chatEmptyMessage => '消息为空。';

  @override
  String get chatSessionTitle => '手机聊天';

  @override
  String get chatEmptyTitle => '给家庭智能体发消息';

  @override
  String get chatEmptyHint => '回合在家庭守护进程上运行。需要许可时，允许/拒绝会出现在这里。';

  @override
  String get chatHint => '消息…';

  @override
  String get chatThought => '思考过程';

  @override
  String get chatNew => '新对话';

  @override
  String get chatNewNamePrompt => '对话名称';

  @override
  String get chatNewNamePlaceholder => '例如：周末计划';

  @override
  String get chatNewNameHint => '现在命名，或不命名直接开始（将用第一条消息作为标题）。';

  @override
  String get chatNewSkip => '不命名开始';

  @override
  String get chatNewCreate => '创建';

  @override
  String get chatNewNeedName => '请输入名称，或选择「不命名开始」。';

  @override
  String get chatNewStart => '开始对话';

  @override
  String get chatOpenArtifact => '打开完整回复';

  @override
  String get chatPromoteKnowledge => '加入知识库';

  @override
  String chatPromotedKnowledge(String path) {
    return '已保存至 $path';
  }

  @override
  String get chatPromoteFailed => '无法加入知识库。';

  @override
  String get chatRecents => '最近';

  @override
  String get chatRecentsEmpty => '暂无更早的对话。';

  @override
  String get chatSessionsEmpty => '暂无对话。开始一个新对话吧。';

  @override
  String get chatUntitled => '未命名对话';

  @override
  String get chatRenameAction => '重命名';

  @override
  String get chatRenamePrompt => '对话名称';

  @override
  String get chatRenameDone => '已重命名。';

  @override
  String get chatRenameEmpty => '名称不能为空。';

  @override
  String get chatRenameNeedSession => '请先发送一条消息，再重命名。';

  @override
  String get chatBusyTurn => '请等待当前回复完成（或取消）。';

  @override
  String get chatEmptyAction => '清空对话';

  @override
  String get chatEmptyConfirmTitle => '清空此对话？';

  @override
  String get chatEmptyConfirmBody => '将删除本线程中的全部消息，对话本身保留。';

  @override
  String get chatTrashMenu => '对话操作';

  @override
  String get chatArchiveAction => '归档对话';

  @override
  String get chatUnarchiveAction => '恢复到对话列表';

  @override
  String get chatUnarchiveDone => '已恢复对话。';

  @override
  String get chatArchivedOpen => '已归档';

  @override
  String get chatTabActive => '聊天';

  @override
  String get chatTabArchived => '已归档';

  @override
  String get homeFolderTitle => '选择文件夹';

  @override
  String get homeFolderSelect => '选择';

  @override
  String get homeFolderDrives => '磁盘';

  @override
  String get homeFolderComputer => '此电脑';

  @override
  String get homeFolderHome => '主目录';

  @override
  String get homeFolderParent => '上级文件夹';

  @override
  String get homeFolderNoSubfolders => '没有子文件夹';

  @override
  String get chatArchivedTitle => '已归档对话';

  @override
  String get chatArchivedBack => '返回对话列表';

  @override
  String get chatArchivedEmpty => '没有已归档的对话。';

  @override
  String get chatRemoveAction => '删除对话';

  @override
  String get chatArchiveConfirmTitle => '归档此对话？';

  @override
  String get chatArchiveConfirmBody =>
      '会从「对话」列表消失，但仍保留在磁盘上。可打开「已归档」恢复或删除。归档不会抹掉消息。';

  @override
  String get chatRemoveConfirmTitle => '删除此对话？';

  @override
  String get chatRemoveConfirmBody => '永久删除此对话及其全部消息。此操作不可撤销。';

  @override
  String get chatRemoveDone => '对话已删除。';

  @override
  String get chatNoSession => '尚无活动对话。';

  @override
  String get chatDeleteFailed => '服务器未能删除该消息。';

  @override
  String get chatDeleteMessage => '删除消息';

  @override
  String get chatCopyMessage => '复制消息';

  @override
  String get chatCopied => '已复制';

  @override
  String get chatCancel => '取消';

  @override
  String chatSubscribeFailed(String error) {
    return '订阅失败：$error';
  }

  @override
  String chatStatus(String status) {
    return '状态：$status';
  }

  @override
  String chatError(String error) {
    return '错误：$error';
  }

  @override
  String get approvalsTitle => '审批';

  @override
  String get approvalsHint => '等待决定的工具与执行请求。';

  @override
  String get approvalsNeedAccount => '请先选择资料以加载审批。';

  @override
  String get approvalsEmptyTitle => '收件箱为空';

  @override
  String get approvalsEmptyHint => '当前没有待处理项。';

  @override
  String get approvalsActuation => '执行';

  @override
  String get approvalsAllow => '允许';

  @override
  String get approvalsDeny => '拒绝';

  @override
  String get approvalsAllowed => '已允许';

  @override
  String get approvalsDenied => '已拒绝';

  @override
  String approvalsFailed(String error) {
    return '失败：$error';
  }

  @override
  String get modelsTitle => '模型';

  @override
  String get modelsOwnerHint => '在家庭主机上启用本地或 Ollama。首次设置建议用桌面。';

  @override
  String get modelsReadonlyHint => '此设备只读。请在桌面设置 → 模型（或受信任的机主手机）启用本地。';

  @override
  String get modelsLocal => '本地模型';

  @override
  String get modelsOwnerTrusted => '本地引擎状态需要受信任的机主设备。';

  @override
  String get modelsResponding => '响应中';

  @override
  String get modelsNotResponding => '无响应';

  @override
  String get modelsDisabled => '已禁用';

  @override
  String get modelsGguf => '磁盘上的 GGUF';

  @override
  String get modelsEnableLocal => '启用本地';

  @override
  String get modelsUseOllama => '使用 Ollama';

  @override
  String get modelsDisable => '禁用';

  @override
  String get modelsLocalOnly => '账号仅本地';

  @override
  String get modelsThisAccount => '此账号';

  @override
  String get modelsNeedAccount => '请先在上方设置 accountId。';

  @override
  String modelsDefault(String id) {
    return '默认：$id';
  }

  @override
  String modelsPool(String filter) {
    return '池：$filter';
  }

  @override
  String get modelsModeMesh => 'Mesh 本地';

  @override
  String get modelsModeSpawn => 'Home llama-server';

  @override
  String get modelsModeOllama => 'Ollama';

  @override
  String get modelsModeOff => '关闭';

  @override
  String get modelsNotConnected => '未连接';

  @override
  String get modelsSetAccount => '设置 accountId 以查看默认模型与池。';

  @override
  String get modelsUpdated => '已更新';

  @override
  String get modelsLocalEnabled => '本地已启用';

  @override
  String get modelsOllamaEnabled => 'Ollama 已启用';

  @override
  String get modelsLocalDisabled => '本地已禁用';

  @override
  String get modelsLocalOnlySet => '已设为仅本地路由';

  @override
  String get modelsDefaultLabel => '默认';

  @override
  String get modelsOffLabel => '关';

  @override
  String get modelsTest => '测试';

  @override
  String get modelsSetDefault => '设为默认';

  @override
  String modelsTestOk(String id) {
    return '已测试 $id';
  }

  @override
  String modelsDefaultSet(String id) {
    return '默认 → $id';
  }

  @override
  String get artifactsTitle => '文件';

  @override
  String get artifactsHint => '浏览此资料可访问的文件夹。可在应用内打开、分享/保存，或在有签名链接时用浏览器打开。';

  @override
  String get artifactsNeedAccount => '请先选择账户以浏览文件。';

  @override
  String get artifactsEmptyTitle => '暂无文件夹';

  @override
  String get artifactsEmptyHint => '下拉刷新。若已为此资料配置工作区，将显示 workspace。';

  @override
  String get artifactsUrlCopied => '无法打开 — 已复制 URL';

  @override
  String artifactsOpenFailed(String error) {
    return '打开失败：$error';
  }

  @override
  String get artifactsTooLarge => '此文件超过应用内 8 MB 打开上限。请让代理导出较小文件，或在家庭主机上打开。';

  @override
  String get artifactsRefresh => '刷新';

  @override
  String get artifactsRetry => '重试';

  @override
  String get artifactsBinaryHint =>
      '此文件类型暂不支持预览。可用「分享/保存」在其他应用中打开，或请家庭智能体导出为文本或 Markdown。';

  @override
  String get artifactsShare => '分享 / 保存';

  @override
  String artifactsShareFailed(String error) {
    return '无法分享：$error';
  }

  @override
  String get artifactsCopyLink => '复制签名链接';

  @override
  String get artifactsLinkCopied => '已复制签名链接';

  @override
  String get artifactsCopyLinkFailed => '无法复制链接';

  @override
  String get artifactsOpenInBrowser => '在浏览器中打开';

  @override
  String get artifactsOpenInBrowserFailed => '无法在浏览器中打开';

  @override
  String get filesParent => '上级';

  @override
  String get filesRoots => '根目录';

  @override
  String get filesEmptyFolder => '此文件夹为空';

  @override
  String get artifactsLoTitle => 'LibreOffice（家庭电脑）';

  @override
  String get artifactsLoWhy =>
      '打印级 Word / Excel / PowerPoint / PDF 导出在家庭电脑本地完成（约 1 GB，不出门）。未安装时仍可用较简布局导出。文档不会上传到云端转换。';

  @override
  String get artifactsLoReady => '已就绪';

  @override
  String get artifactsLoMissing => '未安装';

  @override
  String get artifactsLoDownloading => '下载中…';

  @override
  String get artifactsLoFailed => '安装失败';

  @override
  String get artifactsLoInstall => '在家庭电脑安装';

  @override
  String get artifactsLoCancel => '取消下载';

  @override
  String get artifactsLoNotNow => '暂不';

  @override
  String get artifactsLoRefresh => '刷新状态';

  @override
  String artifactsLoProgress(String received, String total) {
    return '$received / $total';
  }

  @override
  String get artifactsLoHintCopied => '已复制安装提示';

  @override
  String get artifactsLoCopyHint => '复制手动安装提示';

  @override
  String get artifactsLoInstallNote => '托管安装在家庭守护进程主机上执行，不在本手机上。';

  @override
  String get artifactsDataPreferTitle => '数据处理路径（按优先级）';

  @override
  String get artifactsDataPreferStrip =>
      '1）核心表格工具始终可用 · 2）DuckDB 做离线关联 / SQL · 3）Owner MCP 做云表格 / SaaS BI。';

  @override
  String get artifactsDataPreferJoinNeed => '聊天里做离线关联时需要。';

  @override
  String get artifactsDataBrowseTables => '浏览 output/tables';

  @override
  String get artifactsDataBrowseCharts => '浏览 output/charts';

  @override
  String get artifactsSqlTitle => '离线 SQL（DuckDB）';

  @override
  String get artifactsSqlWhy =>
      '在家庭电脑安装 DuckDB，可对沙箱文件做离线 SQL 关联。绝不自动安装——由你点安装。';

  @override
  String get artifactsSqlReady => '已就绪';

  @override
  String get artifactsSqlMissing => '未安装（可选）';

  @override
  String get artifactsSqlDownloading => '下载中…';

  @override
  String get artifactsSqlFailed => '安装失败';

  @override
  String get artifactsSqlCancelled => '已取消下载';

  @override
  String get artifactsSqlInstall => '在家庭电脑安装 DuckDB';

  @override
  String get artifactsSqlCancel => '取消下载';

  @override
  String get artifactsSqlRefresh => '刷新状态';

  @override
  String artifactsSqlProgress(String received, String total) {
    return '$received / $total';
  }

  @override
  String get artifactsSqlToolsReady => '智能体可使用 sql_load / sql_query。';

  @override
  String get artifactsSqlToolsAbsent =>
      '在 DuckDB 就绪前，sql_load / sql_query 不会出现在智能体工具目录中。';

  @override
  String get artifactsSqlInstallNote => '托管安装在家庭守护进程主机上执行，不在本手机上。';

  @override
  String get chatDataAssistHint => '已附加表格——选下一步（只预填输入框；写入仍需审批）：';

  @override
  String get chatDataAssistClean => '清洗并出图';

  @override
  String get chatDataAssistAsk => '问这张表';

  @override
  String get chatDataAssistJoin => '关联 / SQL';

  @override
  String get chatDataAssistInstallDuckdb => '安装 DuckDB…';

  @override
  String get chatDataAssistCleanSeed =>
      '用 table_transform 清洗附件表格（按需 normalize / filter / pipeline），再 chart_table，并给我 CSV 与图表的打开芯片。';

  @override
  String get chatDataAssistAskSeed => '附件表格里有什么？总结列、行数和几行样例。';

  @override
  String get chatDataAssistJoinSeed =>
      '用 sql_load 加载附件表格，再用 sql_query 回答（若再附加表则做关联）。结果 CSV 请给出打开芯片。';

  @override
  String get chatDataAssistNeedDuckdb => 'DuckDB 尚未就绪——请到「系统 → 文件」在家庭电脑上安装。';

  @override
  String chatOpenFile(String name) {
    return '打开 $name';
  }

  @override
  String chatPendingApprovals(int count) {
    return '$count 项等待你的批准';
  }

  @override
  String get choiceCardConfirm => '确认';

  @override
  String get choiceCardOpen => '打开';

  @override
  String get choiceCardChooseFile => '选择文件';

  @override
  String get choiceCardBrowseJail => '浏览文件';

  @override
  String get choiceCardBrowseUp => '上级';

  @override
  String choiceCardFilesChosen(int n) {
    return '已选 $n 个文件';
  }

  @override
  String get choiceCardNoFile => '未选择文件';

  @override
  String get choiceCardFileEmpty => '文件为空。';

  @override
  String choiceCardFileTypeRefused(String name) {
    return '$name 不是允许的表单上传类型。';
  }

  @override
  String get choiceCardHandoffHint => '将在浏览器或 App 中打开以便你完成并付款。Home 不会填写银行卡信息。';

  @override
  String get choiceCardPickOne => '请至少选一项。';

  @override
  String get choiceCardAnswered => '已收到。';

  @override
  String choiceCardFailed(String error) {
    return '无法提交该选择：$error';
  }

  @override
  String chatPendingChoices(int count) {
    return '$count 项等待你的选择';
  }

  @override
  String get choiceCardCancel => '取消';

  @override
  String get choiceCardCanceled => '已取消选择。';

  @override
  String get choiceCardExpired => '已过期';

  @override
  String get choiceCardExpiredHint => '该选择已过期 — 如仍需要请再问一次。';

  @override
  String choiceCardExpiresIn(int mins) {
    return '$mins 分钟后过期';
  }

  @override
  String get choiceCardTextPlaceholder => '输入你的回答';

  @override
  String get schedulesChatTabChat => '聊天';

  @override
  String get schedulesChatTabHistories => '历史';

  @override
  String get schedulesChatHistoriesHint => '已取消的提议，以及近期运行记录。';

  @override
  String get jobsHistoriesMovedHint => '未设置与运行在「历史」';

  @override
  String schedulesChatClosedAt(String when) {
    return '关闭于 $when';
  }

  @override
  String schedulesChatRanAt(String when) {
    return '运行于 $when';
  }

  @override
  String get welcomeSkip => '跳过';

  @override
  String get welcomeNext => '下一步';

  @override
  String get commonContinue => '继续';

  @override
  String get welcomeSlide1Title => '欢迎使用 EnvoyHome';

  @override
  String get welcomeSlide1Body => '手机是通往自托管家庭智能体的窗口 — 聊天、审批和智能家居控制都留在家中桌面上。';

  @override
  String get welcomeSlide2Title => '工作在电脑上完成';

  @override
  String get welcomeSlide2Body =>
      '在家中的 Mac 或 PC 上安装 EnvoyHome。守护进程、模型和家庭记忆都在那台机器上 — 手机只是远程窗口。';

  @override
  String get welcomeSlide3Title => '用二维码配对';

  @override
  String get welcomeSlide3Body =>
      '在电脑上打开 EnvoyHome 并显示配对二维码。在本手机上点「立即配对」并扫描。也可以粘贴配对链接。';

  @override
  String get welcomeSlideRequiredTitle => '先完成配对';

  @override
  String get welcomeSlideRequiredBody =>
      'EnvoyHome 需要一台运行桌面应用的电脑。智能体与家庭控制在那里运行 — 请将本手机与那台电脑配对后再继续。';

  @override
  String get setupGuideTitle => 'EnvoyHome 使用说明';

  @override
  String get setupGuideIntro =>
      '手机上的 EnvoyHome 与家中电脑上的 EnvoyHome 通信。安装桌面应用、配对一次，即可随时聊天与审批。';

  @override
  String get setupGuidePairRequiredTitle => '配对后继续';

  @override
  String get setupGuidePairRequiredBody =>
      'EnvoyHome 是家中桌面的手机伴侣。未配对电脑时，这里还没有可显示的内容。';

  @override
  String get setupGuideStep1Title => '准备一台电脑';

  @override
  String get setupGuideStep1Body =>
      '需要一台家中的 Mac 或 Windows/Linux PC。那台机器将成为 EnvoyHome 主机 — 守护进程与智能体在此运行。';

  @override
  String get setupGuideStep2Title => '下载并安装 EnvoyHome';

  @override
  String get setupGuideStep2Body => '打开 QuickStart，在那台电脑上安装守护进程和桌面应用。启动并保持运行。';

  @override
  String get setupGuideDownloadCta => '打开 EnvoyHome QuickStart';

  @override
  String get setupGuideStep3Title => '显示配对二维码';

  @override
  String get setupGuideStep3Body =>
      '在桌面版 EnvoyHome 中打开「设置 → 配对设备」。保持二维码显示（应包含 mesh/中继，而非仅局域网）。';

  @override
  String get setupGuideStep4Title => '用本手机扫描';

  @override
  String get setupGuideStep4Body =>
      '点下方「立即配对」。允许相机权限后扫描二维码。也可以粘贴 envoy:// 配对链接，或使用主机:端口 / SSH。';

  @override
  String get setupGuideStep5Title => '连接完成';

  @override
  String get setupGuideStep5Body =>
      '配对完成后，本手机将显示该家庭的聊天、审批与设置。无论手机是否在线，桌面都会继续运行。';

  @override
  String get setupGuideNoHomeTitle => '稍后配对也可以';

  @override
  String get setupGuideNoHomeBody => '可以先继续浏览，之后随时从「连接」配对。未配对电脑时，这里还没有可显示的内容。';

  @override
  String get setupGuidePairCta => '立即配对';

  @override
  String get setupGuidePairLaterCta => '暂不配对';

  @override
  String get setupGuideSkipCta => '先看看';

  @override
  String get setupGuideDoneCta => '知道了';

  @override
  String get settingsSetupGuideSubtitle => '如何安装桌面应用并配对本手机。';
}
