// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Japanese (`ja`).
class AppLocalizationsJa extends AppLocalizations {
  AppLocalizationsJa([String locale = 'ja']) : super(locale);

  @override
  String get appName => 'EnvoyHome';

  @override
  String get appLanguage => '言語';

  @override
  String get appThemePicker => '外観';

  @override
  String get appThemeSystem => 'システム';

  @override
  String get appThemeLight => 'ライト';

  @override
  String get appThemeDark => 'ダーク';

  @override
  String get pairLede =>
      'EnvoyMesh でホームデスクトップに参加 — QR をスキャン、host:port を入力、または SSH 経由。';

  @override
  String get pairTabLink => 'リンク';

  @override
  String get pairTabHost => 'ホスト:ポート';

  @override
  String get pairTabSsh => 'SSH';

  @override
  String get pairFooter => 'com.envoymesh.envoyhome · ペア後にプッシュ';

  @override
  String get pairCloseScanner => 'スキャナーを閉じる';

  @override
  String get pairScanQr => 'ペアリング QR をスキャン';

  @override
  String get pairUriLabel => 'ペアリング URI';

  @override
  String get pairUriHint => 'envoy://pair?…&app=EnvoyHome';

  @override
  String get pairConnect => '接続';

  @override
  String get pairDirectHint =>
      'このネットワーク（LAN / Tailscale）でデスクトップに接続します。トークンが必要です。';

  @override
  String get pairHostPort => 'ホスト:ポート';

  @override
  String get pairHostPortHint => '192.168.1.10:4780';

  @override
  String get pairToken => 'ペアリングトークン';

  @override
  String get pairTokenHelper => 'デスクトップ設定 → デバイスのペア';

  @override
  String get pairSshHint => 'SSH 経由でトンネルします。デーモンはループバックを見ます — トークンは任意。';

  @override
  String get pairSshHost => 'SSH ホスト';

  @override
  String get pairSshUser => 'ユーザー';

  @override
  String get pairSshUserHint => 'root';

  @override
  String get pairSshPort => 'ポート';

  @override
  String get pairSshPassword => 'SSH パスワード';

  @override
  String get pairDaemon => '向こう側のデーモン';

  @override
  String get pairDaemonHint => '127.0.0.1:4780';

  @override
  String get pairTokenOptional => 'トークン（任意）';

  @override
  String get shellOnline => 'オンライン';

  @override
  String get shellDegraded => '低下';

  @override
  String get shellOffline => 'オフライン';

  @override
  String get shellConnect => '接続';

  @override
  String get shellReconnect => '再接続';

  @override
  String get shellDisconnect => '切断';

  @override
  String get shellForgetPairing => 'ペアリングを忘れる';

  @override
  String get connectGuideTitle => 'ホームに接続';

  @override
  String get connectGuideHint =>
      'デスクトップの設定 → デバイスのペアリングでQRをスキャンするか、ペアリングリンク／ホストを入力してください。';

  @override
  String get connectGuideReconnectHint =>
      'この端末はすでにペアリング済みです。再接続するか、別のホームなら再度ペアリングしてください。';

  @override
  String get shellProfilePending => 'プロファイルはこのデバイスのペアリングから選ばれます。';

  @override
  String shellProfileOne(String id) {
    return 'プロファイル · $id';
  }

  @override
  String get shellProfile => 'プロファイル';

  @override
  String shellMeshHint(String mesh) {
    return 'mesh $mesh · タブを引いて更新';
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
  String get navChat => 'チャット';

  @override
  String get navHomeChat => 'Home';

  @override
  String get navSchedulesChat => 'スケジュール';

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
  String get navApprovals => '承認';

  @override
  String get navModels => 'モデル';

  @override
  String get navArtifacts => '成果物';

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
  String get settingsNeedConnect => '接続すると LLM・接続・スキル・システムを設定できます。';

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
  String get profilesShareLocationTitle => 'Home と位置情報を共有';

  @override
  String get profilesShareLocationSubtitle =>
      'チャットターンに概算 GPS を付与します。権限はこの画面で一度だけ要求し、送信のたびに問いません。一時注入のみ — メモリには保存しません。';

  @override
  String get profilesShareLocationDenied => '位置情報の許可がありません。共有はオフのままです。';

  @override
  String get profilesShareLocationOn => 'この端末で位置情報の共有をオンにしました';

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
  String get schedulesChatSessionTitle => 'スケジュール';

  @override
  String get schedulesChatEmptyTitle => 'リマインダー';

  @override
  String get schedulesChatEmptyHint => 'この会話はリマインダー向けです。有効化の前に時刻を確認します。';

  @override
  String get schedulesChatHint => 'リマインドして…';

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
  String get schedTabRepeating => '繰り返し';

  @override
  String get schedTabOnce => '一度だけ';

  @override
  String get schedTabHistory => '履歴';

  @override
  String get schedNoneRepeating => '繰り返しスケジュールはまだありません。';

  @override
  String get schedNoneOnce => '一度きりのリマインダーはありません。';

  @override
  String get schedNoReceipts => '実行履歴はまだありません。';

  @override
  String get schedHistoryNotSet => 'Not set';

  @override
  String get schedHistoryRuns => 'Runs';

  @override
  String get schedNoDismissed => 'No canceled or expired proposals.';

  @override
  String get schedDismissedCanceled => 'canceled';

  @override
  String get schedDismissedExpired => 'expired';

  @override
  String get schedNext => '次回';

  @override
  String get schedKindRepeating => '繰り返し';

  @override
  String get schedKindOnce => '一度';

  @override
  String get schedKindDaily => '毎日';

  @override
  String get schedKindWeekdays => '平日';

  @override
  String get schedKindWeekly => '毎週';

  @override
  String get schedKindMonthly => '毎月';

  @override
  String get schedKindYearly => '毎年';

  @override
  String get schedKindEvery => '毎';

  @override
  String schedDayOfMonth(String d) {
    return '$d日';
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
  String get chatNeedAccount => 'チャットの前に上でアカウントを選んでください。';

  @override
  String get chatEmptyMessage => '空のメッセージです。';

  @override
  String get chatSessionTitle => 'スマホチャット';

  @override
  String get chatEmptyTitle => 'ホームエージェントにメッセージ';

  @override
  String get chatEmptyHint => 'ターンはホームデーモンで実行されます。許可が必要なときは、ここで許可/拒否できます。';

  @override
  String get chatHint => 'メッセージ…';

  @override
  String get chatThought => '思考';

  @override
  String get chatNew => '新しいチャット';

  @override
  String get chatNewNamePrompt => 'チャット名';

  @override
  String get chatNewNamePlaceholder => '例：週末の予定';

  @override
  String get chatNewNameHint => '今すぐ名前を付けるか、名前なしで開始（最初のメッセージがタイトルになります）。';

  @override
  String get chatNewSkip => '名前なしで開始';

  @override
  String get chatNewCreate => '作成';

  @override
  String get chatNewNeedName => '名前を入力するか、「名前なしで開始」を選んでください。';

  @override
  String get chatNewStart => '開始';

  @override
  String get chatOpenArtifact => '全文を開く';

  @override
  String get chatRecents => '履歴';

  @override
  String get chatRecentsEmpty => '以前のチャットはありません。';

  @override
  String get chatSessionsEmpty => 'チャットはまだありません。新規作成してください。';

  @override
  String get chatUntitled => '無題のチャット';

  @override
  String get chatRenameAction => '名前を変更';

  @override
  String get chatRenamePrompt => 'チャット名';

  @override
  String get chatRenameDone => '名前を変更しました。';

  @override
  String get chatRenameEmpty => '名前を空にはできません。';

  @override
  String get chatRenameNeedSession => '先にメッセージを送ってから名前を変更してください。';

  @override
  String get chatBusyTurn => '現在の返信が終わるまで待つか、キャンセルしてください。';

  @override
  String get chatEmptyAction => 'チャットを空に';

  @override
  String get chatEmptyConfirmTitle => 'このチャットを空にしますか？';

  @override
  String get chatEmptyConfirmBody => 'このスレッドのメッセージはすべて削除されます。チャット自体は残ります。';

  @override
  String get chatTrashMenu => 'チャット操作';

  @override
  String get chatArchiveAction => 'チャットをアーカイブ';

  @override
  String get chatUnarchiveAction => 'チャット一覧に戻す';

  @override
  String get chatUnarchiveDone => 'チャットを復元しました。';

  @override
  String get chatArchivedOpen => 'アーカイブ';

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
  String get chatArchivedTitle => 'アーカイブ済みチャット';

  @override
  String get chatArchivedBack => 'チャット一覧に戻る';

  @override
  String get chatArchivedEmpty => 'アーカイブ済みチャットはありません。';

  @override
  String get chatRemoveAction => 'チャットを削除';

  @override
  String get chatArchiveConfirmTitle => 'このチャットをアーカイブしますか？';

  @override
  String get chatArchiveConfirmBody => '履歴から隠れますがディスク上に残ります。';

  @override
  String get chatRemoveConfirmTitle => 'このチャットを削除しますか？';

  @override
  String get chatRemoveConfirmBody => 'チャットとすべてのメッセージを完全に削除します。';

  @override
  String get chatRemoveDone => 'チャットを削除しました。';

  @override
  String get chatNoSession => 'アクティブなチャットがありません。';

  @override
  String get chatDeleteFailed => 'サーバーでメッセージを削除できませんでした。';

  @override
  String get chatDeleteMessage => 'メッセージを削除';

  @override
  String get chatCopyMessage => 'メッセージをコピー';

  @override
  String get chatCopied => 'コピーしました';

  @override
  String get chatCancel => 'キャンセル';

  @override
  String chatSubscribeFailed(String error) {
    return '購読失敗: $error';
  }

  @override
  String chatStatus(String status) {
    return '状態: $status';
  }

  @override
  String chatError(String error) {
    return 'エラー: $error';
  }

  @override
  String get approvalsTitle => '承認';

  @override
  String get approvalsHint => '決定待ちのツールと作動リクエスト。';

  @override
  String get approvalsNeedAccount => '承認を読み込むにはアカウントを選んでください。';

  @override
  String get approvalsEmptyTitle => '受信トレイは空';

  @override
  String get approvalsEmptyHint => 'いま保留はありません。';

  @override
  String get approvalsActuation => '作動';

  @override
  String get approvalsAllow => '許可';

  @override
  String get approvalsDeny => '拒否';

  @override
  String get approvalsAllowed => '許可しました';

  @override
  String get approvalsDenied => '拒否しました';

  @override
  String approvalsFailed(String error) {
    return '失敗: $error';
  }

  @override
  String get modelsTitle => 'モデル';

  @override
  String get modelsOwnerHint => 'ホームマシンで Local または Ollama を有効にします。初回はデスクトップ推奨。';

  @override
  String get modelsReadonlyHint =>
      'このデバイスは読み取り専用です。デスクトップ設定 → モデル（または所有者信頼の端末）で Local を有効にしてください。';

  @override
  String get modelsLocal => 'ローカルモデル';

  @override
  String get modelsOwnerTrusted => 'ローカルエンジン状態には所有者信頼デバイスが必要です。';

  @override
  String get modelsResponding => '応答中';

  @override
  String get modelsNotResponding => '無応答';

  @override
  String get modelsDisabled => '無効';

  @override
  String get modelsGguf => 'ディスク上の GGUF';

  @override
  String get modelsEnableLocal => 'Local を有効化';

  @override
  String get modelsUseOllama => 'Ollama を使う';

  @override
  String get modelsDisable => '無効化';

  @override
  String get modelsLocalOnly => 'アカウントをローカルのみに';

  @override
  String get modelsThisAccount => 'このアカウント';

  @override
  String get modelsNeedAccount => '上で accountId を設定してください。';

  @override
  String modelsDefault(String id) {
    return '既定: $id';
  }

  @override
  String modelsPool(String filter) {
    return 'プール: $filter';
  }

  @override
  String get modelsModeMesh => 'Mesh ローカル';

  @override
  String get modelsModeSpawn => 'Home llama-server';

  @override
  String get modelsModeOllama => 'Ollama';

  @override
  String get modelsModeOff => 'オフ';

  @override
  String get modelsNotConnected => '未接続';

  @override
  String get modelsSetAccount => '既定モデルとプールを見るには accountId を設定。';

  @override
  String get modelsUpdated => '更新しました';

  @override
  String get modelsLocalEnabled => 'Local を有効化しました';

  @override
  String get modelsOllamaEnabled => 'Ollama を有効化しました';

  @override
  String get modelsLocalDisabled => 'Local を無効化しました';

  @override
  String get modelsLocalOnlySet => 'ローカルのみルーティングを設定';

  @override
  String get modelsDefaultLabel => '既定';

  @override
  String get modelsOffLabel => 'オフ';

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
  String get artifactsTitle => '成果物';

  @override
  String get artifactsHint => 'ホーム接続経由でアプリ内表示（公開 URL 不要）。';

  @override
  String get artifactsNeedAccount => '成果物を一覧するにはアカウントを選んでください。';

  @override
  String get artifactsEmptyTitle => '成果物はまだありません';

  @override
  String get artifactsEmptyHint => 'エージェントがファイルを出したあと引っ張って更新。';

  @override
  String get artifactsUrlCopied => '開けません — URL をコピーしました';

  @override
  String artifactsOpenFailed(String error) {
    return 'オープン失敗: $error';
  }

  @override
  String get artifactsTooLarge =>
      'This file is larger than the 8 MB in-app open limit. Ask the agent for a smaller export, or open it on the home machine.';

  @override
  String get artifactsRefresh => '更新';

  @override
  String get artifactsRetry => '再試行';

  @override
  String get artifactsBinaryHint =>
      'このファイル形式はここではプレビューできません。共有/保存で他のアプリを開くか、テキストまたは Markdown の書き出しを依頼してください。';

  @override
  String get artifactsShare => '共有 / 保存';

  @override
  String artifactsShareFailed(String error) {
    return '共有できませんでした: $error';
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
    return '$name を開く';
  }

  @override
  String chatPendingApprovals(int count) {
    return '承認待ち $count 件';
  }
}
