import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_de.dart';
import 'app_localizations_en.dart';
import 'app_localizations_fr.dart';
import 'app_localizations_it.dart';
import 'app_localizations_ja.dart';
import 'app_localizations_ko.dart';
import 'app_localizations_zh.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('de'),
    Locale('en'),
    Locale('fr'),
    Locale('it'),
    Locale('ja'),
    Locale('ko'),
    Locale('zh')
  ];

  /// No description provided for @appName.
  ///
  /// In en, this message translates to:
  /// **'EnvoyHome'**
  String get appName;

  /// No description provided for @appLanguage.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get appLanguage;

  /// No description provided for @appThemePicker.
  ///
  /// In en, this message translates to:
  /// **'Appearance'**
  String get appThemePicker;

  /// No description provided for @appThemeSystem.
  ///
  /// In en, this message translates to:
  /// **'System'**
  String get appThemeSystem;

  /// No description provided for @appThemeLight.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get appThemeLight;

  /// No description provided for @appThemeDark.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get appThemeDark;

  /// No description provided for @pairLede.
  ///
  /// In en, this message translates to:
  /// **'Join the home desktop over EnvoyMesh — scan a QR, enter host:port, or hop via SSH.'**
  String get pairLede;

  /// No description provided for @pairTabLink.
  ///
  /// In en, this message translates to:
  /// **'Link'**
  String get pairTabLink;

  /// No description provided for @pairTabHost.
  ///
  /// In en, this message translates to:
  /// **'Host:port'**
  String get pairTabHost;

  /// No description provided for @pairTabSsh.
  ///
  /// In en, this message translates to:
  /// **'SSH'**
  String get pairTabSsh;

  /// No description provided for @pairFooter.
  ///
  /// In en, this message translates to:
  /// **'com.envoymesh.envoyhome · push after pair'**
  String get pairFooter;

  /// No description provided for @pairCloseScanner.
  ///
  /// In en, this message translates to:
  /// **'Close scanner'**
  String get pairCloseScanner;

  /// No description provided for @pairScanQr.
  ///
  /// In en, this message translates to:
  /// **'Scan pairing QR'**
  String get pairScanQr;

  /// No description provided for @pairUriLabel.
  ///
  /// In en, this message translates to:
  /// **'Pairing URI'**
  String get pairUriLabel;

  /// No description provided for @pairUriHint.
  ///
  /// In en, this message translates to:
  /// **'envoy://pair?…&app=EnvoyHome'**
  String get pairUriHint;

  /// No description provided for @pairConnect.
  ///
  /// In en, this message translates to:
  /// **'Connect'**
  String get pairConnect;

  /// No description provided for @pairDirectHint.
  ///
  /// In en, this message translates to:
  /// **'Reach the desktop on this network (LAN / Tailscale). Token is required.'**
  String get pairDirectHint;

  /// No description provided for @pairHostPort.
  ///
  /// In en, this message translates to:
  /// **'Host:port'**
  String get pairHostPort;

  /// No description provided for @pairHostPortHint.
  ///
  /// In en, this message translates to:
  /// **'192.168.1.10:4780'**
  String get pairHostPortHint;

  /// No description provided for @pairToken.
  ///
  /// In en, this message translates to:
  /// **'Pairing token'**
  String get pairToken;

  /// No description provided for @pairTokenHelper.
  ///
  /// In en, this message translates to:
  /// **'From desktop Settings → Pair devices'**
  String get pairTokenHelper;

  /// No description provided for @pairSshHint.
  ///
  /// In en, this message translates to:
  /// **'Tunnel through an SSH hop. The daemon sees loopback — token is optional.'**
  String get pairSshHint;

  /// No description provided for @pairSshHost.
  ///
  /// In en, this message translates to:
  /// **'SSH host'**
  String get pairSshHost;

  /// No description provided for @pairSshUser.
  ///
  /// In en, this message translates to:
  /// **'User'**
  String get pairSshUser;

  /// No description provided for @pairSshUserHint.
  ///
  /// In en, this message translates to:
  /// **'root'**
  String get pairSshUserHint;

  /// No description provided for @pairSshPort.
  ///
  /// In en, this message translates to:
  /// **'Port'**
  String get pairSshPort;

  /// No description provided for @pairSshPassword.
  ///
  /// In en, this message translates to:
  /// **'SSH password'**
  String get pairSshPassword;

  /// No description provided for @pairDaemon.
  ///
  /// In en, this message translates to:
  /// **'Daemon on far side'**
  String get pairDaemon;

  /// No description provided for @pairDaemonHint.
  ///
  /// In en, this message translates to:
  /// **'127.0.0.1:4780'**
  String get pairDaemonHint;

  /// No description provided for @pairTokenOptional.
  ///
  /// In en, this message translates to:
  /// **'Token (optional)'**
  String get pairTokenOptional;

  /// No description provided for @shellOnline.
  ///
  /// In en, this message translates to:
  /// **'online'**
  String get shellOnline;

  /// No description provided for @shellDegraded.
  ///
  /// In en, this message translates to:
  /// **'degraded'**
  String get shellDegraded;

  /// No description provided for @shellOffline.
  ///
  /// In en, this message translates to:
  /// **'offline'**
  String get shellOffline;

  /// No description provided for @shellConnect.
  ///
  /// In en, this message translates to:
  /// **'Connect'**
  String get shellConnect;

  /// No description provided for @shellReconnect.
  ///
  /// In en, this message translates to:
  /// **'Reconnect'**
  String get shellReconnect;

  /// No description provided for @shellDisconnect.
  ///
  /// In en, this message translates to:
  /// **'Disconnect'**
  String get shellDisconnect;

  /// No description provided for @shellForgetPairing.
  ///
  /// In en, this message translates to:
  /// **'Forget pairing'**
  String get shellForgetPairing;

  /// No description provided for @connectGuideTitle.
  ///
  /// In en, this message translates to:
  /// **'Connect to your home'**
  String get connectGuideTitle;

  /// No description provided for @connectGuideHint.
  ///
  /// In en, this message translates to:
  /// **'On the desktop, open Settings → Pair devices and scan the QR — or paste the pairing link / host details.'**
  String get connectGuideHint;

  /// No description provided for @connectGuideReconnectHint.
  ///
  /// In en, this message translates to:
  /// **'This phone is already paired. Reconnect to the home desktop, or pair again if you moved homes.'**
  String get connectGuideReconnectHint;

  /// No description provided for @settingsNeedConnect.
  ///
  /// In en, this message translates to:
  /// **'Connect to your home to configure LLM, Connections, Skills, and System.'**
  String get settingsNeedConnect;

  /// No description provided for @shellProfilePending.
  ///
  /// In en, this message translates to:
  /// **'Profile will be chosen from this device’s pairing.'**
  String get shellProfilePending;

  /// No description provided for @shellProfileOne.
  ///
  /// In en, this message translates to:
  /// **'Profile · {id}'**
  String shellProfileOne(String id);

  /// No description provided for @shellProfile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get shellProfile;

  /// No description provided for @shellMeshHint.
  ///
  /// In en, this message translates to:
  /// **'mesh {mesh} · pull tabs to refresh'**
  String shellMeshHint(String mesh);

  /// No description provided for @shellCreateProfile.
  ///
  /// In en, this message translates to:
  /// **'Create'**
  String get shellCreateProfile;

  /// No description provided for @shellProfileDisplayName.
  ///
  /// In en, this message translates to:
  /// **'Display name'**
  String get shellProfileDisplayName;

  /// No description provided for @shellProfileIdOptional.
  ///
  /// In en, this message translates to:
  /// **'Account id (optional)'**
  String get shellProfileIdOptional;

  /// No description provided for @shellCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get shellCancel;

  /// No description provided for @shellCreate.
  ///
  /// In en, this message translates to:
  /// **'Create'**
  String get shellCreate;

  /// No description provided for @shellProfileCreated.
  ///
  /// In en, this message translates to:
  /// **'Profile created'**
  String get shellProfileCreated;

  /// No description provided for @shellProfileCreateFailed.
  ///
  /// In en, this message translates to:
  /// **'Create failed: {error}'**
  String shellProfileCreateFailed(String error);

  /// No description provided for @navChat.
  ///
  /// In en, this message translates to:
  /// **'Chat'**
  String get navChat;

  /// No description provided for @navHomeChat.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHomeChat;

  /// No description provided for @navSettings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get navSettings;

  /// No description provided for @navLlm.
  ///
  /// In en, this message translates to:
  /// **'LLM'**
  String get navLlm;

  /// No description provided for @navConnections.
  ///
  /// In en, this message translates to:
  /// **'Connections'**
  String get navConnections;

  /// No description provided for @navSkills.
  ///
  /// In en, this message translates to:
  /// **'Skills'**
  String get navSkills;

  /// No description provided for @navSystem.
  ///
  /// In en, this message translates to:
  /// **'System'**
  String get navSystem;

  /// No description provided for @navApprovals.
  ///
  /// In en, this message translates to:
  /// **'Approvals'**
  String get navApprovals;

  /// No description provided for @navModels.
  ///
  /// In en, this message translates to:
  /// **'Models'**
  String get navModels;

  /// No description provided for @navArtifacts.
  ///
  /// In en, this message translates to:
  /// **'Artifacts'**
  String get navArtifacts;

  /// No description provided for @settingsHubHint.
  ///
  /// In en, this message translates to:
  /// **'Configure the home daemon from your phone. Some owner-only actions need a trusted device.'**
  String get settingsHubHint;

  /// No description provided for @settingsLlmSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Models, Local, Routing, Memory'**
  String get settingsLlmSubtitle;

  /// No description provided for @settingsConnectionsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Pairing, Home Assistant, MQTT, Channels'**
  String get settingsConnectionsSubtitle;

  /// No description provided for @settingsSkillsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Skills, Workflows, Schedules'**
  String get settingsSkillsSubtitle;

  /// No description provided for @settingsSystemSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Shared files, Health, Grants'**
  String get settingsSystemSubtitle;

  /// No description provided for @homeChatSessionTitle.
  ///
  /// In en, this message translates to:
  /// **'Phone home chat'**
  String get homeChatSessionTitle;

  /// No description provided for @homeChatEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Talk to your home'**
  String get homeChatEmptyTitle;

  /// No description provided for @homeChatEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Smart-home tools stay available here. Approvals still gate actuations.'**
  String get homeChatEmptyHint;

  /// No description provided for @homeChatHint.
  ///
  /// In en, this message translates to:
  /// **'Ask about lights, locks, climate…'**
  String get homeChatHint;

  /// No description provided for @chatAttach.
  ///
  /// In en, this message translates to:
  /// **'Attach'**
  String get chatAttach;

  /// No description provided for @chatAttachTooMany.
  ///
  /// In en, this message translates to:
  /// **'At most {n} files'**
  String chatAttachTooMany(int n);

  /// No description provided for @chatAttachTooLarge.
  ///
  /// In en, this message translates to:
  /// **'{name} exceeds {mb} MB'**
  String chatAttachTooLarge(String name, String mb);

  /// No description provided for @chatAttachAdded.
  ///
  /// In en, this message translates to:
  /// **'Attached {n} file(s)'**
  String chatAttachAdded(int n);

  /// No description provided for @chatAttachedOnly.
  ///
  /// In en, this message translates to:
  /// **'(attachment)'**
  String get chatAttachedOnly;

  /// No description provided for @chatVoiceStart.
  ///
  /// In en, this message translates to:
  /// **'Dictate'**
  String get chatVoiceStart;

  /// No description provided for @chatVoiceStop.
  ///
  /// In en, this message translates to:
  /// **'Stop dictation'**
  String get chatVoiceStop;

  /// No description provided for @chatVoiceUnsupported.
  ///
  /// In en, this message translates to:
  /// **'Speech recognition is not available on this device.'**
  String get chatVoiceUnsupported;

  /// No description provided for @llmTabModels.
  ///
  /// In en, this message translates to:
  /// **'Models'**
  String get llmTabModels;

  /// No description provided for @llmTabLocal.
  ///
  /// In en, this message translates to:
  /// **'Local'**
  String get llmTabLocal;

  /// No description provided for @llmTabRouting.
  ///
  /// In en, this message translates to:
  /// **'Routing'**
  String get llmTabRouting;

  /// No description provided for @llmTabMemory.
  ///
  /// In en, this message translates to:
  /// **'Memory'**
  String get llmTabMemory;

  /// No description provided for @llmLocalDownloadHint.
  ///
  /// In en, this message translates to:
  /// **'Search Hugging Face and download GGUF files onto the home machine.'**
  String get llmLocalDownloadHint;

  /// No description provided for @llmHfSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search models…'**
  String get llmHfSearchHint;

  /// No description provided for @llmSearch.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get llmSearch;

  /// No description provided for @llmCancelDownload.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get llmCancelDownload;

  /// No description provided for @llmResumeDownload.
  ///
  /// In en, this message translates to:
  /// **'Resume'**
  String get llmResumeDownload;

  /// No description provided for @llmGgufFiles.
  ///
  /// In en, this message translates to:
  /// **'GGUF in {repo}'**
  String llmGgufFiles(String repo);

  /// No description provided for @llmRoutingHint.
  ///
  /// In en, this message translates to:
  /// **'Choose where turns may run for this profile.'**
  String get llmRoutingHint;

  /// No description provided for @llmFilterAny.
  ///
  /// In en, this message translates to:
  /// **'Smart / any'**
  String get llmFilterAny;

  /// No description provided for @llmFilterCloud.
  ///
  /// In en, this message translates to:
  /// **'Cloud only'**
  String get llmFilterCloud;

  /// No description provided for @llmFilterLocal.
  ///
  /// In en, this message translates to:
  /// **'Local only'**
  String get llmFilterLocal;

  /// No description provided for @llmAutoSwitch.
  ///
  /// In en, this message translates to:
  /// **'Auto model switch'**
  String get llmAutoSwitch;

  /// No description provided for @llmCompactNow.
  ///
  /// In en, this message translates to:
  /// **'Compact memory now'**
  String get llmCompactNow;

  /// No description provided for @llmFlushEnabled.
  ///
  /// In en, this message translates to:
  /// **'Flush standing notes'**
  String get llmFlushEnabled;

  /// No description provided for @llmReviewEnabled.
  ///
  /// In en, this message translates to:
  /// **'Review before learn write'**
  String get llmReviewEnabled;

  /// No description provided for @llmInjectMode.
  ///
  /// In en, this message translates to:
  /// **'Inject budget mode'**
  String get llmInjectMode;

  /// No description provided for @llmInjectAuto.
  ///
  /// In en, this message translates to:
  /// **'Auto'**
  String get llmInjectAuto;

  /// No description provided for @llmInjectBaseline.
  ///
  /// In en, this message translates to:
  /// **'Baseline'**
  String get llmInjectBaseline;

  /// No description provided for @llmInjectCustom.
  ///
  /// In en, this message translates to:
  /// **'Custom'**
  String get llmInjectCustom;

  /// No description provided for @llmPendingLearns.
  ///
  /// In en, this message translates to:
  /// **'Pending learns'**
  String get llmPendingLearns;

  /// No description provided for @llmNoPendingLearns.
  ///
  /// In en, this message translates to:
  /// **'No pending learns.'**
  String get llmNoPendingLearns;

  /// No description provided for @connTabPairing.
  ///
  /// In en, this message translates to:
  /// **'Pairing'**
  String get connTabPairing;

  /// No description provided for @connTabHa.
  ///
  /// In en, this message translates to:
  /// **'Home Assistant'**
  String get connTabHa;

  /// No description provided for @connTabMqtt.
  ///
  /// In en, this message translates to:
  /// **'MQTT'**
  String get connTabMqtt;

  /// No description provided for @connTabChannels.
  ///
  /// In en, this message translates to:
  /// **'Channels'**
  String get connTabChannels;

  /// No description provided for @connPairingHint.
  ///
  /// In en, this message translates to:
  /// **'Mint and revoke phones from desktop Settings → Pair devices. This list is read-only on mobile.'**
  String get connPairingHint;

  /// No description provided for @connNoDevices.
  ///
  /// In en, this message translates to:
  /// **'No paired devices listed.'**
  String get connNoDevices;

  /// No description provided for @connEnabled.
  ///
  /// In en, this message translates to:
  /// **'Enabled'**
  String get connEnabled;

  /// No description provided for @connDisabled.
  ///
  /// In en, this message translates to:
  /// **'Disabled'**
  String get connDisabled;

  /// No description provided for @connReady.
  ///
  /// In en, this message translates to:
  /// **'Ready'**
  String get connReady;

  /// No description provided for @connHealthy.
  ///
  /// In en, this message translates to:
  /// **'Healthy'**
  String get connHealthy;

  /// No description provided for @connUnhealthy.
  ///
  /// In en, this message translates to:
  /// **'Unhealthy'**
  String get connUnhealthy;

  /// No description provided for @connHaUrl.
  ///
  /// In en, this message translates to:
  /// **'HA base URL'**
  String get connHaUrl;

  /// No description provided for @connHaToken.
  ///
  /// In en, this message translates to:
  /// **'Access token'**
  String get connHaToken;

  /// No description provided for @connMqttUrl.
  ///
  /// In en, this message translates to:
  /// **'Broker URL'**
  String get connMqttUrl;

  /// No description provided for @connMqttPassword.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get connMqttPassword;

  /// No description provided for @connSaveEnable.
  ///
  /// In en, this message translates to:
  /// **'Save & enable'**
  String get connSaveEnable;

  /// No description provided for @connBindTitle.
  ///
  /// In en, this message translates to:
  /// **'Object bindings'**
  String get connBindTitle;

  /// No description provided for @connBoundTo.
  ///
  /// In en, this message translates to:
  /// **'Bound to {id}'**
  String connBoundTo(String id);

  /// No description provided for @connUnbound.
  ///
  /// In en, this message translates to:
  /// **'Unbound'**
  String get connUnbound;

  /// No description provided for @connChannelsHint.
  ///
  /// In en, this message translates to:
  /// **'Paste a bot token and enable. Prefer desktop for first-time setup.'**
  String get connChannelsHint;

  /// No description provided for @connBotToken.
  ///
  /// In en, this message translates to:
  /// **'Bot token'**
  String get connBotToken;

  /// No description provided for @connDisable.
  ///
  /// In en, this message translates to:
  /// **'Disable'**
  String get connDisable;

  /// No description provided for @connSenderBinds.
  ///
  /// In en, this message translates to:
  /// **'Sender → profile'**
  String get connSenderBinds;

  /// No description provided for @connSenderBindsHint.
  ///
  /// In en, this message translates to:
  /// **'Link an IM sender id to the active profile.'**
  String get connSenderBindsHint;

  /// No description provided for @connBindChannel.
  ///
  /// In en, this message translates to:
  /// **'Channel'**
  String get connBindChannel;

  /// No description provided for @connChannelAccount.
  ///
  /// In en, this message translates to:
  /// **'Channel account'**
  String get connChannelAccount;

  /// No description provided for @connSenderId.
  ///
  /// In en, this message translates to:
  /// **'Sender id'**
  String get connSenderId;

  /// No description provided for @connBindSender.
  ///
  /// In en, this message translates to:
  /// **'Bind sender'**
  String get connBindSender;

  /// No description provided for @skillsTabSkills.
  ///
  /// In en, this message translates to:
  /// **'Skills'**
  String get skillsTabSkills;

  /// No description provided for @skillsVerify.
  ///
  /// In en, this message translates to:
  /// **'Verify'**
  String get skillsVerify;

  /// No description provided for @skillsVerified.
  ///
  /// In en, this message translates to:
  /// **'Skill verified'**
  String get skillsVerified;

  /// No description provided for @skillsTabWorkflows.
  ///
  /// In en, this message translates to:
  /// **'Workflows'**
  String get skillsTabWorkflows;

  /// No description provided for @skillsTabSchedules.
  ///
  /// In en, this message translates to:
  /// **'Schedules'**
  String get skillsTabSchedules;

  /// No description provided for @skillsInstallUrl.
  ///
  /// In en, this message translates to:
  /// **'Install from URL'**
  String get skillsInstallUrl;

  /// No description provided for @skillsInstall.
  ///
  /// In en, this message translates to:
  /// **'Install'**
  String get skillsInstall;

  /// No description provided for @skillsClawHubSearch.
  ///
  /// In en, this message translates to:
  /// **'ClawHub search'**
  String get skillsClawHubSearch;

  /// No description provided for @schedWhenHint.
  ///
  /// In en, this message translates to:
  /// **'When (natural language)'**
  String get schedWhenHint;

  /// No description provided for @schedMessageHint.
  ///
  /// In en, this message translates to:
  /// **'Reminder message'**
  String get schedMessageHint;

  /// No description provided for @schedPropose.
  ///
  /// In en, this message translates to:
  /// **'Propose'**
  String get schedPropose;

  /// No description provided for @schedConfirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get schedConfirm;

  /// No description provided for @schedKindNotify.
  ///
  /// In en, this message translates to:
  /// **'Notify'**
  String get schedKindNotify;

  /// No description provided for @schedKindWorkflow.
  ///
  /// In en, this message translates to:
  /// **'Workflow'**
  String get schedKindWorkflow;

  /// No description provided for @schedKindTool.
  ///
  /// In en, this message translates to:
  /// **'Tool'**
  String get schedKindTool;

  /// No description provided for @schedWorkflowId.
  ///
  /// In en, this message translates to:
  /// **'Workflow id'**
  String get schedWorkflowId;

  /// No description provided for @schedToolName.
  ///
  /// In en, this message translates to:
  /// **'Tool name'**
  String get schedToolName;

  /// No description provided for @wfEditorTitle.
  ///
  /// In en, this message translates to:
  /// **'Workflow'**
  String get wfEditorTitle;

  /// No description provided for @wfEnable.
  ///
  /// In en, this message translates to:
  /// **'Enable'**
  String get wfEnable;

  /// No description provided for @wfDisable.
  ///
  /// In en, this message translates to:
  /// **'Disable'**
  String get wfDisable;

  /// No description provided for @wfTools.
  ///
  /// In en, this message translates to:
  /// **'Insert tool'**
  String get wfTools;

  /// No description provided for @wfId.
  ///
  /// In en, this message translates to:
  /// **'Workflow id'**
  String get wfId;

  /// No description provided for @wfAiPrompt.
  ///
  /// In en, this message translates to:
  /// **'Describe the workflow'**
  String get wfAiPrompt;

  /// No description provided for @wfAiPromptHint.
  ///
  /// In en, this message translates to:
  /// **'e.g. turn off lights at 11pm if nobody home'**
  String get wfAiPromptHint;

  /// No description provided for @wfAiDraft.
  ///
  /// In en, this message translates to:
  /// **'Draft with AI'**
  String get wfAiDraft;

  /// No description provided for @wfDiagramNodes.
  ///
  /// In en, this message translates to:
  /// **'Nodes (phone diagram)'**
  String get wfDiagramNodes;

  /// No description provided for @wfNoNodes.
  ///
  /// In en, this message translates to:
  /// **'No nodes yet — draft or paste YAML.'**
  String get wfNoNodes;

  /// No description provided for @wfYaml.
  ///
  /// In en, this message translates to:
  /// **'YAML'**
  String get wfYaml;

  /// No description provided for @wfSave.
  ///
  /// In en, this message translates to:
  /// **'Validate & save'**
  String get wfSave;

  /// No description provided for @wfRun.
  ///
  /// In en, this message translates to:
  /// **'Test run'**
  String get wfRun;

  /// No description provided for @wfDrafted.
  ///
  /// In en, this message translates to:
  /// **'Draft applied'**
  String get wfDrafted;

  /// No description provided for @wfSaved.
  ///
  /// In en, this message translates to:
  /// **'Saved'**
  String get wfSaved;

  /// No description provided for @wfRan.
  ///
  /// In en, this message translates to:
  /// **'Run started'**
  String get wfRan;

  /// No description provided for @sysTabFiles.
  ///
  /// In en, this message translates to:
  /// **'Shared files'**
  String get sysTabFiles;

  /// No description provided for @sysTabHealth.
  ///
  /// In en, this message translates to:
  /// **'Health'**
  String get sysTabHealth;

  /// No description provided for @sysTabGrants.
  ///
  /// In en, this message translates to:
  /// **'Grants'**
  String get sysTabGrants;

  /// No description provided for @sysTestPush.
  ///
  /// In en, this message translates to:
  /// **'Send test push'**
  String get sysTestPush;

  /// No description provided for @sysTestPushSent.
  ///
  /// In en, this message translates to:
  /// **'Test push requested'**
  String get sysTestPushSent;

  /// No description provided for @sysDoctorFix.
  ///
  /// In en, this message translates to:
  /// **'Fix'**
  String get sysDoctorFix;

  /// No description provided for @sysDoctorFixAll.
  ///
  /// In en, this message translates to:
  /// **'Fix all'**
  String get sysDoctorFixAll;

  /// No description provided for @sysDoctorFixed.
  ///
  /// In en, this message translates to:
  /// **'Fixed: {ids}'**
  String sysDoctorFixed(String ids);

  /// No description provided for @sysNoIssues.
  ///
  /// In en, this message translates to:
  /// **'No doctor issues.'**
  String get sysNoIssues;

  /// No description provided for @sysNoGrants.
  ///
  /// In en, this message translates to:
  /// **'No grants.'**
  String get sysNoGrants;

  /// No description provided for @chatNeedAccount.
  ///
  /// In en, this message translates to:
  /// **'Set an account above before chatting.'**
  String get chatNeedAccount;

  /// No description provided for @chatEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Empty message.'**
  String get chatEmptyMessage;

  /// No description provided for @chatSessionTitle.
  ///
  /// In en, this message translates to:
  /// **'Phone chat'**
  String get chatSessionTitle;

  /// No description provided for @chatEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Message your home agent'**
  String get chatEmptyTitle;

  /// No description provided for @chatEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Turns run on the home daemon. When the agent needs permission, Allow/Deny appears here.'**
  String get chatEmptyHint;

  /// No description provided for @chatHint.
  ///
  /// In en, this message translates to:
  /// **'Message…'**
  String get chatHint;

  /// No description provided for @chatSubscribeFailed.
  ///
  /// In en, this message translates to:
  /// **'subscribe failed: {error}'**
  String chatSubscribeFailed(String error);

  /// No description provided for @chatStatus.
  ///
  /// In en, this message translates to:
  /// **'status: {status}'**
  String chatStatus(String status);

  /// No description provided for @chatError.
  ///
  /// In en, this message translates to:
  /// **'error: {error}'**
  String chatError(String error);

  /// No description provided for @approvalsTitle.
  ///
  /// In en, this message translates to:
  /// **'Approvals'**
  String get approvalsTitle;

  /// No description provided for @approvalsHint.
  ///
  /// In en, this message translates to:
  /// **'Tool and actuation requests waiting for a decision.'**
  String get approvalsHint;

  /// No description provided for @approvalsNeedAccount.
  ///
  /// In en, this message translates to:
  /// **'Set an account to load approvals.'**
  String get approvalsNeedAccount;

  /// No description provided for @approvalsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Inbox clear'**
  String get approvalsEmptyTitle;

  /// No description provided for @approvalsEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Nothing pending right now.'**
  String get approvalsEmptyHint;

  /// No description provided for @approvalsActuation.
  ///
  /// In en, this message translates to:
  /// **'Actuation'**
  String get approvalsActuation;

  /// No description provided for @approvalsAllow.
  ///
  /// In en, this message translates to:
  /// **'Allow'**
  String get approvalsAllow;

  /// No description provided for @approvalsDeny.
  ///
  /// In en, this message translates to:
  /// **'Deny'**
  String get approvalsDeny;

  /// No description provided for @approvalsAllowed.
  ///
  /// In en, this message translates to:
  /// **'Allowed'**
  String get approvalsAllowed;

  /// No description provided for @approvalsDenied.
  ///
  /// In en, this message translates to:
  /// **'Denied'**
  String get approvalsDenied;

  /// No description provided for @approvalsFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed: {error}'**
  String approvalsFailed(String error);

  /// No description provided for @modelsTitle.
  ///
  /// In en, this message translates to:
  /// **'Models'**
  String get modelsTitle;

  /// No description provided for @modelsOwnerHint.
  ///
  /// In en, this message translates to:
  /// **'Enable Local or Ollama on the home machine. Prefer Desktop for first setup.'**
  String get modelsOwnerHint;

  /// No description provided for @modelsReadonlyHint.
  ///
  /// In en, this message translates to:
  /// **'Read-only on this device. Use Desktop Settings → Models (or an owner-trusted phone) to enable Local.'**
  String get modelsReadonlyHint;

  /// No description provided for @modelsLocal.
  ///
  /// In en, this message translates to:
  /// **'Local model'**
  String get modelsLocal;

  /// No description provided for @modelsOwnerTrusted.
  ///
  /// In en, this message translates to:
  /// **'Local engine status needs an owner-trusted device.'**
  String get modelsOwnerTrusted;

  /// No description provided for @modelsResponding.
  ///
  /// In en, this message translates to:
  /// **'responding'**
  String get modelsResponding;

  /// No description provided for @modelsNotResponding.
  ///
  /// In en, this message translates to:
  /// **'not responding'**
  String get modelsNotResponding;

  /// No description provided for @modelsDisabled.
  ///
  /// In en, this message translates to:
  /// **'disabled'**
  String get modelsDisabled;

  /// No description provided for @modelsGguf.
  ///
  /// In en, this message translates to:
  /// **'GGUF on disk'**
  String get modelsGguf;

  /// No description provided for @modelsEnableLocal.
  ///
  /// In en, this message translates to:
  /// **'Enable Local'**
  String get modelsEnableLocal;

  /// No description provided for @modelsUseOllama.
  ///
  /// In en, this message translates to:
  /// **'Use Ollama'**
  String get modelsUseOllama;

  /// No description provided for @modelsDisable.
  ///
  /// In en, this message translates to:
  /// **'Disable'**
  String get modelsDisable;

  /// No description provided for @modelsLocalOnly.
  ///
  /// In en, this message translates to:
  /// **'Local-only for account'**
  String get modelsLocalOnly;

  /// No description provided for @modelsThisAccount.
  ///
  /// In en, this message translates to:
  /// **'This account'**
  String get modelsThisAccount;

  /// No description provided for @modelsNeedAccount.
  ///
  /// In en, this message translates to:
  /// **'Set accountId above.'**
  String get modelsNeedAccount;

  /// No description provided for @modelsDefault.
  ///
  /// In en, this message translates to:
  /// **'Default: {id}'**
  String modelsDefault(String id);

  /// No description provided for @modelsPool.
  ///
  /// In en, this message translates to:
  /// **'Pool: {filter}'**
  String modelsPool(String filter);

  /// No description provided for @modelsModeMesh.
  ///
  /// In en, this message translates to:
  /// **'Mesh Local'**
  String get modelsModeMesh;

  /// No description provided for @modelsModeSpawn.
  ///
  /// In en, this message translates to:
  /// **'Home llama-server'**
  String get modelsModeSpawn;

  /// No description provided for @modelsModeOllama.
  ///
  /// In en, this message translates to:
  /// **'Ollama'**
  String get modelsModeOllama;

  /// No description provided for @modelsModeOff.
  ///
  /// In en, this message translates to:
  /// **'Off'**
  String get modelsModeOff;

  /// No description provided for @modelsNotConnected.
  ///
  /// In en, this message translates to:
  /// **'Not connected'**
  String get modelsNotConnected;

  /// No description provided for @modelsSetAccount.
  ///
  /// In en, this message translates to:
  /// **'Set accountId to see default model and pool.'**
  String get modelsSetAccount;

  /// No description provided for @modelsUpdated.
  ///
  /// In en, this message translates to:
  /// **'Updated'**
  String get modelsUpdated;

  /// No description provided for @modelsLocalEnabled.
  ///
  /// In en, this message translates to:
  /// **'Local enabled'**
  String get modelsLocalEnabled;

  /// No description provided for @modelsOllamaEnabled.
  ///
  /// In en, this message translates to:
  /// **'Ollama enabled'**
  String get modelsOllamaEnabled;

  /// No description provided for @modelsLocalDisabled.
  ///
  /// In en, this message translates to:
  /// **'Local disabled'**
  String get modelsLocalDisabled;

  /// No description provided for @modelsLocalOnlySet.
  ///
  /// In en, this message translates to:
  /// **'Local-only routing set'**
  String get modelsLocalOnlySet;

  /// No description provided for @modelsDefaultLabel.
  ///
  /// In en, this message translates to:
  /// **'default'**
  String get modelsDefaultLabel;

  /// No description provided for @modelsOffLabel.
  ///
  /// In en, this message translates to:
  /// **'off'**
  String get modelsOffLabel;

  /// No description provided for @modelsTest.
  ///
  /// In en, this message translates to:
  /// **'Test'**
  String get modelsTest;

  /// No description provided for @modelsSetDefault.
  ///
  /// In en, this message translates to:
  /// **'Set default'**
  String get modelsSetDefault;

  /// No description provided for @modelsTestOk.
  ///
  /// In en, this message translates to:
  /// **'Tested {id}'**
  String modelsTestOk(String id);

  /// No description provided for @modelsDefaultSet.
  ///
  /// In en, this message translates to:
  /// **'Default → {id}'**
  String modelsDefaultSet(String id);

  /// No description provided for @artifactsTitle.
  ///
  /// In en, this message translates to:
  /// **'Artifacts'**
  String get artifactsTitle;

  /// No description provided for @artifactsHint.
  ///
  /// In en, this message translates to:
  /// **'Signed links from the home daemon. Tap to open.'**
  String get artifactsHint;

  /// No description provided for @artifactsNeedAccount.
  ///
  /// In en, this message translates to:
  /// **'Set an account to list artifacts.'**
  String get artifactsNeedAccount;

  /// No description provided for @artifactsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No artifacts yet'**
  String get artifactsEmptyTitle;

  /// No description provided for @artifactsEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Pull to refresh after the agent produces a file.'**
  String get artifactsEmptyHint;

  /// No description provided for @artifactsUrlCopied.
  ///
  /// In en, this message translates to:
  /// **'Could not open — URL copied'**
  String get artifactsUrlCopied;

  /// No description provided for @artifactsOpenFailed.
  ///
  /// In en, this message translates to:
  /// **'Open failed: {error}'**
  String artifactsOpenFailed(String error);

  /// No description provided for @chatPendingApprovals.
  ///
  /// In en, this message translates to:
  /// **'{count} waiting for your approval'**
  String chatPendingApprovals(int count);
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>[
        'de',
        'en',
        'fr',
        'it',
        'ja',
        'ko',
        'zh'
      ].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'de':
      return AppLocalizationsDe();
    case 'en':
      return AppLocalizationsEn();
    case 'fr':
      return AppLocalizationsFr();
    case 'it':
      return AppLocalizationsIt();
    case 'ja':
      return AppLocalizationsJa();
    case 'ko':
      return AppLocalizationsKo();
    case 'zh':
      return AppLocalizationsZh();
  }

  throw FlutterError(
      'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
