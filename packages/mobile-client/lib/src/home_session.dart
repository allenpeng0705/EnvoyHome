import 'dart:async';

import 'package:envoy_thin_client/envoy_thin_client.dart';
import 'package:envoy_thin_client/services/platform_web_socket.dart';

import 'dial_policy.dart';
import 'join_channel.dart';
import 'libp2p_transport.dart';
import 'pairing.dart';
import 'product.dart';
import 'route_plan.dart';
import 'ssh_tunnel.dart';

/// Thin `home.*` session over [HomeRemoteClient] (no local model — V-P2-MOB-1).
class EnvoyHomeSession {
  EnvoyHomeSession._(this._client, this.pairing, this._tunnel);

  final HomeRemoteClient _client;
  final AcceptedPairing pairing;
  final SshTunnel? _tunnel;

  /// Last `home.subscribe` catalogue — re-bound after transport reconnect.
  List<String> _subscribedEvents = const [];

  static final Libp2pTransport _defaultLibp2p = Libp2pTransport();

  HomeRemoteClient get remote => _client;
  JoinChannel get joinChannel => pairing.joinChannel;

  /// Connect using the EnvoyDev dial ladder (LAN → libp2p → relay WS).
  ///
  /// For [JoinChannel.ssh], opens a local forward first so candidates dial
  /// loopback (Adapt EnvoyCoder).
  static Future<EnvoyHomeSession> connect(
    AcceptedPairing pairing, {
    FutureOr<WebSocketLike> Function(HomeRemoteCandidate candidate)? createTransport,
    SshTunnel? tunnel,
    Libp2pDialer? libp2pDialer,
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
          homeNodePeerId: pairing.data.homeNodePeerId,
          bootstrapPeers: pairing.data.bootstrapPeers,
          relayWsUrls: pairing.data.relayWsUrls,
        ),
        joinChannel: JoinChannel.ssh,
        endpoint: ep,
        ssh: hop,
      );
    }

    // SSH loopback stays on the thin hostingCandidates list; otherwise walk
    // the EnvoyDev family ladder (CandidateResolver).
    final candidates = effective.joinChannel == JoinChannel.ssh
        ? hostingCandidatesFor(effective)
        : candidatesFor(effective);
    if (candidates.isEmpty) {
      await ownedTunnel?.close();
      throw StateError('pairing has no dial target');
    }
    // Assigned before [onReconnect] can fire so resubscribe has a target.
    late final EnvoyHomeSession session;
    final dialer = libp2pDialer ?? _defaultLibp2p.dial;
    final client = HomeRemoteClient(
      HomeRemoteClientOptions(
        resolveCandidates: () async =>
            effective.joinChannel == JoinChannel.ssh
                ? hostingCandidatesFor(effective)
                : candidatesFor(effective),
        createTransport: createTransport ??
            (candidate) => _createTransportFor(candidate, dialer),
        upgradeSweepMs: 0,
        onReconnect: () {
          unawaited(session._resubscribeAfterReconnect());
        },
      ),
    );
    try {
      await client.ensureConnected();
    } catch (e) {
      await ownedTunnel?.close();
      rethrow;
    }
    session = EnvoyHomeSession._(client, pairing, ownedTunnel);
    await session.hello();
    return session;
  }

  /// EnvoyDev `host_client._createTransportFor` — libp2p → relay proxy → WS.
  static Future<WebSocketLike> _createTransportFor(
    HomeRemoteCandidate candidate,
    Libp2pDialer libp2pDialer,
  ) async {
    switch (homeTransportKindFor(candidate)) {
      case HomeTransportKind.libp2p:
        return libp2pDialer(candidate);
      case HomeTransportKind.clientProxy:
        final homePeerId = candidate.homePeerId!;
        final target = candidate.url.indexOf('?target=');
        return ClientProxyTransport.connect(
          relayWsUrl: candidate.url.substring(0, target),
          homePeerId: homePeerId,
          sessionToken: candidate.sessionToken ?? '',
          product: 'envoyhome-mobile',
          handshakeTimeout: const Duration(seconds: 12),
        );
      case HomeTransportKind.webSocket:
        return PlatformWebSocket.connect(candidate.url);
    }
  }

  static String _endpointFromWs(String wsUrl) {
    final uri = Uri.tryParse(wsUrl);
    if (uri == null || uri.host.isEmpty) return '127.0.0.1:4780';
    final port = uri.hasPort ? uri.port : 4780;
    return '${uri.host}:$port';
  }

  Future<Map<String, dynamic>> _call(
    String method,
    Map<String, dynamic> params,
  ) async {
    final result = await _client.call(method, params);
    return Map<String, dynamic>.from(result as Map);
  }

  Future<Map<String, dynamic>> hello({
    String? clientId,
    String platform = 'ios',
  }) async {
    return _call('home.hello', {
      'client': {
        'name': kEnvoyHomeClientName,
        'version': '0.0.0',
        'platform': platform,
        'id': clientId ?? 'envoyhome-mobile',
      },
    });
  }

  Future<Map<String, dynamic>> health() => _call('home.health', {});

  Future<Map<String, dynamic>> meshStatus() => _call('home.meshStatus', {});

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
    String? purpose,
  }) async {
    final params = <String, dynamic>{'accountId': accountId};
    if (title != null) params['title'] = title;
    if (purpose != null) params['purpose'] = purpose;
    return _call('home.openSession', params);
  }

  Future<Map<String, dynamic>> listSessions({
    required String accountId,
    bool includeArchived = false,
  }) {
    final params = <String, dynamic>{'accountId': accountId};
    if (includeArchived) params['includeArchived'] = true;
    return _call('home.listSessions', params);
  }

  Future<Map<String, dynamic>> clearTranscript({
    required String accountId,
    required String sessionId,
  }) =>
      _call('home.clearTranscript', {
        'accountId': accountId,
        'sessionId': sessionId,
      });

  Future<Map<String, dynamic>> deleteTranscriptMessages({
    required String accountId,
    required String sessionId,
    required List<String> messageIds,
  }) =>
      _call('home.deleteTranscriptMessages', {
        'accountId': accountId,
        'sessionId': sessionId,
        'messageIds': messageIds,
      });

  Future<Map<String, dynamic>> archiveSession({
    required String accountId,
    required String sessionId,
  }) =>
      _call('home.archiveSession', {
        'accountId': accountId,
        'sessionId': sessionId,
      });

  Future<Map<String, dynamic>> unarchiveSession({
    required String accountId,
    required String sessionId,
  }) =>
      _call('home.unarchiveSession', {
        'accountId': accountId,
        'sessionId': sessionId,
      });

  Future<Map<String, dynamic>> removeSession({
    required String accountId,
    required String sessionId,
  }) =>
      _call('home.removeSession', {
        'accountId': accountId,
        'sessionId': sessionId,
      });

  Future<Map<String, dynamic>> renameSession({
    required String accountId,
    required String sessionId,
    required String title,
  }) =>
      _call('home.renameSession', {
        'accountId': accountId,
        'sessionId': sessionId,
        'title': title,
      });

  Future<Map<String, dynamic>> getIdentity({required String accountId}) =>
      _call('home.getIdentity', {'accountId': accountId});

  Future<Map<String, dynamic>> setIdentity({
    required String accountId,
    required String markdown,
  }) =>
      _call('home.setIdentity', {
        'accountId': accountId,
        'markdown': markdown,
      });

  Future<Map<String, dynamic>> sendMessage({
    required String accountId,
    required String sessionId,
    required String text,
    List<Map<String, dynamic>>? media,
    Map<String, dynamic>? clientContext,
  }) async {
    final params = <String, dynamic>{
      'accountId': accountId,
      'sessionId': sessionId,
      'text': text,
    };
    if (media != null && media.isNotEmpty) params['media'] = media;
    if (clientContext != null && clientContext.isNotEmpty) {
      params['clientContext'] = clientContext;
    }
    return _call('home.sendMessage', params);
  }

  Future<Map<String, dynamic>> uploadChatMedia({
    required String accountId,
    required String fileName,
    required String contentBase64,
    String? mimeType,
  }) async {
    final params = <String, dynamic>{
      'accountId': accountId,
      'fileName': fileName,
      'contentBase64': contentBase64,
    };
    if (mimeType != null && mimeType.isNotEmpty) params['mimeType'] = mimeType;
    return _call('home.uploadChatMedia', params);
  }

  Future<Map<String, dynamic>> cancelTurn({required String turnId}) =>
      _call('home.cancelTurn', {'turnId': turnId});

  Future<Map<String, dynamic>> getTranscript({
    required String accountId,
    required String sessionId,
    int limit = 50,
  }) =>
      _call('home.getTranscript', {
        'accountId': accountId,
        'sessionId': sessionId,
        'limit': limit,
      });

  /// Product catalogue ([home.subscribe]) **and** transport `on` per event.
  ///
  /// Desktop does both (Design §3.1). `home.subscribe` alone only updates
  /// daemon bookkeeping — without transport `on`, the host never pushes
  /// `home:turn-delta` / `home:turn-finished` frames to this socket.
  Future<Map<String, dynamic>> subscribe(List<String> events) async {
    _subscribedEvents = List<String>.unmodifiable(events);
    final result = await _call('home.subscribe', {'events': events});
    await _bindTransportEvents(events);
    return result;
  }

  Future<void> _bindTransportEvents(List<String> events) async {
    for (final event in events) {
      try {
        await _client.call('on', {'event': event});
      } catch (_) {
        // Best-effort — match desktop `.catch(() => undefined)`.
      }
    }
  }

  Future<void> _resubscribeAfterReconnect() async {
    final events = _subscribedEvents;
    if (events.isEmpty) return;
    try {
      await _call('home.subscribe', {'events': events});
      await _bindTransportEvents(events);
    } catch (_) {
      // Next user action / ChatTab subscribe retry can recover.
    }
  }

  /// Listen for a daemon push event (after [subscribe]).
  void Function() onEvent(String event, void Function(dynamic data) handler) {
    return _client.on(event, handler);
  }

  Future<Map<String, dynamic>> listApprovals({required String accountId}) =>
      _call('home.listApprovals', {'accountId': accountId});

  Future<Map<String, dynamic>> answerApproval({
    required String id,
    required String decision,
    required String argsDigest,
    String scope = 'once',
  }) =>
      _call('home.answerApproval', {
        'id': id,
        'decision': decision,
        'argsDigest': argsDigest,
        'scope': scope,
      });

  /// Pending chat choice cards (V-UX-14 — one / many / text).
  Future<Map<String, dynamic>> listChoices({
    required String accountId,
    String? sessionId,
  }) {
    final params = <String, dynamic>{'accountId': accountId};
    if (sessionId != null && sessionId.isNotEmpty) {
      params['sessionId'] = sessionId;
    }
    return _call('home.listChoices', params);
  }

  Future<Map<String, dynamic>> answerChoice({
    required String accountId,
    required String id,
    String? optionId,
    List<String>? optionIds,
    String? text,
    bool cancel = false,
  }) {
    final params = <String, dynamic>{
      'accountId': accountId,
      'id': id,
    };
    if (cancel) {
      params['cancel'] = true;
    }
    if (optionId != null && optionId.isNotEmpty) {
      params['optionId'] = optionId;
    }
    if (optionIds != null && optionIds.isNotEmpty) {
      params['optionIds'] = optionIds;
    }
    if (text != null && text.trim().isNotEmpty) {
      params['text'] = text.trim();
    }
    return _call('home.answerChoice', params);
  }

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
    return _call('home.registerPushToken', params);
  }

  Future<Map<String, dynamic>> unregisterPushToken() =>
      _call('home.unregisterPushToken', {});

  Future<Map<String, dynamic>> listArtifacts({
    required String accountId,
    String? sessionId,
  }) async {
    final params = <String, dynamic>{'accountId': accountId};
    if (sessionId != null) params['sessionId'] = sessionId;
    return _call('home.listArtifacts', params);
  }

  /// File Explore — one-level browse (Design §9.5d / V-OUT-4).
  /// Empty [path] returns synthetic roots.
  Future<Map<String, dynamic>> listSandboxEntries({
    required String accountId,
    String? path,
  }) async {
    final params = <String, dynamic>{'accountId': accountId};
    if (path != null) params['path'] = path;
    return _call('home.listSandboxEntries', params);
  }

  Future<Map<String, dynamic>> getArtifactUrl({
    required String accountId,
    required String path,
    int ttlSec = 3600,
  }) =>
      _call('home.getArtifactUrl', {
        'accountId': accountId,
        'path': path,
        'ttlSec': ttlSec,
      });

  /// Pull artifact over the paired home.* session (no public HTTPS required).
  Future<Map<String, dynamic>> getArtifactContent({
    required String accountId,
    required String path,
  }) =>
      _call('home.getArtifactContent', {
        'accountId': accountId,
        'path': path,
      });

  Future<Map<String, dynamic>> listProviders({String? accountId}) async {
    final params = <String, dynamic>{};
    if (accountId != null && accountId.isNotEmpty) {
      params['accountId'] = accountId;
    }
    return _call('home.listProviders', params);
  }

  Future<Map<String, dynamic>> getLocalEngineStatus() =>
      _call('home.getLocalEngineStatus', {});

  Future<Map<String, dynamic>> enableLocalEngine({
    String? accountId,
    String prefer = 'auto',
  }) async {
    final params = <String, dynamic>{'prefer': prefer};
    if (accountId != null && accountId.isNotEmpty) {
      params['accountId'] = accountId;
    }
    return _call('home.enableLocalEngine', params);
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
    return _call('home.enableOllama', params);
  }

  Future<Map<String, dynamic>> disableLocalEngine() =>
      _call('home.disableLocalEngine', {});

  Future<Map<String, dynamic>> setPlacementFilter({
    required String accountId,
    required String filter,
  }) =>
      _call('home.setPlacementFilter', {
        'accountId': accountId,
        'filter': filter,
      });

  Future<Map<String, dynamic>> setDefaultProvider({
    required String accountId,
    required String providerId,
  }) =>
      _call('home.setDefaultProvider', {
        'accountId': accountId,
        'providerId': providerId,
      });

  Future<Map<String, dynamic>> setAutoModelSwitch({
    required String accountId,
    required bool enabled,
  }) =>
      _call('home.setAutoModelSwitch', {
        'accountId': accountId,
        'enabled': enabled,
      });

  Future<Map<String, dynamic>> testProvider({
    required String providerId,
    String? accountId,
  }) async {
    final params = <String, dynamic>{'providerId': providerId};
    if (accountId != null && accountId.isNotEmpty) {
      params['accountId'] = accountId;
    }
    return _call('home.testProvider', params);
  }

  Future<Map<String, dynamic>> searchHuggingFaceModels({
    required String query,
    int limit = 20,
  }) =>
      _call('home.searchHuggingFaceModels', {'query': query, 'limit': limit});

  Future<Map<String, dynamic>> listHuggingFaceGgufFiles({
    required String repoId,
  }) =>
      _call('home.listHuggingFaceGgufFiles', {'repoId': repoId});

  Future<Map<String, dynamic>> downloadLocalModel({
    required String modelId,
  }) =>
      _call('home.downloadLocalModel', {'modelId': modelId});

  Future<Map<String, dynamic>> downloadLocalModelUrl({
    required String url,
  }) =>
      _call('home.downloadLocalModelUrl', {'url': url});

  Future<Map<String, dynamic>> cancelLocalModelDownload({
    required String fileName,
  }) =>
      _call('home.cancelLocalModelDownload', {'fileName': fileName});

  Future<Map<String, dynamic>> resumeLocalModelDownload({
    required String fileName,
  }) =>
      _call('home.resumeLocalModelDownload', {'fileName': fileName});

  Future<Map<String, dynamic>> getChannelStatus({
    required String id,
    bool? all,
  }) async {
    final params = <String, dynamic>{'id': id};
    if (all != null) params['all'] = all;
    return _call('home.getChannelStatus', params);
  }

  Future<Map<String, dynamic>> setChannelConfig({
    required String id,
    Map<String, dynamic>? config,
    Map<String, dynamic>? secrets,
  }) async {
    final params = <String, dynamic>{'id': id};
    if (config != null) params['config'] = config;
    if (secrets != null) params['secrets'] = secrets;
    return _call('home.setChannelConfig', params);
  }

  /// Design §9.5f — household web_search config (Owner-scope).
  Future<Map<String, dynamic>> getWebSearchConfig() =>
      _call('home.getWebSearchConfig', {});

  Future<Map<String, dynamic>> setWebSearchConfig({
    bool? enabled,
    String? provider,
    String? apiKey,
    String? fallback,
    List<String>? browserEngines,
    bool? unattendedBrowser,
  }) async {
    final params = <String, dynamic>{};
    if (enabled != null) params['enabled'] = enabled;
    if (provider != null) params['provider'] = provider;
    if (apiKey != null) params['apiKey'] = apiKey;
    if (fallback != null) params['fallback'] = fallback;
    if (browserEngines != null) params['browserEngines'] = browserEngines;
    if (unattendedBrowser != null) params['unattendedBrowser'] = unattendedBrowser;
    return _call('home.setWebSearchConfig', params);
  }

  /// Design §9.5g — household browser control (Owner-scope).
  Future<Map<String, dynamic>> getBrowserControlConfig() =>
      _call('home.getBrowserControlConfig', {});

  Future<Map<String, dynamic>> setBrowserControlConfig({
    bool? enabled,
    bool? unattendedEnabled,
    String? defaultProfile,
    bool? personalEnabled,
    String? personalCdpEndpoint,
    bool? remoteEnabled,
    String? remoteCdpUrl,
    String? remoteToken,
    bool? acknowledgeElevated,
  }) async {
    final params = <String, dynamic>{};
    if (enabled != null) params['enabled'] = enabled;
    if (unattendedEnabled != null) params['unattendedEnabled'] = unattendedEnabled;
    if (defaultProfile != null) params['defaultProfile'] = defaultProfile;
    if (personalEnabled != null) params['personalEnabled'] = personalEnabled;
    if (personalCdpEndpoint != null) params['personalCdpEndpoint'] = personalCdpEndpoint;
    if (remoteEnabled != null) params['remoteEnabled'] = remoteEnabled;
    if (remoteCdpUrl != null) params['remoteCdpUrl'] = remoteCdpUrl;
    if (remoteToken != null) params['remoteToken'] = remoteToken;
    if (acknowledgeElevated != null) params['acknowledgeElevated'] = acknowledgeElevated;
    return _call('home.setBrowserControlConfig', params);
  }

  Future<Map<String, dynamic>> enableChannel({required String id}) =>
      _call('home.enableChannel', {'id': id});

  Future<Map<String, dynamic>> disableChannel({required String id}) =>
      _call('home.disableChannel', {'id': id});

  Future<Map<String, dynamic>> listSources({String? accountId}) async {
    final params = <String, dynamic>{};
    if (accountId != null && accountId.isNotEmpty) {
      params['accountId'] = accountId;
    }
    return _call('home.listSources', params);
  }

  Future<Map<String, dynamic>> setSourceBinding({
    required String channel,
    required String channelAccount,
    required String sourceId,
    required String? accountId,
    bool? shared,
    bool? neverUnattended,
    List<String>? actuationAllowList,
    String? displayName,
  }) async {
    final params = <String, dynamic>{
      'channel': channel,
      'channelAccount': channelAccount,
      'sourceId': sourceId,
      'accountId': accountId,
    };
    if (shared != null) params['shared'] = shared;
    if (neverUnattended != null) params['neverUnattended'] = neverUnattended;
    if (actuationAllowList != null) {
      params['actuationAllowList'] = actuationAllowList;
    }
    if (displayName != null) params['displayName'] = displayName;
    return _call('home.setSourceBinding', params);
  }

  Future<Map<String, dynamic>> removeSourceBinding({
    required String channel,
    required String channelAccount,
    required String sourceId,
  }) =>
      _call('home.removeSourceBinding', {
        'channel': channel,
        'channelAccount': channelAccount,
        'sourceId': sourceId,
      });

  Future<Map<String, dynamic>> listBindings({String? accountId}) async {
    final params = <String, dynamic>{};
    if (accountId != null && accountId.isNotEmpty) {
      params['accountId'] = accountId;
    }
    return _call('home.listBindings', params);
  }

  Future<Map<String, dynamic>> setBinding({
    required String channel,
    required String channelAccount,
    required String senderId,
    required String accountId,
  }) =>
      _call('home.setBinding', {
        'channel': channel,
        'channelAccount': channelAccount,
        'senderId': senderId,
        'accountId': accountId,
      });

  Future<Map<String, dynamic>> removeBinding({required String bindingId}) =>
      _call('home.removeBinding', {'bindingId': bindingId});

  Future<Map<String, dynamic>> listPairedDevices() =>
      _call('home.listPairedDevices', {});

  Future<Map<String, dynamic>> listMemory({required String accountId}) =>
      _call('home.listMemory', {'accountId': accountId});

  Future<Map<String, dynamic>> listPendingLearns({required String accountId}) =>
      _call('home.listPendingLearns', {'accountId': accountId});

  Future<Map<String, dynamic>> acceptLearn({required String id}) =>
      _call('home.acceptLearn', {'id': id});

  Future<Map<String, dynamic>> rejectLearn({required String id}) =>
      _call('home.rejectLearn', {'id': id});

  Future<Map<String, dynamic>> setMemorySettings({
    required String accountId,
    Map<String, dynamic>? settings,
  }) async {
    final params = <String, dynamic>{'accountId': accountId};
    if (settings != null) params.addAll(settings);
    return _call('home.setMemorySettings', params);
  }

  Future<Map<String, dynamic>> compactMemory({required String accountId}) =>
      _call('home.compactMemory', {'accountId': accountId});

  Future<Map<String, dynamic>> listSkills() => _call('home.listSkills', {});

  Future<Map<String, dynamic>> installSkill({
    required String source,
    required String ref,
  }) =>
      _call('home.installSkill', {'source': source, 'ref': ref});

  Future<Map<String, dynamic>> searchClawHubSkills({
    required String query,
  }) =>
      _call('home.searchClawHubSkills', {'query': query});

  Future<Map<String, dynamic>> verifySkill({required String id}) =>
      _call('home.verifySkill', {'id': id});

  Future<Map<String, dynamic>> removeSkill({required String id}) =>
      _call('home.removeSkill', {'id': id});

  Future<Map<String, dynamic>> listWorkflows({String? accountId}) async {
    final params = <String, dynamic>{};
    if (accountId != null && accountId.isNotEmpty) {
      params['accountId'] = accountId;
    }
    return _call('home.listWorkflows', params);
  }

  Future<Map<String, dynamic>> getWorkflow({required String id}) =>
      _call('home.getWorkflow', {'id': id});

  Future<Map<String, dynamic>> putWorkflow({
    required String yaml,
    String? accountId,
  }) async {
    final params = <String, dynamic>{'yaml': yaml};
    if (accountId != null) params['accountId'] = accountId;
    return _call('home.putWorkflow', params);
  }

  Future<Map<String, dynamic>> validateWorkflow({required String yaml}) =>
      _call('home.validateWorkflow', {'yaml': yaml});

  Future<Map<String, dynamic>> setWorkflowEnabled({
    required String id,
    required bool enabled,
  }) =>
      _call('home.setWorkflowEnabled', {'id': id, 'enabled': enabled});

  Future<Map<String, dynamic>> removeWorkflow({required String id}) =>
      _call('home.removeWorkflow', {'id': id});

  Future<Map<String, dynamic>> runWorkflow({
    required String id,
    String? accountId,
  }) async {
    final params = <String, dynamic>{'id': id};
    if (accountId != null) params['accountId'] = accountId;
    return _call('home.runWorkflow', params);
  }

  Future<Map<String, dynamic>> draftWorkflow({
    required String accountId,
    required String text,
    String? currentYaml,
    List<String>? hintTools,
  }) async {
    final params = <String, dynamic>{
      'accountId': accountId,
      'text': text,
    };
    if (currentYaml != null && currentYaml.isNotEmpty) {
      params['currentYaml'] = currentYaml;
    }
    if (hintTools != null) params['hintTools'] = hintTools;
    return _call('home.draftWorkflow', params);
  }

  Future<Map<String, dynamic>> draftWorkflowPrompt({
    required String prompt,
    Map<String, dynamic>? node,
  }) async {
    final params = <String, dynamic>{'prompt': prompt};
    if (node != null) params['node'] = node;
    return _call('home.draftWorkflowPrompt', params);
  }

  Future<Map<String, dynamic>> listWorkflowTools() =>
      _call('home.listWorkflowTools', {});

  Future<Map<String, dynamic>> listWorkflowStepTemplates() =>
      _call('home.listWorkflowStepTemplates', {});

  Future<Map<String, dynamic>> listSchedules({String? accountId}) async {
    final params = <String, dynamic>{};
    if (accountId != null && accountId.isNotEmpty) {
      params['accountId'] = accountId;
    }
    return _call('home.listSchedules', params);
  }

  Future<Map<String, dynamic>> proposeSchedule({
    required String accountId,
    required String text,
    String? timeZone,
    Map<String, dynamic>? clientContext,
  }) async {
    final params = <String, dynamic>{
      'accountId': accountId,
      'text': text,
    };
    if (timeZone != null) params['timeZone'] = timeZone;
    if (clientContext != null) params['clientContext'] = clientContext;
    return _call('home.proposeSchedule', params);
  }

  Future<Map<String, dynamic>> confirmSchedule({
    required String accountId,
    required String proposalId,
    String? name,
    Map<String, dynamic>? payload,
  }) async {
    final params = <String, dynamic>{
      'accountId': accountId,
      'proposalId': proposalId,
    };
    if (name != null) params['name'] = name;
    if (payload != null) params['payload'] = payload;
    return _call('home.confirmSchedule', params);
  }

  Future<Map<String, dynamic>> updateSchedule({
    required String accountId,
    required String jobId,
    bool? enabled,
    String? name,
    Map<String, dynamic>? spec,
    Map<String, dynamic>? payload,
  }) async {
    final params = <String, dynamic>{
      'accountId': accountId,
      'jobId': jobId,
    };
    if (enabled != null) params['enabled'] = enabled;
    if (name != null) params['name'] = name;
    if (spec != null) params['spec'] = spec;
    if (payload != null) params['payload'] = payload;
    return _call('home.updateSchedule', params);
  }

  Future<Map<String, dynamic>> listScheduleReceipts({
    required String accountId,
    String? jobId,
    int? limit,
  }) async {
    final params = <String, dynamic>{'accountId': accountId};
    if (jobId != null && jobId.isNotEmpty) params['jobId'] = jobId;
    if (limit != null) params['limit'] = limit;
    return _call('home.listScheduleReceipts', params);
  }

  Future<Map<String, dynamic>> runSchedule({
    required String accountId,
    required String jobId,
  }) =>
      _call('home.runSchedule', {
        'accountId': accountId,
        'jobId': jobId,
      });

  Future<Map<String, dynamic>> removeSchedule({
    required String accountId,
    required String jobId,
  }) =>
      _call('home.removeSchedule', {
        'accountId': accountId,
        'jobId': jobId,
      });

  Future<Map<String, dynamic>> doctor() => _call('home.doctor', {});

  Future<Map<String, dynamic>> doctorFix({required List<String> issueIds}) =>
      _call('home.doctorFix', {'issueIds': issueIds});

  Future<Map<String, dynamic>> listGrants({String? accountId}) async {
    final params = <String, dynamic>{};
    if (accountId != null && accountId.isNotEmpty) {
      params['accountId'] = accountId;
    }
    return _call('home.listGrants', params);
  }

  Future<Map<String, dynamic>> revokeGrant({required String id}) =>
      _call('home.revokeGrant', {'id': id});

  Future<Map<String, dynamic>> listAccounts() => _call('home.listAccounts', {});

  Future<Map<String, dynamic>> getHouseholdOwner() =>
      _call('home.getHouseholdOwner', {});

  Future<Map<String, dynamic>> transferHouseholdOwner({
    required String toAccountId,
    bool confirm = true,
  }) =>
      _call('home.transferHouseholdOwner', {
        'toAccountId': toAccountId,
        'confirm': confirm,
      });

  Future<Map<String, dynamic>> createAccount({
    required String displayName,
    String? accountId,
    String? locale,
  }) async {
    final params = <String, dynamic>{'displayName': displayName};
    if (accountId != null && accountId.isNotEmpty) {
      params['accountId'] = accountId;
    }
    if (locale != null && locale.isNotEmpty) params['locale'] = locale;
    return _call('home.createAccount', params);
  }

  Future<Map<String, dynamic>> updateAccount({
    required String accountId,
    String? displayName,
    String? locale,
    String? timeZone,
    String? toolPolicy,
  }) async {
    final params = <String, dynamic>{'accountId': accountId};
    if (displayName != null) params['displayName'] = displayName;
    if (locale != null) params['locale'] = locale;
    if (timeZone != null) params['timeZone'] = timeZone;
    if (toolPolicy != null) params['toolPolicy'] = toolPolicy;
    return _call('home.updateAccount', params);
  }

  Future<Map<String, dynamic>> deleteAccount({
    required String accountId,
    bool confirm = true,
    bool force = false,
  }) =>
      _call('home.deleteAccount', {
        'accountId': accountId,
        'confirm': confirm,
        'force': force,
      });

  Future<Map<String, dynamic>> getWorkspace({required String accountId}) =>
      _call('home.getWorkspace', {'accountId': accountId});

  Future<Map<String, dynamic>> setWorkspace({
    required String accountId,
    required String hostPath,
    required String mode,
    String? id,
  }) {
    final params = <String, dynamic>{
      'accountId': accountId,
      'hostPath': hostPath,
      'mode': mode,
    };
    if (id != null) params['id'] = id;
    return _call('home.setWorkspace', params);
  }

  /// Add or update one host folder mount (keeps other mounts).
  Future<Map<String, dynamic>> upsertWorkspaceMount({
    required String accountId,
    required String hostPath,
    required String mode,
    String? id,
  }) {
    final params = <String, dynamic>{
      'accountId': accountId,
      'hostPath': hostPath,
      'mode': mode,
    };
    if (id != null) params['id'] = id;
    return _call('home.upsertWorkspaceMount', params);
  }

  Future<Map<String, dynamic>> removeWorkspaceMount({
    required String accountId,
    required String id,
  }) =>
      _call('home.removeWorkspaceMount', {
        'accountId': accountId,
        'id': id,
      });

  Future<Map<String, dynamic>> clearWorkspace({required String accountId}) =>
      _call('home.clearWorkspace', {'accountId': accountId});

  /// Owner-scope — home machine roots for workspace folder picker.
  Future<Map<String, dynamic>> getHomeFsInfo() =>
      _call('home.getHomeFsInfo', {});

  /// Owner-scope — list one absolute directory (dirsOnly defaults true on daemon).
  Future<Map<String, dynamic>> listHomeFsEntries({
    String? path,
    bool dirsOnly = true,
  }) async {
    final params = <String, dynamic>{'dirsOnly': dirsOnly};
    if (path != null) params['path'] = path;
    return _call('home.listHomeFsEntries', params);
  }

  Future<Map<String, dynamic>> mintPairing({
    required String deviceLabel,
    List<String>? accountIds,
    String? host,
    String? lanHost,
    String? token,
    bool? fresh,
  }) async {
    final params = <String, dynamic>{'deviceLabel': deviceLabel};
    if (accountIds != null) params['accountIds'] = accountIds;
    if (host != null && host.isNotEmpty) params['host'] = host;
    if (lanHost != null && lanHost.isNotEmpty) params['lanHost'] = lanHost;
    if (token != null && token.isNotEmpty) params['token'] = token;
    if (fresh != null) params['fresh'] = fresh;
    return _call('home.mintPairing', params);
  }

  Future<Map<String, dynamic>> revokePairedDevice({required String deviceId}) =>
      _call('home.revokePairedDevice', {'deviceId': deviceId});

  Future<Map<String, dynamic>> forgetPairedDevice({required String deviceId}) =>
      _call('home.forgetPairedDevice', {'deviceId': deviceId});

  Future<Map<String, dynamic>> sendTestPush({String? accountId}) async {
    final params = <String, dynamic>{};
    if (accountId != null && accountId.isNotEmpty) {
      params['accountId'] = accountId;
    }
    return _call('home.sendTestPush', params);
  }

  void dispose() {
    _client.dispose();
    unawaited(_tunnel?.close() ?? Future<void>.value());
  }
}
