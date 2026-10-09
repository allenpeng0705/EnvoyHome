import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:test/test.dart';

void main() {
  group('parseEndpoint', () {
    test('host:port', () {
      final p = parseEndpoint('192.168.1.10:4780');
      expect(p?.host, '192.168.1.10');
      expect(p?.port, 4780);
    });

    test('bracketed IPv6', () {
      final p = parseEndpoint('[::1]:4780');
      expect(p?.host, '::1');
      expect(p?.port, 4780);
    });

    test('rejects bare host', () {
      expect(parseEndpoint('home.local'), isNull);
    });
  });

  group('buildDirectJoin', () {
    test('requires token', () {
      final draft = buildDirectJoin(endpoint: '10.0.0.2:4780', token: '');
      expect(draft, isA<JoinDraftRefused>());
      expect((draft as JoinDraftRefused).refusal, JoinRefusal.needsToken);
    });

    test('builds pairing with joinChannel.direct', () {
      final draft = buildDirectJoin(
        endpoint: '10.0.0.2:4780',
        token: 'tok',
      );
      expect(draft, isA<JoinDraftBuilt>());
      final pairing = (draft as JoinDraftBuilt).pairing;
      expect(pairing.joinChannel, JoinChannel.direct);
      expect(pairing.wsUrl, 'ws://10.0.0.2:4780/ws');
      expect(pairing.token, 'tok');
      final candidates = hostingCandidatesFor(pairing);
      expect(candidates.single.url, contains('token=tok'));
    });
  });

  group('buildSshJoin', () {
    test('token optional', () {
      final draft = buildSshJoin(
        sshHost: 'bastion.example',
        daemonEndpoint: '127.0.0.1:4780',
        password: 'secret',
      );
      expect(draft, isA<JoinDraftBuilt>());
      final pairing = (draft as JoinDraftBuilt).pairing;
      expect(pairing.joinChannel, JoinChannel.ssh);
      expect(pairing.ssh?.host, 'bastion.example');
      expect(pairing.token, isEmpty);
    });
  });

  group('persist round-trip', () {
    test('direct', () {
      final built = (buildDirectJoin(
        endpoint: '10.0.0.2:4780',
        token: 'tok',
      ) as JoinDraftBuilt)
          .pairing;
      final encoded = encodeJoinPersist(built);
      final restored = decodeJoinPersist(encoded)!;
      expect(restored.joinChannel, JoinChannel.direct);
      expect(restored.token, 'tok');
      expect(restored.endpoint, '10.0.0.2:4780');
    });

    test('link URI still accepted', () {
      final uri =
          'envoy://pair?wsUrl=ws%3A%2F%2F127.0.0.1%3A4780%2Fws&token=secret'
          '&ownerPublicKey=pk&ownerId=o&app=EnvoyHome';
      final restored = decodeJoinPersist(uri)!;
      expect(restored.joinChannel, JoinChannel.link);
    });
  });
}
