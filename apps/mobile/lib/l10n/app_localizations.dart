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

  /// No description provided for @shellDisconnect.
  ///
  /// In en, this message translates to:
  /// **'Disconnect'**
  String get shellDisconnect;

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

  /// No description provided for @navChat.
  ///
  /// In en, this message translates to:
  /// **'Chat'**
  String get navChat;

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
