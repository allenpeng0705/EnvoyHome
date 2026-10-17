/// How an EnvoyHome pairing becomes the **family's** candidate walk.
///
/// Peer: EnvoyDev [`route_plan.dart`](../../../EnvoyCoder/apps/mobile/lib/services/route_plan.dart).
/// Ordering lives in `CandidateResolver` (`envoy_thin_client`); this file only maps
/// EnvoyHome pairing fields onto [StoredNode].
///
/// QR `wsUrl` is the daemon's own address (LAN / loopback), not a Mesh Social relay.
library;

import 'package:envoy_thin_client/envoy_thin_client.dart';

import 'pairing.dart';

/// Turn accepted pairing into the family's [StoredNode].
StoredNode storedNodeFor(AcceptedPairing pairing, {String id = 'home'}) {
  final data = pairing.data;
  return StoredNode(
    id: id,
    name: data.app ?? 'EnvoyHome',
    ownerId: data.ownerId ?? '',
    homePeerId: _dialablePeerId(pairing),
    lanIp: pairing.lanWsUrl?.trim().isNotEmpty == true
        ? pairing.lanWsUrl
        : pairing.wsUrl,
    relayWsUrl: _distinctRelay(pairing),
    pairedAt: DateTime.now(),
    bootstrapPeers: _peerListFor(pairing),
  );
}

List<String> _peerListFor(AcceptedPairing pairing) {
  final seen = <String>{};
  final peers = <String>[];
  final data = pairing.data;
  for (final entry in <String>[
    ...?data.bootstrapPeers,
    ...?data.relayWsUrls,
  ]) {
    final trimmed = entry.trim();
    if (trimmed.isEmpty || !seen.add(trimmed)) continue;
    peers.add(trimmed);
  }
  return peers;
}

/// Drop relay when it is the same base as the direct WS (not a real relay).
String? _distinctRelay(AcceptedPairing pairing) {
  final relay = pairing.data.relayWsUrl.trim();
  if (relay.isEmpty) return null;
  final direct = (pairing.lanWsUrl ?? pairing.wsUrl).trim();
  if (direct.isEmpty) return relay;
  String strip(String u) {
    final i = u.indexOf('?');
    return i < 0 ? u : u.substring(0, i);
  }

  if (strip(relay) == strip(direct)) return null;
  return relay;
}

String _dialablePeerId(AcceptedPairing pairing) {
  final id = pairing.data.homeNodePeerId?.trim() ?? '';
  if (id.isEmpty) return '';
  final addrs = pairing.data.bootstrapPeers ?? const <String>[];
  if (addrs.isEmpty) return '';
  return id;
}

/// Ordered candidates — family priority (LAN → libp2p → relay last).
List<HomeRemoteCandidate> candidatesFor(
  AcceptedPairing pairing, {
  bool isOnWifi = false,
  String? token,
}) {
  final node = storedNodeFor(pairing);
  final peerId = node.homePeerId.trim();
  CandidateResolver.setCommunityHomePeerId(peerId.isEmpty ? null : peerId);
  const resolver = CandidateResolver(communityRelayRequiresPeerId: true);
  return resolver.resolve(
    node,
    sessionToken: token ?? pairing.token,
    isOnWifi: isOnWifi,
  );
}
