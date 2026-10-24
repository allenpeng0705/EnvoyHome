import 'dart:async';

import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/connectivity_observer.dart';
import '../services/push_service.dart';

const _kJoinPersist = 'envoyhome.joinPersist';
const _kAccountId = 'envoyhome.accountId';
// Legacy key from QR-only builds.
const _kPairUri = 'envoyhome.pairUri';

class SessionController extends ChangeNotifier {
  SessionController({ConnectivityObserver? connectivity})
      : _connectivity = connectivity;

  /// Wi‑Fi vs cellular for the dial ladder. Null in tests that do not dial.
  final ConnectivityObserver? _connectivity;
  StreamSubscription<void>? _onlineSub;
  StreamSubscription<void>? _typeSub;
  bool _redialInFlight = false;
  /// Network changed while a dial was in flight — re-walk once that settles.
  bool _redialPending = false;
  /// Soft Disconnect: user asked to stay offline until Reconnect / cold restore.
  bool _userPaused = false;

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
  /// Soft-disconnected; network nudges must not auto-reconnect.
  bool get userPaused => _userPaused;

  @visibleForTesting
  void debugPrimeSavedPairing(String persist) {
    _joinPersist = persist.trim().isEmpty ? null : persist.trim();
  }

  @visibleForTesting
  void debugNetworkNudge() => _onNetworkNudge();

  Map<String, dynamic>? get hello => _hello;
  Map<String, dynamic>? get health => _health;
  JoinChannel? get joinChannel => _session?.joinChannel;

  Future<void> _ensureConnectivity() async {
    final observer = _connectivity;
    if (observer == null || _onlineSub != null) return;
    try {
      await observer.start();
    } catch (_) {
      // Platform channel missing in some test/bindings — treat as unknown (off-LAN plan).
    }
    _onlineSub = observer.onBecameOnline.listen((_) => _onNetworkNudge());
    _typeSub = observer.onNetworkTypeChanged.listen((_) => _onNetworkNudge());
  }

  /// Wi‑Fi ↔ cellular (or offline → online): re-walk with a fresh plan.
  void _onNetworkNudge() {
    if (!hasSavedPairing || _userPaused) return;
    if (_busy || _redialInFlight) {
      _redialPending = true;
      return;
    }
    unawaited(_redialFromNetworkChange());
  }

  Future<void> _redialFromNetworkChange() async {
    if (_userPaused || !hasSavedPairing) return;
    if (_redialInFlight) {
      _redialPending = true;
      return;
    }
    _redialInFlight = true;
    try {
      do {
        _redialPending = false;
        if (_userPaused || !hasSavedPairing) break;
        await reconnect();
      } while (_redialPending && hasSavedPairing && !_userPaused);
    } finally {
      _redialInFlight = false;
    }
  }

  void _drainPendingRedial() {
    if (_userPaused) return;
    if (!_redialPending || !hasSavedPairing || _busy || _redialInFlight) return;
    unawaited(_redialFromNetworkChange());
  }

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final account = prefs.getString(_kAccountId);
    final persist =
        prefs.getString(_kJoinPersist) ?? prefs.getString(_kPairUri);
    if (persist == null || persist.isEmpty) return;
    // Keep the saved join even if reconnect fails (daemon offline, LAN down).
    // Never force a remote re-pair just because this cold start could not dial.
    _userPaused = false;
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

  /// Load join from disk into memory when soft-disconnect left memory empty
  /// (or after process death without [restore]).
  Future<void> _ensureJoinPersistLoaded() async {
    if (_joinPersist != null && _joinPersist!.trim().isNotEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    final persist =
        prefs.getString(_kJoinPersist) ?? prefs.getString(_kPairUri);
    if (persist != null && persist.trim().isNotEmpty) {
      _joinPersist = persist;
      _accountId ??= prefs.getString(_kAccountId);
    }
  }

  /// Retry the last saved join without clearing credentials.
  Future<void> reconnect() async {
    _userPaused = false;
    _redialPending = false;
    await _ensureJoinPersistLoaded();
    final persist = _joinPersist;
    if (persist == null || persist.isEmpty) {
      _error = 'No saved pairing — scan the desktop QR again';
      notifyListeners();
      return;
    }
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
    _userPaused = false;
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
      _drainPendingRedial();
    }
  }

  Future<void> connectWithPairing(
    AcceptedPairing pairing, {
    String? accountId,
    bool persist = true,
  }) async {
    _userPaused = false;
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
      _drainPendingRedial();
    }
  }

  Future<void> _finishConnect(
    AcceptedPairing pairing, {
    String? accountId,
    required bool persist,
    required String persistRaw,
  }) async {
    await _ensureConnectivity();
    final platform = defaultTargetPlatform == TargetPlatform.iOS
        ? 'ios'
        : defaultTargetPlatform == TargetPlatform.android
            ? 'android'
            : 'unknown';
    // Providers re-read on every resolve (reconnect / upgrade sweep) so a cafe
    // Wi‑Fi flip mid-walk sees the new plan (EnvoyCoder 09697b0).
    final next = await EnvoyHomeSession.connect(
      pairing,
      isOnWifiProvider: () => _connectivity?.isOnWifi ?? false,
      sameLanProvider: () async {
        // Interface site match is authoritative. Do **not** require
        // connectivity_plus Wi‑Fi first — a false/null reading was zeroing
        // LAN-only pairings into "pairing has no dial target".
        final lanTarget = (pairing.lanWsUrl ?? pairing.wsUrl).trim();
        if (lanTarget.isEmpty) return false;
        return phoneSharesLanWith(lanTarget);
      },
    );
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
    if (fromHello != null) {
      _accountId = fromHello;
      PushService.instance.setAccountId(_accountId);
    }
    notifyListeners();
  }

  /// Drop the live WS only — keep saved pairing for the next launch / reconnect.
  ///
  /// [forgetPairing] calls `home.unregisterPushToken` first (reconnecting briefly
  /// if soft-disconnected). Fail closed: if unregister cannot run, keep the
  /// local join and surface [error] — do not leave a zombie token on the daemon.
  Future<void> disconnect({bool forgetPairing = false}) async {
    if (forgetPairing) {
      final cleared = await _unregisterPushBeforeForget();
      if (!cleared) {
        // Stay soft-paused if we were offline; don't leave a half-connected dial.
        if (_session == null && hasSavedPairing) {
          _userPaused = true;
          _redialPending = false;
        }
        _error =
            'Could not unregister push before forgetting — reconnect and try Forget again';
        notifyListeners();
        return;
      }
      _session?.dispose();
      _session = null;
      _hello = null;
      _health = null;
      _error = null;
      _userPaused = false;
      _redialPending = false;
      _joinPersist = null;
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_kJoinPersist);
      await prefs.remove(_kPairUri);
      await prefs.remove(_kAccountId);
      _accountId = null;
      PushService.instance.setAccountId(null);
      notifyListeners();
      return;
    }

    await PushService.instance.unbind(unregister: false);
    _session?.dispose();
    _session = null;
    _hello = null;
    _health = null;
    _error = null;
    // Soft disconnect: keep pairing durable; suppress auto-redial until Reconnect.
    _userPaused = true;
    _redialPending = false;
    if (_joinPersist != null && _joinPersist!.trim().isNotEmpty) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kJoinPersist, _joinPersist!);
      await prefs.remove(_kPairUri);
      if (_accountId != null) {
        await prefs.setString(_kAccountId, _accountId!);
      }
    } else {
      await _ensureJoinPersistLoaded();
    }
    notifyListeners();
  }

  /// Ensure the daemon drops this device's push token before local forget.
  ///
  /// Returns `true` when unregister succeeded or there was no host to clear.
  /// One reconnect attempt when soft-disconnected — fail closed so the user
  /// can Reconnect and Forget again rather than leaving a zombie token.
  Future<bool> _unregisterPushBeforeForget() async {
    if (_session != null) {
      return PushService.instance.unbind(unregister: true);
    }
    if (!hasSavedPairing) {
      await PushService.instance.unbind(unregister: false);
      return true;
    }
    // Soft-disconnected — need a live session for home.unregisterPushToken.
    await reconnect();
    if (_session == null) return false;
    final ok = await PushService.instance.unbind(unregister: true);
    if (!ok) {
      _session?.dispose();
      _session = null;
      _hello = null;
      _health = null;
    }
    return ok;
  }

  @override
  void dispose() {
    unawaited(_onlineSub?.cancel() ?? Future<void>.value());
    unawaited(_typeSub?.cancel() ?? Future<void>.value());
    unawaited(_connectivity?.dispose() ?? Future<void>.value());
    _session?.dispose();
    super.dispose();
  }
}
