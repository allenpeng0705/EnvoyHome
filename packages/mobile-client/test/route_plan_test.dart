// Peer: EnvoyDev apps/mobile/test/route_plan_test.dart — mapping onto CandidateResolver.

import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:envoy_thin_client/envoy_thin_client.dart';
import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:test/test.dart';

const home = '12D3KooWhome';
const directAddr = '/ip4/192.168.1.9/tcp/4001/p2p/$home';

AcceptedPairing pairing({
  String wsUrl = 'ws://192.168.1.9:4780/ws',
  String? lanWsUrl,
  String token = 'tok',
  String? homePeerId,
  List<String>? bootstrapPeers,
  String relayWsUrl = '',
  List<String>? relayWsUrls,
}) {
  return AcceptedPairing(
    PairingData(
      token: token,
      wsUrl: wsUrl,
      relayWsUrl: relayWsUrl,
      lanWsUrl: lanWsUrl,
      app: 'EnvoyHome',
      ownerId: 'o',
      ownerPublicKey: 'pk',
      homeNodePeerId: homePeerId,
      bootstrapPeers: bootstrapPeers,
      relayWsUrls: relayWsUrls,
    ),
  );
}

List<String> namesFor(
  AcceptedPairing p, {
  bool isOnWifi = false,
  bool sameLan = false,
}) =>
    candidatesFor(p, isOnWifi: isOnWifi, sameLan: sameLan)
        .map((c) => c.name)
        .toList();

void main() {
  test('QR host walks family order, relay last (on home LAN)', () {
    final names = namesFor(
      pairing(
        lanWsUrl: 'ws://192.168.1.9:4780/ws',
        homePeerId: home,
        bootstrapPeers: [directAddr, 'ws://relay-b.example/ws'],
        relayWsUrl: 'wss://relay.example/ws',
        relayWsUrls: ['wss://relay-c.example/ws'],
      ),
      sameLan: true,
    );

    expect(names, [
      'lan',
      'p2p-direct',
      'p2p-cn-relay',
      'relay',
      'relay-1',
      'relay-2',
      'community-relay',
      'community-relay-us',
    ]);
  });

  test('5G / off-LAN drops private LAN rungs so the circuit is first', () {
    final names = namesFor(pairing(
      lanWsUrl: 'ws://192.168.1.9:4780/ws',
      homePeerId: home,
      bootstrapPeers: [directAddr, 'ws://relay-b.example/ws'],
      relayWsUrl: 'wss://relay.example/ws',
      relayWsUrls: ['wss://relay-c.example/ws'],
    ));

    expect(names.first, 'p2p-cn-relay');
    expect(names, isNot(contains('lan')));
    expect(names, isNot(contains('p2p-direct')));
  });

  test('Wi‑Fi that is not the home LAN also drops private LAN rungs', () {
    final names = namesFor(
      pairing(
        lanWsUrl: 'ws://192.168.1.9:4780/ws',
        homePeerId: home,
        bootstrapPeers: [directAddr],
      ),
      isOnWifi: true,
      sameLan: false,
    );
    expect(names, isNot(contains('lan')));
    expect(names, isNot(contains('p2p-direct')));
    expect(names, contains('p2p-cn-relay'));
  });

  test('LAN-only QR off-LAN still keeps hosting WS (no empty plan)', () {
    // Real mint without mesh: ws://192.168.x only — must not throw "no dial target".
    final names = namesFor(
      pairing(
        wsUrl: 'ws://192.168.0.104:4780/ws',
        lanWsUrl: null,
      ),
      sameLan: false,
    );
    expect(names, isNotEmpty);
    expect(names.first, anyOf('lan', 'hosting-ws'));
    final urls = candidatesFor(
      pairing(wsUrl: 'ws://192.168.0.104:4780/ws'),
      sameLan: false,
    ).map((c) => c.url).toList();
    expect(urls.first, contains('192.168.0.104'));
    expect(urls.first, contains('token=tok'));
  });

  test('a public direct address is kept off-LAN', () {
    final names = namesFor(pairing(
      wsUrl: 'ws://203.0.113.7:4780/ws',
      homePeerId: home,
      bootstrapPeers: [directAddr],
    ));
    expect(names.first, 'lan');
  });

  test('SSH keepPrivateLanForSsh keeps private lan off-LAN', () {
    final p = AcceptedPairing(
      pairing(
        lanWsUrl: 'ws://192.168.1.9:4780/ws',
      ).data,
      joinChannel: JoinChannel.ssh,
      ssh: const SshHop(host: 'bastion.example', user: 'u'),
    );
    final names = candidatesFor(p, sameLan: false).map((c) => c.name).toList();
    expect(names, contains('lan'));
  });

  test('LAN pairing still offers circuit for cellular', () {
    const loopback = '/ip4/127.0.0.1/tcp/49204/p2p/$home';
    const circuit =
        '/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWrelay/p2p-circuit/p2p/$home';
    final p2p = candidatesFor(
      pairing(
        homePeerId: home,
        bootstrapPeers: [loopback, directAddr, circuit],
      ),
      sameLan: false,
    ).where((c) => c.name.startsWith('p2p-'));
    expect(p2p.map((c) => c.url), contains(circuit));
    expect(p2p.any((c) => c.url.contains('127.0.0.1')), isFalse);
  });

  test('primary address becomes LAN when no lanWsUrl (on home LAN)', () {
    final candidates = candidatesFor(pairing(), sameLan: true);
    expect(candidates.first.name, 'lan');
    expect(candidates.first.url, contains('token=tok'));
  });

  test('peer id with no address yields no P2P rung', () {
    final names = namesFor(pairing(homePeerId: home, bootstrapPeers: const []));
    expect(names.where((n) => n.startsWith('p2p-')), isEmpty);
    expect(names.contains('community-relay'), isFalse);
  });

  test('addresses with no peer id yield no P2P rung', () {
    final names = namesFor(pairing(bootstrapPeers: [directAddr]));
    expect(names.where((n) => n.startsWith('p2p-')), isEmpty);
  });

  test('libp2pDialTarget prefixes short circuit with relay addr', () {
    final candidate = HomeRemoteCandidate(
      name: 'p2p-cn-relay',
      url: '/p2p/12D3KooWrelay/p2p-circuit/p2p/$home',
      libp2pRelayAddr: '/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWrelay',
    );
    expect(
      libp2pDialTarget(candidate),
      '/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWrelay/p2p-circuit/p2p/$home',
    );
  });

  test('homeTransportKindFor: libp2p / clientProxy / webSocket', () {
    expect(
      homeTransportKindFor(HomeRemoteCandidate(
        name: 'p2p-direct',
        url: directAddr,
        libp2pRelayAddr: '/ip4/1.2.3.4/tcp/4001/p2p/relay',
      )),
      HomeTransportKind.libp2p,
    );
    expect(
      homeTransportKindFor(HomeRemoteCandidate(
        name: 'community-relay',
        url: 'wss://relay.example/ws?target=$home&token=tok',
        homePeerId: home,
        sessionToken: 'tok',
      )),
      HomeTransportKind.clientProxy,
    );
    expect(
      homeTransportKindFor(HomeRemoteCandidate(
        name: 'lan',
        url: 'ws://192.168.1.9:4780/ws?token=tok',
      )),
      HomeTransportKind.webSocket,
    );
  });

  test('compressed pairing= URI yields P2P candidates', () {
    // Same compact encoder the family tests use (gzip JSON → pairing=).
    final uri = _compactPairingUri({
      'v': 1,
      'ws': 'ws://192.168.1.9:4780/ws',
      'lan': 'ws://192.168.1.9:4780/ws',
      'tok': 'tok',
      'oid': 'o',
      'opk': 'pk',
      'app': 'EnvoyHome',
      'tid': home,
      'bp': [directAddr],
    });
    final accepted = acceptEnvoyHomePairing(uri);
    expect(accepted, isNotNull);
    expect(accepted!.data.homeNodePeerId, home);
    expect(accepted.data.bootstrapPeers, [directAddr]);
    final names = namesFor(accepted, sameLan: true);
    expect(names.first, 'lan');
    expect(names.where((n) => n.startsWith('p2p-')), isNotEmpty);
  });
}

String _compactPairingUri(Map<String, Object?> payload) {
  final compressed = GZipEncoder().encode(utf8.encode(jsonEncode(payload)))!;
  final token = base64Url.encode(compressed).replaceAll('=', '');
  return 'envoy://pair?pairing=$token';
}
