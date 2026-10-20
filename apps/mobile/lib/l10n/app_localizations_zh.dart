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
  String get navChat => '对话';

  @override
  String get navHomeChat => 'Home';

  @override
  String get navSchedulesChat => '日程';

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
  String get navProfiles => 'Profiles';

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
  String get settingsProfilesSubtitle =>
      'Owner, workspace folders, tool policy';

  @override
  String get settingsLlmSubtitle => 'Models, Local, Routing, Memory';

  @override
  String get settingsConnectionsSubtitle =>
      'Pairing, Home Assistant, MQTT, Channels';

  @override
  String get settingsSkillsSubtitle => 'Skills, Workflows, Schedules';

  @override
  String get settingsSystemSubtitle => 'Profiles, Shared files, Health, Grants';

  @override
  String get settingsNeedConnect => '先连接家庭主机，再配置 LLM、连接、技能与系统。';

  @override
  String get profilesIntro =>
      'Each person has a profile. The household Owner configures workspace folders and can transfer ownership.';

  @override
  String get profilesMemberHint =>
      'This device is not the household Owner — workspace is read-only here.';

  @override
  String get profilesRefresh => 'Refresh';

  @override
  String get profilesAddTitle => 'Add profile';

  @override
  String get profilesOwnerBadge => 'Owner';

  @override
  String get profilesActiveBadge => 'Active';

  @override
  String get profilesWorkspaceTitle => 'Workspace folders';

  @override
  String get profilesWorkspaceHint =>
      '每个资料仅一个主机文件夹。浏览选择即可；智能体通过 workspace/… 访问。';

  @override
  String get profilesWorkspacePath => 'Host path';

  @override
  String get profilesWorkspaceBrowse => '浏览文件夹';

  @override
  String get profilesWorkspaceBrowseHint => '点按浏览家庭电脑上的文件夹';

  @override
  String get profilesWorkspaceUnset => 'Not set (sandbox only)';

  @override
  String get profilesWorkspaceSet => 'Configured';

  @override
  String get profilesWorkspaceWholeMachine => 'Whole machine';

  @override
  String get profilesWorkspaceRo => 'Read only';

  @override
  String get profilesWorkspaceRw => 'Read & write';

  @override
  String get profilesWorkspaceUseRoot => 'Add computer root';

  @override
  String get profilesWorkspaceClear => 'Clear all';

  @override
  String get profilesWorkspaceRemove => 'Remove';

  @override
  String get profilesWorkspaceApply => 'Add';

  @override
  String get profilesWorkspaceEdit => 'Add folder';

  @override
  String get profilesWorkspaceRootTitle => 'Allow whole-computer access?';

  @override
  String get profilesWorkspaceRootBody =>
      'This lets the agent read (and write, if selected) files under the computer root via workspace/… — including from this phone.';

  @override
  String get profilesWorkspaceRootOk => 'Allow';

  @override
  String get profilesWorkspaceMemberNote =>
      'Only the household Owner can change workspace folders.';

  @override
  String get profilesWorkspaceCrossTitle =>
      'Add workspace folder for another profile?';

  @override
  String profilesWorkspaceCrossBody(String name) {
    return 'This adds a host folder for $name. Continue only if you intend to configure their workspace.';
  }

  @override
  String get profilesWorkspaceDenied => 'Not visible on this device';

  @override
  String get profilesWorkspaceInactive =>
      'Configured but inactive (filesystem-root only applies to Owner)';

  @override
  String get profilesRename => 'Rename';

  @override
  String get profilesRenameTitle => 'Rename profile';

  @override
  String get profilesRenameSave => 'Save';

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
  String get profilesDelete => 'Delete';

  @override
  String get profilesDeleteTitle => 'Delete profile?';

  @override
  String profilesDeleteBody(String name) {
    return 'Delete $name? Their sandbox and workspace config are removed. This cannot be undone.';
  }

  @override
  String get profilesDeleteConfirm => 'Delete';

  @override
  String profilesDeleteDone(String name) {
    return 'Deleted $name';
  }

  @override
  String get profilesDeleteOwnerBlocked =>
      'Cannot delete the household Owner. Transfer ownership first.';

  @override
  String get profilesTransferTitle => 'Transfer household Owner?';

  @override
  String profilesTransferBody(String name) {
    return 'Make $name the household Owner. They will control pairing, bindings, and household Settings.';
  }

  @override
  String get profilesTransferConfirm => 'Transfer';

  @override
  String profilesTransferDone(String name) {
    return 'Owner is now $name';
  }

  @override
  String profilesTransferFailed(String error) {
    return 'Transfer failed: $error';
  }

  @override
  String profilesTransferTo(String name) {
    return 'Transfer to $name';
  }

  @override
  String get profilesToolPolicy => 'Tool policy';

  @override
  String get profilesToolPolicyStandard => 'Standard';

  @override
  String get profilesToolPolicyRestricted => 'Restricted';

  @override
  String get connMintPairing => 'Mint pairing code';

  @override
  String get connMintOk => 'Pairing code minted';

  @override
  String get connMintUriHint => 'Scan or paste this URI on the new device.';

  @override
  String get connPairingOwnerOnly =>
      'Mint / revoke pairing requires the household Owner device.';

  @override
  String get connRevokeDevice => 'Revoke';

  @override
  String get connForgetDevice => 'Forget';

  @override
  String connRevokeConfirm(String id) {
    return 'Revoke device $id? It will need to pair again.';
  }

  @override
  String connForgetConfirm(String id) {
    return 'Forget device $id? The pairing record is removed permanently.';
  }

  @override
  String get connOwnerWriteOnly =>
      'Only the household Owner device can change this setting.';

  @override
  String get connAccountsHint => 'Household profiles';

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
  String get schedulesChatSessionTitle => '日程';

  @override
  String get schedulesChatEmptyTitle => '提醒';

  @override
  String get schedulesChatEmptyHint => '这个对话专注提醒。时间会在启用前确认。';

  @override
  String get schedulesChatHint => '提醒我…';

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
  String get connTabWebSearch => '网页搜索';

  @override
  String get connTabBrowser => '浏览器';

  @override
  String get browserControlLede => '让对话控制托管 Chromium 标签页。默认关闭。不是个人 Chrome。';

  @override
  String get browserControlEnabled => '启用 browser 工具';

  @override
  String get browserControlUnattended => '允许计划任务使用';

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
  String get browserControlDefaultProfile => 'Default profile';

  @override
  String get browserControlProfileManaged => 'Managed (isolated)';

  @override
  String get browserControlProfilePersonal => 'Personal Chrome';

  @override
  String get browserControlProfileRemote => 'Remote CDP';

  @override
  String get browserControlElevatedWarn =>
      'Personal/remote can act as you on logged-in sites. Owner only; never schedules.';

  @override
  String get browserControlAcknowledge => 'I understand elevated browser risk';

  @override
  String get browserControlPersonalEnabled => 'Enable personal Chrome';

  @override
  String get browserControlPersonalCdp => 'Personal CDP (loopback)';

  @override
  String get browserControlPersonalReady => 'Personal CDP up';

  @override
  String get browserControlPersonalNotReady => 'Personal CDP down';

  @override
  String get browserControlRemoteEnabled => 'Enable remote CDP';

  @override
  String get browserControlRemoteCdp => 'Remote CDP URL';

  @override
  String get browserControlRemoteToken => 'Remote CDP token';

  @override
  String get browserControlTokenSet => 'set';

  @override
  String get browserControlTokenPlaceholder => 'Leave blank to keep';

  @override
  String get browserControlRemoteReady => 'Remote CDP up';

  @override
  String get browserControlRemoteNotReady => 'Remote CDP down';

  @override
  String get browserControlOwnerOnly =>
      'Only the household Owner device can change browser control settings.';

  @override
  String get browserControlAcknowledged =>
      'Elevated risk acknowledged. Disable personal/remote to stop using them.';

  @override
  String get webSearchLede =>
      '在对话中搜索公开网页。DuckDuckGo 无需密钥；Brave / Tavily 需要 Owner 配置密钥。';

  @override
  String get webSearchEnabled => '启用 web_search';

  @override
  String get webSearchProvider => '提供商';

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
  String get webSearchBrowserFallback => '浏览器回退（API/DDG 失败时用 Bing/Google）';

  @override
  String get webSearchBrowserFallbackHint =>
      '默认关闭。对话中进入浏览器回退仍会询问。SERP 页面可能验证码或拦截。';

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
  String get schedKindAgent => 'Agent';

  @override
  String get schedAgentPrompt => 'Agent prompt';

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
  String get schedNoDismissed => '暂无已取消或已过期的提议。';

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
  String get sysTabFiles => '文件';

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
  String get artifactsTooLarge =>
      'This file is larger than the 8 MB in-app open limit. Ask the agent for a smaller export, or open it on the home machine.';

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
  String get artifactsCopyLink => 'Copy signed link';

  @override
  String get artifactsLinkCopied => 'Signed link copied';

  @override
  String get artifactsCopyLinkFailed => 'Could not copy link';

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
  String chatOpenFile(String name) {
    return '打开 $name';
  }

  @override
  String chatPendingApprovals(int count) {
    return '$count 项等待你的批准';
  }
}
