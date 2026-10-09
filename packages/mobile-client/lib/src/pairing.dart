import 'package:envoy_thin_client/envoy_thin_client.dart';

import 'join_channel.dart';
import 'product.dart';

/// Result of accepting an EnvoyHome pairing QR / paste / direct / SSH join.
class AcceptedPairing {
  final PairingData data;
  final JoinChannel joinChannel;
  final String? endpoint;
  final SshHop? ssh;

  const AcceptedPairing(
    this.data, {
    this.joinChannel = JoinChannel.link,
    this.endpoint,
    this.ssh,
  });

  String get token => data.token;
  String get wsUrl => data.wsUrl;
  String? get lanWsUrl => data.lanWsUrl;
}

/// Parse + refuse foreign-app codes (client-side; Design §3.3 / V-RPC-4).
///
/// Returns null when the URI is not a pairing code.
/// Throws [StateError] when `app=` is present and is not EnvoyHome.
AcceptedPairing? acceptEnvoyHomePairing(String uri) {
  final data = parsePairingUri(uri);
  if (data == null) return null;
  final mismatch = pairingAppMismatch(data.app, kEnvoyHomeAppName);
  if (mismatch != null) {
    throw StateError(mismatch);
  }
  return AcceptedPairing(data, joinChannel: JoinChannel.link);
}
