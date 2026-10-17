import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/push_service.dart';

const _kJoinPersist = 'envoyhome.joinPersist';
const _kAccountId = 'envoyhome.accountId';
// Legacy key from QR-only builds.
const _kPairUri = 'envoyhome.pairUri';

class SessionController extends ChangeNotifier {
  EnvoyHomeSession? _session;
  String? _joinPersist;
  String? _accountId;
  String? _error;
  bool _busy = false;
  Map<String, dynamic>? _hello;
  Map<String, dynamic>? _health;

  EnvoyHomeSession? get session => _session;
  String? get pairUri => _joinPersist;
  String? get accountId => _accountId;
  String? get error => _error;
  bool get busy => _busy;
  bool get isConnected => _session != null;
  /// True when a join credential is on disk (or in memory) — reconnect without re-scan.
  bool get hasSavedPairing =>
      _joinPersist != null && _joinPersist!.trim().isNotEmpty;
  Map<String, dynamic>? get hello => _hello;
  Map<String, dynamic>? get health => _health;
  JoinChannel? get joinChannel => _session?.joinChannel;

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final account = prefs.getString(_kAccountId);
    final persist =
        prefs.getString(_kJoinPersist) ?? prefs.getString(_kPairUri);
    if (persist == null || persist.isEmpty) return;
    // Keep the saved join even if reconnect fails (daemon offline, LAN down).
    // Never force a remote re-pair just because this cold start could not dial.
    _joinPersist = persist;
    _accountId = account;
    final pairing = decodeJoinPersist(persist);
    if (pairing == null) {
      _error = 'Saved pairing is invalid — scan the desktop QR again';
      notifyListeners();
      return;
    }
    if (pairing.joinChannel == JoinChannel.ssh &&
        (pairing.ssh?.password == null || pairing.ssh!.password!.isEmpty)) {
      // Password is never persisted — user must re-enter on SSH tab.
      _error = 'Re-enter SSH password to reconnect';
      notifyListeners();
      return;
    }
    await connectWithPairing(pairing, accountId: account, persist: false);
  }

  /// Retry the last saved join without clearing credentials.
  Future<void> reconnect() async {
    final persist = _joinPersist;
    if (persist == null || persist.isEmpty) return;
    final pairing = decodeJoinPersist(persist);
    if (pairing == null) {
      _error = 'Saved pairing is invalid — scan the desktop QR again';
      notifyListeners();
      return;
    }
    if (pairing.joinChannel == JoinChannel.ssh &&
        (pairing.ssh?.password == null || pairing.ssh!.password!.isEmpty)) {
      _error = 'Re-enter SSH password to reconnect';
      notifyListeners();
      return;
    }
    await connectWithPairing(pairing, accountId: _accountId, persist: false);
  }

  Future<void> connectWithUri(
    String uri, {
    String? accountId,
    bool persist = true,
  }) async {
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      final pairing = acceptEnvoyHomePairing(uri.trim());
      if (pairing == null) {
        throw StateError('Not a valid envoy://pair URI');
      }
      await _finishConnect(pairing, accountId: accountId, persist: persist,
          persistRaw: uri.trim());
    } catch (err) {
      _error = err.toString();
      _session?.dispose();
      _session = null;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<void> connectWithPairing(
    AcceptedPairing pairing, {
    String? accountId,
    bool persist = true,
  }) async {
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      await _finishConnect(
        pairing,
        accountId: accountId,
        persist: persist,
        persistRaw: encodeJoinPersist(pairing),
      );
    } catch (err) {
      _error = err.toString();
      _session?.dispose();
      _session = null;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<void> _finishConnect(
    AcceptedPairing pairing, {
    String? accountId,
    required bool persist,
    required String persistRaw,
  }) async {
    final platform = defaultTargetPlatform == TargetPlatform.iOS
        ? 'ios'
        : defaultTargetPlatform == TargetPlatform.android
            ? 'android'
            : 'unknown';
    final next = await EnvoyHomeSession.connect(pairing);
    await next.assertHostingDialPath();
    final hello = await next.hello(platform: platform);
    final health = await next.health();

    _session?.dispose();
    _session = next;
    _joinPersist = persistRaw;
    _hello = hello;
    _health = health;
    _accountId = accountId ?? _accountIdFromHello(hello);

    if (persist) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kJoinPersist, _joinPersist!);
      await prefs.remove(_kPairUri);
      if (_accountId != null) {
        await prefs.setString(_kAccountId, _accountId!);
      }
    }

    await PushService.instance.bindSession(next, accountId: _accountId);
  }

  /// Prefer mint-time bindings echoed by `home.hello.accountIds` (additive).
  String? _accountIdFromHello(Map<String, dynamic> hello) {
    final ids = hello['accountIds'];
    if (ids is List) {
      final bound = ids
          .whereType<String>()
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
      if (bound.length == 1) return bound.first;
      if (bound.length > 1 && _accountId != null && bound.contains(_accountId)) {
        return _accountId;
      }
      if (bound.isNotEmpty) return bound.first;
    }
    return _accountId;
  }

  void setAccountId(String id) {
    _accountId = id.trim().isEmpty ? null : id.trim();
    PushService.instance.setAccountId(_accountId);
    notifyListeners();
    SharedPreferences.getInstance().then((prefs) async {
      if (_accountId == null) {
        await prefs.remove(_kAccountId);
      } else {
        await prefs.setString(_kAccountId, _accountId!);
      }
    });
  }

  /// Replace cached `home.hello` (e.g. after createAccount).
  void applyHello(Map<String, dynamic> hello) {
    _hello = hello;
    final fromHello = _accountIdFromHello(hello);
    if (fromHello != null) _accountId = fromHello;
    notifyListeners();
  }

  /// Drop the live WS only — keep saved pairing for the next launch / reconnect.
  Future<void> disconnect({bool forgetPairing = false}) async {
    await PushService.instance.unbind();
    _session?.dispose();
    _session = null;
    _hello = null;
    _health = null;
    if (forgetPairing) {
      _joinPersist = null;
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_kJoinPersist);
      await prefs.remove(_kPairUri);
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _session?.dispose();
    super.dispose();
  }
}
