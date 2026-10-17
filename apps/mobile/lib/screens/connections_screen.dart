import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';

/// Connections: Pairing | Home Assistant | MQTT | Channels.
class ConnectionsScreen extends StatelessWidget {
  const ConnectionsScreen({super.key, required this.session});

  final SessionController session;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.navConnections),
          bottom: TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: l10n.connTabPairing),
              Tab(text: l10n.connTabHa),
              Tab(text: l10n.connTabMqtt),
              Tab(text: l10n.connTabChannels),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _PairingTab(session: session),
            _ChannelConfigTab(session: session, channelId: 'homeassistant'),
            _ChannelConfigTab(session: session, channelId: 'mqtt'),
            _ImChannelsTab(session: session),
          ],
        ),
      ),
    );
  }
}

class _PairingTab extends StatefulWidget {
  const _PairingTab({required this.session});
  final SessionController session;

  @override
  State<_PairingTab> createState() => _PairingTabState();
}

class _PairingTabState extends State<_PairingTab> {
  List<Map<String, dynamic>> _devices = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_reload());
  }

  Future<void> _reload() async {
    final home = widget.session.session;
    if (home == null) return;
    try {
      final body = await home.listPairedDevices();
      final raw = body['devices'] ?? body['pairedDevices'];
      final list = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final d in raw) {
          if (d is Map) list.add(Map<String, dynamic>.from(d));
        }
      }
      if (mounted) {
        setState(() {
          _devices = list;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(l10n.connPairingHint, style: Theme.of(context).textTheme.bodySmall),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          const SizedBox(height: 12),
          ..._devices.map(
            (d) => ListTile(
              title: Text(d['deviceId']?.toString() ?? d['id']?.toString() ?? '?'),
              subtitle: Text(
                '${d['platform'] ?? ''} · ${d['accountIds'] ?? d['accounts'] ?? ''}',
              ),
            ),
          ),
          if (_devices.isEmpty)
            Text(l10n.connNoDevices, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class _ChannelConfigTab extends StatefulWidget {
  const _ChannelConfigTab({
    required this.session,
    required this.channelId,
  });
  final SessionController session;
  final String channelId;

  @override
  State<_ChannelConfigTab> createState() => _ChannelConfigTabState();
}

class _ChannelConfigTabState extends State<_ChannelConfigTab> {
  final _urlCtrl = TextEditingController();
  final _tokenCtrl = TextEditingController();
  Map<String, dynamic>? _status;
  List<Map<String, dynamic>> _sources = [];
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    unawaited(_reload());
  }

  @override
  void dispose() {
    _urlCtrl.dispose();
    _tokenCtrl.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    final home = widget.session.session;
    if (home == null) return;
    setState(() => _busy = true);
    try {
      final status = await home.getChannelStatus(id: widget.channelId);
      final cfg = status['config'];
      if (cfg is Map) {
        _urlCtrl.text =
            cfg['baseUrl']?.toString() ?? cfg['brokerUrl']?.toString() ?? '';
      }
      final sourcesBody = await home.listSources(
        accountId: widget.session.accountId,
      );
      final raw = sourcesBody['sources'];
      final list = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final s in raw) {
          if (s is! Map) continue;
          final m = Map<String, dynamic>.from(s);
          final kind = m['kind']?.toString() ?? m['channelId']?.toString() ?? '';
          if (kind.contains(widget.channelId) ||
              (widget.channelId == 'homeassistant' &&
                  (kind == 'ha' || kind.contains('home'))) ||
              (widget.channelId == 'mqtt' && kind.contains('mqtt')) ||
              m['channelId']?.toString() == widget.channelId) {
            list.add(m);
          } else if (widget.channelId == 'homeassistant' ||
              widget.channelId == 'mqtt') {
            // Show all if channel filter unknown — bind panel still useful.
            list.add(m);
          }
        }
      }
      if (mounted) {
        setState(() {
          _status = status;
          _sources = list;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveEnable() async {
    final home = widget.session.session;
    if (home == null) return;
    setState(() => _busy = true);
    try {
      final config = <String, dynamic>{};
      if (widget.channelId == 'homeassistant') {
        config['baseUrl'] = _urlCtrl.text.trim();
      } else {
        config['brokerUrl'] = _urlCtrl.text.trim();
      }
      final secrets = <String, dynamic>{};
      if (_tokenCtrl.text.trim().isNotEmpty) {
        secrets[widget.channelId == 'homeassistant' ? 'accessToken' : 'password'] =
            _tokenCtrl.text.trim();
      }
      await home.setChannelConfig(
        id: widget.channelId,
        config: config,
        secrets: secrets.isEmpty ? null : secrets,
      );
      await home.enableChannel(id: widget.channelId);
      await _reload();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _bind(Map<String, dynamic> source, {bool neverUnattended = false}) async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    final sourceId = source['sourceId']?.toString() ?? source['id']?.toString();
    final channel = source['channel']?.toString() ?? widget.channelId;
    final channelAccount =
        source['channelAccount']?.toString() ?? source['channelAccountId']?.toString() ?? 'default';
    if (home == null || accountId == null || sourceId == null) return;
    setState(() => _busy = true);
    try {
      await home.setSourceBinding(
        channel: channel,
        channelAccount: channelAccount,
        sourceId: sourceId,
        accountId: accountId,
        neverUnattended: neverUnattended,
      );
      await _reload();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _unbind(Map<String, dynamic> source) async {
    final home = widget.session.session;
    final sourceId = source['sourceId']?.toString() ?? source['id']?.toString();
    final channel = source['channel']?.toString() ?? widget.channelId;
    final channelAccount =
        source['channelAccount']?.toString() ?? source['channelAccountId']?.toString() ?? 'default';
    if (home == null || sourceId == null) return;
    await home.removeSourceBinding(
      channel: channel,
      channelAccount: channelAccount,
      sourceId: sourceId,
    );
    await _reload();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final enabled = _status?['enabled'] == true;
    final ready = _status?['ready'] == true;
    final healthy = _status?['healthy'] == true;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Wrap(
          spacing: 8,
          children: [
            Chip(label: Text(enabled ? l10n.connEnabled : l10n.connDisabled)),
            if (ready) Chip(label: Text(l10n.connReady)),
            Chip(label: Text(healthy ? l10n.connHealthy : l10n.connUnhealthy)),
          ],
        ),
        if (_error != null)
          Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
        const SizedBox(height: 12),
        TextField(
          controller: _urlCtrl,
          decoration: InputDecoration(
            labelText: widget.channelId == 'homeassistant'
                ? l10n.connHaUrl
                : l10n.connMqttUrl,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _tokenCtrl,
          obscureText: true,
          decoration: InputDecoration(
            labelText: widget.channelId == 'homeassistant'
                ? l10n.connHaToken
                : l10n.connMqttPassword,
          ),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _busy ? null : _saveEnable,
          child: Text(l10n.connSaveEnable),
        ),
        const SizedBox(height: 20),
        Text(l10n.connBindTitle, style: theme.textTheme.titleMedium),
        ..._sources.map((s) {
          final bound = s['bound'] == true;
          final name = s['name']?.toString() ??
              s['objectId']?.toString() ??
              s['sourceId']?.toString() ??
              '?';
          return Card(
            child: ListTile(
              title: Text(name),
              subtitle: Text(
                bound
                    ? l10n.connBoundTo(s['accountId']?.toString() ?? '')
                    : l10n.connUnbound,
              ),
              trailing: bound
                  ? IconButton(
                      icon: const Icon(Icons.link_off),
                      onPressed: _busy ? null : () => _unbind(s),
                    )
                  : IconButton(
                      icon: const Icon(Icons.link),
                      onPressed: _busy ? null : () => _bind(s),
                    ),
              onLongPress: bound
                  ? () => _bind(s, neverUnattended: true)
                  : null,
            ),
          );
        }),
        if (_busy) const LinearProgressIndicator(),
      ],
    );
  }
}

class _ImChannelsTab extends StatefulWidget {
  const _ImChannelsTab({required this.session});
  final SessionController session;

  @override
  State<_ImChannelsTab> createState() => _ImChannelsTabState();
}

class _ImChannelsTabState extends State<_ImChannelsTab> {
  static const _ids = [
    'telegram',
    'discord',
    'slack',
    'feishu',
    'dingtalk',
    'wecom',
  ];
  final _tokenCtrls = {for (final id in _ids) id: TextEditingController()};
  final _senderCtrl = TextEditingController();
  final _channelAccountCtrl = TextEditingController(text: 'default');
  String _bindChannel = 'telegram';
  final _status = <String, Map<String, dynamic>>{};
  List<Map<String, dynamic>> _bindings = [];
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    unawaited(_reload());
  }

  @override
  void dispose() {
    for (final c in _tokenCtrls.values) {
      c.dispose();
    }
    _senderCtrl.dispose();
    _channelAccountCtrl.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    final home = widget.session.session;
    if (home == null) return;
    for (final id in _ids) {
      try {
        _status[id] = await home.getChannelStatus(id: id);
      } catch (_) {
        // channel may be unavailable
      }
    }
    try {
      final body = await home.listBindings(
        accountId: widget.session.accountId,
      );
      final raw = body['bindings'];
      final list = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final b in raw) {
          if (b is Map) list.add(Map<String, dynamic>.from(b));
        }
      }
      _bindings = list;
    } catch (_) {
      _bindings = [];
    }
    if (mounted) setState(() {});
  }

  Future<void> _enable(String id) async {
    final home = widget.session.session;
    if (home == null) return;
    setState(() => _busy = true);
    try {
      final token = _tokenCtrls[id]!.text.trim();
      if (token.isNotEmpty) {
        await home.setChannelConfig(
          id: id,
          secrets: {'botToken': token},
        );
      }
      await home.enableChannel(id: id);
      await _reload();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _disable(String id) async {
    final home = widget.session.session;
    if (home == null) return;
    setState(() => _busy = true);
    try {
      await home.disableChannel(id: id);
      await _reload();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _bindSender() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    final senderId = _senderCtrl.text.trim();
    if (home == null || accountId == null || senderId.isEmpty) return;
    setState(() => _busy = true);
    try {
      await home.setBinding(
        channel: _bindChannel,
        channelAccount: _channelAccountCtrl.text.trim().isEmpty
            ? 'default'
            : _channelAccountCtrl.text.trim(),
        senderId: senderId,
        accountId: accountId,
      );
      _senderCtrl.clear();
      await _reload();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(l10n.connChannelsHint, style: theme.textTheme.bodySmall),
        if (_error != null)
          Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
        ..._ids.map((id) {
          final st = _status[id];
          final enabled = st?['enabled'] == true;
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(id, style: theme.textTheme.titleSmall),
                  Text(
                    enabled ? l10n.connEnabled : l10n.connDisabled,
                    style: theme.textTheme.bodySmall,
                  ),
                  TextField(
                    controller: _tokenCtrls[id],
                    obscureText: true,
                    decoration: InputDecoration(labelText: l10n.connBotToken),
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      if (enabled)
                        TextButton(
                          onPressed: _busy ? null : () => _disable(id),
                          child: Text(l10n.connDisable),
                        ),
                      FilledButton(
                        onPressed: _busy ? null : () => _enable(id),
                        child: Text(l10n.connSaveEnable),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        }),
        const SizedBox(height: 16),
        Text(l10n.connSenderBinds, style: theme.textTheme.titleMedium),
        Text(l10n.connSenderBindsHint, style: theme.textTheme.bodySmall),
        DropdownButtonFormField<String>(
          value: _bindChannel,
          items: [
            for (final id in _ids)
              DropdownMenuItem(value: id, child: Text(id)),
          ],
          onChanged: (v) {
            if (v != null) setState(() => _bindChannel = v);
          },
          decoration: InputDecoration(labelText: l10n.connBindChannel),
        ),
        TextField(
          controller: _channelAccountCtrl,
          decoration: InputDecoration(labelText: l10n.connChannelAccount),
        ),
        TextField(
          controller: _senderCtrl,
          decoration: InputDecoration(labelText: l10n.connSenderId),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton.tonal(
            onPressed: _busy ? null : _bindSender,
            child: Text(l10n.connBindSender),
          ),
        ),
        ..._bindings.map((b) {
          final bindingId = b['bindingId']?.toString() ?? b['id']?.toString() ?? '';
          return ListTile(
            title: Text(
              '${b['channel'] ?? '?'} · ${b['senderId'] ?? b['externalUserId'] ?? '?'}',
            ),
            subtitle: Text(
              '→ ${b['accountId'] ?? ''} · ${b['channelAccount'] ?? ''}',
            ),
            trailing: IconButton(
              icon: const Icon(Icons.link_off),
              onPressed: bindingId.isEmpty || _busy
                  ? null
                  : () async {
                      await widget.session.session
                          ?.removeBinding(bindingId: bindingId);
                      await _reload();
                    },
            ),
          );
        }),
      ],
    );
  }
}
