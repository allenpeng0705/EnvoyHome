import 'package:envoy_thin_client/envoy_thin_client.dart';

import 'pairing.dart';

/// How the phone reaches the home daemon (Design §2.3 / V-P2-MESH-1/2).
///
/// EnvoyHome phones dial the **hosting** home peer (or its LAN/WS candidates
/// from the pairing URI). Attach-to-local-node is never a phone dial target.
enum DialTargetKind {
  /// LAN / public WS from the pairing code (hosting path).
  hostingWs,

  /// Explicit refusal — attach must not become the phone route.
  attachForbidden,
}

/// Build WS candidates for the phone from an accepted pairing.
///
/// Order: `lanWsUrl` (when present) then `wsUrl`. Token is appended as
/// `?token=` when missing (daemon remote auth).
List<HomeRemoteCandidate> hostingCandidatesFor(AcceptedPairing pairing) {
  final urls = <String>[];
  final lan = pairing.lanWsUrl?.trim();
  if (lan != null && lan.isNotEmpty) urls.add(lan);
  final primary = pairing.wsUrl.trim();
  if (primary.isNotEmpty && !urls.contains(primary)) urls.add(primary);

  return [
    for (var i = 0; i < urls.length; i++)
      HomeRemoteCandidate(
        name: i == 0 && lan != null && lan.isNotEmpty ? 'lan' : 'hosting-ws',
        url: withPairingToken(urls[i], pairing.token),
      ),
  ];
}

/// Append `token=` when the URL does not already carry one.
///
/// Empty token is left unset (SSH loopback may authenticate without one).
String withPairingToken(String wsUrl, String token) {
  if (token.isEmpty) return wsUrl;
  final uri = Uri.parse(wsUrl);
  if (uri.queryParameters.containsKey('token')) return wsUrl;
  final next = Map<String, String>.from(uri.queryParameters);
  next['token'] = token;
  return uri.replace(queryParameters: next).toString();
}

/// V-P2-MESH-2 guard: callers must not pass an attach-node dial target.
void assertNotAttachDialTarget(DialTargetKind kind) {
  if (kind == DialTargetKind.attachForbidden) {
    throw StateError(
      'EnvoyHome phone path refuses attach-as-dial-target (V-P2-MESH-2); '
      'dial the hosting peer / pairing WS instead.',
    );
  }
}
