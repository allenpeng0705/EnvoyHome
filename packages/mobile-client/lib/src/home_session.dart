import 'dart:async';

import 'package:envoy_thin_client/envoy_thin_client.dart';
import 'package:envoy_thin_client/services/platform_web_socket.dart';

import 'dial_policy.dart';
import 'join_channel.dart';
import 'pairing.dart';
import 'product.dart';
import 'ssh_tunnel.dart';

/// Thin `home.*` session over [HomeRemoteClient] (no local model — V-P2-MOB-1).
class EnvoyHomeSession {
  EnvoyHomeSession._(this._client, this.pairing, this._tunnel);

  final HomeRemoteClient _client;
  final AcceptedPairing pairing;
  final SshTunnel? _tunnel;

  HomeRemoteClient get remote => _client;
  JoinChannel get joinChannel => pairing.joinChannel;

  /// Connect using hosting WS candidates derived from [pairing].
  ///
  /// For [JoinChannel.ssh], opens a local forward first so candidates dial
  /// loopback (Adapt EnvoyCoder).
  static Future<EnvoyHomeSession> connect(
    AcceptedPairing pairing, {
    FutureOr<WebSocketLike> Function(HomeRemoteCandidate candidate)? createTransport,
    SshTunnel? tunnel,
  }) async {
    SshTunnel? ownedTunnel;
    var effective = pairing;

    if (pairing.joinChannel == JoinChannel.ssh) {
      final hop = pairing.ssh;
      if (hop == null) {
        throw StateError('SSH join requires hop host');
      }
      if (hop.password == null || hop.password!.isEmpty) {
        throw StateError('SSH join needs the hop password for this session');
      }
      ownedTunnel = tunnel ?? SshTunnel();
      final ep = pairing.endpoint ?? _endpointFromWs(pairing.wsUrl);
      final localWs = await ownedTunnel.open(
        hop: hop,
        daemonEndpoint: ep,
        token: pairing.token,
      );
      effective = AcceptedPairing(
        PairingData(
          token: pairing.token,
          wsUrl: localWs.contains('?')
              ? localWs.split('?').first
              : localWs,
          relayWsUrl: '',
          lanWsUrl: localWs.contains('?')
              ? localWs.split('?').first
              : localWs,
          app: pairing.data.app,
          ownerId: pairing.data.ownerId,
          ownerPublicKey: pairing.data.ownerPublicKey,
        ),
        joinChannel: JoinChannel.ssh,
        endpoint: ep,
        ssh: hop,
      );
    }

    final candidates = hostingCandidatesFor(effective);
    if (candidates.isEmpty) {
      await ownedTunnel?.close();
      throw StateError('pairing has no WS dial target');
    }
    final client = HomeRemoteClient(
      HomeRemoteClientOptions(
        resolveCandidates: () async => candidates,
        createTransport: createTransport ??
            (candidate) => PlatformWebSocket.connect(candidate.url),
        upgradeSweepMs: 0,
      ),
    );
    try {
      await client.ensureConnected();
    } catch (e) {
      await ownedTunnel?.close();
      rethrow;
    }
    final session = EnvoyHomeSession._(client, pairing, ownedTunnel);
    await session.hello();
    return session;
  }

  static String _endpointFromWs(String wsUrl) {
    final uri = Uri.tryParse(wsUrl);
    if (uri == null || uri.host.isEmpty) return '127.0.0.1:4780';
    final port = uri.hasPort ? uri.port : 4780;
    return '${uri.host}:$port';
  }

  Future<Map<String, dynamic>> hello({
    String? clientId,
    String platform = 'ios',
  }) async {
    final result = await _client.call('home.hello', {
      'client': {
        'name': kEnvoyHomeClientName,
        'version': '0.0.0',
        'platform': platform,
        'id': clientId ?? 'envoyhome-mobile',
      },
    });
    return Map<String, dynamic>.from(result as Map);
  }

  Future<Map<String, dynamic>> health() async {
    final result = await _client.call('home.health', {});
    return Map<String, dynamic>.from(result as Map);
  }

  Future<Map<String, dynamic>> meshStatus() async {
    final result = await _client.call('home.meshStatus', {});
    return Map<String, dynamic>.from(result as Map);
  }

  /// Assert phone path is hosting (or no-node in stub labs) — never attach-only.
  Future<void> assertHostingDialPath() async {
    final mesh = await meshStatus();
    final kind = (mesh['mesh'] as Map?)?['kind'] as String? ?? 'no-node';
    if (kind == 'attached') {
      throw StateError(
        'home.meshStatus is attached — phone must dial hosting peer (V-P2-MESH-1/2)',
      );
    }
  }

  Future<Map<String, dynamic>> openSession({
    required String accountId,
    String? title,
  }) async {
    final params = <String, dynamic>{'accountId': accountId};
    if (title != null) params['title'] = title;
    final result = await _client.call('home.openSession', params);
    return Map<String, dynamic>.from(result as Map);
  }

  Future<Map<String, dynamic>> sendMessage({
    required String accountId,
    required String sessionId,
    required String text,
  }) async {
    final result = await _client.call('home.sendMessage', {
      'accountId': accountId,
      'sessionId': sessionId,
      'text': text,
    });
    return Map<String, dynamic>.from(result as Map);
  }

  Future<Map<String, dynamic>> getTranscript({
    required String sessionId,
    int limit = 50,
  }) async {
    final result = await _client.call('home.getTranscript', {
      'sessionId': sessionId,
      'limit': limit,
    });
    return Map<String, dynamic>.from(result as Map);
  }

  Future<Map<String, dynamic>> subscribe(List<String> events) async {
    final result = await _client.call('home.subscribe', {'events': events});
    return Map<String, dynamic>.from(result as Map);
  }

  /// Listen for a daemon push event (after [subscribe]).
  void Function() onEvent(String event, void Function(dynamic data) handler) {
    return _client.on(event, handler);
  }

  Future<Map<String, dynamic>> listApprovals({required String accountId}) async {
    final result = await _client.call('home.listApprovals', {
      'accountId': accountId,
    });
    return Map<String, dynamic>.from(result as Map);
  }

  Future<Map<String, dynamic>> answerApproval({
    required String id,
    required String decision,
    required String argsDigest,
    String scope = 'once',
  }) async {
    final result = await _client.call('home.answerApproval', {
      'id': id,
      'decision': decision,
      'argsDigest': argsDigest,
      'scope': scope,
    });
    return Map<String, dynamic>.from(result as Map);
  }

  /// Register APNs (ios) or FCM (android) alert token with the home daemon.
  Future<Map<String, dynamic>> registerPushToken({
    required String platform,
    required String token,
    String? accountId,
  }) async {
    final params = <String, dynamic>{
      'platform': platform,
      'token': token,
      'tokenType': 'alert',
    };
    if (accountId != null && accountId.isNotEmpty) {
      params['accountId'] = accountId;
    }
    final result = await _client.call('home.registerPushToken', params);
    return Map<String, dynamic>.from(result as Map);
  }

  Future<Map<String, dynamic>> unregisterPushToken() async {
    final result = await _client.call('home.unregisterPushToken', {});
    return Map<String, dynamic>.from(result as Map);
  }

  Future<Map<String, dynamic>> listArtifacts({
    required String accountId,
    String? sessionId,
  }) async {
    final params = <String, dynamic>{'accountId': accountId};
    if (sessionId != null) params['sessionId'] = sessionId;
    final result = await _client.call('home.listArtifacts', params);
    return Map<String, dynamic>.from(result as Map);
  }

  Future<Map<String, dynamic>> getArtifactUrl({
    required String accountId,
    required String path,
    int ttlSec = 3600,
  }) async {
    final result = await _client.call('home.getArtifactUrl', {
      'accountId': accountId,
      'path': path,
      'ttlSec': ttlSec,
    });
    return Map<String, dynamic>.from(result as Map);
  }

  Future<Map<String, dynamic>> listProviders({String? accountId}) async {
    final params = <String, dynamic>{};
    if (accountId != null && accountId.isNotEmpty) {
      params['accountId'] = accountId;
    }
    final result = await _client.call('home.listProviders', params);
    return Map<String, dynamic>.from(result as Map);
  }

  Future<Map<String, dynamic>> getLocalEngineStatus() async {
    final result = await _client.call('home.getLocalEngineStatus', {});
    return Map<String, dynamic>.from(result as Map);
  }

  Future<Map<String, dynamic>> enableLocalEngine({
    String? accountId,
    String prefer = 'auto',
  }) async {
    final params = <String, dynamic>{'prefer': prefer};
    if (accountId != null && accountId.isNotEmpty) {
      params['accountId'] = accountId;
    }
    final result = await _client.call('home.enableLocalEngine', params);
    return Map<String, dynamic>.from(result as Map);
  }

  Future<Map<String, dynamic>> enableOllama({
    String? accountId,
    String? baseUrl,
    String? model,
  }) async {
    final params = <String, dynamic>{};
    if (accountId != null && accountId.isNotEmpty) {
      params['accountId'] = accountId;
    }
    if (baseUrl != null && baseUrl.isNotEmpty) params['baseUrl'] = baseUrl;
    if (model != null && model.isNotEmpty) params['model'] = model;
    final result = await _client.call('home.enableOllama', params);
    return Map<String, dynamic>.from(result as Map);
  }

  Future<Map<String, dynamic>> disableLocalEngine() async {
    final result = await _client.call('home.disableLocalEngine', {});
    return Map<String, dynamic>.from(result as Map);
  }

  Future<Map<String, dynamic>> setPlacementFilter({
    required String accountId,
    required String filter,
  }) async {
    final result = await _client.call('home.setPlacementFilter', {
      'accountId': accountId,
      'filter': filter,
    });
    return Map<String, dynamic>.from(result as Map);
  }

  Future<Map<String, dynamic>> setDefaultProvider({
    required String accountId,
    required String providerId,
  }) async {
    final result = await _client.call('home.setDefaultProvider', {
      'accountId': accountId,
      'providerId': providerId,
    });
    return Map<String, dynamic>.from(result as Map);
  }

  void dispose() {
    _client.dispose();
    unawaited(_tunnel?.close() ?? Future<void>.value());
  }
}
