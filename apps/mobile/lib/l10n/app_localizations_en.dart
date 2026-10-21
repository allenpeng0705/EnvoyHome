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
  String get navChat => 'Chats';

  @override
  String get navHomeChat => 'Home';

  @override
  String get navSchedulesChat => 'Schedules';

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
  String get navApprovals => 'Approvals';

  @override
  String get navModels => 'Models';

  @override
  String get navArtifacts => 'Artifacts';

  @override
  String get settingsHubHint =>
      'Configure the home daemon from your phone. Household Owner devices can manage profiles, workspace, and pairing.';

  @override
  String get settingsProfilesSubtitle =>
      'Owner, workspace folders, tool policy';

  @override
  String get settingsLlmSubtitle => 'Models, Local, Routing, Memory';

  @override
  String get settingsConnectionsSubtitle =>
      'Pairing, Home Assistant, MQTT, Channels, Web search';

  @override
  String get settingsSkillsSubtitle => 'Skills, Workflows, Schedules';

  @override
  String get settingsSystemSubtitle => 'Profiles, Shared files, Health, Grants';

  @override
  String get settingsNeedConnect =>
      'Connect to your home to configure Profiles, LLM, Connections, Skills, and System.';

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
  String get profilesShareLocationTitle => 'Share location with Home';

  @override
  String get profilesShareLocationSubtitle =>
      'Attach approximate GPS to chat turns for schedule/context. Permission is requested once here; never on every send. Ephemeral only — not saved to memory.';

  @override
  String get profilesShareLocationDenied =>
      'Location permission was not granted. Sharing stays off.';

  @override
  String get profilesShareLocationOn => 'Location sharing on for this device';

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
  String get schedulesChatSessionTitle => 'Schedules';

  @override
  String get schedulesChatEmptyTitle => 'Reminders';

  @override
  String get schedulesChatEmptyHint =>
      'This chat stays on reminders. Confirm a time before it arms.';

  @override
  String get schedulesChatHint => 'Remind me…';

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
      'Control managed Chromium, or attach personal Chrome / remote CDP. Off by default.';

  @override
  String get browserControlEnabled => 'Enable browser tool';

  @override
  String get browserControlUnattended => 'Allow managed profile for schedules';

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
  String get schedKindAgent => 'Agent';

  @override
  String get schedAgentPrompt => 'Agent prompt';

  @override
  String get schedTabRepeating => 'Repeating';

  @override
  String get schedTabOnce => 'Once';

  @override
  String get schedTabHistory => 'History';

  @override
  String get schedNoneRepeating =>
      'No repeating schedules yet. Try “every Monday at 9am”.';

  @override
  String get schedNoneOnce => 'No one-time reminders. Try “tomorrow at 8am”.';

  @override
  String get schedNoReceipts => 'No runs yet.';

  @override
  String get schedHistoryNotSet => 'Not set';

  @override
  String get schedHistoryRuns => 'Runs';

  @override
  String get schedNoDismissed => 'No canceled or expired proposals.';

  @override
  String get schedDismissedCanceled => 'Canceled';

  @override
  String get schedDismissedExpired => 'Expired';

  @override
  String get schedNext => 'Next';

  @override
  String get schedKindRepeating => 'Repeats';

  @override
  String get schedKindOnce => 'Once';

  @override
  String get schedKindDaily => 'Daily';

  @override
  String get schedKindWeekdays => 'Weekdays';

  @override
  String get schedKindWeekly => 'Weekly';

  @override
  String get schedKindMonthly => 'Monthly';

  @override
  String get schedKindYearly => 'Yearly';

  @override
  String get schedKindEvery => 'Every';

  @override
  String schedDayOfMonth(String d) {
    return 'day $d';
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
  String get chatThought => 'Thinking';

  @override
  String get chatNew => 'New chat';

  @override
  String get chatNewNamePrompt => 'Chat name';

  @override
  String get chatNewNamePlaceholder => 'e.g. Weekend plans';

  @override
  String get chatNewNameHint =>
      'Name it now, or start without a name and we’ll use the first message.';

  @override
  String get chatNewSkip => 'Start without name';

  @override
  String get chatNewCreate => 'Create';

  @override
  String get chatNewNeedName => 'Enter a name, or choose Start without name.';

  @override
  String get chatNewStart => 'Start chat';

  @override
  String get chatOpenArtifact => 'Open full reply';

  @override
  String get chatRecents => 'Recents';

  @override
  String get chatRecentsEmpty => 'No earlier chats.';

  @override
  String get chatSessionsEmpty => 'No chats yet. Start a new one.';

  @override
  String get chatUntitled => 'Untitled chat';

  @override
  String get chatRenameAction => 'Rename';

  @override
  String get chatRenamePrompt => 'Chat name';

  @override
  String get chatRenameDone => 'Chat renamed.';

  @override
  String get chatRenameEmpty => 'Name can\'t be empty.';

  @override
  String get chatRenameNeedSession => 'Send a message first, then rename.';

  @override
  String get chatBusyTurn =>
      'Wait for the current reply to finish (or cancel it).';

  @override
  String get chatEmptyAction => 'Empty chat';

  @override
  String get chatEmptyConfirmTitle => 'Empty this chat?';

  @override
  String get chatEmptyConfirmBody =>
      'All messages in this thread will be removed. The chat itself stays.';

  @override
  String get chatTrashMenu => 'Chat actions';

  @override
  String get chatArchiveAction => 'Archive chat';

  @override
  String get chatUnarchiveAction => 'Restore to Chats';

  @override
  String get chatUnarchiveDone => 'Chat restored.';

  @override
  String get chatArchivedOpen => 'Archived';

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
  String get chatArchivedTitle => 'Archived chats';

  @override
  String get chatArchivedBack => 'Back to chats';

  @override
  String get chatArchivedEmpty => 'No archived chats.';

  @override
  String get chatRemoveAction => 'Delete chat';

  @override
  String get chatArchiveConfirmTitle => 'Archive this chat?';

  @override
  String get chatArchiveConfirmBody =>
      'It leaves the Chats list but stays on disk. Open Archived to restore or delete. Archive does not erase messages.';

  @override
  String get chatRemoveConfirmTitle => 'Delete this chat?';

  @override
  String get chatRemoveConfirmBody =>
      'Permanently delete this chat and all its messages. This cannot be undone.';

  @override
  String get chatRemoveDone => 'Chat deleted.';

  @override
  String get chatNoSession => 'No active chat session yet.';

  @override
  String get chatDeleteFailed => 'Could not delete that message on the server.';

  @override
  String get chatDeleteMessage => 'Delete message';

  @override
  String get chatCopyMessage => 'Copy message';

  @override
  String get chatCopied => 'Copied';

  @override
  String get chatCancel => 'Cancel';

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
  String get artifactsTitle => 'Files';

  @override
  String get artifactsHint =>
      'Browse folders this profile can access over your home connection. Open in-app, Share/Save, or Open in browser when a signed link is available.';

  @override
  String get artifactsNeedAccount => 'Set an account to browse files.';

  @override
  String get artifactsEmptyTitle => 'No folders yet';

  @override
  String get artifactsEmptyHint =>
      'Pull to refresh. Workspace appears when configured for this profile.';

  @override
  String get artifactsUrlCopied => 'Could not open — URL copied';

  @override
  String artifactsOpenFailed(String error) {
    return 'Open failed: $error';
  }

  @override
  String get artifactsTooLarge =>
      'This file is larger than the 8 MB in-app open limit. Ask the agent for a smaller export, or open it on the home machine.';

  @override
  String get artifactsRefresh => 'Refresh';

  @override
  String get artifactsRetry => 'Retry';

  @override
  String get artifactsBinaryHint =>
      'This file type isn’t previewable here. Use Share / Save to open it in another app, or ask the home agent for a text or markdown export.';

  @override
  String get artifactsShare => 'Share / Save';

  @override
  String artifactsShareFailed(String error) {
    return 'Could not share: $error';
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
    return 'Open $name';
  }

  @override
  String chatPendingApprovals(int count) {
    return '$count waiting for your approval';
  }

  @override
  String get choiceCardConfirm => 'Confirm';

  @override
  String get choiceCardPickOne => 'Pick at least one option.';

  @override
  String get choiceCardAnswered => 'Got it.';

  @override
  String choiceCardFailed(String error) {
    return 'Could not send that choice: $error';
  }

  @override
  String chatPendingChoices(int count) {
    return '$count waiting for your choice';
  }

  @override
  String get choiceCardCancel => 'Cancel';

  @override
  String get choiceCardCanceled => 'Choice dismissed.';

  @override
  String get choiceCardExpired => 'Expired';

  @override
  String get choiceCardExpiredHint =>
      'This choice expired — ask again if you still need it.';

  @override
  String choiceCardExpiresIn(int mins) {
    return 'Expires in $mins min';
  }

  @override
  String get choiceCardTextPlaceholder => 'Type your answer';

  @override
  String get schedulesChatTabChat => 'Schedules';

  @override
  String get schedulesChatTabHistories => 'Histories';

  @override
  String get schedulesChatHistoriesHint =>
      'Proposals you canceled or that expired, and recent job runs.';

  @override
  String get jobsHistoriesMovedHint => 'History moved to Schedules → Histories';

  @override
  String schedulesChatClosedAt(String when) {
    return 'Closed $when';
  }

  @override
  String schedulesChatRanAt(String when) {
    return 'Ran $when';
  }
}
