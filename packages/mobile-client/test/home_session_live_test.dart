import 'dart:io';

import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:test/test.dart';

/// Live dial against a running daemon.
///
/// ```bash
/// ENVOYHOME_PAIR_URI='envoy://pair?…' dart test test/home_session_live_test.dart
/// ```
void main() {
  final uri = Platform.environment['ENVOYHOME_PAIR_URI'];
  final hasUri = uri != null && uri.isNotEmpty;

  test(
    'V-P2-MOB-1: hello + health over hosting WS',
    () async {
      final pairing = acceptEnvoyHomePairing(uri!);
      expect(pairing, isNotNull);
      final session = await EnvoyHomeSession.connect(pairing!);
      try {
        final hello = await session.hello();
        expect(hello['product'], 'EnvoyHome');
        expect(hello['methods'], isA<List>());
        final health = await session.health();
        expect(health['ok'], isTrue);
        await session.assertHostingDialPath();
      } finally {
        session.dispose();
      }
    },
    skip: hasUri ? false : 'set ENVOYHOME_PAIR_URI for live mobile dial',
    timeout: const Timeout(Duration(seconds: 30)),
  );
}
