// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'EnvoyHome';

  @override
  String get appLanguage => 'Language';

  @override
  String get appThemePicker => 'Appearance';

  @override
  String get appThemeSystem => 'System';

  @override
  String get appThemeLight => 'Light';

  @override
  String get appThemeDark => 'Dark';

  @override
  String get pairLede =>
      'Join the home desktop over EnvoyMesh — scan a QR, enter host:port, or hop via SSH.';

  @override
  String get pairTabLink => 'Link';

  @override
  String get pairTabHost => 'Host:port';

  @override
  String get pairTabSsh => 'SSH';

  @override
  String get pairFooter => 'com.envoymesh.envoyhome · push after pair';

  @override
  String get pairCloseScanner => 'Close scanner';

  @override
  String get pairScanQr => 'Scan pairing QR';

  @override
  String get pairUriLabel => 'Pairing URI';

  @override
  String get pairUriHint => 'envoy://pair?…&app=EnvoyHome';

  @override
  String get pairConnect => 'Connect';

  @override
  String get pairDirectHint =>
      'Reach the desktop on this network (LAN / Tailscale). Token is required.';

  @override
  String get pairHostPort => 'Host:port';

  @override
  String get pairHostPortHint => '192.168.1.10:4780';

  @override
  String get pairToken => 'Pairing token';

  @override
  String get pairTokenHelper => 'From desktop Settings → Pair devices';

  @override
  String get pairSshHint =>
      'Tunnel through an SSH hop. The daemon sees loopback — token is optional.';

  @override
  String get pairSshHost => 'SSH host';

  @override
  String get pairSshUser => 'User';

  @override
  String get pairSshUserHint => 'root';

  @override
  String get pairSshPort => 'Port';

  @override
  String get pairSshPassword => 'SSH password';

  @override
  String get pairDaemon => 'Daemon on far side';

  @override
  String get pairDaemonHint => '127.0.0.1:4780';

  @override
  String get pairTokenOptional => 'Token (optional)';

  @override
  String get shellOnline => 'online';

  @override
  String get shellDegraded => 'degraded';

  @override
  String get shellOffline => 'offline';

  @override
  String get shellConnect => 'Connect';

  @override
  String get shellReconnect => 'Reconnect';

  @override
  String get shellDisconnect => 'Disconnect';

  @override
  String get shellForgetPairing => 'Forget pairing';

  @override
  String get connectGuideTitle => 'Connect to your home';

  @override
  String get connectGuideHint =>
      'On the desktop, open Settings → Pair devices and scan the QR — or paste the pairing link / host details.';

  @override
  String get connectGuideReconnectHint =>
      'This phone is already paired. Reconnect to the home desktop, or pair again if you moved homes.';

  @override
  String get settingsNeedConnect =>
      'Connect to your home to configure LLM, Connections, Skills, and System.';

  @override
  String get shellProfilePending =>
      'Profile will be chosen from this device’s pairing.';

  @override
  String shellProfileOne(String id) {
    return 'Profile · $id';
  }

  @override
  String get shellProfile => 'Profile';

  @override
  String shellMeshHint(String mesh) {
    return 'mesh $mesh · pull tabs to refresh';
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
  String get navChat => 'Chat';

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
  String get navApprovals => 'Approvals';

  @override
  String get navModels => 'Models';

  @override
  String get navArtifacts => 'Artifacts';

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
  String get schedConfirm => 'Confirm';

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
  String get chatNeedAccount => 'Set an account above before chatting.';

  @override
  String get chatEmptyMessage => 'Empty message.';

  @override
  String get chatSessionTitle => 'Phone chat';

  @override
  String get chatEmptyTitle => 'Message your home agent';

  @override
  String get chatEmptyHint =>
      'Turns run on the home daemon. When the agent needs permission, Allow/Deny appears here.';

  @override
  String get chatHint => 'Message…';

  @override
  String chatSubscribeFailed(String error) {
    return 'subscribe failed: $error';
  }

  @override
  String chatStatus(String status) {
    return 'status: $status';
  }

  @override
  String chatError(String error) {
    return 'error: $error';
  }

  @override
  String get approvalsTitle => 'Approvals';

  @override
  String get approvalsHint =>
      'Tool and actuation requests waiting for a decision.';

  @override
  String get approvalsNeedAccount => 'Set an account to load approvals.';

  @override
  String get approvalsEmptyTitle => 'Inbox clear';

  @override
  String get approvalsEmptyHint => 'Nothing pending right now.';

  @override
  String get approvalsActuation => 'Actuation';

  @override
  String get approvalsAllow => 'Allow';

  @override
  String get approvalsDeny => 'Deny';

  @override
  String get approvalsAllowed => 'Allowed';

  @override
  String get approvalsDenied => 'Denied';

  @override
  String approvalsFailed(String error) {
    return 'Failed: $error';
  }

  @override
  String get modelsTitle => 'Models';

  @override
  String get modelsOwnerHint =>
      'Enable Local or Ollama on the home machine. Prefer Desktop for first setup.';

  @override
  String get modelsReadonlyHint =>
      'Read-only on this device. Use Desktop Settings → Models (or an owner-trusted phone) to enable Local.';

  @override
  String get modelsLocal => 'Local model';

  @override
  String get modelsOwnerTrusted =>
      'Local engine status needs an owner-trusted device.';

  @override
  String get modelsResponding => 'responding';

  @override
  String get modelsNotResponding => 'not responding';

  @override
  String get modelsDisabled => 'disabled';

  @override
  String get modelsGguf => 'GGUF on disk';

  @override
  String get modelsEnableLocal => 'Enable Local';

  @override
  String get modelsUseOllama => 'Use Ollama';

  @override
  String get modelsDisable => 'Disable';

  @override
  String get modelsLocalOnly => 'Local-only for account';

  @override
  String get modelsThisAccount => 'This account';

  @override
  String get modelsNeedAccount => 'Set accountId above.';

  @override
  String modelsDefault(String id) {
    return 'Default: $id';
  }

  @override
  String modelsPool(String filter) {
    return 'Pool: $filter';
  }

  @override
  String get modelsModeMesh => 'Mesh Local';

  @override
  String get modelsModeSpawn => 'Home llama-server';

  @override
  String get modelsModeOllama => 'Ollama';

  @override
  String get modelsModeOff => 'Off';

  @override
  String get modelsNotConnected => 'Not connected';

  @override
  String get modelsSetAccount => 'Set accountId to see default model and pool.';

  @override
  String get modelsUpdated => 'Updated';

  @override
  String get modelsLocalEnabled => 'Local enabled';

  @override
  String get modelsOllamaEnabled => 'Ollama enabled';

  @override
  String get modelsLocalDisabled => 'Local disabled';

  @override
  String get modelsLocalOnlySet => 'Local-only routing set';

  @override
  String get modelsDefaultLabel => 'default';

  @override
  String get modelsOffLabel => 'off';

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
  String get artifactsTitle => 'Artifacts';

  @override
  String get artifactsHint => 'Signed links from the home daemon. Tap to open.';

  @override
  String get artifactsNeedAccount => 'Set an account to list artifacts.';

  @override
  String get artifactsEmptyTitle => 'No artifacts yet';

  @override
  String get artifactsEmptyHint =>
      'Pull to refresh after the agent produces a file.';

  @override
  String get artifactsUrlCopied => 'Could not open — URL copied';

  @override
  String artifactsOpenFailed(String error) {
    return 'Open failed: $error';
  }

  @override
  String chatPendingApprovals(int count) {
    return '$count waiting for your approval';
  }
}
