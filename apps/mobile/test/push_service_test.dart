import 'package:envoyhome/services/push_service.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeHost implements PushTokenHost {
  final List<Map<String, dynamic>> registers = [];
  int unregisterCalls = 0;
  Object? registerError;
  Object? unregisterError;

  @override
  Future<Map<String, dynamic>> registerPushToken({
    required String platform,
    required String token,
    String? accountId,
  }) async {
    if (registerError != null) throw registerError!;
    registers.add({
      'platform': platform,
      'token': token,
      'accountId': accountId,
    });
    return {'ok': true};
  }

  @override
  Future<Map<String, dynamic>> unregisterPushToken() async {
    unregisterCalls += 1;
    if (unregisterError != null) throw unregisterError!;
    return {'ok': true};
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late PushService push;

  setUp(() {
    push = PushService.instance;
    push.debugReset();
  });

  tearDown(() {
    push.debugReset();
  });

  group('pushTapTabIndex (Design 2026-10-22f)', () {
    test('interactive + test + heartbeat + standing-order → Chat', () {
      for (final type in [
        'approval',
        'choice',
        'turn',
        'test',
        'heartbeat',
        'standing-order',
      ]) {
        expect(pushTapTabIndex(type), 0, reason: type);
      }
    });

    test('schedule → Schedules', () {
      expect(pushTapTabIndex('schedule'), 1);
      expect(pushTapTabIndex('schedule-fired'), 1);
    });

    test('unknown / null → null', () {
      expect(pushTapTabIndex(null), isNull);
      expect(pushTapTabIndex('turn-finished'), isNull);
    });
  });

  group('iOS MethodChannel path', () {
    test('onAlertToken registers as ios with accountId', () async {
      final host = _FakeHost();
      push.debugPlatformOverride = 'ios';
      await push.bindHost(host, accountId: 'alice');

      await push.debugHandleNative(
        const MethodCall('onAlertToken', {'token': 'aabbccddeeff'}),
      );
      await Future<void>.delayed(Duration.zero);

      expect(host.registers, hasLength(1));
      expect(host.registers.single['platform'], 'ios');
      expect(host.registers.single['token'], 'aabbccddeeff');
      expect(host.registers.single['accountId'], 'alice');
      expect(push.token, 'aabbccddeeff');
    });

    test('onNotificationTap routes to handler (user tap)', () async {
      Map<String, dynamic>? tapped;
      push.onTap = (data) => tapped = data;

      await push.debugHandleNative(
        const MethodCall('onNotificationTap', {
          'type': 'approval',
          'accountId': 'alice',
          'approvalId': 'a1',
        }),
      );

      expect(tapped?['type'], 'approval');
      expect(tapped?['accountId'], 'alice');
    });

    test('onNotificationTap queues when no handler', () async {
      await push.debugHandleNative(
        const MethodCall('onNotificationTap', {
          'type': 'schedule',
          'accountId': 'bob',
        }),
      );
      final pending = push.consumePendingTap();
      expect(pending?['type'], 'schedule');
      expect(push.consumePendingTap(), isNull);
    });
  });

  group('Android FCM-shaped token path', () {
    test('token registers as android', () async {
      final host = _FakeHost();
      push.debugPlatformOverride = 'android';
      push.debugAcceptToken('fcm-registration-token-xyz');
      await push.bindHost(host, accountId: 'alice');

      expect(host.registers, hasLength(1));
      expect(host.registers.single['platform'], 'android');
      expect(host.registers.single['token'], 'fcm-registration-token-xyz');
    });
  });

  group('token lifecycle (Design 2026-10-22f)', () {
    test('soft unbind keeps daemon token (no unregister)', () async {
      final host = _FakeHost();
      push.debugPlatformOverride = 'ios';
      push.debugAcceptToken('tok');
      await push.bindHost(host, accountId: 'alice');
      expect(host.registers, hasLength(1));

      final ok = await push.unbind(unregister: false);
      expect(ok, isTrue);
      expect(host.unregisterCalls, 0);
    });

    test('forget unbind calls unregister', () async {
      final host = _FakeHost();
      push.debugPlatformOverride = 'ios';
      push.debugAcceptToken('tok');
      await push.bindHost(host, accountId: 'alice');

      final ok = await push.unbind(unregister: true);
      expect(ok, isTrue);
      expect(host.unregisterCalls, 1);
    });

    test('forget unbind fails closed and keeps host for retry', () async {
      final host = _FakeHost()..unregisterError = StateError('offline');
      push.debugPlatformOverride = 'ios';
      push.debugAcceptToken('tok');
      await push.bindHost(host, accountId: 'alice');

      final ok = await push.unbind(unregister: true);
      expect(ok, isFalse);
      expect(host.unregisterCalls, 1);

      host.unregisterError = null;
      final retry = await push.unbind(unregister: true);
      expect(retry, isTrue);
      expect(host.unregisterCalls, 2);
    });

    test('forget unbind without host returns false', () async {
      final ok = await push.unbind(unregister: true);
      expect(ok, isFalse);
    });

    test('token while unbound registers on next bind', () async {
      final host = _FakeHost();
      push.debugPlatformOverride = 'android';
      push.debugAcceptToken('late-token');
      expect(host.registers, isEmpty);

      await push.bindHost(host, accountId: 'carol');
      expect(host.registers, hasLength(1));
      expect(host.registers.single['token'], 'late-token');
      expect(host.registers.single['accountId'], 'carol');
    });

    test('accountId change re-registers', () async {
      final host = _FakeHost();
      push.debugPlatformOverride = 'ios';
      push.debugAcceptToken('tok');
      await push.bindHost(host, accountId: 'alice');
      expect(host.registers, hasLength(1));

      push.setAccountId('bob');
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(host.registers, hasLength(2));
      expect(host.registers.last['accountId'], 'bob');
    });

    test('failed register stays pending for retry', () async {
      final host = _FakeHost()..registerError = StateError('offline');
      push.debugPlatformOverride = 'ios';
      push.debugAcceptToken('tok');
      await push.bindHost(host, accountId: 'alice');
      expect(host.registers, isEmpty);

      host.registerError = null;
      await push.bindHost(host, accountId: 'alice');
      expect(host.registers, hasLength(1));
    });
  });
}
