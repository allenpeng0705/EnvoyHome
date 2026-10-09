import 'dart:async';
import 'dart:io' show Platform;

import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

typedef PushTapHandler = void Function(Map<String, dynamic> data);

/// Alert push for EnvoyHome (`com.envoymesh.envoyhome`).
///
/// - **iOS:** native APNs via `envoyhome/alert_push` MethodChannel.
/// - **Android:** FCM when `google-services.json` is present.
/// - Tokens → `home.registerPushToken`; daemon wakes the phone on
///   `home:approval-needed` via APNs/FCM.
class PushService {
  PushService._();
  static final PushService instance = PushService._();

  static const _channelName = 'envoyhome/alert_push';
  static const _channel = MethodChannel(_channelName);

  bool _initialized = false;
  String? _token;
  EnvoyHomeSession? _session;
  String? _accountId;
  PushTapHandler? onTap;
  Map<String, dynamic>? _pendingTap;

  String? get token => _token;

  bool get isSupported {
    if (kIsWeb) return false;
    try {
      return Platform.isIOS || Platform.isAndroid;
    } catch (_) {
      return false;
    }
  }

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;
    if (!isSupported) return;

    _channel.setMethodCallHandler(_onNative);

    try {
      if (Platform.isIOS) {
        await _channel.invokeMethod<void>('requestPermissionAndRegister');
      } else if (Platform.isAndroid) {
        await _initAndroidFcm();
      }
    } catch (e, st) {
      debugPrint('[push] initialize failed: $e\n$st');
    }
  }

  Future<void> bindSession(EnvoyHomeSession session, {String? accountId}) async {
    _session = session;
    _accountId = accountId;
    await _registerIfReady();
  }

  void setAccountId(String? accountId) {
    _accountId = accountId;
    unawaited(_registerIfReady());
  }

  Future<void> unbind() async {
    final session = _session;
    _session = null;
    if (session == null) return;
    try {
      await session.unregisterPushToken();
    } catch (e) {
      debugPrint('[push] unregister failed: $e');
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
      _token = token;
      await _registerIfReady();
    }
    messaging.onTokenRefresh.listen((t) async {
      _token = t;
      await _registerIfReady();
    });
    FirebaseMessaging.onMessage.listen((msg) {
      final data = Map<String, dynamic>.from(msg.data);
      if (msg.notification != null) {
        data.putIfAbsent('title', () => msg.notification!.title ?? '');
        data.putIfAbsent('body', () => msg.notification!.body ?? '');
      }
      _routeTap(data);
    });
    FirebaseMessaging.onMessageOpenedApp.listen((msg) {
      _routeTap(Map<String, dynamic>.from(msg.data));
    });
    final initial = await messaging.getInitialMessage();
    if (initial != null) {
      _routeTap(Map<String, dynamic>.from(initial.data));
    }
  }

  Future<void> _registerIfReady() async {
    final session = _session;
    final token = _token;
    if (session == null || token == null || token.isEmpty) return;
    try {
      final platform = Platform.isIOS ? 'ios' : 'android';
      await session.registerPushToken(
        platform: platform,
        token: token,
        accountId: _accountId,
      );
      debugPrint('[push] home.registerPushToken ok platform=$platform');
    } catch (e) {
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
          _token = token;
          await _registerIfReady();
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
