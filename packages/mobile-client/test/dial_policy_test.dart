import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:test/test.dart';

void main() {
  group('hostingCandidatesFor', () {
    test('prefers lan then primary and injects token', () {
      final pairing = acceptEnvoyHomePairing(
        'envoy://pair?wsUrl=ws%3A%2F%2F127.0.0.1%3A4780%2Fws'
        '&lanWsUrl=ws%3A%2F%2F10.0.0.2%3A4780%2Fws'
        '&token=secret&ownerPublicKey=pk&ownerId=o&app=EnvoyHome',
      )!;
      final candidates = hostingCandidatesFor(pairing);
      expect(candidates.length, 2);
      expect(candidates[0].name, 'lan');
      expect(candidates[0].url, contains('10.0.0.2'));
      expect(candidates[0].url, contains('token=secret'));
      expect(candidates[1].name, 'hosting-ws');
      expect(candidates[1].url, contains('127.0.0.1'));
    });
  });

  group('assertNotAttachDialTarget', () {
    test('allows hostingWs', () {
      assertNotAttachDialTarget(DialTargetKind.hostingWs);
    });

    test('refuses attachForbidden (V-P2-MESH-2)', () {
      expect(
        () => assertNotAttachDialTarget(DialTargetKind.attachForbidden),
        throwsStateError,
      );
    });
  });
}
