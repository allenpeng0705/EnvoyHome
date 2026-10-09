import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:test/test.dart';

void main() {
  group('acceptEnvoyHomePairing', () {
    test('accepts app=EnvoyHome legacy URI', () {
      final accepted = acceptEnvoyHomePairing(
        'envoy://pair?wsUrl=ws%3A%2F%2F127.0.0.1%3A4780%2Fws'
        '&lanWsUrl=ws%3A%2F%2F192.168.1.10%3A4780%2Fws'
        '&token=tok123&ownerPublicKey=pk&ownerId=owner1&app=EnvoyHome',
      );
      expect(accepted, isNotNull);
      expect(accepted!.token, 'tok123');
      expect(accepted.wsUrl, contains('127.0.0.1'));
      expect(accepted.lanWsUrl, contains('192.168.1.10'));
    });

    test('refuses EnvoyDev code (V-RPC-4 client side)', () {
      expect(
        () => acceptEnvoyHomePairing(
          'envoy://pair?wsUrl=ws%3A%2F%2F127.0.0.1%3A4780%2Fws'
          '&token=t&ownerPublicKey=pk&ownerId=o&app=EnvoyDev',
        ),
        throwsA(isA<StateError>().having(
          (e) => e.message,
          'message',
          contains('EnvoyHome'),
        )),
      );
    });

    test('returns null for garbage', () {
      expect(acceptEnvoyHomePairing('not-a-uri'), isNull);
    });
  });
}
