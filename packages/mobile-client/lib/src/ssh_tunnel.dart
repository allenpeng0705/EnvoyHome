/// SSH local forward to EnvoyHomeDesktop when it is not directly reachable.
///
/// In-process `ssh -N -L` via dartssh2 (Adapt EnvoyCoder `ssh_tunnel.dart`).
/// The daemon sees the connection on its own loopback.
library;

import 'dart:async';
import 'dart:io';

import 'package:dartssh2/dartssh2.dart';

import 'join_channel.dart';

class SshTunnel {
  SSHClient? _client;
  ServerSocket? _server;
  StreamSubscription<Socket>? _accepts;

  /// Open the forward; returns `ws://127.0.0.1:<local>/ws` (+ optional token).
  Future<String> open({
    required SshHop hop,
    required String daemonEndpoint,
    String token = '',
  }) async {
    await close();
    final remotePort = _remoteDaemonPort(daemonEndpoint);
    final socket = await SSHSocket.connect(hop.host, hop.port);
    final client = SSHClient(
      socket,
      username: hop.user ?? 'root',
      onPasswordRequest: () => hop.password ?? '',
    );
    await client.authenticated;
    _client = client;

    final server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    _server = server;
    _accepts = server.listen((clientSocket) async {
      try {
        final forward = await client.forwardLocal('127.0.0.1', remotePort);
        unawaited(forward.stream.cast<List<int>>().pipe(clientSocket));
        unawaited(clientSocket.cast<List<int>>().pipe(forward.sink));
      } catch (_) {
        try {
          await clientSocket.close();
        } catch (_) {}
      }
    });
    final local = 'ws://127.0.0.1:${server.port}/ws';
    if (token.isEmpty) return local;
    return _attachToken(local, token);
  }

  Future<void> close() async {
    await _accepts?.cancel();
    _accepts = null;
    try {
      await _server?.close();
    } catch (_) {}
    _server = null;
    try {
      _client?.close();
    } catch (_) {}
    _client = null;
  }

  static int _remoteDaemonPort(String endpoint) {
    final parts = endpoint.split(':');
    if (parts.length >= 2) {
      final port = int.tryParse(parts.last);
      if (port != null && port > 0) return port;
    }
    return 4780;
  }

  static String _attachToken(String url, String token) {
    final uri = Uri.tryParse(url);
    if (uri == null) return url;
    final params = Map<String, String>.from(uri.queryParameters);
    params['token'] = token;
    return uri.replace(queryParameters: params).toString();
  }
}
