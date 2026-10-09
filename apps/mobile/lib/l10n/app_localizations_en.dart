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
  String get shellDisconnect => 'Disconnect';

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
  String get navChat => 'Chat';

  @override
  String get navApprovals => 'Approvals';

  @override
  String get navModels => 'Models';

  @override
  String get navArtifacts => 'Artifacts';

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
  String get artifactsTitle => 'Artifacts';

  @override
  String get artifactsHint => 'Signed links from the home daemon. Tap to open.';

  @override
  String get artifactsNeedAccount => 'Set an account to list artifacts.';

  @override
  String get artifactsEmptyTitle => 'No artifacts yet';

  @override
  String get artifactsEmptyHint =>
      'Pull to refresh after the agent produces a file.';

  @override
  String get artifactsUrlCopied => 'Could not open — URL copied';

  @override
  String artifactsOpenFailed(String error) {
    return 'Open failed: $error';
  }

  @override
  String chatPendingApprovals(int count) {
    return '$count waiting for your approval';
  }
}
