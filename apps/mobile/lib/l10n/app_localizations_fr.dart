// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appName => 'EnvoyHome';

  @override
  String get appLanguage => 'Langue';

  @override
  String get appThemePicker => 'Apparence';

  @override
  String get appThemeSystem => 'Système';

  @override
  String get appThemeLight => 'Clair';

  @override
  String get appThemeDark => 'Sombre';

  @override
  String get pairLede =>
      'Rejoignez le bureau domestique via EnvoyMesh — scannez un QR, saisissez host:port, ou passez par SSH.';

  @override
  String get pairTabLink => 'Lien';

  @override
  String get pairTabHost => 'Hôte:port';

  @override
  String get pairTabSsh => 'SSH';

  @override
  String get pairFooter => 'com.envoymesh.envoyhome · push après appairage';

  @override
  String get pairCloseScanner => 'Fermer le scanneur';

  @override
  String get pairScanQr => 'Scanner le QR d’appairage';

  @override
  String get pairUriLabel => 'URI d’appairage';

  @override
  String get pairUriHint => 'envoy://pair?…&app=EnvoyHome';

  @override
  String get pairConnect => 'Connecter';

  @override
  String get pairDirectHint =>
      'Atteignez le bureau sur ce réseau (LAN / Tailscale). Un jeton est requis.';

  @override
  String get pairHostPort => 'Hôte:port';

  @override
  String get pairHostPortHint => '192.168.1.10:4780';

  @override
  String get pairToken => 'Jeton d’appairage';

  @override
  String get pairTokenHelper =>
      'Depuis Réglages bureau → Appairer des appareils';

  @override
  String get pairSshHint =>
      'Tunnel via un saut SSH. Le démon voit la boucle locale — jeton facultatif.';

  @override
  String get pairSshHost => 'Hôte SSH';

  @override
  String get pairSshUser => 'Utilisateur';

  @override
  String get pairSshUserHint => 'root';

  @override
  String get pairSshPort => 'Port';

  @override
  String get pairSshPassword => 'Mot de passe SSH';

  @override
  String get pairDaemon => 'Démon côté distant';

  @override
  String get pairDaemonHint => '127.0.0.1:4780';

  @override
  String get pairTokenOptional => 'Jeton (facultatif)';

  @override
  String get shellOnline => 'en ligne';

  @override
  String get shellDegraded => 'dégradé';

  @override
  String get shellOffline => 'hors ligne';

  @override
  String get shellConnect => 'Connecter';

  @override
  String get shellReconnect => 'Reconnecter';

  @override
  String get shellDisconnect => 'Déconnecter';

  @override
  String get shellForgetPairing => 'Oublier l’appairage';

  @override
  String get connectGuideTitle => 'Connectez-vous à la maison';

  @override
  String get connectGuideHint =>
      'Sur le bureau, ouvrez Réglages → Appairer les appareils et scannez le QR — ou collez le lien / l’hôte.';

  @override
  String get connectGuideReconnectHint =>
      'Ce téléphone est déjà appairé. Reconnectez-vous au bureau, ou appairer à nouveau si vous avez changé de maison.';

  @override
  String get settingsNeedConnect =>
      'Connectez-vous pour configurer LLM, Connexions, Compétences et Système.';

  @override
  String get shellProfilePending =>
      'Le profil sera choisi d’après l’appairage de cet appareil.';

  @override
  String shellProfileOne(String id) {
    return 'Profil · $id';
  }

  @override
  String get shellProfile => 'Profil';

  @override
  String shellMeshHint(String mesh) {
    return 'mesh $mesh · tirez les onglets pour actualiser';
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
  String get navApprovals => 'Approbations';

  @override
  String get navModels => 'Modèles';

  @override
  String get navArtifacts => 'Artefacts';

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
  String get chatNeedAccount =>
      'Choisissez un compte ci-dessus avant de discuter.';

  @override
  String get chatEmptyMessage => 'Message vide.';

  @override
  String get chatSessionTitle => 'Chat téléphone';

  @override
  String get chatEmptyTitle => 'Écrivez à votre agent domestique';

  @override
  String get chatEmptyHint =>
      'Les tours s’exécutent sur le démon domestique. Quand l’agent a besoin d’une permission, Autoriser/Refuser apparaît ici.';

  @override
  String get chatHint => 'Message…';

  @override
  String chatSubscribeFailed(String error) {
    return 'échec d’abonnement : $error';
  }

  @override
  String chatStatus(String status) {
    return 'état : $status';
  }

  @override
  String chatError(String error) {
    return 'erreur : $error';
  }

  @override
  String get approvalsTitle => 'Approbations';

  @override
  String get approvalsHint =>
      'Demandes d’outils et d’actuation en attente de décision.';

  @override
  String get approvalsNeedAccount =>
      'Choisissez un compte pour charger les approbations.';

  @override
  String get approvalsEmptyTitle => 'Boîte vide';

  @override
  String get approvalsEmptyHint => 'Rien en attente pour le moment.';

  @override
  String get approvalsActuation => 'Actuation';

  @override
  String get approvalsAllow => 'Autoriser';

  @override
  String get approvalsDeny => 'Refuser';

  @override
  String get approvalsAllowed => 'Autorisé';

  @override
  String get approvalsDenied => 'Refusé';

  @override
  String approvalsFailed(String error) {
    return 'Échec : $error';
  }

  @override
  String get modelsTitle => 'Modèles';

  @override
  String get modelsOwnerHint =>
      'Activez Local ou Ollama sur la machine domestique. Préférez le bureau pour la première config.';

  @override
  String get modelsReadonlyHint =>
      'Lecture seule sur cet appareil. Utilisez Réglages bureau → Modèles (ou un téléphone propriétaire de confiance) pour activer Local.';

  @override
  String get modelsLocal => 'Modèle local';

  @override
  String get modelsOwnerTrusted =>
      'L’état du moteur local nécessite un appareil propriétaire de confiance.';

  @override
  String get modelsResponding => 'répond';

  @override
  String get modelsNotResponding => 'ne répond pas';

  @override
  String get modelsDisabled => 'désactivé';

  @override
  String get modelsGguf => 'GGUF sur disque';

  @override
  String get modelsEnableLocal => 'Activer Local';

  @override
  String get modelsUseOllama => 'Utiliser Ollama';

  @override
  String get modelsDisable => 'Désactiver';

  @override
  String get modelsLocalOnly => 'Local uniquement pour le compte';

  @override
  String get modelsThisAccount => 'Ce compte';

  @override
  String get modelsNeedAccount => 'Définissez accountId ci-dessus.';

  @override
  String modelsDefault(String id) {
    return 'Par défaut : $id';
  }

  @override
  String modelsPool(String filter) {
    return 'Pool : $filter';
  }

  @override
  String get modelsModeMesh => 'Mesh local';

  @override
  String get modelsModeSpawn => 'Home llama-server';

  @override
  String get modelsModeOllama => 'Ollama';

  @override
  String get modelsModeOff => 'Arrêt';

  @override
  String get modelsNotConnected => 'Non connecté';

  @override
  String get modelsSetAccount =>
      'Définissez accountId pour voir le modèle et le pool par défaut.';

  @override
  String get modelsUpdated => 'Mis à jour';

  @override
  String get modelsLocalEnabled => 'Local activé';

  @override
  String get modelsOllamaEnabled => 'Ollama activé';

  @override
  String get modelsLocalDisabled => 'Local désactivé';

  @override
  String get modelsLocalOnlySet => 'Routage local uniquement défini';

  @override
  String get modelsDefaultLabel => 'défaut';

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
  String get artifactsTitle => 'Artefacts';

  @override
  String get artifactsHint =>
      'Liens signés du démon domestique. Appuyez pour ouvrir.';

  @override
  String get artifactsNeedAccount =>
      'Choisissez un compte pour lister les artefacts.';

  @override
  String get artifactsEmptyTitle => 'Aucun artefact';

  @override
  String get artifactsEmptyHint =>
      'Tirez pour actualiser après qu’un fichier soit produit.';

  @override
  String get artifactsUrlCopied => 'Impossible d’ouvrir — URL copiée';

  @override
  String artifactsOpenFailed(String error) {
    return 'Échec d’ouverture : $error';
  }

  @override
  String chatPendingApprovals(int count) {
    return '$count en attente de votre approbation';
  }
}
