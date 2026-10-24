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
  String get navChat => 'Chats';

  @override
  String get navHomeChat => 'Home';

  @override
  String get navSchedulesChat => 'Horaires';

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
  String get navApprovals => 'Approbations';

  @override
  String get navModels => 'Modèles';

  @override
  String get navArtifacts => 'Artefacts';

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
  String get settingsNeedConnect =>
      'Connectez-vous pour configurer LLM, Connexions, Compétences et Système.';

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
  String get profilesShareLocationTitle => 'Partager la position avec Home';

  @override
  String get profilesShareLocationSubtitle =>
      'Joindre un GPS approximatif aux tours de chat. Permission demandée une fois ici ; jamais à chaque envoi. Éphémère seulement — pas en mémoire.';

  @override
  String get profilesShareLocationDenied =>
      'Permission de localisation refusée. Le partage reste désactivé.';

  @override
  String get profilesShareLocationOn =>
      'Partage de position activé sur cet appareil';

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
  String get schedulesChatSessionTitle => 'Horaires';

  @override
  String get schedulesChatEmptyTitle => 'Rappels';

  @override
  String get schedulesChatEmptyHint =>
      'Ce fil reste sur les rappels. Confirmez l’heure avant activation.';

  @override
  String get schedulesChatHint => 'Rappelle-moi…';

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
  String get schedTabRepeating => 'Récurrents';

  @override
  String get schedTabOnce => 'Une fois';

  @override
  String get schedTabHistory => 'Historique';

  @override
  String get schedNoneRepeating => 'Aucun planning récurrent.';

  @override
  String get schedNoneOnce => 'Aucun rappel unique.';

  @override
  String get schedNoReceipts => 'Aucune exécution.';

  @override
  String get schedHistoryNotSet => 'Not set';

  @override
  String get schedHistoryRuns => 'Runs';

  @override
  String get schedNoDismissed => 'No canceled or expired proposals.';

  @override
  String get schedDismissedCanceled => 'Annulé';

  @override
  String get schedDismissedExpired => 'Expiré';

  @override
  String get schedNext => 'Prochain';

  @override
  String get schedKindRepeating => 'Récurrent';

  @override
  String get schedKindOnce => 'Une fois';

  @override
  String get schedKindDaily => 'Quotidien';

  @override
  String get schedKindWeekdays => 'Jours ouvrés';

  @override
  String get schedKindWeekly => 'Hebdomadaire';

  @override
  String get schedKindMonthly => 'Mensuel';

  @override
  String get schedKindYearly => 'Annuel';

  @override
  String get schedKindEvery => 'Toutes les';

  @override
  String schedDayOfMonth(String d) {
    return 'jour $d';
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
  String get chatThought => 'Réflexion';

  @override
  String get chatNew => 'Nouveau chat';

  @override
  String get chatNewNamePrompt => 'Nom du chat';

  @override
  String get chatNewNamePlaceholder => 'ex. Plans du week-end';

  @override
  String get chatNewNameHint =>
      'Nommez-le maintenant, ou démarrez sans nom — le titre viendra du premier message.';

  @override
  String get chatNewSkip => 'Démarrer sans nom';

  @override
  String get chatNewCreate => 'Créer';

  @override
  String get chatNewNeedName =>
      'Saisissez un nom, ou choisissez Démarrer sans nom.';

  @override
  String get chatNewStart => 'Démarrer';

  @override
  String get chatOpenArtifact => 'Ouvrir la réponse complète';

  @override
  String get chatRecents => 'Récents';

  @override
  String get chatRecentsEmpty => 'Aucun chat antérieur.';

  @override
  String get chatSessionsEmpty => 'Aucun chat. Commencez-en un nouveau.';

  @override
  String get chatUntitled => 'Chat sans titre';

  @override
  String get chatRenameAction => 'Renommer';

  @override
  String get chatRenamePrompt => 'Nom de la chat';

  @override
  String get chatRenameDone => 'Chat renommée.';

  @override
  String get chatRenameEmpty => 'Le nom ne peut pas être vide.';

  @override
  String get chatRenameNeedSession =>
      'Envoyez d’abord un message, puis renommez.';

  @override
  String get chatBusyTurn =>
      'Attendez la fin de la réponse en cours (ou annulez).';

  @override
  String get chatEmptyAction => 'Vider le chat';

  @override
  String get chatEmptyConfirmTitle => 'Vider ce chat ?';

  @override
  String get chatEmptyConfirmBody =>
      'Tous les messages de ce fil seront supprimés. Le chat lui-même reste.';

  @override
  String get chatTrashMenu => 'Actions du chat';

  @override
  String get chatArchiveAction => 'Archiver le chat';

  @override
  String get chatUnarchiveAction => 'Restaurer dans Chats';

  @override
  String get chatUnarchiveDone => 'Chat restauré.';

  @override
  String get chatArchivedOpen => 'Archivés';

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
  String get chatArchivedTitle => 'Chats archivés';

  @override
  String get chatArchivedBack => 'Retour aux chats';

  @override
  String get chatArchivedEmpty => 'Aucun chat archivé.';

  @override
  String get chatRemoveAction => 'Supprimer le chat';

  @override
  String get chatArchiveConfirmTitle => 'Archiver ce chat ?';

  @override
  String get chatArchiveConfirmBody =>
      'Il quittera Récents mais restera sur le disque.';

  @override
  String get chatRemoveConfirmTitle => 'Supprimer ce chat ?';

  @override
  String get chatRemoveConfirmBody =>
      'Supprimer définitivement ce chat et tous ses messages.';

  @override
  String get chatRemoveDone => 'Chat supprimé.';

  @override
  String get chatNoSession => 'Aucune session de chat active.';

  @override
  String get chatDeleteFailed =>
      'Impossible de supprimer ce message sur le serveur.';

  @override
  String get chatDeleteMessage => 'Supprimer le message';

  @override
  String get chatCopyMessage => 'Copier le message';

  @override
  String get chatCopied => 'Copié';

  @override
  String get chatCancel => 'Annuler';

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
      'S’ouvre dans l’app via la connexion domestique (pas d’URL publique requise).';

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
  String get artifactsTooLarge =>
      'This file is larger than the 8 MB in-app open limit. Ask the agent for a smaller export, or open it on the home machine.';

  @override
  String get artifactsRefresh => 'Actualiser';

  @override
  String get artifactsRetry => 'Réessayer';

  @override
  String get artifactsBinaryHint =>
      'Ce type de fichier n’est pas prévisualisable ici. Utilisez Partager/Enregistrer pour l’ouvrir ailleurs, ou demandez un export texte ou Markdown.';

  @override
  String get artifactsShare => 'Partager / Enregistrer';

  @override
  String artifactsShareFailed(String error) {
    return 'Partage impossible : $error';
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
    return 'Ouvrir $name';
  }

  @override
  String chatPendingApprovals(int count) {
    return '$count en attente de votre approbation';
  }

  @override
  String get choiceCardConfirm => 'Confirmer';

  @override
  String get choiceCardPickOne => 'Choisissez au moins une option.';

  @override
  String get choiceCardAnswered => 'Reçu.';

  @override
  String choiceCardFailed(String error) {
    return 'Impossible d\'envoyer ce choix : $error';
  }

  @override
  String chatPendingChoices(int count) {
    return '$count en attente de votre choix';
  }

  @override
  String get choiceCardCancel => 'Annuler';

  @override
  String get choiceCardCanceled => 'Choix annulé.';

  @override
  String get choiceCardExpired => 'Expiré';

  @override
  String get choiceCardExpiredHint =>
      'Ce choix a expiré — reposez la question si besoin.';

  @override
  String choiceCardExpiresIn(int mins) {
    return 'Expire dans $mins min';
  }

  @override
  String get choiceCardTextPlaceholder => 'Saisissez votre réponse';

  @override
  String get schedulesChatTabChat => 'Plannings';

  @override
  String get schedulesChatTabHistories => 'Historiques';

  @override
  String get schedulesChatHistoriesHint =>
      'Propositions annulées ou expirées, et exécutions récentes.';

  @override
  String get jobsHistoriesMovedHint =>
      'Historique sous Plannings → Historiques';

  @override
  String schedulesChatClosedAt(String when) {
    return 'Fermé $when';
  }

  @override
  String schedulesChatRanAt(String when) {
    return 'Exécuté $when';
  }

  @override
  String get welcomeSkip => 'Passer';

  @override
  String get welcomeNext => 'Suivant';

  @override
  String get commonContinue => 'Continuer';

  @override
  String get welcomeSlide1Title => 'Bienvenue sur EnvoyHome';

  @override
  String get welcomeSlide1Body =>
      'Votre téléphone est une fenêtre vers un agent maison auto-hébergé — chat, validations et maison connectée restent sur le bureau.';

  @override
  String get welcomeSlide2Title => 'Le travail se fait sur l’ordinateur';

  @override
  String get welcomeSlide2Body =>
      'Installez EnvoyHome sur un Mac ou PC à la maison. Le démon, les modèles et la mémoire du foyer restent là — le téléphone est une fenêtre à distance.';

  @override
  String get welcomeSlide3Title => 'Apparier avec un QR';

  @override
  String get welcomeSlide3Body =>
      'Sur l’ordinateur, ouvrez EnvoyHome et affichez le QR d’appariement. Sur ce téléphone, touchez Apparier maintenant et scannez. Vous pouvez aussi coller un lien.';

  @override
  String get welcomeSlideRequiredTitle => 'Apparier pour commencer';

  @override
  String get welcomeSlideRequiredBody =>
      'EnvoyHome a besoin d’un ordinateur avec l’app bureau. Agents et contrôle maison y tournent — appariez ce téléphone pour continuer.';

  @override
  String get setupGuideTitle => 'Comment fonctionne EnvoyHome';

  @override
  String get setupGuideIntro =>
      'EnvoyHome sur le téléphone parle à EnvoyHome sur l’ordinateur de maison. Installez le bureau, appariez une fois, puis discutez et validez de partout.';

  @override
  String get setupGuidePairRequiredTitle => 'Apparier pour continuer';

  @override
  String get setupGuidePairRequiredBody =>
      'EnvoyHome est le compagnon téléphone de votre bureau maison. Sans ordinateur apparié, il n’y a encore rien à afficher ici.';

  @override
  String get setupGuideStep1Title => 'Préparer un ordinateur';

  @override
  String get setupGuideStep1Body =>
      'Il vous faut un Mac ou un PC Windows/Linux à la maison. C’est l’hôte EnvoyHome — démon et agents y tournent.';

  @override
  String get setupGuideStep2Title => 'Télécharger et installer EnvoyHome';

  @override
  String get setupGuideStep2Body =>
      'Ouvrez le QuickStart et installez le démon ainsi que l’app bureau. Lancez-les et laissez-les tourner.';

  @override
  String get setupGuideDownloadCta => 'Ouvrir le QuickStart EnvoyHome';

  @override
  String get setupGuideStep3Title => 'Afficher le QR d’appariement';

  @override
  String get setupGuideStep3Body =>
      'Dans EnvoyHome bureau : Réglages → Apparier des appareils. Gardez le QR à l’écran (avec mesh/relais, pas LAN seul).';

  @override
  String get setupGuideStep4Title => 'Scanner avec ce téléphone';

  @override
  String get setupGuideStep4Body =>
      'Touchez Apparier maintenant. Autorisez la caméra, scannez le QR. Ou collez un lien envoy:// / hôte:port / SSH.';

  @override
  String get setupGuideStep5Title => 'Vous êtes connecté';

  @override
  String get setupGuideStep5Body =>
      'Après l’appariement, ce téléphone montre chats, validations et Réglages. Le bureau continue même sans téléphone.';

  @override
  String get setupGuideNoHomeTitle => 'Apparier plus tard convient';

  @override
  String get setupGuideNoHomeBody =>
      'Vous pouvez continuer et apparier à tout moment depuis Connexion. Sans ordinateur, il n’y a encore rien à afficher.';

  @override
  String get setupGuidePairCta => 'Apparier maintenant';

  @override
  String get setupGuidePairLaterCta => 'Plus tard';

  @override
  String get setupGuideSkipCta => 'Explorer d’abord';

  @override
  String get setupGuideDoneCta => 'Compris';

  @override
  String get settingsSetupGuideSubtitle =>
      'Installer l’app bureau et apparier ce téléphone.';
}
