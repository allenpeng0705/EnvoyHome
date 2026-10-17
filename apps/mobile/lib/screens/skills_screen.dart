import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';
import 'workflow_editor_page.dart';

/// Skills | Workflows | Schedules.
class SkillsScreen extends StatelessWidget {
  const SkillsScreen({super.key, required this.session});

  final SessionController session;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.navSkills),
          bottom: TabBar(
            tabs: [
              Tab(text: l10n.skillsTabSkills),
              Tab(text: l10n.skillsTabWorkflows),
              Tab(text: l10n.skillsTabSchedules),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _SkillsListTab(session: session),
            _WorkflowsTab(session: session),
            _SchedulesTab(session: session),
          ],
        ),
      ),
    );
  }
}

class _SkillsListTab extends StatefulWidget {
  const _SkillsListTab({required this.session});
  final SessionController session;

  @override
  State<_SkillsListTab> createState() => _SkillsListTabState();
}

class _SkillsListTabState extends State<_SkillsListTab> {
  final _urlCtrl = TextEditingController();
  final _queryCtrl = TextEditingController();
  List<Map<String, dynamic>> _skills = [];
  List<Map<String, dynamic>> _search = [];
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
    _queryCtrl.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    final home = widget.session.session;
    if (home == null) return;
    try {
      final body = await home.listSkills();
      final raw = body['skills'];
      final list = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final s in raw) {
          if (s is Map) list.add(Map<String, dynamic>.from(s));
        }
      }
      if (mounted) setState(() => _skills = list);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _installUrl() async {
    final home = widget.session.session;
    final url = _urlCtrl.text.trim();
    if (home == null || url.isEmpty) return;
    setState(() => _busy = true);
    try {
      await home.installSkill(source: 'url', ref: url);
      _urlCtrl.clear();
      await _reload();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _searchClaw() async {
    final home = widget.session.session;
    final q = _queryCtrl.text.trim();
    if (home == null || q.isEmpty) return;
    setState(() => _busy = true);
    try {
      final body = await home.searchClawHubSkills(query: q);
      final raw = body['skills'] ?? body['results'];
      final list = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final s in raw) {
          if (s is Map) list.add(Map<String, dynamic>.from(s));
        }
      }
      if (mounted) setState(() => _search = list);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
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
        if (_error != null)
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        TextField(
          controller: _urlCtrl,
          decoration: InputDecoration(labelText: l10n.skillsInstallUrl),
        ),
        FilledButton(
          onPressed: _busy ? null : _installUrl,
          child: Text(l10n.skillsInstall),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _queryCtrl,
          decoration: InputDecoration(labelText: l10n.skillsClawHubSearch),
          onSubmitted: (_) => _searchClaw(),
        ),
        TextButton(onPressed: _busy ? null : _searchClaw, child: Text(l10n.llmSearch)),
        ..._search.map(
          (s) => ListTile(
            title: Text(s['name']?.toString() ?? s['id']?.toString() ?? '?'),
            trailing: IconButton(
              icon: const Icon(Icons.download),
              onPressed: _busy
                  ? null
                  : () async {
                      final ref = s['ref']?.toString() ??
                          s['slug']?.toString() ??
                          s['id']?.toString();
                      if (ref == null) return;
                      await widget.session.session
                          ?.installSkill(source: 'clawhub', ref: ref);
                      await _reload();
                    },
            ),
          ),
        ),
        const Divider(),
        ..._skills.map((s) {
          final id = s['id']?.toString() ?? '';
          return ListTile(
            title: Text(s['name']?.toString() ?? id),
            subtitle: Text(s['description']?.toString() ?? ''),
            trailing: Wrap(
              children: [
                IconButton(
                  tooltip: l10n.skillsVerify,
                  icon: const Icon(Icons.verified_outlined),
                  onPressed: id.isEmpty
                      ? null
                      : () async {
                          try {
                            final r = await widget.session.session
                                ?.verifySkill(id: id);
                            if (!mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  r?['ok'] == true
                                      ? l10n.skillsVerified
                                      : '${r?['findings'] ?? r}',
                                ),
                              ),
                            );
                          } catch (e) {
                            if (!mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('$e')),
                            );
                          }
                        },
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline),
                  onPressed: id.isEmpty
                      ? null
                      : () async {
                          await widget.session.session?.removeSkill(id: id);
                          await _reload();
                        },
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}

class _WorkflowsTab extends StatefulWidget {
  const _WorkflowsTab({required this.session});
  final SessionController session;

  @override
  State<_WorkflowsTab> createState() => _WorkflowsTabState();
}

class _WorkflowsTabState extends State<_WorkflowsTab> {
  List<Map<String, dynamic>> _items = [];
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
      final body = await home.listWorkflows(
        accountId: widget.session.accountId,
      );
      final raw = body['workflows'];
      final list = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final w in raw) {
          if (w is Map) list.add(Map<String, dynamic>.from(w));
        }
      }
      if (mounted) setState(() => _items = list);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _reload,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_error != null)
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ..._items.map((w) {
              final id = w['id']?.toString() ?? '';
              final enabled = w['enabled'] == true;
              return ListTile(
                title: Text(w['name']?.toString() ?? id),
                subtitle: Text(enabled ? l10n.connEnabled : l10n.connDisabled),
                onTap: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => WorkflowEditorPage(
                        session: widget.session,
                        workflowId: id,
                      ),
                    ),
                  );
                  await _reload();
                },
                trailing: Wrap(
                  children: [
                    IconButton(
                      tooltip: enabled ? l10n.wfDisable : l10n.wfEnable,
                      icon: Icon(
                        enabled ? Icons.toggle_on : Icons.toggle_off_outlined,
                      ),
                      onPressed: id.isEmpty
                          ? null
                          : () async {
                              await widget.session.session?.setWorkflowEnabled(
                                id: id,
                                enabled: !enabled,
                              );
                              await _reload();
                            },
                    ),
                    IconButton(
                      icon: const Icon(Icons.play_arrow),
                      onPressed: id.isEmpty
                          ? null
                          : () => widget.session.session?.runWorkflow(
                                id: id,
                                accountId: widget.session.accountId,
                              ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete_outline),
                      onPressed: id.isEmpty
                          ? null
                          : () async {
                              await widget.session.session
                                  ?.removeWorkflow(id: id);
                              await _reload();
                            },
                    ),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => WorkflowEditorPage(session: widget.session),
            ),
          );
          await _reload();
        },
        child: const Icon(Icons.add),
      ),
    );
  }
}

class _SchedulesTab extends StatefulWidget {
  const _SchedulesTab({required this.session});
  final SessionController session;

  @override
  State<_SchedulesTab> createState() => _SchedulesTabState();
}

class _SchedulesTabState extends State<_SchedulesTab> {
  final _whenCtrl = TextEditingController();
  final _msgCtrl = TextEditingController();
  final _workflowIdCtrl = TextEditingController();
  final _toolNameCtrl = TextEditingController();
  List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>> _workflows = [];
  Map<String, dynamic>? _proposal;
  String _payloadKind = 'notify';
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    unawaited(_reload());
  }

  @override
  void dispose() {
    _whenCtrl.dispose();
    _msgCtrl.dispose();
    _workflowIdCtrl.dispose();
    _toolNameCtrl.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    final home = widget.session.session;
    if (home == null) return;
    try {
      final body = await home.listSchedules(
        accountId: widget.session.accountId,
      );
      final raw = body['schedules'];
      final list = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final s in raw) {
          if (s is Map) list.add(Map<String, dynamic>.from(s));
        }
      }
      final wf = await home.listWorkflows(accountId: widget.session.accountId);
      final wfRaw = wf['workflows'];
      final wfList = <Map<String, dynamic>>[];
      if (wfRaw is List) {
        for (final w in wfRaw) {
          if (w is Map) wfList.add(Map<String, dynamic>.from(w));
        }
      }
      if (mounted) {
        setState(() {
          _items = list;
          _workflows = wfList;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _propose() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (home == null || accountId == null) return;
    setState(() => _busy = true);
    try {
      final body = await home.proposeSchedule(
        accountId: accountId,
        text: _whenCtrl.text.trim(),
      );
      if (mounted) setState(() => _proposal = body);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Map<String, dynamic> _payload() {
    switch (_payloadKind) {
      case 'workflow':
        return {
          'kind': 'workflow',
          'workflowId': _workflowIdCtrl.text.trim(),
        };
      case 'tool':
        return {
          'kind': 'tool',
          'toolName': _toolNameCtrl.text.trim(),
        };
      default:
        final message = _msgCtrl.text.trim().isEmpty
            ? 'Reminder'
            : _msgCtrl.text.trim();
        return {'kind': 'notify', 'message': message};
    }
  }

  Future<void> _confirm() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    final proposal = _proposal;
    final proposalId = proposal?['proposalId']?.toString();
    if (home == null || accountId == null || proposalId == null) return;
    setState(() => _busy = true);
    try {
      final payload = _payload();
      final name = _msgCtrl.text.trim().isEmpty
          ? _payloadKind
          : _msgCtrl.text.trim();
      await home.confirmSchedule(
        accountId: accountId,
        proposalId: proposalId,
        name: name,
        payload: payload,
      );
      _proposal = null;
      _whenCtrl.clear();
      _msgCtrl.clear();
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
    final accountId = widget.session.accountId;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (_error != null)
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        TextField(
          controller: _whenCtrl,
          decoration: InputDecoration(labelText: l10n.schedWhenHint),
        ),
        SegmentedButton<String>(
          segments: [
            ButtonSegment(value: 'notify', label: Text(l10n.schedKindNotify)),
            ButtonSegment(
              value: 'workflow',
              label: Text(l10n.schedKindWorkflow),
            ),
            ButtonSegment(value: 'tool', label: Text(l10n.schedKindTool)),
          ],
          selected: {_payloadKind},
          onSelectionChanged: (s) => setState(() => _payloadKind = s.first),
        ),
        const SizedBox(height: 8),
        if (_payloadKind == 'notify')
          TextField(
            controller: _msgCtrl,
            decoration: InputDecoration(labelText: l10n.schedMessageHint),
          ),
        if (_payloadKind == 'workflow') ...[
          TextField(
            controller: _workflowIdCtrl,
            decoration: InputDecoration(labelText: l10n.schedWorkflowId),
          ),
          if (_workflows.isNotEmpty)
            Wrap(
              spacing: 6,
              children: [
                for (final w in _workflows.take(8))
                  ActionChip(
                    label: Text(w['id']?.toString() ?? '?'),
                    onPressed: () => setState(() {
                      _workflowIdCtrl.text = w['id']?.toString() ?? '';
                    }),
                  ),
              ],
            ),
        ],
        if (_payloadKind == 'tool')
          TextField(
            controller: _toolNameCtrl,
            decoration: InputDecoration(labelText: l10n.schedToolName),
          ),
        Row(
          children: [
            FilledButton(
              onPressed: _busy ? null : _propose,
              child: Text(l10n.schedPropose),
            ),
            const SizedBox(width: 8),
            if (_proposal != null)
              FilledButton.tonal(
                onPressed: _busy ? null : _confirm,
                child: Text(l10n.schedConfirm),
              ),
          ],
        ),
        if (_proposal != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('$_proposal', style: Theme.of(context).textTheme.bodySmall),
          ),
        const Divider(),
        ..._items.map((s) {
          final id = s['id']?.toString() ?? s['jobId']?.toString() ?? '';
          final enabled = s['enabled'] != false;
          return ListTile(
            title: Text(s['name']?.toString() ?? s['title']?.toString() ?? id),
            subtitle: Text(
              '${s['payloadKind'] ?? ''} · ${enabled ? l10n.connEnabled : l10n.connDisabled}',
            ),
            trailing: Wrap(
              children: [
                IconButton(
                  icon: Icon(enabled ? Icons.toggle_on : Icons.toggle_off),
                  onPressed: id.isEmpty || accountId == null
                      ? null
                      : () async {
                          await widget.session.session?.updateSchedule(
                            accountId: accountId,
                            jobId: id,
                            enabled: !enabled,
                          );
                          await _reload();
                        },
                ),
                IconButton(
                  icon: const Icon(Icons.play_arrow),
                  onPressed: id.isEmpty || accountId == null
                      ? null
                      : () => widget.session.session?.runSchedule(
                            accountId: accountId,
                            jobId: id,
                          ),
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline),
                  onPressed: id.isEmpty || accountId == null
                      ? null
                      : () async {
                          await widget.session.session?.removeSchedule(
                            accountId: accountId,
                            jobId: id,
                          );
                          await _reload();
                        },
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}
