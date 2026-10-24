import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';
import 'artifacts_tab.dart';
import 'profiles_screen.dart';

/// System: Profiles | Files | Health | Grants | This machine (Design §10.1).
class SystemScreen extends StatelessWidget {
  const SystemScreen({super.key, required this.session});

  final SessionController session;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return DefaultTabController(
      length: 5,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.navSystem),
          bottom: TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: l10n.navProfiles),
              Tab(text: l10n.sysTabFiles),
              Tab(text: l10n.sysTabHealth),
              Tab(text: l10n.sysTabGrants),
              Tab(text: l10n.sysTabMachine),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            ProfilesScreen(session: session, embedded: true),
            ArtifactsTab(session: session),
            _DoctorTab(session: session),
            _GrantsTab(session: session),
            _ThisMachineTab(session: session),
          ],
        ),
      ),
    );
  }
}

class _ThisMachineTab extends StatefulWidget {
  const _ThisMachineTab({required this.session});
  final SessionController session;

  @override
  State<_ThisMachineTab> createState() => _ThisMachineTabState();
}

class _ThisMachineTabState extends State<_ThisMachineTab> {
  Map<String, dynamic>? _health;
  Map<String, dynamic>? _mesh;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    unawaited(_reload());
  }

  Future<void> _reload() async {
    final home = widget.session.session;
    if (home == null) return;
    setState(() => _busy = true);
    try {
      final health = await home.health();
      Map<String, dynamic>? mesh;
      try {
        mesh = await home.meshStatus();
      } catch (_) {
        mesh = null;
      }
      if (mounted) {
        setState(() {
          _health = health;
          _mesh = mesh;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _testPush() async {
    final home = widget.session.session;
    if (home == null) return;
    try {
      await home.sendTestPush(accountId: widget.session.accountId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context).sysTestPushSent)),
        );
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  String _fmtUptime(Object? sec) {
    final n = sec is num ? sec.toInt() : int.tryParse('$sec') ?? 0;
    if (n <= 0) return '—';
    final h = n ~/ 3600;
    final m = (n % 3600) ~/ 60;
    final s = n % 60;
    if (h > 0) return '${h}h ${m}m';
    if (m > 0) return '${m}m ${s}s';
    return '${s}s';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final h = _health;
    final ok = h != null && h['ok'] != false && _error == null;
    final publicUrl = h?['publicBaseUrl']?.toString() ?? '';
    final meshKind = _mesh?['kind']?.toString() ?? '—';

    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(l10n.sysMachineHint, style: theme.textTheme.bodySmall),
          const SizedBox(height: 12),
          if (_error != null)
            Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              Chip(
                avatar: Icon(
                  ok ? Icons.check_circle : Icons.error_outline,
                  size: 18,
                  color: ok ? theme.colorScheme.primary : theme.colorScheme.error,
                ),
                label: Text(ok ? l10n.sysMachineDaemonOk : l10n.sysMachineDaemonBad),
              ),
              FilledButton.tonal(
                onPressed: _busy ? null : _reload,
                child: Text(l10n.sysMachineRefresh),
              ),
              FilledButton.tonal(
                onPressed: _testPush,
                child: Text(l10n.sysTestPush),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _kv(l10n.sysMachineWsPort, '${h?['wsPort'] ?? '—'}'),
          _kv(l10n.sysMachineHttpPort, '${h?['httpPort'] ?? '—'}'),
          _kv(
            l10n.sysMachinePublicUrl,
            publicUrl.isEmpty ? l10n.sysMachinePublicUrlEmpty : publicUrl,
          ),
          _kv(l10n.sysMachineUptime, _fmtUptime(h?['uptimeSec'])),
          _kv(
            l10n.sysMachineConnections,
            '${h?['connections'] ?? '—'} / ${h?['activeTurns'] ?? '—'}',
          ),
          _kv(l10n.sysMachineMesh, meshKind),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(l10n.sysMachineOsServiceNote, style: theme.textTheme.bodySmall),
            ),
          ),
          if (_busy) const LinearProgressIndicator(),
        ],
      ),
    );
  }

  Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 140,
            child: Text(k, style: Theme.of(context).textTheme.bodySmall),
          ),
          Expanded(child: Text(v, style: const TextStyle(fontFamily: 'monospace'))),
        ],
      ),
    );
  }
}

class _DoctorTab extends StatefulWidget {
  const _DoctorTab({required this.session});
  final SessionController session;

  @override
  State<_DoctorTab> createState() => _DoctorTabState();
}

class _DoctorTabState extends State<_DoctorTab> {
  List<Map<String, dynamic>> _issues = [];
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    unawaited(_reload());
  }

  Future<void> _reload() async {
    final home = widget.session.session;
    if (home == null) return;
    setState(() => _busy = true);
    try {
      final body = await home.doctor();
      final raw = body['issues'] ?? body['checks'];
      final list = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final i in raw) {
          if (i is Map) list.add(Map<String, dynamic>.from(i));
        }
      }
      if (mounted) {
        setState(() {
          _issues = list;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _testPush() async {
    final home = widget.session.session;
    if (home == null) return;
    try {
      await home.sendTestPush(accountId: widget.session.accountId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context).sysTestPushSent)),
        );
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _fix(String? issueId) async {
    final home = widget.session.session;
    if (home == null) return;
    final ids = issueId != null
        ? [issueId]
        : _issues
            .map((i) => i['id']?.toString() ?? i['code']?.toString())
            .whereType<String>()
            .where((s) => s.isNotEmpty)
            .toList();
    if (ids.isEmpty) return;
    setState(() => _busy = true);
    try {
      final res = await home.doctorFix(issueIds: ids);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              AppLocalizations.of(context).sysDoctorFixed(
                '${res['fixed'] ?? []}',
              ),
            ),
          ),
        );
      }
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
    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null)
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          Wrap(
            spacing: 8,
            children: [
              FilledButton.tonal(
                onPressed: _testPush,
                child: Text(l10n.sysTestPush),
              ),
              if (_issues.isNotEmpty)
                FilledButton(
                  onPressed: _busy ? null : () => _fix(null),
                  child: Text(l10n.sysDoctorFixAll),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (_issues.isEmpty && !_busy)
            Text(l10n.sysNoIssues, style: Theme.of(context).textTheme.bodySmall),
          ..._issues.map((i) {
            final id = i['id']?.toString() ?? i['code']?.toString() ?? '';
            final fixable = i['fixable'] != false;
            return ListTile(
              title: Text(id.isEmpty ? '?' : id),
              subtitle: Text(
                i['message']?.toString() ?? i['detail']?.toString() ?? '',
              ),
              trailing: fixable && id.isNotEmpty
                  ? TextButton(
                      onPressed: _busy ? null : () => _fix(id),
                      child: Text(l10n.sysDoctorFix),
                    )
                  : null,
            );
          }),
          if (_busy) const LinearProgressIndicator(),
        ],
      ),
    );
  }
}

class _GrantsTab extends StatefulWidget {
  const _GrantsTab({required this.session});
  final SessionController session;

  @override
  State<_GrantsTab> createState() => _GrantsTabState();
}

class _GrantsTabState extends State<_GrantsTab> {
  List<Map<String, dynamic>> _grants = [];
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
      final body = await home.listGrants(accountId: widget.session.accountId);
      final raw = body['grants'];
      final list = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final g in raw) {
          if (g is Map) list.add(Map<String, dynamic>.from(g));
        }
      }
      if (mounted) setState(() => _grants = list);
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
          if (_error != null)
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          if (_grants.isEmpty)
            Text(l10n.sysNoGrants, style: Theme.of(context).textTheme.bodySmall),
          ..._grants.map((g) {
            final id = g['id']?.toString() ?? '';
            return ListTile(
              title: Text(g['tool']?.toString() ?? id),
              subtitle: Text(g['scope']?.toString() ?? ''),
              trailing: IconButton(
                icon: const Icon(Icons.delete_outline),
                onPressed: id.isEmpty
                    ? null
                    : () async {
                        await widget.session.session?.revokeGrant(id: id);
                        await _reload();
                      },
              ),
            );
          }),
        ],
      ),
    );
  }
}
