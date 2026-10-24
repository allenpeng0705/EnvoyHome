// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Korean (`ko`).
class AppLocalizationsKo extends AppLocalizations {
  AppLocalizationsKo([String locale = 'ko']) : super(locale);

  @override
  String get appName => 'EnvoyHome';

  @override
  String get appLanguage => '언어';

  @override
  String get appThemePicker => '모양';

  @override
  String get appThemeSystem => '시스템';

  @override
  String get appThemeLight => '라이트';

  @override
  String get appThemeDark => '다크';

  @override
  String get pairLede =>
      'EnvoyMesh로 홈 데스크톱에 연결 — QR 스캔, host:port 입력, 또는 SSH 경유.';

  @override
  String get pairTabLink => '링크';

  @override
  String get pairTabHost => '호스트:포트';

  @override
  String get pairTabSsh => 'SSH';

  @override
  String get pairFooter => 'com.envoymesh.envoyhome · 페어링 후 푸시';

  @override
  String get pairCloseScanner => '스캐너 닫기';

  @override
  String get pairScanQr => '페어링 QR 스캔';

  @override
  String get pairUriLabel => '페어링 URI';

  @override
  String get pairUriHint => 'envoy://pair?…&app=EnvoyHome';

  @override
  String get pairConnect => '연결';

  @override
  String get pairDirectHint =>
      '이 네트워크(LAN / Tailscale)에서 데스크톱에 연결합니다. 토큰이 필요합니다.';

  @override
  String get pairHostPort => '호스트:포트';

  @override
  String get pairHostPortHint => '192.168.1.10:4780';

  @override
  String get pairToken => '페어링 토큰';

  @override
  String get pairTokenHelper => '데스크톱 설정 → 기기 페어링';

  @override
  String get pairSshHint => 'SSH 홉으로 터널링합니다. 데몬은 루프백을 봅니다 — 토큰은 선택.';

  @override
  String get pairSshHost => 'SSH 호스트';

  @override
  String get pairSshUser => '사용자';

  @override
  String get pairSshUserHint => 'root';

  @override
  String get pairSshPort => '포트';

  @override
  String get pairSshPassword => 'SSH 비밀번호';

  @override
  String get pairDaemon => '원격 데몬';

  @override
  String get pairDaemonHint => '127.0.0.1:4780';

  @override
  String get pairTokenOptional => '토큰(선택)';

  @override
  String get shellOnline => '온라인';

  @override
  String get shellDegraded => '저하';

  @override
  String get shellOffline => '오프라인';

  @override
  String get shellConnect => '연결';

  @override
  String get shellReconnect => '다시 연결';

  @override
  String get shellDisconnect => '연결 해제';

  @override
  String get shellForgetPairing => '페어링 지우기';

  @override
  String get connectGuideTitle => '홈에 연결';

  @override
  String get connectGuideHint =>
      '데스크톱에서 설정 → 기기 페어링의 QR을 스캔하거나 페어링 링크/호스트를 입력하세요.';

  @override
  String get connectGuideReconnectHint =>
      '이 휴대폰은 이미 페어링되어 있습니다. 다시 연결하거나, 다른 홈이면 다시 페어링하세요.';

  @override
  String get shellProfilePending => '프로필은 이 기기의 페어링에서 선택됩니다.';

  @override
  String shellProfileOne(String id) {
    return '프로필 · $id';
  }

  @override
  String get shellProfile => '프로필';

  @override
  String shellMeshHint(String mesh) {
    return 'mesh $mesh · 탭을 당겨 새로고침';
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
  String get navChat => '채팅';

  @override
  String get navHomeChat => 'Home';

  @override
  String get navSchedulesChat => '일정';

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
  String get navApprovals => '승인';

  @override
  String get navModels => '모델';

  @override
  String get navArtifacts => '산출물';

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
  String get settingsNeedConnect => '연결하면 LLM, 연결, 스킬, 시스템을 설정할 수 있습니다.';

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
      'Add host folders on the home machine (up to 16). The agent reaches them via workspace/<id>/… paths.';

  @override
  String get profilesWorkspacePath => 'Host path';

  @override
  String get profilesWorkspaceBrowse => 'Browse folders';

  @override
  String get profilesWorkspaceBrowseHint => 'Tap to browse the home machine';

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
  String get profilesTimeZoneUnset =>
      'Time zone: not set (schedules use host default)';

  @override
  String profilesTimeZoneValue(String tz) {
    return 'Time zone: $tz';
  }

  @override
  String get profilesTimeZoneEdit => 'Time zone';

  @override
  String get profilesTimeZoneTitle => 'Account time zone';

  @override
  String get profilesTimeZoneHint => 'IANA name, e.g. Asia/Shanghai';

  @override
  String get profilesTimeZoneSave => 'Save';

  @override
  String profilesTimeZoneDone(String tz) {
    return 'Time zone set to $tz';
  }

  @override
  String get profilesShareLocationTitle => 'Home과 위치 공유';

  @override
  String get profilesShareLocationSubtitle =>
      '채팅 턴에 대략적인 GPS를 첨부합니다. 권한은 여기서 한 번만 요청하며 전송마다 묻지 않습니다. 일시 주입만 — 메모리에 저장하지 않습니다.';

  @override
  String get profilesShareLocationDenied => '위치 권한이 허용되지 않았습니다. 공유는 꺼진 상태입니다.';

  @override
  String get profilesShareLocationOn => '이 기기에서 위치 공유가 켜졌습니다';

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
  String get schedulesChatSessionTitle => '일정';

  @override
  String get schedulesChatEmptyTitle => '알림';

  @override
  String get schedulesChatEmptyHint => '이 대화는 알림에 집중합니다. 켜기 전에 시간을 확인합니다.';

  @override
  String get schedulesChatHint => '알려 줘…';

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
  String get connTabWebSearch => 'Web search';

  @override
  String get connTabBrowser => 'Browser';

  @override
  String get browserControlLede =>
      'Control a managed Chromium tab from chat. Off by default. Not your personal Chrome.';

  @override
  String get browserControlEnabled => 'Enable browser tool';

  @override
  String get browserControlUnattended => 'Allow for schedules';

  @override
  String get browserControlReady => 'Ready';

  @override
  String get browserControlNotReady => 'Not ready';

  @override
  String get browserControlSave => 'Save';

  @override
  String get browserControlSaved => 'Browser settings saved.';

  @override
  String get browserControlSaveFailed => 'Could not save browser settings.';

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
      'Search the public web from chat. DuckDuckGo needs no key; Brave and Tavily need an Owner API key.';

  @override
  String get webSearchEnabled => 'Enable web_search';

  @override
  String get webSearchProvider => 'Provider';

  @override
  String get webSearchApiKey => 'API key';

  @override
  String get webSearchApiKeyHint => 'Leave blank to keep the current key';

  @override
  String get webSearchReady => 'Ready';

  @override
  String get webSearchNotReady => 'Not ready';

  @override
  String get webSearchSave => 'Save';

  @override
  String get webSearchSaved => 'Web search settings saved.';

  @override
  String get webSearchSaveFailed => 'Could not save web search settings.';

  @override
  String get webSearchOwnerOnly =>
      'Only the Household Owner device can change web search.';

  @override
  String get webSearchBrowserFallback =>
      'Browser fallback (Bing/Google when API/DDG fails)';

  @override
  String get webSearchBrowserFallbackHint =>
      'Off by default. Attended chats still ask before the browser leg. SERP pages may CAPTCHA or block.';

  @override
  String get webSearchBrowserReady =>
      'Playwright Chromium ready on daemon host';

  @override
  String get webSearchBrowserMissing =>
      'Playwright Chromium not installed on daemon host';

  @override
  String get webSearchInstallHintNote =>
      'Playwright is already part of the daemon. Download Chromium on the home computer that runs EnvoyHome (not this phone), then reopen Settings; restart the daemon if status stays missing.';

  @override
  String get webSearchCopyHint => 'Copy install command';

  @override
  String get webSearchUnattendedBrowser =>
      'Allow browser fallback for schedules';

  @override
  String get connPairingHint =>
      'Household Owner devices can mint and revoke pairing here. Members see status only.';

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
  String get schedTabRepeating => '반복';

  @override
  String get schedTabOnce => '한 번';

  @override
  String get schedTabHistory => '기록';

  @override
  String get schedNoneRepeating => '반복 일정이 아직 없습니다.';

  @override
  String get schedNoneOnce => '일회성 알림이 없습니다.';

  @override
  String get schedNoReceipts => '실행 기록이 없습니다.';

  @override
  String get schedHistoryNotSet => 'Not set';

  @override
  String get schedHistoryRuns => 'Runs';

  @override
  String get schedNoDismissed => 'No canceled or expired proposals.';

  @override
  String get schedDismissedCanceled => '취소됨';

  @override
  String get schedDismissedExpired => '만료됨';

  @override
  String get schedNext => '다음';

  @override
  String get schedKindRepeating => '반복';

  @override
  String get schedKindOnce => '한 번';

  @override
  String get schedKindDaily => '매일';

  @override
  String get schedKindWeekdays => '평일';

  @override
  String get schedKindWeekly => '매주';

  @override
  String get schedKindMonthly => '매월';

  @override
  String get schedKindYearly => '매년';

  @override
  String get schedKindEvery => '매';

  @override
  String schedDayOfMonth(String d) {
    return '$d일';
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
  String get sysTabFiles => 'Files';

  @override
  String get sysTabHealth => 'Health';

  @override
  String get sysTabGrants => 'Grants';

  @override
  String get sysTabMachine => 'This machine';

  @override
  String get sysMachineHint =>
      'Daemon listen status from home.health. OS service install/restart is loopback-only on the home desktop — not available over mesh.';

  @override
  String get sysMachineDaemonOk => 'Daemon reachable';

  @override
  String get sysMachineDaemonBad => 'Daemon health failed';

  @override
  String get sysMachineWsPort => 'WebSocket port';

  @override
  String get sysMachineHttpPort => 'HTTP hatch port';

  @override
  String get sysMachinePublicUrl => 'Public base URL';

  @override
  String get sysMachinePublicUrlEmpty => 'Not set';

  @override
  String get sysMachineUptime => 'Uptime';

  @override
  String get sysMachineConnections => 'Clients / active turns';

  @override
  String get sysMachineMesh => 'Mesh';

  @override
  String get sysMachineOsServiceNote =>
      'Install or restart the OS service from desktop Settings → System → This machine (loopback-owner).';

  @override
  String get sysMachineRefresh => 'Refresh';

  @override
  String get sysTestPush => 'Send test push';

  @override
  String get sysTestPushSent => 'Test push requested';

  @override
  String get wfModeYaml => 'YAML';

  @override
  String get wfModeDiagram => 'Diagram';

  @override
  String get wfDiagramEmpty => 'No steps yet — draft or edit YAML.';

  @override
  String get wfDiagramEdge => '↓';

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
  String get chatNeedAccount => '채팅 전에 위에서 계정을 선택하세요.';

  @override
  String get chatEmptyMessage => '빈 메시지.';

  @override
  String get chatSessionTitle => '휴대폰 채팅';

  @override
  String get chatEmptyTitle => '홈 에이전트에게 메시지';

  @override
  String get chatEmptyHint =>
      '턴은 홈 데몬에서 실행됩니다. 에이전트에 권한이 필요하면 허용/거부가 여기에 표시됩니다.';

  @override
  String get chatHint => '메시지…';

  @override
  String get chatThought => '생각';

  @override
  String get chatNew => '새 채팅';

  @override
  String get chatNewNamePrompt => '채팅 이름';

  @override
  String get chatNewNamePlaceholder => '예: 주말 계획';

  @override
  String get chatNewNameHint => '지금 이름을 지정하거나, 이름 없이 시작하세요. 제목은 첫 메시지로 정해집니다.';

  @override
  String get chatNewSkip => '이름 없이 시작';

  @override
  String get chatNewCreate => '만들기';

  @override
  String get chatNewNeedName => '이름을 입력하거나 ‘이름 없이 시작’을 선택하세요.';

  @override
  String get chatNewStart => '시작';

  @override
  String get chatOpenArtifact => '전체 답변 열기';

  @override
  String get chatRecents => '최근';

  @override
  String get chatRecentsEmpty => '이전 채팅이 없습니다.';

  @override
  String get chatSessionsEmpty => '채팅이 없습니다. 새 채팅을 시작하세요.';

  @override
  String get chatUntitled => '제목 없는 채팅';

  @override
  String get chatRenameAction => '이름 바꾸기';

  @override
  String get chatRenamePrompt => '채팅 이름';

  @override
  String get chatRenameDone => '이름이 변경되었습니다.';

  @override
  String get chatRenameEmpty => '이름은 비울 수 없습니다.';

  @override
  String get chatRenameNeedSession => '메시지를 보낸 다음 이름을 바꾸세요.';

  @override
  String get chatBusyTurn => '현재 응답이 끝날 때까지 기다리거나 취소하세요.';

  @override
  String get chatEmptyAction => '채팅 비우기';

  @override
  String get chatEmptyConfirmTitle => '이 채팅을 비울까요?';

  @override
  String get chatEmptyConfirmBody => '이 스레드의 모든 메시지가 삭제됩니다. 채팅 자체는 유지됩니다.';

  @override
  String get chatTrashMenu => '채팅 작업';

  @override
  String get chatArchiveAction => '채팅 보관';

  @override
  String get chatUnarchiveAction => '채팅 목록으로 복원';

  @override
  String get chatUnarchiveDone => '채팅을 복원했습니다.';

  @override
  String get chatArchivedOpen => '보관됨';

  @override
  String get chatTabActive => 'Chats';

  @override
  String get chatTabArchived => 'Archived';

  @override
  String get homeFolderTitle => 'Choose folder';

  @override
  String get homeFolderSelect => 'Select';

  @override
  String get homeFolderDrives => 'Drives';

  @override
  String get homeFolderComputer => 'Computer';

  @override
  String get homeFolderHome => 'Home';

  @override
  String get homeFolderParent => 'Parent folder';

  @override
  String get homeFolderNoSubfolders => 'No subfolders';

  @override
  String get chatArchivedTitle => '보관된 채팅';

  @override
  String get chatArchivedBack => '채팅 목록으로';

  @override
  String get chatArchivedEmpty => '보관된 채팅이 없습니다.';

  @override
  String get chatRemoveAction => '채팅 삭제';

  @override
  String get chatArchiveConfirmTitle => '이 채팅을 보관할까요?';

  @override
  String get chatArchiveConfirmBody => '최근 목록에서 숨겨지지만 디스크에는 남습니다.';

  @override
  String get chatRemoveConfirmTitle => '이 채팅을 삭제할까요?';

  @override
  String get chatRemoveConfirmBody => '채팅과 모든 메시지를 영구 삭제합니다.';

  @override
  String get chatRemoveDone => '채팅을 삭제했습니다.';

  @override
  String get chatNoSession => '활성 채팅이 없습니다.';

  @override
  String get chatDeleteFailed => '서버에서 메시지를 삭제하지 못했습니다.';

  @override
  String get chatDeleteMessage => '메시지 삭제';

  @override
  String get chatCopyMessage => '메시지 복사';

  @override
  String get chatCopied => '복사됨';

  @override
  String get chatCancel => '취소';

  @override
  String chatSubscribeFailed(String error) {
    return '구독 실패: $error';
  }

  @override
  String chatStatus(String status) {
    return '상태: $status';
  }

  @override
  String chatError(String error) {
    return '오류: $error';
  }

  @override
  String get approvalsTitle => '승인';

  @override
  String get approvalsHint => '결정을 기다리는 도구 및 작동 요청.';

  @override
  String get approvalsNeedAccount => '승인을 불러오려면 계정을 선택하세요.';

  @override
  String get approvalsEmptyTitle => '받은편지함 비어 있음';

  @override
  String get approvalsEmptyHint => '지금 대기 중인 항목이 없습니다.';

  @override
  String get approvalsActuation => '작동';

  @override
  String get approvalsAllow => '허용';

  @override
  String get approvalsDeny => '거부';

  @override
  String get approvalsAllowed => '허용됨';

  @override
  String get approvalsDenied => '거부됨';

  @override
  String approvalsFailed(String error) {
    return '실패: $error';
  }

  @override
  String get modelsTitle => '모델';

  @override
  String get modelsOwnerHint =>
      '홈 기기에서 Local 또는 Ollama를 사용하세요. 첫 설정은 데스크톱을 권장합니다.';

  @override
  String get modelsReadonlyHint =>
      '이 기기는 읽기 전용입니다. 데스크톱 설정 → 모델(또는 소유자 신뢰 폰)에서 Local을 켜세요.';

  @override
  String get modelsLocal => '로컬 모델';

  @override
  String get modelsOwnerTrusted => '로컬 엔진 상태는 소유자 신뢰 기기가 필요합니다.';

  @override
  String get modelsResponding => '응답 중';

  @override
  String get modelsNotResponding => '응답 없음';

  @override
  String get modelsDisabled => '사용 안 함';

  @override
  String get modelsGguf => '디스크의 GGUF';

  @override
  String get modelsEnableLocal => 'Local 사용';

  @override
  String get modelsUseOllama => 'Ollama 사용';

  @override
  String get modelsDisable => '사용 안 함';

  @override
  String get modelsLocalOnly => '계정 로컬 전용';

  @override
  String get modelsThisAccount => '이 계정';

  @override
  String get modelsNeedAccount => '위에서 accountId를 설정하세요.';

  @override
  String modelsDefault(String id) {
    return '기본: $id';
  }

  @override
  String modelsPool(String filter) {
    return '풀: $filter';
  }

  @override
  String get modelsModeMesh => 'Mesh 로컬';

  @override
  String get modelsModeSpawn => 'Home llama-server';

  @override
  String get modelsModeOllama => 'Ollama';

  @override
  String get modelsModeOff => '꺼짐';

  @override
  String get modelsNotConnected => '연결되지 않음';

  @override
  String get modelsSetAccount => '기본 모델과 풀을 보려면 accountId를 설정하세요.';

  @override
  String get modelsUpdated => '업데이트됨';

  @override
  String get modelsLocalEnabled => 'Local 사용됨';

  @override
  String get modelsOllamaEnabled => 'Ollama 사용됨';

  @override
  String get modelsLocalDisabled => 'Local 해제됨';

  @override
  String get modelsLocalOnlySet => '로컬 전용 라우팅 설정됨';

  @override
  String get modelsDefaultLabel => '기본';

  @override
  String get modelsOffLabel => '끔';

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
  String get artifactsTitle => '산출물';

  @override
  String get artifactsHint => '홈 연결로 앱 안에서 엽니다(공개 URL 불필요).';

  @override
  String get artifactsNeedAccount => '산출물을 보려면 계정을 선택하세요.';

  @override
  String get artifactsEmptyTitle => '산출물 없음';

  @override
  String get artifactsEmptyHint => '에이전트가 파일을 만든 뒤 당겨서 새로고침하세요.';

  @override
  String get artifactsUrlCopied => '열 수 없음 — URL 복사됨';

  @override
  String artifactsOpenFailed(String error) {
    return '열기 실패: $error';
  }

  @override
  String get artifactsTooLarge =>
      'This file is larger than the 8 MB in-app open limit. Ask the agent for a smaller export, or open it on the home machine.';

  @override
  String get artifactsRefresh => '새로고침';

  @override
  String get artifactsRetry => '다시 시도';

  @override
  String get artifactsBinaryHint =>
      '이 파일 형식은 여기서 미리볼 수 없습니다. 공유/저장으로 다른 앱에서 열거나, 텍스트 또는 Markdown 내보내기를 요청하세요.';

  @override
  String get artifactsShare => '공유 / 저장';

  @override
  String artifactsShareFailed(String error) {
    return '공유 실패: $error';
  }

  @override
  String get artifactsCopyLink => 'Copy signed link';

  @override
  String get artifactsLinkCopied => 'Signed link copied';

  @override
  String get artifactsCopyLinkFailed => 'Could not copy link';

  @override
  String get artifactsOpenInBrowser => 'Open in browser';

  @override
  String get artifactsOpenInBrowserFailed => 'Could not open in browser';

  @override
  String get filesParent => 'Parent';

  @override
  String get filesRoots => 'Roots';

  @override
  String get filesEmptyFolder => 'This folder is empty';

  @override
  String chatOpenFile(String name) {
    return '$name 열기';
  }

  @override
  String chatPendingApprovals(int count) {
    return '승인 대기 $count건';
  }

  @override
  String get choiceCardConfirm => '확인';

  @override
  String get choiceCardPickOne => '하나 이상 선택하세요.';

  @override
  String get choiceCardAnswered => '확인했습니다.';

  @override
  String choiceCardFailed(String error) {
    return '선택을 보낼 수 없습니다: $error';
  }

  @override
  String chatPendingChoices(int count) {
    return '선택 대기 $count건';
  }

  @override
  String get choiceCardCancel => '취소';

  @override
  String get choiceCardCanceled => '선택을 취소했습니다.';

  @override
  String get choiceCardExpired => '만료됨';

  @override
  String get choiceCardExpiredHint => '이 선택은 만료되었습니다. 필요하면 다시 물어보세요.';

  @override
  String choiceCardExpiresIn(int mins) {
    return '$mins분 후 만료';
  }

  @override
  String get choiceCardTextPlaceholder => '답변 입력';

  @override
  String get schedulesChatTabChat => '일정';

  @override
  String get schedulesChatTabHistories => '기록';

  @override
  String get schedulesChatHistoriesHint => '취소·만료된 제안과 최근 실행 기록.';

  @override
  String get jobsHistoriesMovedHint => '기록은 일정 → 기록으로 이동';

  @override
  String schedulesChatClosedAt(String when) {
    return '종료 $when';
  }

  @override
  String schedulesChatRanAt(String when) {
    return '실행 $when';
  }

  @override
  String get welcomeSkip => '건너뛰기';

  @override
  String get welcomeNext => '다음';

  @override
  String get commonContinue => '계속';

  @override
  String get welcomeSlide1Title => 'EnvoyHome에 오신 것을 환영합니다';

  @override
  String get welcomeSlide1Body =>
      '휴대폰은 셀프호스팅 홈 에이전트로 가는 창입니다. 채팅·승인·스마트홈은 데스크톱에 남습니다.';

  @override
  String get welcomeSlide2Title => '작업은 컴퓨터에서 진행됩니다';

  @override
  String get welcomeSlide2Body =>
      '집의 Mac 또는 PC에 EnvoyHome을 설치하세요. 데몬·모델·가구 메모리는 그 기기에 있고, 휴대폰은 원격 창입니다.';

  @override
  String get welcomeSlide3Title => 'QR로 페어링';

  @override
  String get welcomeSlide3Body =>
      '컴퓨터에서 EnvoyHome을 열고 페어링 QR을 표시하세요. 이 휴대폰에서 지금 페어링을 누르고 스캔하세요. 링크를 붙여넣을 수도 있습니다.';

  @override
  String get welcomeSlideRequiredTitle => '시작하려면 페어링';

  @override
  String get welcomeSlideRequiredBody =>
      'EnvoyHome에는 데스크톱 앱이 실행 중인 컴퓨터가 필요합니다. 에이전트와 홈 제어는 그곳에서 실행됩니다. 이 휴대폰을 그 컴퓨터와 페어링하세요.';

  @override
  String get setupGuideTitle => 'EnvoyHome 사용 방법';

  @override
  String get setupGuideIntro =>
      '휴대폰의 EnvoyHome은 집 컴퓨터의 EnvoyHome과 통신합니다. 데스크톱을 설치하고 한 번 페어링하면 어디서든 채팅과 승인이 가능합니다.';

  @override
  String get setupGuidePairRequiredTitle => '계속하려면 페어링';

  @override
  String get setupGuidePairRequiredBody =>
      'EnvoyHome은 집 데스크톱의 휴대폰 동반 앱입니다. 페어링된 컴퓨터가 없으면 여기에 표시할 내용이 아직 없습니다.';

  @override
  String get setupGuideStep1Title => '컴퓨터 준비';

  @override
  String get setupGuideStep1Body =>
      '집의 Mac 또는 Windows/Linux PC가 필요합니다. 그 기기가 EnvoyHome 호스트가 되어 데몬과 에이전트가 실행됩니다.';

  @override
  String get setupGuideStep2Title => 'EnvoyHome 다운로드 및 설치';

  @override
  String get setupGuideStep2Body =>
      'QuickStart를 열고 그 컴퓨터에 데몬과 데스크톱 앱을 설치하세요. 실행한 뒤 계속 켜 두세요.';

  @override
  String get setupGuideDownloadCta => 'EnvoyHome QuickStart 열기';

  @override
  String get setupGuideStep3Title => '페어링 QR 표시';

  @override
  String get setupGuideStep3Body =>
      '데스크톱 EnvoyHome에서 설정 → 기기 페어링. QR을 화면에 유지하세요(LAN만이 아니라 mesh/릴레이 포함).';

  @override
  String get setupGuideStep4Title => '이 휴대폰으로 스캔';

  @override
  String get setupGuideStep4Body =>
      '아래 지금 페어링을 누르세요. 카메라를 허용한 뒤 QR을 스캔하세요. envoy:// 링크나 host:port / SSH도 가능합니다.';

  @override
  String get setupGuideStep5Title => '연결되었습니다';

  @override
  String get setupGuideStep5Body =>
      '페어링이 끝나면 이 휴대폰에 해당 홈의 채팅·승인·설정이 표시됩니다. 휴대폰이 없어도 데스크톱은 계속 실행됩니다.';

  @override
  String get setupGuideNoHomeTitle => '나중에 페어링해도 됩니다';

  @override
  String get setupGuideNoHomeBody =>
      '지금은 계속 둘러보고 연결에서 언제든 페어링할 수 있습니다. 컴퓨터가 없으면 여기에 표시할 내용이 아직 없습니다.';

  @override
  String get setupGuidePairCta => '지금 페어링';

  @override
  String get setupGuidePairLaterCta => '나중에 페어링';

  @override
  String get setupGuideSkipCta => '먼저 둘러보기';

  @override
  String get setupGuideDoneCta => '알겠습니다';

  @override
  String get settingsSetupGuideSubtitle => '데스크톱 설치와 이 휴대폰 페어링 방법.';
}
