/// Direct libp2p dial — peer: EnvoyDev `libp2p_transport.dart`.
library;

import 'package:envoy_mesh_libp2p/envoy_mesh_libp2p.dart';
import 'package:envoy_thin_client/envoy_thin_client.dart';

typedef Libp2pDialer = Future<WebSocketLike> Function(HomeRemoteCandidate candidate);

/// Which dial surface [EnvoyHomeSession] opens for a candidate.
enum HomeTransportKind { libp2p, clientProxy, webSocket }

/// EnvoyDev host_client transport branch — kept pure for unit tests.
HomeTransportKind homeTransportKindFor(HomeRemoteCandidate candidate) {
  if (candidate.libp2pRelayAddr != null) return HomeTransportKind.libp2p;
  final homePeerId = candidate.homePeerId;
  if (homePeerId != null &&
      homePeerId.isNotEmpty &&
      candidate.url.contains('?target=')) {
    return HomeTransportKind.clientProxy;
  }
  return HomeTransportKind.webSocket;
}

Libp2pNode? _sharedNode;

Future<Libp2pNode> _sharedLibp2pNode() async {
  final node = _sharedNode ??= Libp2pNode(seedStore: MemoryLibp2pSeedStore());
  if (!node.isStarted) {
    await node.start(enableRelay: true);
  }
  return node;
}

Future<void> stopSharedLibp2pNode() async {
  final node = _sharedNode;
  _sharedNode = null;
  await node?.stop();
}

class Libp2pTransport {
  Libp2pTransport({
    this.connectTimeout = const Duration(seconds: 8),
    Future<Libp2pNode> Function()? node,
  }) : _node = node ?? _sharedLibp2pNode;

  final Duration connectTimeout;
  final Future<Libp2pNode> Function() _node;

  Future<WebSocketLike> dial(HomeRemoteCandidate candidate) async {
    final address = libp2pDialTarget(candidate);
    final token = candidate.sessionToken ?? '';
    final node = await _node();

    if (!address.contains('/p2p-circuit/')) {
      final reached = await node.connectPeer(address, timeout: connectTimeout);
      if (!reached) {
        throw StateError('libp2p: no connection to $address');
      }
    }

    final transport = await node.dial(
      peerMultiaddr: address,
      protocolId: kClientProxyProtocol,
    );
    await transport.performHandshake(token);
    return transport;
  }
}

/// Multiaddr handed to [Libp2pNode.dial] (EnvoyDev `libp2pDialTarget`).
String libp2pDialTarget(HomeRemoteCandidate candidate) {
  final url = candidate.url;
  final circuitAt = url.indexOf('/p2p-circuit/');
  if (circuitAt < 0) return url;

  final relay = candidate.libp2pRelayAddr?.trim() ?? '';
  if (relay.isEmpty || relay.contains('/p2p-circuit/')) return url;

  final firstP2p = url.indexOf('/p2p/');
  if (firstP2p > 0) return url;
  return '$relay${url.substring(circuitAt)}';
}
