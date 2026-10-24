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
  String get navChat => 'Chats';

  @override
  String get navHomeChat => 'Home';

  @override
  String get navSchedulesChat => 'Zeitpläne';

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
  String get navApprovals => 'Freigaben';

  @override
  String get navModels => 'Modelle';

  @override
  String get navArtifacts => 'Artefakte';

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
      'Verbinden Sie sich, um LLM, Verbindungen, Skills und System zu konfigurieren.';

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
  String get profilesShareLocationTitle => 'Standort mit Home teilen';

  @override
  String get profilesShareLocationSubtitle =>
      'Ungefähre GPS-Koordinaten an Chat-Turns anhängen. Berechtigung nur einmal hier; nie bei jedem Senden. Nur ephemer — nicht in den Speicher.';

  @override
  String get profilesShareLocationDenied =>
      'Standortberechtigung nicht erteilt. Teilen bleibt aus.';

  @override
  String get profilesShareLocationOn =>
      'Standortfreigabe auf diesem Gerät aktiv';

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
  String get schedulesChatSessionTitle => 'Zeitpläne';

  @override
  String get schedulesChatEmptyTitle => 'Erinnerungen';

  @override
  String get schedulesChatEmptyHint =>
      'Dieser Chat bleibt bei Erinnerungen. Zeit bestätigen, bevor sie aktiv wird.';

  @override
  String get schedulesChatHint => 'Erinnere mich…';

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
  String get schedTabRepeating => 'Wiederkehrend';

  @override
  String get schedTabOnce => 'Einmalig';

  @override
  String get schedTabHistory => 'Verlauf';

  @override
  String get schedNoneRepeating => 'Noch keine wiederkehrenden Zeitpläne.';

  @override
  String get schedNoneOnce => 'Keine einmaligen Erinnerungen.';

  @override
  String get schedNoReceipts => 'Noch keine Läufe.';

  @override
  String get schedHistoryNotSet => 'Not set';

  @override
  String get schedHistoryRuns => 'Runs';

  @override
  String get schedNoDismissed => 'No canceled or expired proposals.';

  @override
  String get schedDismissedCanceled => 'Abgebrochen';

  @override
  String get schedDismissedExpired => 'Abgelaufen';

  @override
  String get schedNext => 'Nächste';

  @override
  String get schedKindRepeating => 'Wiederholt';

  @override
  String get schedKindOnce => 'Einmal';

  @override
  String get schedKindDaily => 'Täglich';

  @override
  String get schedKindWeekdays => 'Werktags';

  @override
  String get schedKindWeekly => 'Wöchentlich';

  @override
  String get schedKindMonthly => 'Monatlich';

  @override
  String get schedKindYearly => 'Jährlich';

  @override
  String get schedKindEvery => 'Alle';

  @override
  String schedDayOfMonth(String d) {
    return 'Tag $d';
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
  String get chatThought => 'Überlegung';

  @override
  String get chatNew => 'Neuer Chat';

  @override
  String get chatNewNamePrompt => 'Chatname';

  @override
  String get chatNewNamePlaceholder => 'z. B. Wochenendpläne';

  @override
  String get chatNewNameHint =>
      'Jetzt benennen, oder ohne Namen starten — Titel kommt aus der ersten Nachricht.';

  @override
  String get chatNewSkip => 'Ohne Namen starten';

  @override
  String get chatNewCreate => 'Erstellen';

  @override
  String get chatNewNeedName =>
      'Namen eingeben oder „Ohne Namen starten“ wählen.';

  @override
  String get chatNewStart => 'Chat starten';

  @override
  String get chatOpenArtifact => 'Vollständige Antwort öffnen';

  @override
  String get chatRecents => 'Zuletzt';

  @override
  String get chatRecentsEmpty => 'Keine früheren Chats.';

  @override
  String get chatSessionsEmpty => 'Noch keine Chats. Starten Sie einen neuen.';

  @override
  String get chatUntitled => 'Unbenannter Chat';

  @override
  String get chatRenameAction => 'Umbenennen';

  @override
  String get chatRenamePrompt => 'Chatname';

  @override
  String get chatRenameDone => 'Chat umbenannt.';

  @override
  String get chatRenameEmpty => 'Name darf nicht leer sein.';

  @override
  String get chatRenameNeedSession =>
      'Sende zuerst eine Nachricht, dann umbenennen.';

  @override
  String get chatBusyTurn =>
      'Warte, bis die aktuelle Antwort fertig ist (oder brich ab).';

  @override
  String get chatEmptyAction => 'Chat leeren';

  @override
  String get chatEmptyConfirmTitle => 'Diesen Chat leeren?';

  @override
  String get chatEmptyConfirmBody =>
      'Alle Nachrichten in diesem Thread werden entfernt. Der Chat bleibt bestehen.';

  @override
  String get chatTrashMenu => 'Chat-Aktionen';

  @override
  String get chatArchiveAction => 'Chat archivieren';

  @override
  String get chatUnarchiveAction => 'In Chats wiederherstellen';

  @override
  String get chatUnarchiveDone => 'Chat wiederhergestellt.';

  @override
  String get chatArchivedOpen => 'Archiviert';

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
  String get chatArchivedTitle => 'Archivierte Chats';

  @override
  String get chatArchivedBack => 'Zurück zu Chats';

  @override
  String get chatArchivedEmpty => 'Keine archivierten Chats.';

  @override
  String get chatRemoveAction => 'Chat löschen';

  @override
  String get chatArchiveConfirmTitle => 'Diesen Chat archivieren?';

  @override
  String get chatArchiveConfirmBody =>
      'Er verschwindet aus Zuletzt, bleibt aber auf dem Datenträger.';

  @override
  String get chatRemoveConfirmTitle => 'Diesen Chat löschen?';

  @override
  String get chatRemoveConfirmBody =>
      'Chat und alle Nachrichten dauerhaft löschen.';

  @override
  String get chatRemoveDone => 'Chat gelöscht.';

  @override
  String get chatNoSession => 'Noch keine aktive Chat-Sitzung.';

  @override
  String get chatDeleteFailed =>
      'Nachricht konnte auf dem Server nicht gelöscht werden.';

  @override
  String get chatDeleteMessage => 'Nachricht löschen';

  @override
  String get chatCopyMessage => 'Nachricht kopieren';

  @override
  String get chatCopied => 'Kopiert';

  @override
  String get chatCancel => 'Abbrechen';

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
      'Öffnet in der App über die Home-Verbindung (keine öffentliche URL nötig).';

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
  String get artifactsTooLarge =>
      'This file is larger than the 8 MB in-app open limit. Ask the agent for a smaller export, or open it on the home machine.';

  @override
  String get artifactsRefresh => 'Aktualisieren';

  @override
  String get artifactsRetry => 'Erneut versuchen';

  @override
  String get artifactsBinaryHint =>
      'Dieser Dateityp kann hier nicht angezeigt werden. Nutze Teilen/Speichern für eine andere App, oder bitte um Text-/Markdown-Export.';

  @override
  String get artifactsShare => 'Teilen / Speichern';

  @override
  String artifactsShareFailed(String error) {
    return 'Teilen fehlgeschlagen: $error';
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
    return 'Öffnen $name';
  }

  @override
  String chatPendingApprovals(int count) {
    return '$count warten auf Ihre Freigabe';
  }

  @override
  String get choiceCardConfirm => 'Bestätigen';

  @override
  String get choiceCardPickOne => 'Bitte mindestens eine Option wählen.';

  @override
  String get choiceCardAnswered => 'Erhalten.';

  @override
  String choiceCardFailed(String error) {
    return 'Auswahl konnte nicht gesendet werden: $error';
  }

  @override
  String chatPendingChoices(int count) {
    return '$count warten auf Ihre Auswahl';
  }

  @override
  String get choiceCardCancel => 'Abbrechen';

  @override
  String get choiceCardCanceled => 'Auswahl verworfen.';

  @override
  String get choiceCardExpired => 'Abgelaufen';

  @override
  String get choiceCardExpiredHint =>
      'Diese Auswahl ist abgelaufen — fragen Sie erneut, falls nötig.';

  @override
  String choiceCardExpiresIn(int mins) {
    return 'Läuft in $mins Min. ab';
  }

  @override
  String get choiceCardTextPlaceholder => 'Antwort eingeben';

  @override
  String get schedulesChatTabChat => 'Zeitpläne';

  @override
  String get schedulesChatTabHistories => 'Verläufe';

  @override
  String get schedulesChatHistoriesHint =>
      'Abgebrochene oder abgelaufene Vorschläge und letzte Läufe.';

  @override
  String get jobsHistoriesMovedHint => 'Verlauf unter Zeitpläne → Verläufe';

  @override
  String schedulesChatClosedAt(String when) {
    return 'Geschlossen $when';
  }

  @override
  String schedulesChatRanAt(String when) {
    return 'Gelaufen $when';
  }

  @override
  String get welcomeSkip => 'Überspringen';

  @override
  String get welcomeNext => 'Weiter';

  @override
  String get commonContinue => 'Fortfahren';

  @override
  String get welcomeSlide1Title => 'Willkommen bei EnvoyHome';

  @override
  String get welcomeSlide1Body =>
      'Dein Telefon ist ein Fenster zu einem selbst gehosteten Home-Agenten — Chat, Freigaben und Smart-Home bleiben auf dem Desktop.';

  @override
  String get welcomeSlide2Title => 'Die Arbeit läuft auf dem Computer';

  @override
  String get welcomeSlide2Body =>
      'Installiere EnvoyHome auf einem Mac oder PC zu Hause. Daemon, Modelle und Haushaltsspeicher bleiben dort — das Telefon ist ein Remote-Fenster.';

  @override
  String get welcomeSlide3Title => 'Mit QR-Code koppeln';

  @override
  String get welcomeSlide3Body =>
      'Öffne EnvoyHome auf dem Computer und zeige den Pairing-QR. Tippe hier auf Jetzt koppeln und scanne ihn. Du kannst auch einen Pairing-Link einfügen.';

  @override
  String get welcomeSlideRequiredTitle => 'Zum Start koppeln';

  @override
  String get welcomeSlideRequiredBody =>
      'EnvoyHome braucht einen Computer mit der Desktop-App. Agenten und Home-Steuerung laufen dort — koppeln Sie dieses Telefon damit.';

  @override
  String get setupGuideTitle => 'So funktioniert EnvoyHome';

  @override
  String get setupGuideIntro =>
      'EnvoyHome auf dem Telefon spricht mit EnvoyHome auf dem Heimcomputer. Desktop installieren, einmal koppeln, dann von überall chatten und freigeben.';

  @override
  String get setupGuidePairRequiredTitle => 'Zum Fortfahren koppeln';

  @override
  String get setupGuidePairRequiredBody =>
      'EnvoyHome ist die Telefon-Begleit-App für Ihren Heim-Desktop. Ohne gekoppelten Computer gibt es hier noch nichts zu zeigen.';

  @override
  String get setupGuideStep1Title => 'Computer bereithalten';

  @override
  String get setupGuideStep1Body =>
      'Sie brauchen einen Mac oder Windows/Linux-PC zu Hause. Dort laufen Daemon und Agenten.';

  @override
  String get setupGuideStep2Title => 'EnvoyHome herunterladen und installieren';

  @override
  String get setupGuideStep2Body =>
      'Öffnen Sie den QuickStart und installieren Sie Daemon sowie Desktop-App. Starten und laufen lassen.';

  @override
  String get setupGuideDownloadCta => 'EnvoyHome-QuickStart öffnen';

  @override
  String get setupGuideStep3Title => 'Pairing-QR anzeigen';

  @override
  String get setupGuideStep3Body =>
      'In der Desktop-App: Einstellungen → Geräte koppeln. QR auf dem Bildschirm lassen (mit Mesh/Relays, nicht nur LAN).';

  @override
  String get setupGuideStep4Title => 'Mit diesem Telefon scannen';

  @override
  String get setupGuideStep4Body =>
      'Tippen Sie unten auf Jetzt koppeln. Kamera erlauben, QR scannen. Oder envoy://-Link / Host:Port / SSH.';

  @override
  String get setupGuideStep5Title => 'Verbunden';

  @override
  String get setupGuideStep5Body =>
      'Nach dem Pairing zeigt dieses Telefon Chats, Freigaben und Einstellungen. Der Desktop läuft weiter, auch ohne Telefon.';

  @override
  String get setupGuideNoHomeTitle => 'Später koppeln ist in Ordnung';

  @override
  String get setupGuideNoHomeBody =>
      'Sie können jetzt weitergehen und jederzeit unter Verbinden koppeln. Ohne Computer gibt es hier noch nichts zu zeigen.';

  @override
  String get setupGuidePairCta => 'Jetzt koppeln';

  @override
  String get setupGuidePairLaterCta => 'Später koppeln';

  @override
  String get setupGuideSkipCta => 'Erst erkunden';

  @override
  String get setupGuideDoneCta => 'Verstanden';

  @override
  String get settingsSetupGuideSubtitle =>
      'Desktop-App installieren und dieses Telefon koppeln.';
}
