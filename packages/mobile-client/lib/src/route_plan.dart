/// How an EnvoyHome pairing becomes the **family's** candidate walk.
///
/// Peer: EnvoyDev [`route_plan.dart`](../../../EnvoyCoder/apps/mobile/lib/services/route_plan.dart).
/// Ordering lives in `CandidateResolver` (`envoy_thin_client`); this file maps
/// EnvoyHome pairing fields onto [StoredNode] and applies off-LAN filtering.
///
/// QR `wsUrl` is the daemon's own address (LAN / loopback), not a Mesh Social relay.
library;

import 'package:envoy_thin_client/envoy_thin_client.dart';

import 'dial_policy.dart';
import 'join_channel.dart';
import 'lan_reachability.dart';
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
///
/// [isOnWifi] only caps how many expensive libp2p candidates the family keeps.
///
/// [sameLan] gates **private** LAN addresses only. When false (5G, cafe Wi‑Fi,
/// subnet mismatch): private `lan` WS and LAN-only `p2p-direct` are dropped;
/// a **public** address in the `lan` slot is kept. SSH keep-private is for
/// callers that still walk [candidatesFor] with an SSH hop (tunnel makes LAN
/// reachable); the usual SSH connect path uses [hostingCandidatesFor] instead.
List<HomeRemoteCandidate> candidatesFor(
  AcceptedPairing pairing, {
  bool isOnWifi = false,
  bool sameLan = false,
  String? token,
  bool? keepPrivateLanForSsh,
}) {
  final node = storedNodeFor(pairing);
  final peerId = node.homePeerId.trim();
  CandidateResolver.setCommunityHomePeerId(peerId.isEmpty ? null : peerId);
  const resolver = CandidateResolver(communityRelayRequiresPeerId: true);
  final resolved = resolver.resolve(
    node,
    sessionToken: token ?? pairing.token,
    isOnWifi: isOnWifi,
  );
  if (sameLan) return resolved;
  final keepSsh = keepPrivateLanForSsh ?? pairing.joinChannel == JoinChannel.ssh;
  final filtered =
      resolved.where((c) => _usableOffLan(c, keepPrivateLanForSsh: keepSsh)).toList();
  if (filtered.isNotEmpty) return filtered;
  // LAN-only QR (private wsUrl, no mesh/relay): off-LAN filter would otherwise
  // yield zero candidates → "pairing has no dial target". Still offer the
  // hosting WS; dial fails with a clear connection error if truly unreachable.
  final hosting = hostingCandidatesFor(pairing);
  return hosting.isNotEmpty ? hosting : filtered;
}

/// Rungs that can answer when the phone is not on the desktop's private LAN.
bool _usableOffLan(
  HomeRemoteCandidate candidate, {
  required bool keepPrivateLanForSsh,
}) {
  if (candidate.name == 'lan') {
    if (keepPrivateLanForSsh) return true;
    return !_wsUrlIsPrivateOrLoopback(candidate.url);
  }
  if (candidate.name.startsWith('p2p-direct') && _multiaddrIsLanOnly(candidate.url)) {
    return false;
  }
  return true;
}

bool _wsUrlIsPrivateOrLoopback(String url) {
  final host = ipv4HostOf(url);
  if (host == null) {
    // Hostname (e.g. `desk.local`): not provably public — treat as LAN-only off-site.
    return true;
  }
  if (host.startsWith('127.')) return true;
  final parts = host.split('.').map(int.parse).toList();
  final a = parts[0];
  final b = parts[1];
  if (a == 0 || a == 10) return true;
  if (a == 169 && b == 254) return true;
  if (a == 192 && b == 168) return true;
  if (a == 172 && b >= 16 && b <= 31) return true;
  if (a == 100 && b >= 64 && b <= 127) return true;
  return false;
}

bool _multiaddrIsLanOnly(String multiaddr) {
  if (multiaddr.startsWith('/ip4/127.') || multiaddr.startsWith('/ip6/::1/')) return true;
  final match =
      RegExp(r'^/ip4/(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}/').firstMatch(multiaddr);
  if (match == null) return false;
  final a = int.parse(match.group(1)!);
  final b = int.parse(match.group(2)!);
  if (a == 0 || a == 10 || a == 127) return true;
  if (a == 169 && b == 254) return true;
  if (a == 192 && b == 168) return true;
  if (a == 172 && b >= 16 && b <= 31) return true;
  if (a == 100 && b >= 64 && b <= 127) return true;
  return false;
}
