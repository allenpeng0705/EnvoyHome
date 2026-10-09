/// Join channels into the EnvoyMesh super channel (Design §5.1 / §2.3).
///
/// These are **dial paths**, not IM ChannelPlugins. Same trust model as EnvoyDev:
/// link (QR / `envoy://pair`), direct (`host:port` + token), ssh (hop + daemon).
library;

import 'package:envoy_thin_client/envoy_thin_client.dart';

import 'pairing.dart';
import 'product.dart';

/// How this phone reached EnvoyHomeDesktop.
enum JoinChannel {
  /// QR / paste of `envoy://pair?…&app=EnvoyHome`.
  link,

  /// LAN / Tailscale TCP: `host:port` + minted token.
  direct,

  /// SSH local-forward hop; daemon sees loopback (token optional).
  ssh,
}

/// An SSH hop to a machine that is not directly reachable.
class SshHop {
  const SshHop({
    required this.host,
    this.port = 22,
    this.user,
    this.password,
  });

  final String host;
  final int port;
  final String? user;

  /// In-memory only — never written to shared preferences or logs.
  final String? password;
}

/// Host and port as typed: `home.local:4780`, `10.0.0.4:4780`, `[::1]:4780`.
({String host, int port})? parseEndpoint(String raw) {
  final text = raw.trim();
  if (text.isEmpty) return null;

  final bracketed = RegExp(r'^\[([^\]]+)\]:(\d{1,5})$').firstMatch(text);
  if (bracketed != null) {
    final port = int.tryParse(bracketed.group(2)!);
    if (port == null || port < 1 || port > 65535) return null;
    return (host: bracketed.group(1)!, port: port);
  }

  final at = text.lastIndexOf(':');
  if (at <= 0 || at == text.length - 1) return null;
  final host = text.substring(0, at).trim();
  final port = int.tryParse(text.substring(at + 1).trim());
  if (host.isEmpty || port == null || port < 1 || port > 65535) return null;
  return (host: host, port: port);
}

sealed class JoinDraft {
  const JoinDraft();
}

class JoinDraftBuilt extends JoinDraft {
  const JoinDraftBuilt(this.pairing);
  final AcceptedPairing pairing;
}

enum JoinRefusal {
  notHostPort,
  needsToken,
  sshHost,
  sshPort,
  daemonAddress,
}

class JoinDraftRefused extends JoinDraft {
  const JoinDraftRefused(this.refusal);
  final JoinRefusal refusal;

  String get message => switch (refusal) {
        JoinRefusal.notHostPort =>
          'Enter host:port (e.g. 192.168.1.10:4780).',
        JoinRefusal.needsToken =>
          'Direct connect needs the pairing token from desktop Settings.',
        JoinRefusal.sshHost => 'Enter the SSH hop host.',
        JoinRefusal.sshPort => 'SSH port must be 1–65535.',
        JoinRefusal.daemonAddress =>
          'Enter the daemon as host:port on the far side (e.g. 127.0.0.1:4780).',
      };
}

/// Direct TCP into EnvoyHomeDesktop — token required (phone is not loopback).
JoinDraft buildDirectJoin({
  required String endpoint,
  required String token,
}) {
  final parsed = parseEndpoint(endpoint);
  if (parsed == null) return const JoinDraftRefused(JoinRefusal.notHostPort);
  final trimmedToken = token.trim();
  if (trimmedToken.isEmpty) {
    return const JoinDraftRefused(JoinRefusal.needsToken);
  }
  final where = '${parsed.host}:${parsed.port}';
  final wsUrl = 'ws://$where/ws';
  return JoinDraftBuilt(
    AcceptedPairing(
      PairingData(
        token: trimmedToken,
        wsUrl: wsUrl,
        relayWsUrl: '',
        app: kEnvoyHomeAppName,
        ownerId: 'envoy:owner:direct',
        ownerPublicKey: 'direct',
      ),
      joinChannel: JoinChannel.direct,
      endpoint: where,
    ),
  );
}

/// SSH hop: tunnel to daemon loopback on the far machine.
///
/// Token is optional — the daemon sees its own loopback. Supplying one still
/// helps if the hop is later replaced by a direct route.
JoinDraft buildSshJoin({
  required String sshHost,
  required String daemonEndpoint,
  String user = '',
  String port = '22',
  String password = '',
  String token = '',
}) {
  final hop = sshHost.trim();
  if (hop.isEmpty) return const JoinDraftRefused(JoinRefusal.sshHost);
  final parsedPort = int.tryParse(port.trim());
  if (parsedPort == null || parsedPort < 1 || parsedPort > 65535) {
    return const JoinDraftRefused(JoinRefusal.sshPort);
  }
  final daemon = parseEndpoint(daemonEndpoint);
  if (daemon == null) {
    return const JoinDraftRefused(JoinRefusal.daemonAddress);
  }
  final where = '${daemon.host}:${daemon.port}';
  final wsUrl = 'ws://$where/ws';
  final trimmedToken = token.trim();
  return JoinDraftBuilt(
    AcceptedPairing(
      PairingData(
        token: trimmedToken,
        wsUrl: wsUrl,
        relayWsUrl: '',
        app: kEnvoyHomeAppName,
        ownerId: 'envoy:owner:ssh',
        ownerPublicKey: 'ssh',
      ),
      joinChannel: JoinChannel.ssh,
      endpoint: where,
      ssh: SshHop(
        host: hop,
        port: parsedPort,
        user: user.trim().isEmpty ? null : user.trim(),
        password: password.isEmpty ? null : password,
      ),
    ),
  );
}

/// Persistable form (no SSH password). Restore re-prompts for password on ssh.
String encodeJoinPersist(AcceptedPairing pairing) {
  switch (pairing.joinChannel) {
    case JoinChannel.link:
      // Caller should persist the original URI; this is a fallback.
      return pairing.wsUrl;
    case JoinChannel.direct:
      final ep = pairing.endpoint ?? _hostPortFromWs(pairing.wsUrl);
      return 'envoyhome://direct?endpoint=${Uri.encodeComponent(ep)}'
          '&token=${Uri.encodeComponent(pairing.token)}';
    case JoinChannel.ssh:
      final hop = pairing.ssh;
      final ep = pairing.endpoint ?? _hostPortFromWs(pairing.wsUrl);
      final q = <String, String>{
        'sshHost': hop?.host ?? '',
        'sshPort': '${hop?.port ?? 22}',
        if (hop?.user != null && hop!.user!.isNotEmpty) 'sshUser': hop.user!,
        'daemon': ep,
        if (pairing.token.isNotEmpty) 'token': pairing.token,
      };
      return Uri(scheme: 'envoyhome', host: 'ssh', queryParameters: q)
          .toString();
  }
}

/// Restore from [encodeJoinPersist] or a classic `envoy://pair` URI.
///
/// For ssh without password, returns pairing that still needs [SshHop.password]
/// before [EnvoyHomeSession.connect] can open the tunnel.
AcceptedPairing? decodeJoinPersist(String raw) {
  final text = raw.trim();
  if (text.startsWith('envoy://pair') || text.startsWith('envoy://invite')) {
    final p = acceptEnvoyHomePairing(text);
    return p;
  }
  if (text.startsWith('envoyhome://direct')) {
    final uri = Uri.tryParse(text);
    if (uri == null) return null;
    final draft = buildDirectJoin(
      endpoint: uri.queryParameters['endpoint'] ?? '',
      token: uri.queryParameters['token'] ?? '',
    );
    return draft is JoinDraftBuilt ? draft.pairing : null;
  }
  if (text.startsWith('envoyhome://ssh')) {
    final uri = Uri.tryParse(text);
    if (uri == null) return null;
    final draft = buildSshJoin(
      sshHost: uri.queryParameters['sshHost'] ?? '',
      port: uri.queryParameters['sshPort'] ?? '22',
      user: uri.queryParameters['sshUser'] ?? '',
      daemonEndpoint: uri.queryParameters['daemon'] ?? '',
      token: uri.queryParameters['token'] ?? '',
    );
    return draft is JoinDraftBuilt ? draft.pairing : null;
  }
  return acceptEnvoyHomePairing(text);
}

String _hostPortFromWs(String wsUrl) {
  final uri = Uri.tryParse(wsUrl);
  if (uri == null || uri.host.isEmpty) return '127.0.0.1:4780';
  final port = uri.hasPort ? uri.port : 4780;
  return '${uri.host}:$port';
}
