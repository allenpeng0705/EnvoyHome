// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for German (`de`).
class AppLocalizationsDe extends AppLocalizations {
  AppLocalizationsDe([String locale = 'de']) : super(locale);

  @override
  String get appName => 'EnvoyHome';

  @override
  String get appLanguage => 'Sprache';

  @override
  String get appThemePicker => 'Darstellung';

  @override
  String get appThemeSystem => 'System';

  @override
  String get appThemeLight => 'Hell';

  @override
  String get appThemeDark => 'Dunkel';

  @override
  String get pairLede =>
      'Mit dem Home-Desktop über EnvoyMesh verbinden — QR scannen, host:port eingeben oder per SSH.';

  @override
  String get pairTabLink => 'Link';

  @override
  String get pairTabHost => 'Host:Port';

  @override
  String get pairTabSsh => 'SSH';

  @override
  String get pairFooter => 'com.envoymesh.envoyhome · Push nach Pairing';

  @override
  String get pairCloseScanner => 'Scanner schließen';

  @override
  String get pairScanQr => 'Pairing-QR scannen';

  @override
  String get pairUriLabel => 'Pairing-URI';

  @override
  String get pairUriHint => 'envoy://pair?…&app=EnvoyHome';

  @override
  String get pairConnect => 'Verbinden';

  @override
  String get pairDirectHint =>
      'Erreichen Sie den Desktop in diesem Netz (LAN / Tailscale). Token erforderlich.';

  @override
  String get pairHostPort => 'Host:Port';

  @override
  String get pairHostPortHint => '192.168.1.10:4780';

  @override
  String get pairToken => 'Pairing-Token';

  @override
  String get pairTokenHelper => 'Aus Desktop-Einstellungen → Geräte koppeln';

  @override
  String get pairSshHint =>
      'Tunnel über einen SSH-Hop. Der Daemon sieht Loopback — Token optional.';

  @override
  String get pairSshHost => 'SSH-Host';

  @override
  String get pairSshUser => 'Benutzer';

  @override
  String get pairSshUserHint => 'root';

  @override
  String get pairSshPort => 'Port';

  @override
  String get pairSshPassword => 'SSH-Passwort';

  @override
  String get pairDaemon => 'Daemon auf der Gegenseite';

  @override
  String get pairDaemonHint => '127.0.0.1:4780';

  @override
  String get pairTokenOptional => 'Token (optional)';

  @override
  String get shellOnline => 'online';

  @override
  String get shellDegraded => 'eingeschränkt';

  @override
  String get shellOffline => 'offline';

  @override
  String get shellConnect => 'Verbinden';

  @override
  String get shellReconnect => 'Erneut verbinden';

  @override
  String get shellDisconnect => 'Trennen';

  @override
  String get shellForgetPairing => 'Kopplung vergessen';

  @override
  String get connectGuideTitle => 'Mit dem Zuhause verbinden';

  @override
  String get connectGuideHint =>
      'Öffnen Sie am Desktop Einstellungen → Geräte koppeln und scannen Sie den QR-Code — oder fügen Sie den Pairing-Link / Host ein.';

  @override
  String get connectGuideReconnectHint =>
      'Dieses Telefon ist bereits gekoppelt. Stellen Sie die Verbindung wieder her, oder koppeln Sie erneut bei einem neuen Zuhause.';

  @override
  String get settingsNeedConnect =>
      'Verbinden Sie sich, um LLM, Verbindungen, Skills und System zu konfigurieren.';

  @override
  String get shellProfilePending =>
      'Das Profil wird aus dem Pairing dieses Geräts gewählt.';

  @override
  String shellProfileOne(String id) {
    return 'Profil · $id';
  }

  @override
  String get shellProfile => 'Profil';

  @override
  String shellMeshHint(String mesh) {
    return 'mesh $mesh · Tabs zum Aktualisieren ziehen';
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
  String get navApprovals => 'Freigaben';

  @override
  String get navModels => 'Modelle';

  @override
  String get navArtifacts => 'Artefakte';

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
  String get chatNeedAccount => 'Wählen Sie oben ein Konto, bevor Sie chatten.';

  @override
  String get chatEmptyMessage => 'Leere Nachricht.';

  @override
  String get chatSessionTitle => 'Telefon-Chat';

  @override
  String get chatEmptyTitle => 'Nachricht an Ihren Home-Agenten';

  @override
  String get chatEmptyHint =>
      'Turns laufen auf dem Home-Daemon. Wenn der Agent eine Freigabe braucht, erscheinen Erlauben/Ablehnen hier.';

  @override
  String get chatHint => 'Nachricht…';

  @override
  String chatSubscribeFailed(String error) {
    return 'Abo fehlgeschlagen: $error';
  }

  @override
  String chatStatus(String status) {
    return 'Status: $status';
  }

  @override
  String chatError(String error) {
    return 'Fehler: $error';
  }

  @override
  String get approvalsTitle => 'Freigaben';

  @override
  String get approvalsHint =>
      'Tool- und Aktuationsanfragen warten auf eine Entscheidung.';

  @override
  String get approvalsNeedAccount =>
      'Wählen Sie ein Konto, um Freigaben zu laden.';

  @override
  String get approvalsEmptyTitle => 'Posteingang leer';

  @override
  String get approvalsEmptyHint => 'Derzeit nichts ausstehend.';

  @override
  String get approvalsActuation => 'Aktuation';

  @override
  String get approvalsAllow => 'Erlauben';

  @override
  String get approvalsDeny => 'Ablehnen';

  @override
  String get approvalsAllowed => 'Erlaubt';

  @override
  String get approvalsDenied => 'Abgelehnt';

  @override
  String approvalsFailed(String error) {
    return 'Fehlgeschlagen: $error';
  }

  @override
  String get modelsTitle => 'Modelle';

  @override
  String get modelsOwnerHint =>
      'Aktivieren Sie Local oder Ollama auf dem Home-Rechner. Fürs Erste Desktop bevorzugen.';

  @override
  String get modelsReadonlyHint =>
      'Nur Lesen auf diesem Gerät. Desktop-Einstellungen → Modelle (oder vertrauenswürdiges Owner-Telefon) nutzen.';

  @override
  String get modelsLocal => 'Lokales Modell';

  @override
  String get modelsOwnerTrusted =>
      'Lokaler Engine-Status braucht ein vertrauenswürdiges Owner-Gerät.';

  @override
  String get modelsResponding => 'antwortet';

  @override
  String get modelsNotResponding => 'antwortet nicht';

  @override
  String get modelsDisabled => 'deaktiviert';

  @override
  String get modelsGguf => 'GGUF auf Disk';

  @override
  String get modelsEnableLocal => 'Local aktivieren';

  @override
  String get modelsUseOllama => 'Ollama nutzen';

  @override
  String get modelsDisable => 'Deaktivieren';

  @override
  String get modelsLocalOnly => 'Nur lokal für Konto';

  @override
  String get modelsThisAccount => 'Dieses Konto';

  @override
  String get modelsNeedAccount => 'accountId oben setzen.';

  @override
  String modelsDefault(String id) {
    return 'Standard: $id';
  }

  @override
  String modelsPool(String filter) {
    return 'Pool: $filter';
  }

  @override
  String get modelsModeMesh => 'Mesh lokal';

  @override
  String get modelsModeSpawn => 'Home llama-server';

  @override
  String get modelsModeOllama => 'Ollama';

  @override
  String get modelsModeOff => 'Aus';

  @override
  String get modelsNotConnected => 'Nicht verbunden';

  @override
  String get modelsSetAccount =>
      'accountId setzen, um Standardmodell und Pool zu sehen.';

  @override
  String get modelsUpdated => 'Aktualisiert';

  @override
  String get modelsLocalEnabled => 'Local aktiviert';

  @override
  String get modelsOllamaEnabled => 'Ollama aktiviert';

  @override
  String get modelsLocalDisabled => 'Local deaktiviert';

  @override
  String get modelsLocalOnlySet => 'Nur-lokal-Routing gesetzt';

  @override
  String get modelsDefaultLabel => 'Standard';

  @override
  String get modelsOffLabel => 'aus';

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
  String get artifactsTitle => 'Artefakte';

  @override
  String get artifactsHint =>
      'Signierte Links vom Home-Daemon. Tippen zum Öffnen.';

  @override
  String get artifactsNeedAccount => 'Konto wählen, um Artefakte anzuzeigen.';

  @override
  String get artifactsEmptyTitle => 'Noch keine Artefakte';

  @override
  String get artifactsEmptyHint =>
      'Zum Aktualisieren ziehen, nachdem eine Datei erzeugt wurde.';

  @override
  String get artifactsUrlCopied => 'Öffnen fehlgeschlagen — URL kopiert';

  @override
  String artifactsOpenFailed(String error) {
    return 'Öffnen fehlgeschlagen: $error';
  }

  @override
  String chatPendingApprovals(int count) {
    return '$count warten auf Ihre Freigabe';
  }
}
