import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';
import 'artifacts_tab.dart';
import 'profiles_screen.dart';

/// System: Profiles | Shared files | Health | Grants (Design §10.1).
class SystemScreen extends StatelessWidget {
  const SystemScreen({super.key, required this.session});

  final SessionController session;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return DefaultTabController(
      length: 4,
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
            ],
          ),
        ),
        body: TabBarView(
          children: [
            ProfilesScreen(session: session, embedded: true),
            ArtifactsTab(session: session),
            _DoctorTab(session: session),
            _GrantsTab(session: session),
          ],
        ),
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
