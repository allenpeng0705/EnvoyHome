/// Soft Disconnect must not auto-reconnect on network nudges; Forget fails closed.
library;

import 'package:envoyhome/services/push_service.dart';
import 'package:envoyhome/state/session_controller.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    PushService.instance.debugReset();
  });

  tearDown(() {
    PushService.instance.debugReset();
  });

  test('soft disconnect sets userPaused and ignores network nudge', () async {
    final session = SessionController();
    session.debugPrimeSavedPairing(
      'envoy://pair?wsUrl=ws%3A%2F%2F127.0.0.1%3A4780%2Fws'
      '&token=tok&ownerPublicKey=pk&ownerId=oid',
    );
    expect(session.hasSavedPairing, isTrue);
    expect(session.userPaused, isFalse);

    await session.disconnect();
    expect(session.userPaused, isTrue);
    expect(session.isConnected, isFalse);
    expect(session.hasSavedPairing, isTrue);

    session.debugNetworkNudge();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(session.userPaused, isTrue);
    expect(session.isConnected, isFalse);
    // Pause must skip reconnect — no "dial failed" error from a nudge.
    expect(session.error, isNull);

    session.dispose();
  });

  test('reconnect clears userPaused', () async {
    final session = SessionController();
    session.debugPrimeSavedPairing(
      'envoy://pair?wsUrl=ws%3A%2F%2F127.0.0.1%3A4780%2Fws'
      '&token=tok&ownerPublicKey=pk&ownerId=oid',
    );
    await session.disconnect();
    expect(session.userPaused, isTrue);

    // Dial will fail (no daemon) but pause must clear at the start of reconnect.
    await session.reconnect();
    expect(session.userPaused, isFalse);

    session.dispose();
  });

  test('forget without live session fails closed when reconnect cannot dial',
      () async {
    final session = SessionController();
    // Invalid join → reconnect fails fast (no dial ladder hang).
    session.debugPrimeSavedPairing('not-a-valid-join');
    await session.disconnect();
    expect(session.userPaused, isTrue);
    expect(session.hasSavedPairing, isTrue);

    await session.disconnect(forgetPairing: true);
    // Fail closed: keep join so the user can fix reachability and Forget again.
    expect(session.hasSavedPairing, isTrue);
    expect(session.error, contains('unregister push'));
    expect(session.userPaused, isTrue);

    session.dispose();
  });
}
