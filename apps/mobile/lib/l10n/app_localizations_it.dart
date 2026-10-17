// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Italian (`it`).
class AppLocalizationsIt extends AppLocalizations {
  AppLocalizationsIt([String locale = 'it']) : super(locale);

  @override
  String get appName => 'EnvoyHome';

  @override
  String get appLanguage => 'Lingua';

  @override
  String get appThemePicker => 'Aspetto';

  @override
  String get appThemeSystem => 'Sistema';

  @override
  String get appThemeLight => 'Chiaro';

  @override
  String get appThemeDark => 'Scuro';

  @override
  String get pairLede =>
      'Unisciti al desktop di casa via EnvoyMesh — scansiona un QR, inserisci host:port o passa via SSH.';

  @override
  String get pairTabLink => 'Link';

  @override
  String get pairTabHost => 'Host:porta';

  @override
  String get pairTabSsh => 'SSH';

  @override
  String get pairFooter => 'com.envoymesh.envoyhome · push dopo l’abbinamento';

  @override
  String get pairCloseScanner => 'Chiudi scanner';

  @override
  String get pairScanQr => 'Scansiona QR di abbinamento';

  @override
  String get pairUriLabel => 'URI di abbinamento';

  @override
  String get pairUriHint => 'envoy://pair?…&app=EnvoyHome';

  @override
  String get pairConnect => 'Connetti';

  @override
  String get pairDirectHint =>
      'Raggiungi il desktop su questa rete (LAN / Tailscale). Il token è obbligatorio.';

  @override
  String get pairHostPort => 'Host:porta';

  @override
  String get pairHostPortHint => '192.168.1.10:4780';

  @override
  String get pairToken => 'Token di abbinamento';

  @override
  String get pairTokenHelper => 'Da Impostazioni desktop → Abbina dispositivi';

  @override
  String get pairSshHint =>
      'Tunnel tramite hop SSH. Il demone vede il loopback — token opzionale.';

  @override
  String get pairSshHost => 'Host SSH';

  @override
  String get pairSshUser => 'Utente';

  @override
  String get pairSshUserHint => 'root';

  @override
  String get pairSshPort => 'Porta';

  @override
  String get pairSshPassword => 'Password SSH';

  @override
  String get pairDaemon => 'Demone sul lato remoto';

  @override
  String get pairDaemonHint => '127.0.0.1:4780';

  @override
  String get pairTokenOptional => 'Token (opzionale)';

  @override
  String get shellOnline => 'online';

  @override
  String get shellDegraded => 'degradato';

  @override
  String get shellOffline => 'offline';

  @override
  String get shellConnect => 'Connetti';

  @override
  String get shellReconnect => 'Riconnetti';

  @override
  String get shellDisconnect => 'Disconnetti';

  @override
  String get shellForgetPairing => 'Dimentica associazione';

  @override
  String get connectGuideTitle => 'Collegati a casa';

  @override
  String get connectGuideHint =>
      'Sul desktop apri Impostazioni → Associa dispositivi e scansiona il QR — oppure incolla il link / host.';

  @override
  String get connectGuideReconnectHint =>
      'Questo telefono è già associato. Riconnettiti al desktop, oppure associa di nuovo se hai cambiato casa.';

  @override
  String get settingsNeedConnect =>
      'Collegati per configurare LLM, Connessioni, Skill e Sistema.';

  @override
  String get shellProfilePending =>
      'Il profilo sarà scelto dall’abbinamento di questo dispositivo.';

  @override
  String shellProfileOne(String id) {
    return 'Profilo · $id';
  }

  @override
  String get shellProfile => 'Profilo';

  @override
  String shellMeshHint(String mesh) {
    return 'mesh $mesh · tira le schede per aggiornare';
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
  String get navApprovals => 'Approvazioni';

  @override
  String get navModels => 'Modelli';

  @override
  String get navArtifacts => 'Artefatti';

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
  String get chatNeedAccount => 'Scegli un account sopra prima di chattare.';

  @override
  String get chatEmptyMessage => 'Messaggio vuoto.';

  @override
  String get chatSessionTitle => 'Chat telefono';

  @override
  String get chatEmptyTitle => 'Messaggio all’agente di casa';

  @override
  String get chatEmptyHint =>
      'I turni girano sul demone di casa. Quando l’agente serve un permesso, Consenti/Nega compare qui.';

  @override
  String get chatHint => 'Messaggio…';

  @override
  String chatSubscribeFailed(String error) {
    return 'iscrizione non riuscita: $error';
  }

  @override
  String chatStatus(String status) {
    return 'stato: $status';
  }

  @override
  String chatError(String error) {
    return 'errore: $error';
  }

  @override
  String get approvalsTitle => 'Approvazioni';

  @override
  String get approvalsHint =>
      'Richieste di tool e attuazione in attesa di decisione.';

  @override
  String get approvalsNeedAccount =>
      'Scegli un account per caricare le approvazioni.';

  @override
  String get approvalsEmptyTitle => 'Posta vuota';

  @override
  String get approvalsEmptyHint => 'Niente in sospeso al momento.';

  @override
  String get approvalsActuation => 'Attuazione';

  @override
  String get approvalsAllow => 'Consenti';

  @override
  String get approvalsDeny => 'Nega';

  @override
  String get approvalsAllowed => 'Consentito';

  @override
  String get approvalsDenied => 'Negato';

  @override
  String approvalsFailed(String error) {
    return 'Non riuscito: $error';
  }

  @override
  String get modelsTitle => 'Modelli';

  @override
  String get modelsOwnerHint =>
      'Abilita Local o Ollama sulla macchina di casa. Preferisci Desktop per la prima configurazione.';

  @override
  String get modelsReadonlyHint =>
      'Solo lettura su questo dispositivo. Usa Impostazioni desktop → Modelli (o telefono owner fidato) per abilitare Local.';

  @override
  String get modelsLocal => 'Modello locale';

  @override
  String get modelsOwnerTrusted =>
      'Lo stato del motore locale richiede un dispositivo owner fidato.';

  @override
  String get modelsResponding => 'risponde';

  @override
  String get modelsNotResponding => 'non risponde';

  @override
  String get modelsDisabled => 'disabilitato';

  @override
  String get modelsGguf => 'GGUF su disco';

  @override
  String get modelsEnableLocal => 'Abilita Local';

  @override
  String get modelsUseOllama => 'Usa Ollama';

  @override
  String get modelsDisable => 'Disabilita';

  @override
  String get modelsLocalOnly => 'Solo locale per account';

  @override
  String get modelsThisAccount => 'Questo account';

  @override
  String get modelsNeedAccount => 'Imposta accountId sopra.';

  @override
  String modelsDefault(String id) {
    return 'Predefinito: $id';
  }

  @override
  String modelsPool(String filter) {
    return 'Pool: $filter';
  }

  @override
  String get modelsModeMesh => 'Mesh locale';

  @override
  String get modelsModeSpawn => 'Home llama-server';

  @override
  String get modelsModeOllama => 'Ollama';

  @override
  String get modelsModeOff => 'Spento';

  @override
  String get modelsNotConnected => 'Non connesso';

  @override
  String get modelsSetAccount =>
      'Imposta accountId per vedere modello e pool predefiniti.';

  @override
  String get modelsUpdated => 'Aggiornato';

  @override
  String get modelsLocalEnabled => 'Local abilitato';

  @override
  String get modelsOllamaEnabled => 'Ollama abilitato';

  @override
  String get modelsLocalDisabled => 'Local disabilitato';

  @override
  String get modelsLocalOnlySet => 'Routing solo locale impostato';

  @override
  String get modelsDefaultLabel => 'predefinito';

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
  String get artifactsTitle => 'Artefatti';

  @override
  String get artifactsHint =>
      'Link firmati dal demone di casa. Tocca per aprire.';

  @override
  String get artifactsNeedAccount =>
      'Scegli un account per elencare gli artefatti.';

  @override
  String get artifactsEmptyTitle => 'Nessun artefatto';

  @override
  String get artifactsEmptyHint =>
      'Tira per aggiornare dopo che l’agente produce un file.';

  @override
  String get artifactsUrlCopied => 'Impossibile aprire — URL copiato';

  @override
  String artifactsOpenFailed(String error) {
    return 'Apertura non riuscita: $error';
  }

  @override
  String chatPendingApprovals(int count) {
    return '$count in attesa della tua approvazione';
  }
}
