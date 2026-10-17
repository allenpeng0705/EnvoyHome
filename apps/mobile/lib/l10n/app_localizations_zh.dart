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
  String get settingsNeedConnect => '先连接家庭主机，再配置 LLM、连接、技能与系统。';

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
  String get shellCreateProfile => 'Create';

  @override
  String get shellProfileDisplayName => 'Display name';

  @override
  String get shellProfileIdOptional => 'Account id (optional)';

  @override
  String get shellCancel => 'Cancel';

  @override
  String get shellCreate => 'Create';

  @override
  String get shellProfileCreated => 'Profile created';

  @override
  String shellProfileCreateFailed(String error) {
    return 'Create failed: $error';
  }

  @override
  String get navChat => '聊天';

  @override
  String get navHomeChat => 'Home';

  @override
  String get navSettings => 'Settings';

  @override
  String get navLlm => 'LLM';

  @override
  String get navConnections => 'Connections';

  @override
  String get navSkills => 'Skills';

  @override
  String get navSystem => 'System';

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
  String get settingsLlmSubtitle => 'Models, Local, Routing, Memory';

  @override
  String get settingsConnectionsSubtitle =>
      'Pairing, Home Assistant, MQTT, Channels';

  @override
  String get settingsSkillsSubtitle => 'Skills, Workflows, Schedules';

  @override
  String get settingsSystemSubtitle => 'Shared files, Health, Grants';

  @override
  String get homeChatSessionTitle => 'Phone home chat';

  @override
  String get homeChatEmptyTitle => 'Talk to your home';

  @override
  String get homeChatEmptyHint =>
      'Smart-home tools stay available here. Approvals still gate actuations.';

  @override
  String get homeChatHint => 'Ask about lights, locks, climate…';

  @override
  String get chatAttach => 'Attach';

  @override
  String chatAttachTooMany(int n) {
    return 'At most $n files';
  }

  @override
  String chatAttachTooLarge(String name, String mb) {
    return '$name exceeds $mb MB';
  }

  @override
  String chatAttachAdded(int n) {
    return 'Attached $n file(s)';
  }

  @override
  String get chatAttachedOnly => '(attachment)';

  @override
  String get chatVoiceStart => 'Dictate';

  @override
  String get chatVoiceStop => 'Stop dictation';

  @override
  String get chatVoiceUnsupported =>
      'Speech recognition is not available on this device.';

  @override
  String get llmTabModels => 'Models';

  @override
  String get llmTabLocal => 'Local';

  @override
  String get llmTabRouting => 'Routing';

  @override
  String get llmTabMemory => 'Memory';

  @override
  String get llmLocalDownloadHint =>
      'Search Hugging Face and download GGUF files onto the home machine.';

  @override
  String get llmHfSearchHint => 'Search models…';

  @override
  String get llmSearch => 'Search';

  @override
  String get llmCancelDownload => 'Cancel';

  @override
  String get llmResumeDownload => 'Resume';

  @override
  String llmGgufFiles(String repo) {
    return 'GGUF in $repo';
  }

  @override
  String get llmRoutingHint => 'Choose where turns may run for this profile.';

  @override
  String get llmFilterAny => 'Smart / any';

  @override
  String get llmFilterCloud => 'Cloud only';

  @override
  String get llmFilterLocal => 'Local only';

  @override
  String get llmAutoSwitch => 'Auto model switch';

  @override
  String get llmCompactNow => 'Compact memory now';

  @override
  String get llmFlushEnabled => 'Flush standing notes';

  @override
  String get llmReviewEnabled => 'Review before learn write';

  @override
  String get llmInjectMode => 'Inject budget mode';

  @override
  String get llmInjectAuto => 'Auto';

  @override
  String get llmInjectBaseline => 'Baseline';

  @override
  String get llmInjectCustom => 'Custom';

  @override
  String get llmPendingLearns => 'Pending learns';

  @override
  String get llmNoPendingLearns => 'No pending learns.';

  @override
  String get connTabPairing => 'Pairing';

  @override
  String get connTabHa => 'Home Assistant';

  @override
  String get connTabMqtt => 'MQTT';

  @override
  String get connTabChannels => 'Channels';

  @override
  String get connPairingHint =>
      'Mint and revoke phones from desktop Settings → Pair devices. This list is read-only on mobile.';

  @override
  String get connNoDevices => 'No paired devices listed.';

  @override
  String get connEnabled => 'Enabled';

  @override
  String get connDisabled => 'Disabled';

  @override
  String get connReady => 'Ready';

  @override
  String get connHealthy => 'Healthy';

  @override
  String get connUnhealthy => 'Unhealthy';

  @override
  String get connHaUrl => 'HA base URL';

  @override
  String get connHaToken => 'Access token';

  @override
  String get connMqttUrl => 'Broker URL';

  @override
  String get connMqttPassword => 'Password';

  @override
  String get connSaveEnable => 'Save & enable';

  @override
  String get connBindTitle => 'Object bindings';

  @override
  String connBoundTo(String id) {
    return 'Bound to $id';
  }

  @override
  String get connUnbound => 'Unbound';

  @override
  String get connChannelsHint =>
      'Paste a bot token and enable. Prefer desktop for first-time setup.';

  @override
  String get connBotToken => 'Bot token';

  @override
  String get connDisable => 'Disable';

  @override
  String get connSenderBinds => 'Sender → profile';

  @override
  String get connSenderBindsHint =>
      'Link an IM sender id to the active profile.';

  @override
  String get connBindChannel => 'Channel';

  @override
  String get connChannelAccount => 'Channel account';

  @override
  String get connSenderId => 'Sender id';

  @override
  String get connBindSender => 'Bind sender';

  @override
  String get skillsTabSkills => 'Skills';

  @override
  String get skillsVerify => 'Verify';

  @override
  String get skillsVerified => 'Skill verified';

  @override
  String get skillsTabWorkflows => 'Workflows';

  @override
  String get skillsTabSchedules => 'Schedules';

  @override
  String get skillsInstallUrl => 'Install from URL';

  @override
  String get skillsInstall => 'Install';

  @override
  String get skillsClawHubSearch => 'ClawHub search';

  @override
  String get schedWhenHint => 'When (natural language)';

  @override
  String get schedMessageHint => 'Reminder message';

  @override
  String get schedPropose => 'Propose';

  @override
  String get schedConfirm => 'Confirm reminder';

  @override
  String get schedKindNotify => 'Notify';

  @override
  String get schedKindWorkflow => 'Workflow';

  @override
  String get schedKindTool => 'Tool';

  @override
  String get schedWorkflowId => 'Workflow id';

  @override
  String get schedToolName => 'Tool name';

  @override
  String get wfEditorTitle => 'Workflow';

  @override
  String get wfEnable => 'Enable';

  @override
  String get wfDisable => 'Disable';

  @override
  String get wfTools => 'Insert tool';

  @override
  String get wfId => 'Workflow id';

  @override
  String get wfAiPrompt => 'Describe the workflow';

  @override
  String get wfAiPromptHint => 'e.g. turn off lights at 11pm if nobody home';

  @override
  String get wfAiDraft => 'Draft with AI';

  @override
  String get wfDiagramNodes => 'Nodes (phone diagram)';

  @override
  String get wfNoNodes => 'No nodes yet — draft or paste YAML.';

  @override
  String get wfYaml => 'YAML';

  @override
  String get wfSave => 'Validate & save';

  @override
  String get wfRun => 'Test run';

  @override
  String get wfDrafted => 'Draft applied';

  @override
  String get wfSaved => 'Saved';

  @override
  String get wfRan => 'Run started';

  @override
  String get sysTabFiles => 'Shared files';

  @override
  String get sysTabHealth => 'Health';

  @override
  String get sysTabGrants => 'Grants';

  @override
  String get sysTestPush => 'Send test push';

  @override
  String get sysTestPushSent => 'Test push requested';

  @override
  String get sysDoctorFix => 'Fix';

  @override
  String get sysDoctorFixAll => 'Fix all';

  @override
  String sysDoctorFixed(String ids) {
    return 'Fixed: $ids';
  }

  @override
  String get sysNoIssues => 'No doctor issues.';

  @override
  String get sysNoGrants => 'No grants.';

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
  String get modelsTest => 'Test';

  @override
  String get modelsSetDefault => 'Set default';

  @override
  String modelsTestOk(String id) {
    return 'Tested $id';
  }

  @override
  String modelsDefaultSet(String id) {
    return 'Default → $id';
  }

  @override
  String get artifactsTitle => '产物';

  @override
  String get artifactsHint => '来自家庭守护进程的签名链接。点按打开。';

  @override
  String get artifactsNeedAccount => '请先选择资料以列出产物。';

  @override
  String get artifactsEmptyTitle => '还没有产物';

  @override
  String get artifactsEmptyHint => '智能体生成文件后下拉刷新。';

  @override
  String get artifactsUrlCopied => '无法打开 — 已复制 URL';

  @override
  String artifactsOpenFailed(String error) {
    return '打开失败：$error';
  }

  @override
  String chatPendingApprovals(int count) {
    return '$count 项等待你的批准';
  }
}
