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
/// Returns `0` (Chat), `1` (Schedules), or `null` if the type is unknown.
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
  String? _token;
  PushTokenHost? _host;
  String? _accountId;
  /// Token changed while soft-disconnected — register on next [bindSession].
  bool _registerPending = false;
  PushTapHandler? onTap;
  Map<String, dynamic>? _pendingTap;

  /// Test-only platform override (`ios` / `android`).
  @visibleForTesting
  String? debugPlatformOverride;

  String? get token => _token;

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
    _initialized = false;
    _token = null;
    _host = null;
    _accountId = null;
    _registerPending = false;
    onTap = null;
    _pendingTap = null;
    debugPlatformOverride = null;
  }

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;
    if (!isSupported) return;

    _channel.setMethodCallHandler(_onNative);

    try {
      if (Platform.isIOS) {
        // Scene-based iOS may wire the MethodChannel a tick after launch.
        await _requestIosPushWithRetry();
      } else if (Platform.isAndroid) {
        await _initAndroidFcm();
      }
    } catch (e, st) {
      debugPrint('[push] initialize failed: $e\n$st');
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
    // Session often binds before APNs callback — re-request registration, pull
    // native cache (covers race where token arrived before the MethodChannel
    // handler was live), then register with the daemon.
    if (!kIsWeb && Platform.isIOS) {
      try {
        await _channel.invokeMethod<void>('requestPermissionAndRegister');
      } on MissingPluginException {
        // Channel not ready — initialize()'s retry path will catch up.
      } catch (e) {
        debugPrint('[push] re-request on bind failed: $e');
      }
      await _pullIosCachedToken(attempts: 12);
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

  Future<void> _initAndroidFcm() async {
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('[push] Firebase not configured (add google-services.json): $e');
      return;
    }
    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission(alert: true, badge: true, sound: true);
    final token = await messaging.getToken();
    if (token != null && token.isNotEmpty) {
      _acceptToken(token);
    }
    messaging.onTokenRefresh.listen(_acceptToken);
    // Foreground delivery: do not navigate — Design tap targets are on open only.
    FirebaseMessaging.onMessage.listen((msg) {
      debugPrint('[push] foreground FCM data=${msg.data}');
    });
    FirebaseMessaging.onMessageOpenedApp.listen((msg) {
      _routeTap(Map<String, dynamic>.from(msg.data));
    });
    final initial = await messaging.getInitialMessage();
    if (initial != null) {
      _routeTap(Map<String, dynamic>.from(initial.data));
    }
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
