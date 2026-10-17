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
  String get settingsNeedConnect => '接続すると LLM・接続・スキル・システムを設定できます。';

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
  String get navApprovals => '承認';

  @override
  String get navModels => 'モデル';

  @override
  String get navArtifacts => '成果物';

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
  String get artifactsHint => 'ホームデーモンの署名付きリンク。タップで開きます。';

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
  String chatPendingApprovals(int count) {
    return '承認待ち $count 件';
  }
}
