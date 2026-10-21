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
  String get navSchedulesChat => 'Promemoria';

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
  String get navApprovals => 'Approvazioni';

  @override
  String get navModels => 'Modelli';

  @override
  String get navArtifacts => 'Artefatti';

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
      'Collegati per configurare LLM, Connessioni, Skill e Sistema.';

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
  String get profilesShareLocationTitle => 'Condividi posizione con Home';

  @override
  String get profilesShareLocationSubtitle =>
      'Allega GPS approssimativo ai turni di chat. Permesso richiesto una sola volta qui; mai a ogni invio. Solo effimero — non in memoria.';

  @override
  String get profilesShareLocationDenied =>
      'Permesso di localizzazione non concesso. Condivisione resta disattivata.';

  @override
  String get profilesShareLocationOn =>
      'Condivisione posizione attiva su questo dispositivo';

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
  String get schedulesChatSessionTitle => 'Promemoria';

  @override
  String get schedulesChatEmptyTitle => 'Promemoria';

  @override
  String get schedulesChatEmptyHint =>
      'Questa chat resta sui promemoria. Conferma l’orario prima di attivarlo.';

  @override
  String get schedulesChatHint => 'Ricordami…';

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
  String get schedTabRepeating => 'Ricorrenti';

  @override
  String get schedTabOnce => 'Una volta';

  @override
  String get schedTabHistory => 'Cronologia';

  @override
  String get schedNoneRepeating => 'Nessuna pianificazione ricorrente.';

  @override
  String get schedNoneOnce => 'Nessun promemoria una tantum.';

  @override
  String get schedNoReceipts => 'Nessuna esecuzione.';

  @override
  String get schedHistoryNotSet => 'Not set';

  @override
  String get schedHistoryRuns => 'Runs';

  @override
  String get schedNoDismissed => 'No canceled or expired proposals.';

  @override
  String get schedDismissedCanceled => 'Annullato';

  @override
  String get schedDismissedExpired => 'Scaduto';

  @override
  String get schedNext => 'Prossima';

  @override
  String get schedKindRepeating => 'Si ripete';

  @override
  String get schedKindOnce => 'Una volta';

  @override
  String get schedKindDaily => 'Giornaliero';

  @override
  String get schedKindWeekdays => 'Giorni feriali';

  @override
  String get schedKindWeekly => 'Settimanale';

  @override
  String get schedKindMonthly => 'Mensile';

  @override
  String get schedKindYearly => 'Annuale';

  @override
  String get schedKindEvery => 'Ogni';

  @override
  String schedDayOfMonth(String d) {
    return 'giorno $d';
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
  String get chatThought => 'Ragionamento';

  @override
  String get chatNew => 'Nuova chat';

  @override
  String get chatNewNamePrompt => 'Nome chat';

  @override
  String get chatNewNamePlaceholder => 'es. Piani del weekend';

  @override
  String get chatNewNameHint =>
      'Assegna un nome ora, oppure avvia senza — il titolo userà il primo messaggio.';

  @override
  String get chatNewSkip => 'Avvia senza nome';

  @override
  String get chatNewCreate => 'Crea';

  @override
  String get chatNewNeedName =>
      'Inserisci un nome, oppure scegli Avvia senza nome.';

  @override
  String get chatNewStart => 'Avvia chat';

  @override
  String get chatOpenArtifact => 'Apri risposta completa';

  @override
  String get chatRecents => 'Recenti';

  @override
  String get chatRecentsEmpty => 'Nessuna chat precedente.';

  @override
  String get chatSessionsEmpty => 'Nessuna chat. Iniziane una nuova.';

  @override
  String get chatUntitled => 'Chat senza titolo';

  @override
  String get chatRenameAction => 'Rinomina';

  @override
  String get chatRenamePrompt => 'Nome chat';

  @override
  String get chatRenameDone => 'Chat rinominata.';

  @override
  String get chatRenameEmpty => 'Il nome non può essere vuoto.';

  @override
  String get chatRenameNeedSession => 'Invia prima un messaggio, poi rinomina.';

  @override
  String get chatBusyTurn =>
      'Attendi che la risposta corrente finisca (o annulla).';

  @override
  String get chatEmptyAction => 'Svuota chat';

  @override
  String get chatEmptyConfirmTitle => 'Svuotare questa chat?';

  @override
  String get chatEmptyConfirmBody =>
      'Tutti i messaggi di questo thread verranno rimossi. La chat resta.';

  @override
  String get chatTrashMenu => 'Azioni chat';

  @override
  String get chatArchiveAction => 'Archivia chat';

  @override
  String get chatUnarchiveAction => 'Ripristina in Chat';

  @override
  String get chatUnarchiveDone => 'Chat ripristinata.';

  @override
  String get chatArchivedOpen => 'Archiviate';

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
  String get chatArchivedTitle => 'Chat archiviate';

  @override
  String get chatArchivedBack => 'Torna alle chat';

  @override
  String get chatArchivedEmpty => 'Nessuna chat archiviata.';

  @override
  String get chatRemoveAction => 'Elimina chat';

  @override
  String get chatArchiveConfirmTitle => 'Archiviare questa chat?';

  @override
  String get chatArchiveConfirmBody =>
      'Sparirà da Recenti ma resterà su disco.';

  @override
  String get chatRemoveConfirmTitle => 'Eliminare questa chat?';

  @override
  String get chatRemoveConfirmBody =>
      'Elimina definitivamente questa chat e tutti i messaggi.';

  @override
  String get chatRemoveDone => 'Chat eliminata.';

  @override
  String get chatNoSession => 'Nessuna chat attiva.';

  @override
  String get chatDeleteFailed =>
      'Impossibile eliminare il messaggio sul server.';

  @override
  String get chatDeleteMessage => 'Elimina messaggio';

  @override
  String get chatCopyMessage => 'Copia messaggio';

  @override
  String get chatCopied => 'Copiato';

  @override
  String get chatCancel => 'Annulla';

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
      'Si apre nell’app via connessione home (nessun URL pubblico).';

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
  String get artifactsTooLarge =>
      'This file is larger than the 8 MB in-app open limit. Ask the agent for a smaller export, or open it on the home machine.';

  @override
  String get artifactsRefresh => 'Aggiorna';

  @override
  String get artifactsRetry => 'Riprova';

  @override
  String get artifactsBinaryHint =>
      'Questo tipo di file non è anteprimabile qui. Usa Condividi/Salva per aprirlo in un’altra app, o chiedi un export testo o Markdown.';

  @override
  String get artifactsShare => 'Condividi / Salva';

  @override
  String artifactsShareFailed(String error) {
    return 'Condivisione non riuscita: $error';
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
    return 'Apri $name';
  }

  @override
  String chatPendingApprovals(int count) {
    return '$count in attesa della tua approvazione';
  }

  @override
  String get choiceCardConfirm => 'Conferma';

  @override
  String get choiceCardPickOne => 'Seleziona almeno un\'opzione.';

  @override
  String get choiceCardAnswered => 'Ricevuto.';

  @override
  String choiceCardFailed(String error) {
    return 'Impossibile inviare la scelta: $error';
  }

  @override
  String chatPendingChoices(int count) {
    return '$count in attesa della tua scelta';
  }

  @override
  String get choiceCardCancel => 'Annulla';

  @override
  String get choiceCardCanceled => 'Scelta annullata.';

  @override
  String get choiceCardExpired => 'Scaduto';

  @override
  String get choiceCardExpiredHint =>
      'Questa scelta è scaduta — chiedi di nuovo se serve.';

  @override
  String choiceCardExpiresIn(int mins) {
    return 'Scade tra $mins min';
  }

  @override
  String get choiceCardTextPlaceholder => 'Scrivi la risposta';

  @override
  String get schedulesChatTabChat => 'Programmi';

  @override
  String get schedulesChatTabHistories => 'Cronologie';

  @override
  String get schedulesChatHistoriesHint =>
      'Proposte annullate o scadute ed esecuzioni recenti.';

  @override
  String get jobsHistoriesMovedHint => 'Cronologia in Programmi → Cronologie';

  @override
  String schedulesChatClosedAt(String when) {
    return 'Chiuso $when';
  }

  @override
  String schedulesChatRanAt(String when) {
    return 'Eseguito $when';
  }
}
