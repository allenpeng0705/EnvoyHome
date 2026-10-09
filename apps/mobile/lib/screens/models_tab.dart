import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:flutter/material.dart';

import '../state/session_controller.dart';

/// Models status + owner Local/Ollama controls (Design §8.5 / §10.1).
///
/// Member devices see read-only routing. Owner-trusted devices can enable Local.
class ModelsTab extends StatefulWidget {
  const ModelsTab({super.key, required this.session});

  final SessionController session;

  @override
  State<ModelsTab> createState() => _ModelsTabState();
}

class _ModelsTabState extends State<ModelsTab> {
  Map<String, dynamic>? _providers;
  Map<String, dynamic>? _local;
  String? _error;
  String? _note;
  bool _loading = false;
  bool _busy = false;
  bool _ownerScope = false;

  @override
  void initState() {
    super.initState();
    widget.session.addListener(_onSession);
    _reload();
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSession);
    super.dispose();
  }

  void _onSession() {
    if (mounted) _reload();
  }

  EnvoyHomeSession? get _home => widget.session.session;

  Future<void> _reload() async {
    final home = _home;
    final accountId = widget.session.accountId;
    if (home == null) {
      setState(() {
        _providers = null;
        _local = null;
        _error = 'Not connected';
        _ownerScope = false;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _note = null;
    });
    try {
      Map<String, dynamic>? local;
      var owner = false;
      try {
        local = await home.getLocalEngineStatus();
        owner = true;
      } catch (_) {
        local = null;
        owner = false;
      }
      Map<String, dynamic>? providers;
      if (accountId != null && accountId.isNotEmpty) {
        providers = await home.listProviders(accountId: accountId);
      }
      if (!mounted) return;
      setState(() {
        _local = local;
        _providers = providers;
        _ownerScope = owner;
        _loading = false;
        if (accountId == null || accountId.isEmpty) {
          _note = 'Set accountId to see default model and pool.';
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _run(
    Future<Map<String, dynamic>> Function(EnvoyHomeSession home) op, {
    String? okNote,
  }) async {
    final home = _home;
    if (home == null) return;
    setState(() {
      _busy = true;
      _error = null;
      _note = null;
    });
    try {
      await op(home);
      if (!mounted) return;
      setState(() => _note = okNote ?? 'Updated');
      await _reload();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _modeLabel(String? mode) {
    switch (mode) {
      case 'attach':
        return 'Mesh Local';
      case 'spawn':
        return 'Home llama-server';
      case 'ollama':
        return 'Ollama';
      default:
        return 'Off';
    }
  }

  @override
  Widget build(BuildContext context) {
    final accountId = widget.session.accountId;
    final theme = Theme.of(context);
    final local = _local;
    final enabled = local?['enabled'] == true;
    final mode = local?['mode']?.toString() ?? 'off';
    final healthy = local?['healthy'] == true;
    final ggufs =
        (local?['modelsOnDisk'] as List?)?.map((e) => e.toString()).toList() ??
            [];
    final defaultId = _providers?['defaultProviderId']?.toString();
    final filter = _providers?['placementFilter']?.toString() ?? 'any';
    final providerRows = (_providers?['providers'] as List?) ?? const [];

    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Models', style: theme.textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(
            _ownerScope
                ? 'Enable Local or Ollama on the home machine. Prefer Desktop for first setup.'
                : 'Read-only on this device. Use Desktop Settings → Models (or an owner-trusted phone) to enable Local.',
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          if (_loading) const LinearProgressIndicator(),
          if (_error != null) ...[
            Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
            const SizedBox(height: 8),
          ],
          if (_note != null) ...[
            Text(_note!, style: theme.textTheme.bodySmall),
            const SizedBox(height: 8),
          ],
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Local model', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 8),
                  if (!_ownerScope)
                    Text(
                      'Local engine status needs an owner-trusted device.',
                      style: theme.textTheme.bodySmall,
                    )
                  else ...[
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        Chip(
                          label: Text(_modeLabel(mode)),
                          visualDensity: VisualDensity.compact,
                        ),
                        Chip(
                          label: Text(
                            enabled
                                ? (healthy ? 'responding' : 'not responding')
                                : 'disabled',
                          ),
                          visualDensity: VisualDensity.compact,
                        ),
                      ],
                    ),
                    if (local?['hint'] != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          '${local!['hint']}',
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                    if (ggufs.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text('GGUF on disk', style: theme.textTheme.labelLarge),
                      ...ggufs.map(
                        (n) => Text('· $n', style: theme.textTheme.bodySmall),
                      ),
                    ],
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        FilledButton(
                          onPressed: _busy
                              ? null
                              : () => _run(
                                    (h) => h.enableLocalEngine(
                                      accountId: accountId,
                                      prefer: 'auto',
                                    ),
                                    okNote: 'Local enabled',
                                  ),
                          child: const Text('Enable Local'),
                        ),
                        FilledButton.tonal(
                          onPressed: _busy
                              ? null
                              : () => _run(
                                    (h) => h.enableOllama(accountId: accountId),
                                    okNote: 'Ollama enabled',
                                  ),
                          child: const Text('Use Ollama'),
                        ),
                        OutlinedButton(
                          onPressed: !_busy && enabled
                              ? () => _run(
                                    (h) => h.disableLocalEngine(),
                                    okNote: 'Local disabled',
                                  )
                              : null,
                          child: const Text('Disable'),
                        ),
                        if (accountId != null &&
                            accountId.isNotEmpty &&
                            enabled)
                          FilledButton.tonal(
                            onPressed: _busy
                                ? null
                                : () => _run((h) async {
                                      await h.setPlacementFilter(
                                        accountId: accountId,
                                        filter: 'local',
                                      );
                                      final pid = mode == 'ollama'
                                          ? 'ollama'
                                          : 'envoyhome-local';
                                      await h.setDefaultProvider(
                                        accountId: accountId,
                                        providerId: pid,
                                      );
                                      return {'ok': true};
                                    }, okNote: 'Local-only routing set'),
                            child: const Text('Local-only for account'),
                          ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('This account', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 8),
                  if (accountId == null || accountId.isEmpty)
                    Text(
                      'Set accountId above.',
                      style: theme.textTheme.bodySmall,
                    )
                  else ...[
                    Text(
                      'Default: ${defaultId ?? '—'}',
                      style: theme.textTheme.bodyMedium,
                    ),
                    Text('Pool: $filter', style: theme.textTheme.bodyMedium),
                    const SizedBox(height: 8),
                    ...providerRows.whereType<Map>().map((raw) {
                      final p = Map<String, dynamic>.from(raw);
                      final id = p['id']?.toString() ?? '?';
                      final label = p['label']?.toString() ?? id;
                      final on = p['enabled'] == true;
                      final isDefault = id == defaultId;
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        title: Text(label),
                        subtitle: Text(
                          '${p['kind']} · ${p['placement'] ?? ''} · ${p['model'] ?? ''}',
                        ),
                        trailing: Text(
                          [
                            if (isDefault) 'default',
                            if (!on) 'off',
                          ].join(' · '),
                          style: theme.textTheme.labelSmall,
                        ),
                      );
                    }),
                  ],
                ],
              ),
            ),
          ),
          if (_busy) ...[
            const SizedBox(height: 16),
            const Center(child: CircularProgressIndicator()),
          ],
        ],
      ),
    );
  }
}
