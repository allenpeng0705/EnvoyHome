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
  /// **'Chats'**
  String get navChat;

  /// No description provided for @navHomeChat.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHomeChat;

  /// No description provided for @navSchedulesChat.
  ///
  /// In en, this message translates to:
  /// **'Schedules'**
  String get navSchedulesChat;

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

  /// No description provided for @navProfiles.
  ///
  /// In en, this message translates to:
  /// **'Profiles'**
  String get navProfiles;

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
  /// **'Configure the home daemon from your phone. Household Owner devices can manage profiles, workspace, and pairing.'**
  String get settingsHubHint;

  /// No description provided for @settingsProfilesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Owner, workspace folders, tool policy'**
  String get settingsProfilesSubtitle;

  /// No description provided for @settingsLlmSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Models, Local, Routing, Memory'**
  String get settingsLlmSubtitle;

  /// No description provided for @settingsConnectionsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Pairing, Home Assistant, MQTT, Channels, Web search'**
  String get settingsConnectionsSubtitle;

  /// No description provided for @settingsSkillsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Skills, Workflows, Schedules'**
  String get settingsSkillsSubtitle;

  /// No description provided for @settingsSystemSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Profiles, Shared files, Health, Grants'**
  String get settingsSystemSubtitle;

  /// No description provided for @settingsNeedConnect.
  ///
  /// In en, this message translates to:
  /// **'Connect to your home to configure Profiles, LLM, Connections, Skills, and System.'**
  String get settingsNeedConnect;

  /// No description provided for @profilesIntro.
  ///
  /// In en, this message translates to:
  /// **'Each person has a profile. The household Owner configures workspace folders and can transfer ownership.'**
  String get profilesIntro;

  /// No description provided for @profilesMemberHint.
  ///
  /// In en, this message translates to:
  /// **'This device is not the household Owner — workspace is read-only here.'**
  String get profilesMemberHint;

  /// No description provided for @profilesRefresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get profilesRefresh;

  /// No description provided for @profilesAddTitle.
  ///
  /// In en, this message translates to:
  /// **'Add profile'**
  String get profilesAddTitle;

  /// No description provided for @profilesOwnerBadge.
  ///
  /// In en, this message translates to:
  /// **'Owner'**
  String get profilesOwnerBadge;

  /// No description provided for @profilesActiveBadge.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get profilesActiveBadge;

  /// No description provided for @profilesWorkspaceTitle.
  ///
  /// In en, this message translates to:
  /// **'Workspace folders'**
  String get profilesWorkspaceTitle;

  /// No description provided for @profilesWorkspaceHint.
  ///
  /// In en, this message translates to:
  /// **'Add host folders on the home machine (up to 16). The agent reaches them via workspace/<id>/… paths.'**
  String get profilesWorkspaceHint;

  /// No description provided for @profilesWorkspacePath.
  ///
  /// In en, this message translates to:
  /// **'Host path'**
  String get profilesWorkspacePath;

  /// No description provided for @profilesWorkspaceBrowse.
  ///
  /// In en, this message translates to:
  /// **'Browse folders'**
  String get profilesWorkspaceBrowse;

  /// No description provided for @profilesWorkspaceBrowseHint.
  ///
  /// In en, this message translates to:
  /// **'Tap to browse the home machine'**
  String get profilesWorkspaceBrowseHint;

  /// No description provided for @profilesWorkspaceUnset.
  ///
  /// In en, this message translates to:
  /// **'Not set (sandbox only)'**
  String get profilesWorkspaceUnset;

  /// No description provided for @profilesWorkspaceSet.
  ///
  /// In en, this message translates to:
  /// **'Configured'**
  String get profilesWorkspaceSet;

  /// No description provided for @profilesWorkspaceWholeMachine.
  ///
  /// In en, this message translates to:
  /// **'Whole machine'**
  String get profilesWorkspaceWholeMachine;

  /// No description provided for @profilesWorkspaceRo.
  ///
  /// In en, this message translates to:
  /// **'Read only'**
  String get profilesWorkspaceRo;

  /// No description provided for @profilesWorkspaceRw.
  ///
  /// In en, this message translates to:
  /// **'Read & write'**
  String get profilesWorkspaceRw;

  /// No description provided for @profilesWorkspaceUseRoot.
  ///
  /// In en, this message translates to:
  /// **'Add computer root'**
  String get profilesWorkspaceUseRoot;

  /// No description provided for @profilesWorkspaceClear.
  ///
  /// In en, this message translates to:
  /// **'Clear all'**
  String get profilesWorkspaceClear;

  /// No description provided for @profilesWorkspaceRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get profilesWorkspaceRemove;

  /// No description provided for @profilesWorkspaceApply.
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get profilesWorkspaceApply;

  /// No description provided for @profilesWorkspaceEdit.
  ///
  /// In en, this message translates to:
  /// **'Add folder'**
  String get profilesWorkspaceEdit;

  /// No description provided for @profilesWorkspaceRootTitle.
  ///
  /// In en, this message translates to:
  /// **'Allow whole-computer access?'**
  String get profilesWorkspaceRootTitle;

  /// No description provided for @profilesWorkspaceRootBody.
  ///
  /// In en, this message translates to:
  /// **'This lets the agent read (and write, if selected) files under the computer root via workspace/… — including from this phone.'**
  String get profilesWorkspaceRootBody;

  /// No description provided for @profilesWorkspaceRootOk.
  ///
  /// In en, this message translates to:
  /// **'Allow'**
  String get profilesWorkspaceRootOk;

  /// No description provided for @profilesWorkspaceMemberNote.
  ///
  /// In en, this message translates to:
  /// **'Only the household Owner can change workspace folders.'**
  String get profilesWorkspaceMemberNote;

  /// No description provided for @profilesWorkspaceCrossTitle.
  ///
  /// In en, this message translates to:
  /// **'Add workspace folder for another profile?'**
  String get profilesWorkspaceCrossTitle;

  /// No description provided for @profilesWorkspaceCrossBody.
  ///
  /// In en, this message translates to:
  /// **'This adds a host folder for {name}. Continue only if you intend to configure their workspace.'**
  String profilesWorkspaceCrossBody(String name);

  /// No description provided for @profilesWorkspaceDenied.
  ///
  /// In en, this message translates to:
  /// **'Not visible on this device'**
  String get profilesWorkspaceDenied;

  /// No description provided for @profilesWorkspaceInactive.
  ///
  /// In en, this message translates to:
  /// **'Configured but inactive (filesystem-root only applies to Owner)'**
  String get profilesWorkspaceInactive;

  /// No description provided for @profilesRename.
  ///
  /// In en, this message translates to:
  /// **'Rename'**
  String get profilesRename;

  /// No description provided for @profilesRenameTitle.
  ///
  /// In en, this message translates to:
  /// **'Rename profile'**
  String get profilesRenameTitle;

  /// No description provided for @profilesRenameSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get profilesRenameSave;

  /// No description provided for @profilesTimeZoneUnset.
  ///
  /// In en, this message translates to:
  /// **'Time zone: not set (schedules use host default)'**
  String get profilesTimeZoneUnset;

  /// No description provided for @profilesTimeZoneValue.
  ///
  /// In en, this message translates to:
  /// **'Time zone: {tz}'**
  String profilesTimeZoneValue(String tz);

  /// No description provided for @profilesTimeZoneEdit.
  ///
  /// In en, this message translates to:
  /// **'Time zone'**
  String get profilesTimeZoneEdit;

  /// No description provided for @profilesTimeZoneTitle.
  ///
  /// In en, this message translates to:
  /// **'Account time zone'**
  String get profilesTimeZoneTitle;

  /// No description provided for @profilesTimeZoneHint.
  ///
  /// In en, this message translates to:
  /// **'IANA name, e.g. Asia/Shanghai'**
  String get profilesTimeZoneHint;

  /// No description provided for @profilesTimeZoneSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get profilesTimeZoneSave;

  /// No description provided for @profilesTimeZoneDone.
  ///
  /// In en, this message translates to:
  /// **'Time zone set to {tz}'**
  String profilesTimeZoneDone(String tz);

  /// No description provided for @profilesShareLocationTitle.
  ///
  /// In en, this message translates to:
  /// **'Share location with Home'**
  String get profilesShareLocationTitle;

  /// No description provided for @profilesShareLocationSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Attach approximate GPS to chat turns for schedule/context. Permission is requested once here; never on every send. Ephemeral only — not saved to memory.'**
  String get profilesShareLocationSubtitle;

  /// No description provided for @profilesShareLocationDenied.
  ///
  /// In en, this message translates to:
  /// **'Location permission was not granted. Sharing stays off.'**
  String get profilesShareLocationDenied;

  /// No description provided for @profilesShareLocationOn.
  ///
  /// In en, this message translates to:
  /// **'Location sharing on for this device'**
  String get profilesShareLocationOn;

  /// No description provided for @profilesDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get profilesDelete;

  /// No description provided for @profilesDeleteTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete profile?'**
  String get profilesDeleteTitle;

  /// No description provided for @profilesDeleteBody.
  ///
  /// In en, this message translates to:
  /// **'Delete {name}? Their sandbox and workspace config are removed. This cannot be undone.'**
  String profilesDeleteBody(String name);

  /// No description provided for @profilesDeleteConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get profilesDeleteConfirm;

  /// No description provided for @profilesDeleteDone.
  ///
  /// In en, this message translates to:
  /// **'Deleted {name}'**
  String profilesDeleteDone(String name);

  /// No description provided for @profilesDeleteOwnerBlocked.
  ///
  /// In en, this message translates to:
  /// **'Cannot delete the household Owner. Transfer ownership first.'**
  String get profilesDeleteOwnerBlocked;

  /// No description provided for @profilesTransferTitle.
  ///
  /// In en, this message translates to:
  /// **'Transfer household Owner?'**
  String get profilesTransferTitle;

  /// No description provided for @profilesTransferBody.
  ///
  /// In en, this message translates to:
  /// **'Make {name} the household Owner. They will control pairing, bindings, and household Settings.'**
  String profilesTransferBody(String name);

  /// No description provided for @profilesTransferConfirm.
  ///
  /// In en, this message translates to:
  /// **'Transfer'**
  String get profilesTransferConfirm;

  /// No description provided for @profilesTransferDone.
  ///
  /// In en, this message translates to:
  /// **'Owner is now {name}'**
  String profilesTransferDone(String name);

  /// No description provided for @profilesTransferFailed.
  ///
  /// In en, this message translates to:
  /// **'Transfer failed: {error}'**
  String profilesTransferFailed(String error);

  /// No description provided for @profilesTransferTo.
  ///
  /// In en, this message translates to:
  /// **'Transfer to {name}'**
  String profilesTransferTo(String name);

  /// No description provided for @profilesToolPolicy.
  ///
  /// In en, this message translates to:
  /// **'Tool policy'**
  String get profilesToolPolicy;

  /// No description provided for @profilesToolPolicyStandard.
  ///
  /// In en, this message translates to:
  /// **'Standard'**
  String get profilesToolPolicyStandard;

  /// No description provided for @profilesToolPolicyRestricted.
  ///
  /// In en, this message translates to:
  /// **'Restricted'**
  String get profilesToolPolicyRestricted;

  /// No description provided for @connMintPairing.
  ///
  /// In en, this message translates to:
  /// **'Mint pairing code'**
  String get connMintPairing;

  /// No description provided for @connMintOk.
  ///
  /// In en, this message translates to:
  /// **'Pairing code minted'**
  String get connMintOk;

  /// No description provided for @connMintUriHint.
  ///
  /// In en, this message translates to:
  /// **'Scan or paste this URI on the new device.'**
  String get connMintUriHint;

  /// No description provided for @connPairingOwnerOnly.
  ///
  /// In en, this message translates to:
  /// **'Mint / revoke pairing requires the household Owner device.'**
  String get connPairingOwnerOnly;

  /// No description provided for @connRevokeDevice.
  ///
  /// In en, this message translates to:
  /// **'Revoke'**
  String get connRevokeDevice;

  /// No description provided for @connForgetDevice.
  ///
  /// In en, this message translates to:
  /// **'Forget'**
  String get connForgetDevice;

  /// No description provided for @connRevokeConfirm.
  ///
  /// In en, this message translates to:
  /// **'Revoke device {id}? It will need to pair again.'**
  String connRevokeConfirm(String id);

  /// No description provided for @connForgetConfirm.
  ///
  /// In en, this message translates to:
  /// **'Forget device {id}? The pairing record is removed permanently.'**
  String connForgetConfirm(String id);

  /// No description provided for @connOwnerWriteOnly.
  ///
  /// In en, this message translates to:
  /// **'Only the household Owner device can change this setting.'**
  String get connOwnerWriteOnly;

  /// No description provided for @connAccountsHint.
  ///
  /// In en, this message translates to:
  /// **'Household profiles'**
  String get connAccountsHint;

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

  /// No description provided for @schedulesChatSessionTitle.
  ///
  /// In en, this message translates to:
  /// **'Schedules'**
  String get schedulesChatSessionTitle;

  /// No description provided for @schedulesChatEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Reminders'**
  String get schedulesChatEmptyTitle;

  /// No description provided for @schedulesChatEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'This chat stays on reminders. Confirm a time before it arms.'**
  String get schedulesChatEmptyHint;

  /// No description provided for @schedulesChatHint.
  ///
  /// In en, this message translates to:
  /// **'Remind me…'**
  String get schedulesChatHint;

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

  /// No description provided for @connTabWebSearch.
  ///
  /// In en, this message translates to:
  /// **'Web search'**
  String get connTabWebSearch;

  /// No description provided for @connTabBrowser.
  ///
  /// In en, this message translates to:
  /// **'Browser'**
  String get connTabBrowser;

  /// No description provided for @browserControlLede.
  ///
  /// In en, this message translates to:
  /// **'Control managed Chromium, or attach personal Chrome / remote CDP. Off by default.'**
  String get browserControlLede;

  /// No description provided for @browserControlEnabled.
  ///
  /// In en, this message translates to:
  /// **'Enable browser tool'**
  String get browserControlEnabled;

  /// No description provided for @browserControlUnattended.
  ///
  /// In en, this message translates to:
  /// **'Allow managed profile for schedules'**
  String get browserControlUnattended;

  /// No description provided for @browserControlReady.
  ///
  /// In en, this message translates to:
  /// **'Ready'**
  String get browserControlReady;

  /// No description provided for @browserControlNotReady.
  ///
  /// In en, this message translates to:
  /// **'Not ready'**
  String get browserControlNotReady;

  /// No description provided for @browserControlSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get browserControlSave;

  /// No description provided for @browserControlSaved.
  ///
  /// In en, this message translates to:
  /// **'Browser settings saved.'**
  String get browserControlSaved;

  /// No description provided for @browserControlSaveFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not save browser settings.'**
  String get browserControlSaveFailed;

  /// No description provided for @browserControlDefaultProfile.
  ///
  /// In en, this message translates to:
  /// **'Default profile'**
  String get browserControlDefaultProfile;

  /// No description provided for @browserControlProfileManaged.
  ///
  /// In en, this message translates to:
  /// **'Managed (isolated)'**
  String get browserControlProfileManaged;

  /// No description provided for @browserControlProfilePersonal.
  ///
  /// In en, this message translates to:
  /// **'Personal Chrome'**
  String get browserControlProfilePersonal;

  /// No description provided for @browserControlProfileRemote.
  ///
  /// In en, this message translates to:
  /// **'Remote CDP'**
  String get browserControlProfileRemote;

  /// No description provided for @browserControlElevatedWarn.
  ///
  /// In en, this message translates to:
  /// **'Personal/remote can act as you on logged-in sites. Owner only; never schedules.'**
  String get browserControlElevatedWarn;

  /// No description provided for @browserControlAcknowledge.
  ///
  /// In en, this message translates to:
  /// **'I understand elevated browser risk'**
  String get browserControlAcknowledge;

  /// No description provided for @browserControlPersonalEnabled.
  ///
  /// In en, this message translates to:
  /// **'Enable personal Chrome'**
  String get browserControlPersonalEnabled;

  /// No description provided for @browserControlPersonalCdp.
  ///
  /// In en, this message translates to:
  /// **'Personal CDP (loopback)'**
  String get browserControlPersonalCdp;

  /// No description provided for @browserControlPersonalReady.
  ///
  /// In en, this message translates to:
  /// **'Personal CDP up'**
  String get browserControlPersonalReady;

  /// No description provided for @browserControlPersonalNotReady.
  ///
  /// In en, this message translates to:
  /// **'Personal CDP down'**
  String get browserControlPersonalNotReady;

  /// No description provided for @browserControlRemoteEnabled.
  ///
  /// In en, this message translates to:
  /// **'Enable remote CDP'**
  String get browserControlRemoteEnabled;

  /// No description provided for @browserControlRemoteCdp.
  ///
  /// In en, this message translates to:
  /// **'Remote CDP URL'**
  String get browserControlRemoteCdp;

  /// No description provided for @browserControlRemoteToken.
  ///
  /// In en, this message translates to:
  /// **'Remote CDP token'**
  String get browserControlRemoteToken;

  /// No description provided for @browserControlTokenSet.
  ///
  /// In en, this message translates to:
  /// **'set'**
  String get browserControlTokenSet;

  /// No description provided for @browserControlTokenPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Leave blank to keep'**
  String get browserControlTokenPlaceholder;

  /// No description provided for @browserControlRemoteReady.
  ///
  /// In en, this message translates to:
  /// **'Remote CDP up'**
  String get browserControlRemoteReady;

  /// No description provided for @browserControlRemoteNotReady.
  ///
  /// In en, this message translates to:
  /// **'Remote CDP down'**
  String get browserControlRemoteNotReady;

  /// No description provided for @browserControlOwnerOnly.
  ///
  /// In en, this message translates to:
  /// **'Only the household Owner device can change browser control settings.'**
  String get browserControlOwnerOnly;

  /// No description provided for @browserControlAcknowledged.
  ///
  /// In en, this message translates to:
  /// **'Elevated risk acknowledged. Disable personal/remote to stop using them.'**
  String get browserControlAcknowledged;

  /// No description provided for @webSearchLede.
  ///
  /// In en, this message translates to:
  /// **'Search the public web from chat. DuckDuckGo needs no key; Brave and Tavily need an Owner API key.'**
  String get webSearchLede;

  /// No description provided for @webSearchEnabled.
  ///
  /// In en, this message translates to:
  /// **'Enable web_search'**
  String get webSearchEnabled;

  /// No description provided for @webSearchProvider.
  ///
  /// In en, this message translates to:
  /// **'Provider'**
  String get webSearchProvider;

  /// No description provided for @webSearchApiKey.
  ///
  /// In en, this message translates to:
  /// **'API key'**
  String get webSearchApiKey;

  /// No description provided for @webSearchApiKeyHint.
  ///
  /// In en, this message translates to:
  /// **'Leave blank to keep the current key'**
  String get webSearchApiKeyHint;

  /// No description provided for @webSearchReady.
  ///
  /// In en, this message translates to:
  /// **'Ready'**
  String get webSearchReady;

  /// No description provided for @webSearchNotReady.
  ///
  /// In en, this message translates to:
  /// **'Not ready'**
  String get webSearchNotReady;

  /// No description provided for @webSearchSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get webSearchSave;

  /// No description provided for @webSearchSaved.
  ///
  /// In en, this message translates to:
  /// **'Web search settings saved.'**
  String get webSearchSaved;

  /// No description provided for @webSearchSaveFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not save web search settings.'**
  String get webSearchSaveFailed;

  /// No description provided for @webSearchOwnerOnly.
  ///
  /// In en, this message translates to:
  /// **'Only the Household Owner device can change web search.'**
  String get webSearchOwnerOnly;

  /// No description provided for @webSearchBrowserFallback.
  ///
  /// In en, this message translates to:
  /// **'Browser fallback (Bing/Google when API/DDG fails)'**
  String get webSearchBrowserFallback;

  /// No description provided for @webSearchBrowserFallbackHint.
  ///
  /// In en, this message translates to:
  /// **'Off by default. Attended chats still ask before the browser leg. SERP pages may CAPTCHA or block.'**
  String get webSearchBrowserFallbackHint;

  /// No description provided for @webSearchBrowserReady.
  ///
  /// In en, this message translates to:
  /// **'Playwright Chromium ready on daemon host'**
  String get webSearchBrowserReady;

  /// No description provided for @webSearchBrowserMissing.
  ///
  /// In en, this message translates to:
  /// **'Playwright Chromium not installed on daemon host'**
  String get webSearchBrowserMissing;

  /// No description provided for @webSearchInstallHintNote.
  ///
  /// In en, this message translates to:
  /// **'Playwright is already part of the daemon. Download Chromium on the home computer that runs EnvoyHome (not this phone), then reopen Settings; restart the daemon if status stays missing.'**
  String get webSearchInstallHintNote;

  /// No description provided for @webSearchCopyHint.
  ///
  /// In en, this message translates to:
  /// **'Copy install command'**
  String get webSearchCopyHint;

  /// No description provided for @webSearchUnattendedBrowser.
  ///
  /// In en, this message translates to:
  /// **'Allow browser fallback for schedules'**
  String get webSearchUnattendedBrowser;

  /// No description provided for @connPairingHint.
  ///
  /// In en, this message translates to:
  /// **'Household Owner devices can mint and revoke pairing here. Members see status only.'**
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

  /// No description provided for @schedKindAgent.
  ///
  /// In en, this message translates to:
  /// **'Agent'**
  String get schedKindAgent;

  /// No description provided for @schedAgentPrompt.
  ///
  /// In en, this message translates to:
  /// **'Agent prompt'**
  String get schedAgentPrompt;

  /// No description provided for @schedTabRepeating.
  ///
  /// In en, this message translates to:
  /// **'Repeating'**
  String get schedTabRepeating;

  /// No description provided for @schedTabOnce.
  ///
  /// In en, this message translates to:
  /// **'Once'**
  String get schedTabOnce;

  /// No description provided for @schedTabHistory.
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get schedTabHistory;

  /// No description provided for @schedNoneRepeating.
  ///
  /// In en, this message translates to:
  /// **'No repeating schedules yet. Try “every Monday at 9am”.'**
  String get schedNoneRepeating;

  /// No description provided for @schedNoneOnce.
  ///
  /// In en, this message translates to:
  /// **'No one-time reminders. Try “tomorrow at 8am”.'**
  String get schedNoneOnce;

  /// No description provided for @schedNoReceipts.
  ///
  /// In en, this message translates to:
  /// **'No runs yet.'**
  String get schedNoReceipts;

  /// No description provided for @schedHistoryNotSet.
  ///
  /// In en, this message translates to:
  /// **'Not set'**
  String get schedHistoryNotSet;

  /// No description provided for @schedHistoryRuns.
  ///
  /// In en, this message translates to:
  /// **'Runs'**
  String get schedHistoryRuns;

  /// No description provided for @schedNoDismissed.
  ///
  /// In en, this message translates to:
  /// **'No canceled or expired proposals.'**
  String get schedNoDismissed;

  /// No description provided for @schedDismissedCanceled.
  ///
  /// In en, this message translates to:
  /// **'Canceled'**
  String get schedDismissedCanceled;

  /// No description provided for @schedDismissedExpired.
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get schedDismissedExpired;

  /// No description provided for @schedNext.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get schedNext;

  /// No description provided for @schedKindRepeating.
  ///
  /// In en, this message translates to:
  /// **'Repeats'**
  String get schedKindRepeating;

  /// No description provided for @schedKindOnce.
  ///
  /// In en, this message translates to:
  /// **'Once'**
  String get schedKindOnce;

  /// No description provided for @schedKindDaily.
  ///
  /// In en, this message translates to:
  /// **'Daily'**
  String get schedKindDaily;

  /// No description provided for @schedKindWeekdays.
  ///
  /// In en, this message translates to:
  /// **'Weekdays'**
  String get schedKindWeekdays;

  /// No description provided for @schedKindWeekly.
  ///
  /// In en, this message translates to:
  /// **'Weekly'**
  String get schedKindWeekly;

  /// No description provided for @schedKindMonthly.
  ///
  /// In en, this message translates to:
  /// **'Monthly'**
  String get schedKindMonthly;

  /// No description provided for @schedKindYearly.
  ///
  /// In en, this message translates to:
  /// **'Yearly'**
  String get schedKindYearly;

  /// No description provided for @schedKindEvery.
  ///
  /// In en, this message translates to:
  /// **'Every'**
  String get schedKindEvery;

  /// No description provided for @schedDayOfMonth.
  ///
  /// In en, this message translates to:
  /// **'day {d}'**
  String schedDayOfMonth(String d);

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
  /// **'Files'**
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

  /// No description provided for @sysTabMachine.
  ///
  /// In en, this message translates to:
  /// **'This machine'**
  String get sysTabMachine;

  /// No description provided for @sysMachineHint.
  ///
  /// In en, this message translates to:
  /// **'Daemon listen status from home.health. OS service install/restart is loopback-only on the home desktop — not available over mesh.'**
  String get sysMachineHint;

  /// No description provided for @sysMachineDaemonOk.
  ///
  /// In en, this message translates to:
  /// **'Daemon reachable'**
  String get sysMachineDaemonOk;

  /// No description provided for @sysMachineDaemonBad.
  ///
  /// In en, this message translates to:
  /// **'Daemon health failed'**
  String get sysMachineDaemonBad;

  /// No description provided for @sysMachineWsPort.
  ///
  /// In en, this message translates to:
  /// **'WebSocket port'**
  String get sysMachineWsPort;

  /// No description provided for @sysMachineHttpPort.
  ///
  /// In en, this message translates to:
  /// **'HTTP hatch port'**
  String get sysMachineHttpPort;

  /// No description provided for @sysMachinePublicUrl.
  ///
  /// In en, this message translates to:
  /// **'Public base URL'**
  String get sysMachinePublicUrl;

  /// No description provided for @sysMachinePublicUrlEmpty.
  ///
  /// In en, this message translates to:
  /// **'Not set'**
  String get sysMachinePublicUrlEmpty;

  /// No description provided for @sysMachineUptime.
  ///
  /// In en, this message translates to:
  /// **'Uptime'**
  String get sysMachineUptime;

  /// No description provided for @sysMachineConnections.
  ///
  /// In en, this message translates to:
  /// **'Clients / active turns'**
  String get sysMachineConnections;

  /// No description provided for @sysMachineMesh.
  ///
  /// In en, this message translates to:
  /// **'Mesh'**
  String get sysMachineMesh;

  /// No description provided for @sysMachineOsServiceNote.
  ///
  /// In en, this message translates to:
  /// **'Install or restart the OS service from desktop Settings → System → This machine (loopback-owner).'**
  String get sysMachineOsServiceNote;

  /// No description provided for @sysMachineRefresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get sysMachineRefresh;

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

  /// No description provided for @wfModeYaml.
  ///
  /// In en, this message translates to:
  /// **'YAML'**
  String get wfModeYaml;

  /// No description provided for @wfModeDiagram.
  ///
  /// In en, this message translates to:
  /// **'Diagram'**
  String get wfModeDiagram;

  /// No description provided for @wfDiagramEmpty.
  ///
  /// In en, this message translates to:
  /// **'No steps yet — draft or edit YAML.'**
  String get wfDiagramEmpty;

  /// No description provided for @wfDiagramEdge.
  ///
  /// In en, this message translates to:
  /// **'↓'**
  String get wfDiagramEdge;

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

  /// No description provided for @chatThought.
  ///
  /// In en, this message translates to:
  /// **'Thinking'**
  String get chatThought;

  /// No description provided for @chatNew.
  ///
  /// In en, this message translates to:
  /// **'New chat'**
  String get chatNew;

  /// No description provided for @chatNewNamePrompt.
  ///
  /// In en, this message translates to:
  /// **'Chat name'**
  String get chatNewNamePrompt;

  /// No description provided for @chatNewNamePlaceholder.
  ///
  /// In en, this message translates to:
  /// **'e.g. Weekend plans'**
  String get chatNewNamePlaceholder;

  /// No description provided for @chatNewNameHint.
  ///
  /// In en, this message translates to:
  /// **'Name it now, or start without a name and we’ll use the first message.'**
  String get chatNewNameHint;

  /// No description provided for @chatNewSkip.
  ///
  /// In en, this message translates to:
  /// **'Start without name'**
  String get chatNewSkip;

  /// No description provided for @chatNewCreate.
  ///
  /// In en, this message translates to:
  /// **'Create'**
  String get chatNewCreate;

  /// No description provided for @chatNewNeedName.
  ///
  /// In en, this message translates to:
  /// **'Enter a name, or choose Start without name.'**
  String get chatNewNeedName;

  /// No description provided for @chatNewStart.
  ///
  /// In en, this message translates to:
  /// **'Start chat'**
  String get chatNewStart;

  /// No description provided for @chatOpenArtifact.
  ///
  /// In en, this message translates to:
  /// **'Open full reply'**
  String get chatOpenArtifact;

  /// No description provided for @chatRecents.
  ///
  /// In en, this message translates to:
  /// **'Recents'**
  String get chatRecents;

  /// No description provided for @chatRecentsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No earlier chats.'**
  String get chatRecentsEmpty;

  /// No description provided for @chatSessionsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No chats yet. Start a new one.'**
  String get chatSessionsEmpty;

  /// No description provided for @chatUntitled.
  ///
  /// In en, this message translates to:
  /// **'Untitled chat'**
  String get chatUntitled;

  /// No description provided for @chatRenameAction.
  ///
  /// In en, this message translates to:
  /// **'Rename'**
  String get chatRenameAction;

  /// No description provided for @chatRenamePrompt.
  ///
  /// In en, this message translates to:
  /// **'Chat name'**
  String get chatRenamePrompt;

  /// No description provided for @chatRenameDone.
  ///
  /// In en, this message translates to:
  /// **'Chat renamed.'**
  String get chatRenameDone;

  /// No description provided for @chatRenameEmpty.
  ///
  /// In en, this message translates to:
  /// **'Name can\'t be empty.'**
  String get chatRenameEmpty;

  /// No description provided for @chatRenameNeedSession.
  ///
  /// In en, this message translates to:
  /// **'Send a message first, then rename.'**
  String get chatRenameNeedSession;

  /// No description provided for @chatBusyTurn.
  ///
  /// In en, this message translates to:
  /// **'Wait for the current reply to finish (or cancel it).'**
  String get chatBusyTurn;

  /// No description provided for @chatEmptyAction.
  ///
  /// In en, this message translates to:
  /// **'Empty chat'**
  String get chatEmptyAction;

  /// No description provided for @chatEmptyConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Empty this chat?'**
  String get chatEmptyConfirmTitle;

  /// No description provided for @chatEmptyConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'All messages in this thread will be removed. The chat itself stays.'**
  String get chatEmptyConfirmBody;

  /// No description provided for @chatTrashMenu.
  ///
  /// In en, this message translates to:
  /// **'Chat actions'**
  String get chatTrashMenu;

  /// No description provided for @chatArchiveAction.
  ///
  /// In en, this message translates to:
  /// **'Archive chat'**
  String get chatArchiveAction;

  /// No description provided for @chatUnarchiveAction.
  ///
  /// In en, this message translates to:
  /// **'Restore to Chats'**
  String get chatUnarchiveAction;

  /// No description provided for @chatUnarchiveDone.
  ///
  /// In en, this message translates to:
  /// **'Chat restored.'**
  String get chatUnarchiveDone;

  /// No description provided for @chatArchivedOpen.
  ///
  /// In en, this message translates to:
  /// **'Archived'**
  String get chatArchivedOpen;

  /// No description provided for @chatTabActive.
  ///
  /// In en, this message translates to:
  /// **'Chats'**
  String get chatTabActive;

  /// No description provided for @chatTabArchived.
  ///
  /// In en, this message translates to:
  /// **'Archived'**
  String get chatTabArchived;

  /// No description provided for @homeFolderTitle.
  ///
  /// In en, this message translates to:
  /// **'Choose folder'**
  String get homeFolderTitle;

  /// No description provided for @homeFolderSelect.
  ///
  /// In en, this message translates to:
  /// **'Select'**
  String get homeFolderSelect;

  /// No description provided for @homeFolderDrives.
  ///
  /// In en, this message translates to:
  /// **'Drives'**
  String get homeFolderDrives;

  /// No description provided for @homeFolderComputer.
  ///
  /// In en, this message translates to:
  /// **'Computer'**
  String get homeFolderComputer;

  /// No description provided for @homeFolderHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get homeFolderHome;

  /// No description provided for @homeFolderParent.
  ///
  /// In en, this message translates to:
  /// **'Parent folder'**
  String get homeFolderParent;

  /// No description provided for @homeFolderNoSubfolders.
  ///
  /// In en, this message translates to:
  /// **'No subfolders'**
  String get homeFolderNoSubfolders;

  /// No description provided for @chatArchivedTitle.
  ///
  /// In en, this message translates to:
  /// **'Archived chats'**
  String get chatArchivedTitle;

  /// No description provided for @chatArchivedBack.
  ///
  /// In en, this message translates to:
  /// **'Back to chats'**
  String get chatArchivedBack;

  /// No description provided for @chatArchivedEmpty.
  ///
  /// In en, this message translates to:
  /// **'No archived chats.'**
  String get chatArchivedEmpty;

  /// No description provided for @chatRemoveAction.
  ///
  /// In en, this message translates to:
  /// **'Delete chat'**
  String get chatRemoveAction;

  /// No description provided for @chatArchiveConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Archive this chat?'**
  String get chatArchiveConfirmTitle;

  /// No description provided for @chatArchiveConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'It leaves the Chats list but stays on disk. Open Archived to restore or delete. Archive does not erase messages.'**
  String get chatArchiveConfirmBody;

  /// No description provided for @chatRemoveConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete this chat?'**
  String get chatRemoveConfirmTitle;

  /// No description provided for @chatRemoveConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'Permanently delete this chat and all its messages. This cannot be undone.'**
  String get chatRemoveConfirmBody;

  /// No description provided for @chatRemoveDone.
  ///
  /// In en, this message translates to:
  /// **'Chat deleted.'**
  String get chatRemoveDone;

  /// No description provided for @chatNoSession.
  ///
  /// In en, this message translates to:
  /// **'No active chat session yet.'**
  String get chatNoSession;

  /// No description provided for @chatDeleteFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not delete that message on the server.'**
  String get chatDeleteFailed;

  /// No description provided for @chatDeleteMessage.
  ///
  /// In en, this message translates to:
  /// **'Delete message'**
  String get chatDeleteMessage;

  /// No description provided for @chatCopyMessage.
  ///
  /// In en, this message translates to:
  /// **'Copy message'**
  String get chatCopyMessage;

  /// No description provided for @chatCopied.
  ///
  /// In en, this message translates to:
  /// **'Copied'**
  String get chatCopied;

  /// No description provided for @chatCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get chatCancel;

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
  /// **'Files'**
  String get artifactsTitle;

  /// No description provided for @artifactsHint.
  ///
  /// In en, this message translates to:
  /// **'Browse folders this profile can access over your home connection. Open in-app, Share/Save, or Open in browser when a signed link is available.'**
  String get artifactsHint;

  /// No description provided for @artifactsNeedAccount.
  ///
  /// In en, this message translates to:
  /// **'Set an account to browse files.'**
  String get artifactsNeedAccount;

  /// No description provided for @artifactsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No folders yet'**
  String get artifactsEmptyTitle;

  /// No description provided for @artifactsEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Pull to refresh. Workspace appears when configured for this profile.'**
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

  /// No description provided for @artifactsTooLarge.
  ///
  /// In en, this message translates to:
  /// **'This file is larger than the 8 MB in-app open limit. Ask the agent for a smaller export, or open it on the home machine.'**
  String get artifactsTooLarge;

  /// No description provided for @artifactsRefresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get artifactsRefresh;

  /// No description provided for @artifactsRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get artifactsRetry;

  /// No description provided for @artifactsBinaryHint.
  ///
  /// In en, this message translates to:
  /// **'This file type isn’t previewable here. Use Share / Save to open it in another app, or ask the home agent for a text or markdown export.'**
  String get artifactsBinaryHint;

  /// No description provided for @artifactsShare.
  ///
  /// In en, this message translates to:
  /// **'Share / Save'**
  String get artifactsShare;

  /// No description provided for @artifactsShareFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not share: {error}'**
  String artifactsShareFailed(String error);

  /// No description provided for @artifactsCopyLink.
  ///
  /// In en, this message translates to:
  /// **'Copy signed link'**
  String get artifactsCopyLink;

  /// No description provided for @artifactsLinkCopied.
  ///
  /// In en, this message translates to:
  /// **'Signed link copied'**
  String get artifactsLinkCopied;

  /// No description provided for @artifactsCopyLinkFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not copy link'**
  String get artifactsCopyLinkFailed;

  /// No description provided for @artifactsOpenInBrowser.
  ///
  /// In en, this message translates to:
  /// **'Open in browser'**
  String get artifactsOpenInBrowser;

  /// No description provided for @artifactsOpenInBrowserFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not open in browser'**
  String get artifactsOpenInBrowserFailed;

  /// No description provided for @filesParent.
  ///
  /// In en, this message translates to:
  /// **'Parent'**
  String get filesParent;

  /// No description provided for @filesRoots.
  ///
  /// In en, this message translates to:
  /// **'Roots'**
  String get filesRoots;

  /// No description provided for @filesEmptyFolder.
  ///
  /// In en, this message translates to:
  /// **'This folder is empty'**
  String get filesEmptyFolder;

  /// No description provided for @chatOpenFile.
  ///
  /// In en, this message translates to:
  /// **'Open {name}'**
  String chatOpenFile(String name);

  /// No description provided for @chatPendingApprovals.
  ///
  /// In en, this message translates to:
  /// **'{count} waiting for your approval'**
  String chatPendingApprovals(int count);

  /// No description provided for @choiceCardConfirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get choiceCardConfirm;

  /// No description provided for @choiceCardPickOne.
  ///
  /// In en, this message translates to:
  /// **'Pick at least one option.'**
  String get choiceCardPickOne;

  /// No description provided for @choiceCardAnswered.
  ///
  /// In en, this message translates to:
  /// **'Got it.'**
  String get choiceCardAnswered;

  /// No description provided for @choiceCardFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not send that choice: {error}'**
  String choiceCardFailed(String error);

  /// No description provided for @chatPendingChoices.
  ///
  /// In en, this message translates to:
  /// **'{count} waiting for your choice'**
  String chatPendingChoices(int count);

  /// No description provided for @choiceCardCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get choiceCardCancel;

  /// No description provided for @choiceCardCanceled.
  ///
  /// In en, this message translates to:
  /// **'Choice dismissed.'**
  String get choiceCardCanceled;

  /// No description provided for @choiceCardExpired.
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get choiceCardExpired;

  /// No description provided for @choiceCardExpiredHint.
  ///
  /// In en, this message translates to:
  /// **'This choice expired — ask again if you still need it.'**
  String get choiceCardExpiredHint;

  /// No description provided for @choiceCardExpiresIn.
  ///
  /// In en, this message translates to:
  /// **'Expires in {mins} min'**
  String choiceCardExpiresIn(int mins);

  /// No description provided for @choiceCardTextPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Type your answer'**
  String get choiceCardTextPlaceholder;

  /// No description provided for @schedulesChatTabChat.
  ///
  /// In en, this message translates to:
  /// **'Schedules'**
  String get schedulesChatTabChat;

  /// No description provided for @schedulesChatTabHistories.
  ///
  /// In en, this message translates to:
  /// **'Histories'**
  String get schedulesChatTabHistories;

  /// No description provided for @schedulesChatHistoriesHint.
  ///
  /// In en, this message translates to:
  /// **'Proposals you canceled or that expired, and recent job runs.'**
  String get schedulesChatHistoriesHint;

  /// No description provided for @jobsHistoriesMovedHint.
  ///
  /// In en, this message translates to:
  /// **'History moved to Schedules → Histories'**
  String get jobsHistoriesMovedHint;

  /// No description provided for @schedulesChatClosedAt.
  ///
  /// In en, this message translates to:
  /// **'Closed {when}'**
  String schedulesChatClosedAt(String when);

  /// No description provided for @schedulesChatRanAt.
  ///
  /// In en, this message translates to:
  /// **'Ran {when}'**
  String schedulesChatRanAt(String when);

  /// No description provided for @welcomeSkip.
  ///
  /// In en, this message translates to:
  /// **'Skip'**
  String get welcomeSkip;

  /// No description provided for @welcomeNext.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get welcomeNext;

  /// No description provided for @commonContinue.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get commonContinue;

  /// No description provided for @welcomeSlide1Title.
  ///
  /// In en, this message translates to:
  /// **'Welcome to EnvoyHome'**
  String get welcomeSlide1Title;

  /// No description provided for @welcomeSlide1Body.
  ///
  /// In en, this message translates to:
  /// **'Your phone is a window into a self-hosted home agent — chat, approvals, and smart-home control stay on your desktop.'**
  String get welcomeSlide1Body;

  /// No description provided for @welcomeSlide2Title.
  ///
  /// In en, this message translates to:
  /// **'The work runs on your computer'**
  String get welcomeSlide2Title;

  /// No description provided for @welcomeSlide2Body.
  ///
  /// In en, this message translates to:
  /// **'Install EnvoyHome on a Mac or PC at home. The daemon, models, and household memory stay on that machine — the phone is a remote window.'**
  String get welcomeSlide2Body;

  /// No description provided for @welcomeSlide3Title.
  ///
  /// In en, this message translates to:
  /// **'Pair with a QR code'**
  String get welcomeSlide3Title;

  /// No description provided for @welcomeSlide3Body.
  ///
  /// In en, this message translates to:
  /// **'On the computer, open EnvoyHome and show the pairing QR. On this phone, tap Pair now and scan it. You can also paste a pairing link.'**
  String get welcomeSlide3Body;

  /// No description provided for @welcomeSlideRequiredTitle.
  ///
  /// In en, this message translates to:
  /// **'Pair to get started'**
  String get welcomeSlideRequiredTitle;

  /// No description provided for @welcomeSlideRequiredBody.
  ///
  /// In en, this message translates to:
  /// **'EnvoyHome needs a computer running the desktop app. Agents and home control run there — pair this phone with that computer to continue.'**
  String get welcomeSlideRequiredBody;

  /// No description provided for @setupGuideTitle.
  ///
  /// In en, this message translates to:
  /// **'How EnvoyHome works'**
  String get setupGuideTitle;

  /// No description provided for @setupGuideIntro.
  ///
  /// In en, this message translates to:
  /// **'EnvoyHome on your phone talks to EnvoyHome on your home computer. Install the desktop app, pair once, then chat and approve from anywhere.'**
  String get setupGuideIntro;

  /// No description provided for @setupGuidePairRequiredTitle.
  ///
  /// In en, this message translates to:
  /// **'Pair to continue'**
  String get setupGuidePairRequiredTitle;

  /// No description provided for @setupGuidePairRequiredBody.
  ///
  /// In en, this message translates to:
  /// **'EnvoyHome is the phone companion for your home desktop. Without a paired computer there is nothing to show here yet.'**
  String get setupGuidePairRequiredBody;

  /// No description provided for @setupGuideStep1Title.
  ///
  /// In en, this message translates to:
  /// **'Get a computer ready'**
  String get setupGuideStep1Title;

  /// No description provided for @setupGuideStep1Body.
  ///
  /// In en, this message translates to:
  /// **'You need a Mac or Windows/Linux PC at home. That machine becomes your EnvoyHome host — where the daemon and agents run.'**
  String get setupGuideStep1Body;

  /// No description provided for @setupGuideStep2Title.
  ///
  /// In en, this message translates to:
  /// **'Download and install EnvoyHome'**
  String get setupGuideStep2Title;

  /// No description provided for @setupGuideStep2Body.
  ///
  /// In en, this message translates to:
  /// **'Open the QuickStart and install the daemon plus desktop app on that computer. Launch them and keep them running.'**
  String get setupGuideStep2Body;

  /// No description provided for @setupGuideDownloadCta.
  ///
  /// In en, this message translates to:
  /// **'Open EnvoyHome QuickStart'**
  String get setupGuideDownloadCta;

  /// No description provided for @setupGuideStep3Title.
  ///
  /// In en, this message translates to:
  /// **'Show the pairing QR'**
  String get setupGuideStep3Title;

  /// No description provided for @setupGuideStep3Body.
  ///
  /// In en, this message translates to:
  /// **'In desktop EnvoyHome, open Settings → Pair devices. Keep the QR on screen (it should include mesh/relays, not LAN-only).'**
  String get setupGuideStep3Body;

  /// No description provided for @setupGuideStep4Title.
  ///
  /// In en, this message translates to:
  /// **'Scan with this phone'**
  String get setupGuideStep4Title;

  /// No description provided for @setupGuideStep4Body.
  ///
  /// In en, this message translates to:
  /// **'Tap Pair now below. Allow camera access, then scan the QR. You can also paste an envoy:// pair link, or use host:port / SSH.'**
  String get setupGuideStep4Body;

  /// No description provided for @setupGuideStep5Title.
  ///
  /// In en, this message translates to:
  /// **'You’re connected'**
  String get setupGuideStep5Title;

  /// No description provided for @setupGuideStep5Body.
  ///
  /// In en, this message translates to:
  /// **'When pairing finishes, this phone shows chats, approvals, and Settings for that home. The desktop keeps running whether or not the phone is connected.'**
  String get setupGuideStep5Body;

  /// No description provided for @setupGuideNoHomeTitle.
  ///
  /// In en, this message translates to:
  /// **'Pairing later is fine'**
  String get setupGuideNoHomeTitle;

  /// No description provided for @setupGuideNoHomeBody.
  ///
  /// In en, this message translates to:
  /// **'You can continue now and pair any time from Connect. Without a paired computer, there is nothing to show here yet.'**
  String get setupGuideNoHomeBody;

  /// No description provided for @setupGuidePairCta.
  ///
  /// In en, this message translates to:
  /// **'Pair now'**
  String get setupGuidePairCta;

  /// No description provided for @setupGuidePairLaterCta.
  ///
  /// In en, this message translates to:
  /// **'Pair later'**
  String get setupGuidePairLaterCta;

  /// No description provided for @setupGuideSkipCta.
  ///
  /// In en, this message translates to:
  /// **'Explore first'**
  String get setupGuideSkipCta;

  /// No description provided for @setupGuideDoneCta.
  ///
  /// In en, this message translates to:
  /// **'Got it'**
  String get setupGuideDoneCta;

  /// No description provided for @settingsSetupGuideSubtitle.
  ///
  /// In en, this message translates to:
  /// **'How to install the desktop app and pair this phone.'**
  String get settingsSetupGuideSubtitle;
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
