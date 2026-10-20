import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';

/// Connections: Pairing | HA | MQTT | Channels | Web search | Browser.
class ConnectionsScreen extends StatelessWidget {
  const ConnectionsScreen({super.key, required this.session});

  final SessionController session;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return DefaultTabController(
      length: 6,
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
              Tab(text: l10n.connTabWebSearch),
              Tab(text: l10n.connTabBrowser),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _PairingTab(session: session),
            _ChannelConfigTab(session: session, channelId: 'homeassistant'),
            _ChannelConfigTab(session: session, channelId: 'mqtt'),
            _ImChannelsTab(session: session),
            _WebSearchTab(session: session),
            _BrowserControlTab(session: session),
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
  List<Map<String, dynamic>> _accounts = [];
  String? _ownerAccountId;
  String? _lastMintUri;
  String? _error;
  bool _busy = false;

  bool get _isOwnerDevice {
    final owner = _ownerAccountId;
    if (owner == null || owner.isEmpty) return false;
    final raw = widget.session.hello?['accountIds'];
    if (raw is! List) return false;
    final ids = raw.map((e) => e.toString()).where((s) => s.isNotEmpty).toList();
    return ids.length == 1 && ids.first == owner;
  }

  @override
  void initState() {
    super.initState();
    unawaited(_reload());
  }

  Future<void> _reload() async {
    final home = widget.session.session;
    if (home == null) return;
    try {
      String? ownerId;
      try {
        final own = await home.getHouseholdOwner();
        ownerId = own['ownerAccountId']?.toString();
      } catch (_) {}

      final accounts = <Map<String, dynamic>>[];
      try {
        final listed = await home.listAccounts();
        final ar = listed['accounts'];
        if (ar is List) {
          for (final a in ar) {
            if (a is Map) accounts.add(Map<String, dynamic>.from(a));
          }
        }
      } catch (_) {}

      // listPairedDevices is Owner-scope — members skip without treating as error.
      final helloIds = widget.session.hello?['accountIds'];
      final isOwner = ownerId != null &&
          helloIds is List &&
          helloIds.length == 1 &&
          helloIds.first.toString() == ownerId;

      final list = <Map<String, dynamic>>[];
      if (isOwner) {
        try {
          final body = await home.listPairedDevices();
          final raw = body['devices'] ?? body['pairedDevices'];
          if (raw is List) {
            for (final d in raw) {
              if (d is Map) list.add(Map<String, dynamic>.from(d));
            }
          }
        } catch (e) {
          if (mounted) setState(() => _error = '$e');
          return;
        }
      }

      if (mounted) {
        setState(() {
          _devices = list;
          _accounts = accounts;
          _ownerAccountId = ownerId;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _mint() async {
    final l10n = AppLocalizations.of(context);
    final home = widget.session.session;
    if (home == null) return;
    // Default exclusive Owner bind for household admin phones.
    final accountIds = _ownerAccountId != null ? [_ownerAccountId!] : <String>[];
    setState(() => _busy = true);
    try {
      final res = await home.mintPairing(
        deviceLabel: 'Phone',
        accountIds: accountIds.isEmpty ? null : accountIds,
        fresh: true,
      );
      final uri = res['uri']?.toString();
      if (mounted) {
        setState(() => _lastMintUri = uri);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.connMintOk)),
        );
      }
      await _reload();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _revoke(String deviceId) async {
    final l10n = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.connRevokeDevice),
        content: Text(l10n.connRevokeConfirm(deviceId)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.shellCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.connRevokeDevice),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final home = widget.session.session;
    if (home == null) return;
    try {
      await home.revokePairedDevice(deviceId: deviceId);
      await _reload();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _forget(String deviceId) async {
    final l10n = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.connForgetDevice),
        content: Text(l10n.connForgetConfirm(deviceId)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.shellCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.connForgetDevice),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final home = widget.session.session;
    if (home == null) return;
    try {
      await home.forgetPairedDevice(deviceId: deviceId);
      await _reload();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(l10n.connPairingHint, style: theme.textTheme.bodySmall),
          if (_isOwnerDevice) ...[
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _busy ? null : _mint,
              icon: const Icon(Icons.qr_code_2),
              label: Text(l10n.connMintPairing),
            ),
            if (_lastMintUri != null) ...[
              const SizedBox(height: 8),
              SelectableText(
                _lastMintUri!,
                style: theme.textTheme.bodySmall?.copyWith(fontFamily: 'monospace'),
              ),
              Text(
                l10n.connMintUriHint,
                style: theme.textTheme.labelSmall,
              ),
            ],
          ] else ...[
            const SizedBox(height: 8),
            Text(
              l10n.connPairingOwnerOnly,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.62),
              ),
            ),
          ],
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                _error!,
                style: TextStyle(color: theme.colorScheme.error),
              ),
            ),
          const SizedBox(height: 12),
          ..._devices.map(
            (d) {
              final id = d['deviceId']?.toString() ?? d['id']?.toString() ?? '?';
              final revoked = d['revoked'] == true;
              return ListTile(
                title: Text(d['label']?.toString() ?? id),
                subtitle: Text(
                  '$id · ${d['accountIds'] ?? d['accounts'] ?? ''}'
                  '${revoked ? ' · revoked' : ''}',
                ),
                trailing: _isOwnerDevice
                    ? PopupMenuButton<String>(
                        onSelected: (v) {
                          if (v == 'revoke') unawaited(_revoke(id));
                          if (v == 'forget') unawaited(_forget(id));
                        },
                        itemBuilder: (_) => [
                          if (!revoked)
                            PopupMenuItem(
                              value: 'revoke',
                              child: Text(l10n.connRevokeDevice),
                            ),
                          PopupMenuItem(
                            value: 'forget',
                            child: Text(l10n.connForgetDevice),
                          ),
                        ],
                      )
                    : null,
              );
            },
          ),
          if (_devices.isEmpty)
            Text(l10n.connNoDevices, style: theme.textTheme.bodySmall),
          if (_accounts.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(l10n.connAccountsHint, style: theme.textTheme.labelMedium),
            ..._accounts.map(
              (a) => Text(
                '· ${a['displayName'] ?? a['accountId']}',
                style: theme.textTheme.bodySmall,
              ),
            ),
          ],
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
  String? _ownerAccountId;
  String? _error;
  bool _busy = false;

  bool get _isOwnerDevice {
    final owner = _ownerAccountId;
    if (owner == null || owner.isEmpty) return false;
    final raw = widget.session.hello?['accountIds'];
    if (raw is! List) return false;
    return raw.length == 1 && raw.first.toString() == owner;
  }

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
      try {
        final own = await home.getHouseholdOwner();
        _ownerAccountId = own['ownerAccountId']?.toString();
      } catch (_) {
        _ownerAccountId = null;
      }
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
        if (!_isOwnerDevice)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              l10n.connOwnerWriteOnly,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.62),
              ),
            ),
          ),
        TextField(
          controller: _urlCtrl,
          readOnly: !_isOwnerDevice,
          decoration: InputDecoration(
            labelText: widget.channelId == 'homeassistant'
                ? l10n.connHaUrl
                : l10n.connMqttUrl,
          ),
        ),
        const SizedBox(height: 8),
        if (_isOwnerDevice)
          TextField(
            controller: _tokenCtrl,
            obscureText: true,
            decoration: InputDecoration(
              labelText: widget.channelId == 'homeassistant'
                  ? l10n.connHaToken
                  : l10n.connMqttPassword,
            ),
          ),
        if (_isOwnerDevice) ...[
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _busy ? null : _saveEnable,
            child: Text(l10n.connSaveEnable),
          ),
        ],
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
              trailing: !_isOwnerDevice
                  ? null
                  : bound
                      ? IconButton(
                          icon: const Icon(Icons.link_off),
                          onPressed: _busy ? null : () => _unbind(s),
                        )
                      : IconButton(
                          icon: const Icon(Icons.link),
                          onPressed: _busy ? null : () => _bind(s),
                        ),
              onLongPress: !_isOwnerDevice || !bound
                  ? null
                  : () => _bind(s, neverUnattended: true),
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
  String? _ownerAccountId;
  String? _error;
  bool _busy = false;

  bool get _isOwnerDevice {
    final owner = _ownerAccountId;
    if (owner == null || owner.isEmpty) return false;
    final raw = widget.session.hello?['accountIds'];
    if (raw is! List) return false;
    final ids = raw.map((e) => e.toString()).where((s) => s.isNotEmpty).toList();
    return ids.length == 1 && ids.first == owner;
  }

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
    String? ownerId;
    try {
      final own = await home.getHouseholdOwner();
      ownerId = own['ownerAccountId']?.toString();
    } catch (_) {}
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
    if (mounted) {
      setState(() {
        _ownerAccountId = ownerId;
      });
    }
  }

  Future<void> _enable(String id) async {
    if (!_isOwnerDevice) return;
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
    if (!_isOwnerDevice) return;
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
    if (!_isOwnerDevice) return;
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
        if (!_isOwnerDevice) ...[
          const SizedBox(height: 8),
          Text(
            l10n.connOwnerWriteOnly,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.62),
            ),
          ),
        ],
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
                  if (_isOwnerDevice)
                    TextField(
                      controller: _tokenCtrls[id],
                      obscureText: true,
                      decoration: InputDecoration(labelText: l10n.connBotToken),
                    ),
                  if (_isOwnerDevice)
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
        if (_isOwnerDevice) ...[
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
        ],
        ..._bindings.map((b) {
          final bindingId = b['bindingId']?.toString() ?? b['id']?.toString() ?? '';
          return ListTile(
            title: Text(
              '${b['channel'] ?? '?'} · ${b['senderId'] ?? b['externalUserId'] ?? '?'}',
            ),
            subtitle: Text(
              '→ ${b['accountId'] ?? ''} · ${b['channelAccount'] ?? ''}',
            ),
            trailing: !_isOwnerDevice
                ? null
                : IconButton(
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

class _WebSearchTab extends StatefulWidget {
  const _WebSearchTab({required this.session});
  final SessionController session;

  @override
  State<_WebSearchTab> createState() => _WebSearchTabState();
}

class _WebSearchTabState extends State<_WebSearchTab> {
  bool _enabled = true;
  String _provider = 'duckduckgo';
  bool _hasApiKey = false;
  bool _ready = false;
  bool _browserFallback = false;
  bool _unattendedBrowser = false;
  String _browserRuntime = 'missing';
  String? _browserInstallHint;
  String? _unavailableReason;
  String? _error;
  bool _busy = false;
  bool _isOwnerDevice = false;
  final _apiKeyCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    unawaited(_reload());
  }

  @override
  void dispose() {
    _apiKeyCtrl.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    final home = widget.session.session;
    if (home == null) return;
    try {
      String? ownerId;
      try {
        final ow = await home.getHouseholdOwner();
        ownerId = ow['ownerAccountId']?.toString();
      } catch (_) {}
      final rawIds = widget.session.hello?['accountIds'];
      final ids = rawIds is List
          ? rawIds.map((e) => e.toString()).where((s) => s.isNotEmpty).toList()
          : <String>[];
      final isOwner =
          ownerId != null && ownerId.isNotEmpty && ids.length == 1 && ids.first == ownerId;
      final cfg = await home.getWebSearchConfig();
      if (!mounted) return;
      setState(() {
        _isOwnerDevice = isOwner;
        _enabled = cfg['enabled'] != false;
        _provider = cfg['provider']?.toString() ?? 'duckduckgo';
        _hasApiKey = cfg['hasApiKey'] == true;
        _ready = cfg['ready'] == true;
        _browserFallback = cfg['fallback']?.toString() == 'browser';
        _unattendedBrowser = cfg['unattendedBrowser'] == true;
        _browserRuntime = cfg['browserRuntime']?.toString() ?? 'missing';
        _browserInstallHint = cfg['browserInstallHint']?.toString();
        _unavailableReason = cfg['unavailableReason']?.toString();
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  Future<void> _save() async {
    final home = widget.session.session;
    final l10n = AppLocalizations.of(context);
    if (home == null || !_isOwnerDevice) return;
    setState(() => _busy = true);
    try {
      final key = _apiKeyCtrl.text.trim();
      await home.setWebSearchConfig(
        enabled: _enabled,
        provider: _provider,
        apiKey: key.isEmpty ? null : key,
        fallback: _browserFallback ? 'browser' : 'none',
        unattendedBrowser: _unattendedBrowser,
      );
      _apiKeyCtrl.clear();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.webSearchSaved)));
      await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.webSearchSaveFailed)),
      );
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final needsKey = _provider == 'brave' || _provider == 'tavily';
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(l10n.webSearchLede),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        if (!_isOwnerDevice) ...[
          const SizedBox(height: 12),
          Text(l10n.webSearchOwnerOnly),
        ],
        const SizedBox(height: 12),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(_ready ? l10n.webSearchReady : l10n.webSearchNotReady),
          subtitle: _unavailableReason == null || _unavailableReason!.isEmpty
              ? null
              : Text(_unavailableReason!),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(l10n.webSearchEnabled),
          value: _enabled,
          onChanged: !_isOwnerDevice || _busy
              ? null
              : (v) => setState(() => _enabled = v),
        ),
        const SizedBox(height: 8),
        Text(l10n.webSearchProvider),
        DropdownButtonFormField<String>(
          value: _provider,
          items: const [
            DropdownMenuItem(value: 'duckduckgo', child: Text('DuckDuckGo')),
            DropdownMenuItem(value: 'brave', child: Text('Brave')),
            DropdownMenuItem(value: 'tavily', child: Text('Tavily')),
          ],
          onChanged: !_isOwnerDevice || _busy
              ? null
              : (v) {
                  if (v != null) setState(() => _provider = v);
                },
        ),
        if (needsKey) ...[
          const SizedBox(height: 12),
          TextField(
            controller: _apiKeyCtrl,
            obscureText: true,
            enabled: _isOwnerDevice && !_busy,
            decoration: InputDecoration(
              labelText: l10n.webSearchApiKey + (_hasApiKey ? ' ✓' : ''),
              hintText: l10n.webSearchApiKeyHint,
            ),
          ),
        ],
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(l10n.webSearchBrowserFallback),
          subtitle: Text(l10n.webSearchBrowserFallbackHint),
          value: _browserFallback,
          onChanged: !_isOwnerDevice || _busy
              ? null
              : (v) => setState(() => _browserFallback = v),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(
            _browserRuntime == 'ready'
                ? l10n.webSearchBrowserReady
                : l10n.webSearchBrowserMissing,
          ),
        ),
        if (_browserFallback &&
            _browserRuntime != 'ready' &&
            (_browserInstallHint?.isNotEmpty ?? false)) ...[
          const SizedBox(height: 8),
          Text(l10n.webSearchInstallHintNote),
          const SizedBox(height: 8),
          SelectableText(
            _browserInstallHint!,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontFamily: 'monospace',
                ),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: _browserInstallHint!));
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(l10n.webSearchCopyHint)),
                );
              },
              child: Text(l10n.webSearchCopyHint),
            ),
          ),
        ],
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(l10n.webSearchUnattendedBrowser),
          value: _unattendedBrowser,
          onChanged: !_isOwnerDevice || _busy
              ? null
              : (v) => setState(() => _unattendedBrowser = v),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: !_isOwnerDevice || _busy ? null : _save,
          child: Text(l10n.webSearchSave),
        ),
      ],
    );
  }
}

class _BrowserControlTab extends StatefulWidget {
  const _BrowserControlTab({required this.session});
  final SessionController session;

  @override
  State<_BrowserControlTab> createState() => _BrowserControlTabState();
}

class _BrowserControlTabState extends State<_BrowserControlTab> {
  bool _enabled = false;
  bool _unattended = false;
  bool _ready = false;
  String _browserRuntime = 'missing';
  String _defaultProfile = 'managed';
  bool _personalEnabled = false;
  String _personalCdp = 'http://127.0.0.1:9222';
  bool _personalReady = false;
  bool _remoteEnabled = false;
  String _remoteCdpUrl = '';
  String _remoteToken = '';
  bool _hasRemoteToken = false;
  bool _remoteReady = false;
  bool _elevatedAck = false;
  String? _browserInstallHint;
  String? _unavailableReason;
  String? _error;
  bool _busy = false;
  bool _isOwnerDevice = false;

  @override
  void initState() {
    super.initState();
    unawaited(_reload());
  }

  Future<void> _reload() async {
    final home = widget.session.session;
    if (home == null) return;
    try {
      String? ownerId;
      try {
        final ow = await home.getHouseholdOwner();
        ownerId = ow['ownerAccountId']?.toString();
      } catch (_) {}
      final rawIds = widget.session.hello?['accountIds'];
      final ids = rawIds is List
          ? rawIds.map((e) => e.toString()).where((s) => s.isNotEmpty).toList()
          : <String>[];
      final isOwner =
          ownerId != null && ownerId.isNotEmpty && ids.length == 1 && ids.first == ownerId;
      if (!mounted) return;
      if (!isOwner) {
        setState(() {
          _isOwnerDevice = false;
          _error = null;
        });
        return;
      }
      final cfg = await home.getBrowserControlConfig();
      if (!mounted) return;
      setState(() {
        _isOwnerDevice = true;
        _enabled = cfg['enabled'] == true;
        _unattended = cfg['unattendedEnabled'] == true;
        _ready = cfg['ready'] == true;
        _browserRuntime = cfg['browserRuntime']?.toString() ?? 'missing';
        _defaultProfile = cfg['defaultProfile']?.toString() ?? 'managed';
        _personalEnabled = cfg['personalEnabled'] == true;
        _personalCdp =
            cfg['personalCdpEndpoint']?.toString() ?? 'http://127.0.0.1:9222';
        _personalReady = cfg['personalReady'] == true;
        _remoteEnabled = cfg['remoteEnabled'] == true;
        _remoteCdpUrl = cfg['remoteCdpUrl']?.toString() ?? '';
        _hasRemoteToken = cfg['hasRemoteToken'] == true;
        _remoteReady = cfg['remoteReady'] == true;
        _elevatedAck = cfg['elevatedAcknowledged'] == true;
        _browserInstallHint = cfg['browserInstallHint']?.toString();
        _unavailableReason = cfg['unavailableReason']?.toString();
        _remoteToken = '';
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  Future<void> _save() async {
    final home = widget.session.session;
    final l10n = AppLocalizations.of(context);
    if (home == null || !_isOwnerDevice) return;
    setState(() => _busy = true);
    try {
      await home.setBrowserControlConfig(
        enabled: _enabled,
        unattendedEnabled: _unattended,
        defaultProfile: _defaultProfile,
        personalEnabled: _personalEnabled,
        personalCdpEndpoint: _personalCdp,
        remoteEnabled: _remoteEnabled,
        remoteCdpUrl: _remoteCdpUrl,
        remoteToken: _remoteToken.isEmpty ? null : _remoteToken,
        acknowledgeElevated: _elevatedAck ? true : null,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.browserControlSaved)),
      );
      await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.browserControlSaveFailed)),
      );
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(l10n.browserControlLede),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        if (!_isOwnerDevice) ...[
          const SizedBox(height: 12),
          Text(l10n.browserControlOwnerOnly),
          const SizedBox(height: 16),
        ] else ...[
        const SizedBox(height: 12),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(_ready ? l10n.browserControlReady : l10n.browserControlNotReady),
          subtitle: Text(
            _unavailableReason?.isNotEmpty == true
                ? _unavailableReason!
                : (_browserRuntime == 'ready'
                    ? l10n.webSearchBrowserReady
                    : l10n.webSearchBrowserMissing),
          ),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(l10n.browserControlEnabled),
          value: _enabled,
          onChanged: _busy ? null : (v) => setState(() => _enabled = v),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(l10n.browserControlUnattended),
          value: _unattended,
          onChanged: _busy ? null : (v) => setState(() => _unattended = v),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(l10n.browserControlDefaultProfile),
          subtitle: DropdownButton<String>(
            isExpanded: true,
            value: _defaultProfile,
            items: [
              DropdownMenuItem(
                value: 'managed',
                child: Text(l10n.browserControlProfileManaged),
              ),
              DropdownMenuItem(
                value: 'personal',
                child: Text(l10n.browserControlProfilePersonal),
              ),
              DropdownMenuItem(
                value: 'remote',
                child: Text(l10n.browserControlProfileRemote),
              ),
            ],
            onChanged: _busy
                ? null
                : (v) {
                    if (v != null) setState(() => _defaultProfile = v);
                  },
          ),
        ),
        Text(l10n.browserControlElevatedWarn),
        if (_elevatedAck)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(l10n.browserControlAcknowledged),
          )
        else
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(l10n.browserControlAcknowledge),
            value: false,
            onChanged: _busy
                ? null
                : (v) {
                    if (v) setState(() => _elevatedAck = true);
                  },
          ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(l10n.browserControlPersonalEnabled),
          subtitle: Text(
            _personalReady
                ? l10n.browserControlPersonalReady
                : l10n.browserControlPersonalNotReady,
          ),
          value: _personalEnabled,
          onChanged: !_isOwnerDevice || _busy
              ? null
              : (v) => setState(() => _personalEnabled = v),
        ),
        TextFormField(
          key: ValueKey('personal-cdp-$_personalCdp'),
          enabled: _isOwnerDevice && !_busy,
          initialValue: _personalCdp,
          decoration: InputDecoration(labelText: l10n.browserControlPersonalCdp),
          onChanged: (v) => _personalCdp = v,
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(l10n.browserControlRemoteEnabled),
          subtitle: Text(
            _remoteReady
                ? l10n.browserControlRemoteReady
                : l10n.browserControlRemoteNotReady,
          ),
          value: _remoteEnabled,
          onChanged: !_isOwnerDevice || _busy
              ? null
              : (v) => setState(() => _remoteEnabled = v),
        ),
        TextFormField(
          key: ValueKey('remote-cdp-$_remoteCdpUrl'),
          enabled: _isOwnerDevice && !_busy,
          initialValue: _remoteCdpUrl,
          decoration: InputDecoration(labelText: l10n.browserControlRemoteCdp),
          onChanged: (v) => _remoteCdpUrl = v,
        ),
        TextFormField(
          enabled: _isOwnerDevice && !_busy,
          obscureText: true,
          initialValue: '',
          decoration: InputDecoration(
            labelText: _hasRemoteToken
                ? '${l10n.browserControlRemoteToken} (${l10n.browserControlTokenSet})'
                : l10n.browserControlRemoteToken,
            hintText: l10n.browserControlTokenPlaceholder,
          ),
          onChanged: (v) => _remoteToken = v,
        ),
        if (_browserRuntime != 'ready' &&
            (_browserInstallHint?.isNotEmpty ?? false)) ...[
          const SizedBox(height: 8),
          Text(l10n.webSearchInstallHintNote),
          const SizedBox(height: 8),
          SelectableText(
            _browserInstallHint!,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontFamily: 'monospace',
                ),
          ),
        ],
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: Text(l10n.browserControlSave),
        ),
        ], // owner-only form
      ],
    );
  }
}
