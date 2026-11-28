import 'dart:async';
import 'dart:io' show Platform;

import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

typedef PushTapHandler = void Function(Map<String, dynamic> data);

/// Narrow RPC surface [PushService] needs from a live home session.
abstract class PushTokenHost {
  Future<Map<String, dynamic>> registerPushToken({
    required String platform,
    required String token,
    String? accountId,
  });

  Future<Map<String, dynamic>> unregisterPushToken();
}

class _SessionPushHost implements PushTokenHost {
  _SessionPushHost(this._session);
  final EnvoyHomeSession _session;

  @override
  Future<Map<String, dynamic>> registerPushToken({
    required String platform,
    required String token,
    String? accountId,
  }) =>
      _session.registerPushToken(
        platform: platform,
        token: token,
        accountId: accountId,
      );

  @override
  Future<Map<String, dynamic>> unregisterPushToken() =>
      _session.unregisterPushToken();
}

/// Design `2026-10-22f` — bottom-nav index for a push [data.type] tap.
///
/// Returns `0` (Chats), `1` (Reminders), or `null` if the type is unknown.
int? pushTapTabIndex(String? type) {
  switch (type) {
    case 'approval':
    case 'choice':
    case 'turn':
    case 'test':
    case 'heartbeat':
    case 'standing-order':
      return 0;
    case 'schedule':
    case 'schedule-fired':
      return 1;
    default:
      return null;
  }
}

/// Whether a push tap should expand the shell Needs-you strip on Chat.
bool pushTapOpensNeedsYou(String? type) {
  switch (type) {
    case 'approval':
    case 'choice':
    case 'standing-order':
    case 'test':
      return true;
    default:
      return false;
  }
}

/// Alert push for EnvoyHome (`com.envoymesh.envoyhome`).
///
/// - **iOS:** native APNs via `envoyhome/alert_push` MethodChannel (device-token hex).
/// - **Android:** FCM when `google-services.json` is present (registration token).
/// - Tokens → `home.registerPushToken`; daemon wakes per Design `2026-10-22f`.
/// - Navigation runs on **tap** / cold-start open — not on foreground delivery alone.
class PushService {
  PushService._();
  static final PushService instance = PushService._();

  static const _channelName = 'envoyhome/alert_push';
  static const _channel = MethodChannel(_channelName);

  bool _initialized = false;
  /// False when FCM/APNs setup failed — the app keeps running without pushes.
  bool _transportReady = false;
  String? _token;
  PushTokenHost? _host;
  String? _accountId;
  /// Token changed while soft-disconnected — register on next [bindSession].
  bool _registerPending = false;
  PushTapHandler? onTap;
  Map<String, dynamic>? _pendingTap;

  /// Shared with [bindHost] so pairing can await the same in-flight FCM setup.
  Future<bool>? _androidInitFuture;
  FirebaseMessaging? _androidMessaging;
  bool _androidListenersReady = false;
  Timer? _androidTokenRetryTimer;
  int _androidTokenRetryCount = 0;
  static const _androidTokenRetryMax = 5;

  /// Test-only platform override (`ios` / `android`).
  @visibleForTesting
  String? debugPlatformOverride;

  String? get token => _token;

  /// True after a successful native push transport setup (token may still be pending).
  bool get isTransportReady => _transportReady;

  bool get isSupported {
    if (kIsWeb) return false;
    try {
      return Platform.isIOS || Platform.isAndroid;
    } catch (_) {
      return false;
    }
  }

  @visibleForTesting
  void debugReset() {
    _cancelAndroidTokenRetry();
    _initialized = false;
    _transportReady = false;
    _token = null;
    _host = null;
    _accountId = null;
    _registerPending = false;
    onTap = null;
    _pendingTap = null;
    debugPlatformOverride = null;
    _androidInitFuture = null;
    _androidMessaging = null;
    _androidListenersReady = false;
    _androidTokenRetryCount = 0;
  }

  /// Best-effort push setup. **Fail-open:** any error is logged and ignored so
  /// chat/pairing still work — the device simply will not receive wakes until
  /// push succeeds on a later launch or token refresh.
  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;
    if (!isSupported) return;

    try {
      _channel.setMethodCallHandler(_onNative);
    } catch (e) {
      debugPrint('[push] MethodChannel handler failed (continuing without push): $e');
    }

    try {
      if (Platform.isIOS) {
        // Scene-based iOS may wire the MethodChannel a tick after launch.
        await _requestIosPushWithRetry();
        _transportReady = true;
      } else if (Platform.isAndroid) {
        _androidInitFuture ??= _initAndroidFcm();
        _transportReady = await _androidInitFuture!;
      }
    } catch (e, st) {
      _transportReady = false;
      debugPrint('[push] initialize failed (app continues without push): $e\n$st');
    }
  }

  Future<void> _requestIosPushWithRetry() async {
    const attempts = 8;
    for (var i = 0; i < attempts; i++) {
      try {
        await _channel.invokeMethod<void>('requestPermissionAndRegister');
        // Token may have arrived before the MethodChannel handler was live —
        // pull the native cache (and retry briefly while APNs registers).
        await _pullIosCachedToken(attempts: 10);
        return;
      } on MissingPluginException {
        if (i == attempts - 1) rethrow;
        await Future<void>.delayed(Duration(milliseconds: 50 * (i + 1)));
      }
    }
  }

  /// Read [lastAlertTokenHex] from AppDelegate when the push callback raced Flutter.
  Future<void> _pullIosCachedToken({int attempts = 6}) async {
    for (var i = 0; i < attempts; i++) {
      try {
        final hex = await _channel.invokeMethod<String?>('getAlertToken');
        if (hex != null && hex.isNotEmpty) {
          _acceptToken(hex);
          return;
        }
      } on MissingPluginException {
        // Channel not ready yet.
      } catch (e) {
        debugPrint('[push] getAlertToken failed: $e');
        return;
      }
      await Future<void>.delayed(Duration(milliseconds: 100 * (i + 1)));
    }
  }

  Future<void> bindSession(EnvoyHomeSession session, {String? accountId}) async {
    await bindHost(_SessionPushHost(session), accountId: accountId);
  }

  /// Bind a [PushTokenHost] (production session or test fake).
  Future<void> bindHost(PushTokenHost host, {String? accountId}) async {
    _host = host;
    _accountId = accountId;
    _registerPending = true;
    // Session often binds before APNs/FCM token — re-request / pull, then
    // register with the daemon.
    if (!kIsWeb && Platform.isIOS) {
      try {
        await _channel.invokeMethod<void>('requestPermissionAndRegister');
      } on MissingPluginException {
        // Channel not ready — initialize()'s retry path will catch up.
      } catch (e) {
        debugPrint('[push] re-request on bind failed: $e');
      }
      await _pullIosCachedToken(attempts: 12);
    } else if (!kIsWeb && Platform.isAndroid) {
      // Mirror iOS: pairing after a timed-out getToken must retry, and must
      // await any in-flight initialize() so we don't race first acquisition.
      await _ensureAndroidTokenOnBind();
    }
    await _registerIfReady();
  }

  void setAccountId(String? accountId) {
    final next = accountId?.trim();
    final normalized = (next == null || next.isEmpty) ? null : next;
    if (normalized == _accountId) return;
    _accountId = normalized;
    _registerPending = true;
    unawaited(_registerIfReady());
  }

  /// Drop the live session binding used for register/refresh.
  ///
  /// Soft Disconnect keeps the daemon token so approvals/schedules can still wake
  /// the phone (Design `2026-10-22f`). Pass [unregister] only when forgetting the
  /// pairing.
  ///
  /// Returns `true` when unregister was not requested, succeeded, or there was
  /// no host. Returns `false` when [unregister] was requested but the RPC failed
  /// or no host was bound (caller must fail closed — [host] is kept on failure
  /// so Forget can retry).
  Future<bool> unbind({bool unregister = false}) async {
    final host = _host;
    if (!unregister) {
      _host = null;
      return true;
    }
    if (host == null) return false;
    try {
      await host.unregisterPushToken();
      _host = null;
      return true;
    } catch (e) {
      debugPrint('[push] unregister failed: $e');
      return false;
    }
  }

  Map<String, dynamic>? consumePendingTap() {
    final tap = _pendingTap;
    _pendingTap = null;
    return tap;
  }

  /// Returns `true` only when Firebase Messaging listeners are usable.
  /// Failures return `false` without throwing — callers treat push as optional.
  Future<bool> _initAndroidFcm() async {
    try {
      await Firebase.initializeApp().timeout(const Duration(seconds: 10));
    } catch (e) {
      debugPrint(
        '[push] Firebase unavailable (app continues without push): $e',
      );
      return false;
    }

    FirebaseMessaging messaging;
    try {
      messaging = FirebaseMessaging.instance;
    } catch (e) {
      debugPrint('[push] FirebaseMessaging.instance failed: $e');
      return false;
    }
    _androidMessaging = messaging;

    try {
      await messaging
          .requestPermission(alert: true, badge: true, sound: true)
          .timeout(const Duration(seconds: 10));
    } catch (e) {
      // Permission denied / timed out — still try getToken; may work later.
      debugPrint('[push] FCM requestPermission (continuing): $e');
    }

    // Listeners before getToken so a late first token via onTokenRefresh is kept.
    if (!_androidListenersReady) {
      try {
        messaging.onTokenRefresh.listen(
          _acceptToken,
          onError: (Object e) => debugPrint('[push] onTokenRefresh error: $e'),
        );
        // Foreground delivery: do not navigate — Design tap targets are on open only.
        FirebaseMessaging.onMessage.listen((msg) {
          debugPrint('[push] foreground FCM data=${msg.data}');
        });
        FirebaseMessaging.onMessageOpenedApp.listen((msg) {
          _routeTap(Map<String, dynamic>.from(msg.data));
        });
        _androidListenersReady = true;
      } catch (e) {
        debugPrint('[push] FCM listeners failed (app continues without push): $e');
        return false;
      }
    }

    // getToken() is known to hang without Play Services / first-run consent.
    final got = await _fetchAndroidFcmToken(timeout: const Duration(seconds: 15));
    if (!got) {
      // onTokenRefresh alone is not enough for first acquisition — retry later
      // and again from bindHost when the user pairs.
      _scheduleAndroidTokenRetry();
    }

    try {
      final initial = await messaging
          .getInitialMessage()
          .timeout(const Duration(seconds: 5));
      if (initial != null) {
        _routeTap(Map<String, dynamic>.from(initial.data));
      }
    } catch (e) {
      debugPrint('[push] FCM getInitialMessage (ignored): $e');
    }

    return _androidListenersReady;
  }

  /// Pairing-time Android path: await in-flight init, then retry getToken.
  Future<void> _ensureAndroidTokenOnBind() async {
    try {
      _androidInitFuture ??= _initAndroidFcm();
      _transportReady = await _androidInitFuture!;
      if (!_transportReady) return;
      if (_token != null && _token!.isNotEmpty) return;
      final got =
          await _fetchAndroidFcmToken(timeout: const Duration(seconds: 10));
      if (!got) {
        _scheduleAndroidTokenRetry();
      }
    } catch (e) {
      debugPrint('[push] Android token on bind failed: $e');
    }
  }

  Future<bool> _fetchAndroidFcmToken({
    Duration timeout = const Duration(seconds: 15),
  }) async {
    final messaging = _androidMessaging;
    if (messaging == null) return false;
    try {
      final token = await messaging.getToken().timeout(timeout);
      if (token != null && token.isNotEmpty) {
        _acceptToken(token);
        return true;
      }
      debugPrint('[push] FCM getToken returned empty (push deferred)');
    } catch (e) {
      debugPrint('[push] FCM getToken failed (app continues without push): $e');
    }
    return false;
  }

  void _scheduleAndroidTokenRetry() {
    if (_androidMessaging == null || !_androidListenersReady) return;
    if (_token != null && _token!.isNotEmpty) return;
    if (_androidTokenRetryCount >= _androidTokenRetryMax) {
      debugPrint('[push] FCM getToken retries exhausted');
      return;
    }
    _androidTokenRetryTimer?.cancel();
    final delaySec = (2 << _androidTokenRetryCount).clamp(2, 30);
    _androidTokenRetryCount += 1;
    _androidTokenRetryTimer = Timer(Duration(seconds: delaySec), () {
      unawaited(_runAndroidTokenRetry());
    });
    debugPrint(
      '[push] FCM getToken retry #$_androidTokenRetryCount in ${delaySec}s',
    );
  }

  Future<void> _runAndroidTokenRetry() async {
    final got =
        await _fetchAndroidFcmToken(timeout: const Duration(seconds: 10));
    if (!got) _scheduleAndroidTokenRetry();
  }

  void _cancelAndroidTokenRetry() {
    _androidTokenRetryTimer?.cancel();
    _androidTokenRetryTimer = null;
  }

  @visibleForTesting
  void debugAcceptToken(String token) => _acceptToken(token);

  @visibleForTesting
  Future<void> debugHandleNative(MethodCall call) => _onNative(call);

  void _acceptToken(String token) {
    if (token.isEmpty) return;
    if (_token == token && !_registerPending) return;
    _token = token;
    _registerPending = true;
    _cancelAndroidTokenRetry();
    unawaited(_registerIfReady());
  }

  String _platformWire() {
    final override = debugPlatformOverride;
    if (override == 'ios' || override == 'android') return override!;
    return Platform.isIOS ? 'ios' : 'android';
  }

  Future<void> _registerIfReady() async {
    final host = _host;
    final token = _token;
    if (host == null || token == null || token.isEmpty) return;
    if (!_registerPending) return;
    try {
      final platform = _platformWire();
      await host.registerPushToken(
        platform: platform,
        token: token,
        accountId: _accountId,
      );
      _registerPending = false;
      debugPrint('[push] home.registerPushToken ok platform=$platform');
    } catch (e) {
      // Keep pending so the next bind/account change retries.
      debugPrint('[push] home.registerPushToken failed: $e');
    }
  }

  void _routeTap(Map<String, dynamic> data) {
    if (data.isEmpty) return;
    debugPrint('[push] tap/data: $data');
    final handler = onTap;
    if (handler != null) {
      handler(data);
    } else {
      _pendingTap = data;
    }
  }

  Future<dynamic> _onNative(MethodCall call) async {
    switch (call.method) {
      case 'onAlertToken':
        final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
        final token = args['token'] as String?;
        if (token != null && token.isNotEmpty) {
          _acceptToken(token);
        }
        return null;
      case 'onAlertTokenError':
        debugPrint('[push] APNs error: ${call.arguments}');
        return null;
      case 'onNotificationTap':
        final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
        _routeTap(args);
        return null;
      default:
        return null;
    }
  }
}
