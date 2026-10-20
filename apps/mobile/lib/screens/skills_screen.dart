import 'dart:async';

import 'package:flutter/material.dart';

import '../client_context.dart';
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
  List<Map<String, dynamic>> _tools = [];
  List<Map<String, dynamic>> _receipts = [];
  List<Map<String, dynamic>> _dismissed = [];
  Map<String, dynamic>? _proposal;
  /// Selected tool arg values (from sampleArgs / argChoices).
  final Map<String, String> _toolArgValues = {};
  String _payloadKind = 'notify';
  /// repeating | once | history (V-UX-12b)
  String _listView = 'repeating';
  String? _error;
  bool _busy = false;

  List<Map<String, dynamic>> get _repeating => _items
      .where((s) {
        final k = s['kind']?.toString();
        return k == 'cron' || k == 'every';
      })
      .toList();

  List<Map<String, dynamic>> get _once =>
      _items.where((s) => s['kind']?.toString() == 'at').toList();

  String _formatNext(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    return d.toLocal().toString().split('.').first;
  }

  String _formatJobWhen(Map<String, dynamic> s, AppLocalizations l10n) {
    final kind = s['kind']?.toString() ?? '';
    final tz = s['timeZone']?.toString();
    final tzSuffix = (tz != null && tz.isNotEmpty) ? ' · $tz' : '';
    if (kind == 'every') {
      final ms = s['everyMs'];
      if (ms is num && ms > 0) {
        final sec = (ms / 1000).round();
        if (sec < 120) return '${l10n.schedKindEvery} ${sec}s$tzSuffix';
        final min = (sec / 60).round();
        if (min < 120) return '${l10n.schedKindEvery} ${min}m$tzSuffix';
        return '${l10n.schedKindEvery} ${(min / 60).round()}h$tzSuffix';
      }
      return '${l10n.schedKindRepeating}$tzSuffix';
    }
    if (kind == 'cron') {
      final expr = s['cronExpr']?.toString() ?? '';
      final parts = expr.trim().split(RegExp(r'\s+'));
      if (parts.length >= 5) {
        final min = parts[0];
        final hour = parts[1];
        final dom = parts[2];
        final mon = parts[3];
        final dow = parts[4];
        final clock = (hour != '*' && min != '*')
            ? '${hour.padLeft(2, '0')}:${min.padLeft(2, '0')}'
            : expr;
        const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        if (dom == '*' && mon == '*' && dow == '*') {
          return '${l10n.schedKindDaily} $clock$tzSuffix';
        }
        if (dom == '*' && mon == '*' && dow == '1-5') {
          return '${l10n.schedKindWeekdays} $clock$tzSuffix';
        }
        if (dom == '*' && mon == '*' && RegExp(r'^\d$').hasMatch(dow)) {
          final name = dowNames[int.parse(dow)];
          return '${l10n.schedKindWeekly} $name $clock$tzSuffix';
        }
        if (dom != '*' && mon == '*' && dow == '*') {
          return '${l10n.schedKindMonthly} ${l10n.schedDayOfMonth(dom)} $clock$tzSuffix';
        }
        if (dom != '*' && mon != '*' && dow == '*') {
          return '${l10n.schedKindYearly} $mon/$dom $clock$tzSuffix';
        }
        if (expr.isNotEmpty) {
          return '${l10n.schedKindRepeating} $expr$tzSuffix';
        }
      }
      return '${l10n.schedKindRepeating}$tzSuffix';
    }
    final when = s['whenInstant']?.toString() ?? s['nextRunAt']?.toString();
    return '${l10n.schedKindOnce} · ${_formatNext(when)}$tzSuffix';
  }

  Widget _jobTile(
    Map<String, dynamic> s,
    AppLocalizations l10n,
    String? accountId,
  ) {
    final id = s['id']?.toString() ?? s['jobId']?.toString() ?? '';
    final enabled = s['enabled'] != false;
    final synced = s['source']?.toString() == 'workflow';
    final payloadKind = s['payloadKind']?.toString() ?? '';
    final title = s['name']?.toString() ??
        s['message']?.toString() ??
        s['toolName']?.toString() ??
        id;
    return ListTile(
      title: Row(
        children: [
          Expanded(child: Text(title)),
          if (synced)
            Padding(
              padding: const EdgeInsets.only(left: 6),
              child: Chip(
                label: Text(l10n.schedKindWorkflow),
                visualDensity: VisualDensity.compact,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
        ],
      ),
      subtitle: Text(
        [
          _formatJobWhen(s, l10n),
          if (payloadKind.isNotEmpty) payloadKind,
          '${l10n.schedNext}: ${_formatNext(s['nextRunAt']?.toString())}',
          enabled ? l10n.connEnabled : l10n.connDisabled,
        ].where((x) => x.isNotEmpty).join(' · '),
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
                : () async {
                    await widget.session.session?.runSchedule(
                      accountId: accountId,
                      jobId: id,
                    );
                    await _reload();
                  },
          ),
          if (!synced)
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
  }

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
    final accountId = widget.session.accountId;
    if (home == null || accountId == null) return;
    try {
      final body = await home.listSchedules(accountId: accountId);
      // Wire key is `jobs` (V-UX-12b) — never `schedules`.
      final raw = body['jobs'];
      final list = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final s in raw) {
          if (s is! Map) continue;
          final m = Map<String, dynamic>.from(s);
          if (m['payloadKind']?.toString() == 'system') continue;
          list.add(m);
        }
      }
      final dismissedRaw = body['dismissed'];
      final dismissedList = <Map<String, dynamic>>[];
      if (dismissedRaw is List) {
        for (final d in dismissedRaw) {
          if (d is Map) dismissedList.add(Map<String, dynamic>.from(d));
        }
      }
      final wf = await home.listWorkflows(accountId: accountId);
      final wfRaw = wf['workflows'];
      final wfList = <Map<String, dynamic>>[];
      if (wfRaw is List) {
        for (final w in wfRaw) {
          if (w is Map) wfList.add(Map<String, dynamic>.from(w));
        }
      }
      final toolsBody = await home.listWorkflowTools();
      final toolsRaw = toolsBody['tools'];
      final toolList = <Map<String, dynamic>>[];
      if (toolsRaw is List) {
        for (final t in toolsRaw) {
          if (t is! Map) continue;
          final m = Map<String, dynamic>.from(t);
          if (m['available'] == false) continue;
          toolList.add(m);
        }
      }
      final receiptsBody = await home.listScheduleReceipts(
        accountId: accountId,
        limit: 20,
      );
      final receiptsRaw = receiptsBody['receipts'];
      final receiptList = <Map<String, dynamic>>[];
      if (receiptsRaw is List) {
        for (final r in receiptsRaw) {
          if (r is Map) receiptList.add(Map<String, dynamic>.from(r));
        }
      }
      if (mounted) {
        setState(() {
          _items = list;
          _workflows = wfList;
          _tools = toolList;
          _receipts = receiptList;
          _dismissed = dismissedList;
          _error = null;
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
      final clientContext = await buildClientContext(context);
      final body = await home.proposeSchedule(
        accountId: accountId,
        text: _whenCtrl.text.trim(),
        clientContext: clientContext,
      );
      if (mounted) setState(() => _proposal = body);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  List<String>? _argChoicesFor(Map<String, dynamic> tool, String key) {
    final choices = tool['argChoices'];
    if (choices is Map && choices[key] is List) {
      return (choices[key] as List).map((e) => e.toString()).toList();
    }
    return null;
  }

  String _proposalPreview(Map<String, dynamic> p) {
    final when = p['resolvedLocal']?.toString() ??
        p['whenInstant']?.toString() ??
        p['cronExpr']?.toString() ??
        '';
    final kind = p['kind']?.toString() ?? '';
    final message = p['message']?.toString() ?? '';
    final parts = <String>[
      if (when.isNotEmpty) when,
      if (kind.isNotEmpty) kind,
      if (message.isNotEmpty) message,
    ];
    return parts.isEmpty ? 'Ready to confirm' : parts.join(' · ');
  }

  Map<String, dynamic> _payload() {
    switch (_payloadKind) {
      case 'workflow':
        return {
          'kind': 'workflow',
          'workflowId': _workflowIdCtrl.text.trim(),
        };
      case 'agentTurn':
        final prompt = _msgCtrl.text.trim().isEmpty
            ? 'Scheduled agent task'
            : _msgCtrl.text.trim();
        return {
          'kind': 'agentTurn',
          'prompt': prompt,
          'toolPolicyPreset': 'restricted',
          'message': prompt.length > 80 ? prompt.substring(0, 80) : prompt,
        };
      case 'tool':
        final name = _toolNameCtrl.text.trim();
        Map<String, dynamic>? match;
        for (final t in _tools) {
          if (t['name']?.toString() == name) {
            match = t;
            break;
          }
        }
        final sample = match?['sampleArgs'];
        final toolArgs = <String, dynamic>{};
        if (sample is Map) {
          for (final e in sample.entries) {
            toolArgs[e.key.toString()] = e.value;
          }
        }
        for (final e in _toolArgValues.entries) {
          if (e.value.isNotEmpty) toolArgs[e.key] = e.value;
        }
        return {
          'kind': 'tool',
          'toolName': name,
          if (toolArgs.isNotEmpty) 'toolArgs': toolArgs,
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
            ButtonSegment(value: 'agentTurn', label: Text(l10n.schedKindAgent)),
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
        if (_payloadKind == 'agentTurn')
          TextField(
            controller: _msgCtrl,
            maxLines: 3,
            decoration: InputDecoration(labelText: l10n.schedAgentPrompt),
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
        if (_payloadKind == 'tool') ...[
          if (_tools.isEmpty)
            TextField(
              controller: _toolNameCtrl,
              decoration: InputDecoration(labelText: l10n.schedToolName),
            )
          else
            DropdownButtonFormField<String>(
              value: _tools.any((t) => t['name']?.toString() == _toolNameCtrl.text)
                  ? _toolNameCtrl.text
                  : null,
              decoration: InputDecoration(labelText: l10n.schedToolName),
              items: [
                for (final t in _tools)
                  DropdownMenuItem(
                    value: t['name']?.toString() ?? '',
                    child: Text(t['name']?.toString() ?? '?'),
                  ),
              ],
              onChanged: (v) {
                if (v == null) return;
                setState(() {
                  _toolNameCtrl.text = v;
                  _toolArgValues.clear();
                  Map<String, dynamic>? match;
                  for (final t in _tools) {
                    if (t['name']?.toString() == v) {
                      match = t;
                      break;
                    }
                  }
                  final sample = match?['sampleArgs'];
                  if (sample is Map) {
                    for (final e in sample.entries) {
                      final k = e.key.toString();
                      final choices = _argChoicesFor(match!, k);
                      if (choices != null && choices.isNotEmpty) {
                        final seed = e.value?.toString() ?? '';
                        _toolArgValues[k] =
                            choices.contains(seed) ? seed : choices.first;
                      } else if (e.value != null) {
                        _toolArgValues[k] = e.value.toString();
                      }
                    }
                  }
                  final choicesMap = match?['argChoices'];
                  if (choicesMap is Map) {
                    for (final e in choicesMap.entries) {
                      final k = e.key.toString();
                      if (_toolArgValues.containsKey(k)) continue;
                      final list = _argChoicesFor(match!, k);
                      if (list != null && list.isNotEmpty) {
                        _toolArgValues[k] = list.first;
                      }
                    }
                  }
                });
              },
            ),
          if (_toolNameCtrl.text.isNotEmpty) ...[
            Builder(
              builder: (context) {
                String? summary;
                Map<String, dynamic>? match;
                for (final t in _tools) {
                  if (t['name']?.toString() == _toolNameCtrl.text) {
                    match = t;
                    summary = t['summary']?.toString();
                    break;
                  }
                }
                final children = <Widget>[];
                if (summary != null && summary.isNotEmpty) {
                  children.add(
                    Padding(
                      padding: const EdgeInsets.only(top: 4, bottom: 4),
                      child: Text(
                        summary,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  );
                }
                if (match != null) {
                  final keys = <String>{
                    ..._toolArgValues.keys,
                    if (match['sampleArgs'] is Map)
                      ...(match['sampleArgs'] as Map).keys.map((k) => k.toString()),
                    if (match['argChoices'] is Map)
                      ...(match['argChoices'] as Map).keys.map((k) => k.toString()),
                  };
                  for (final key in keys) {
                    final choices = _argChoicesFor(match, key);
                    if (choices != null && choices.isNotEmpty) {
                      children.add(
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: DropdownButtonFormField<String>(
                            value: choices.contains(_toolArgValues[key])
                                ? _toolArgValues[key]
                                : choices.first,
                            decoration: InputDecoration(labelText: key),
                            items: [
                              for (final c in choices)
                                DropdownMenuItem(value: c, child: Text(c)),
                            ],
                            onChanged: (v) {
                              if (v == null) return;
                              setState(() => _toolArgValues[key] = v);
                            },
                          ),
                        ),
                      );
                    } else if (_toolArgValues.containsKey(key) ||
                        (match['sampleArgs'] is Map &&
                            (match['sampleArgs'] as Map).containsKey(key))) {
                      children.add(
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: TextFormField(
                            initialValue: _toolArgValues[key] ??
                                (match['sampleArgs'] as Map)[key]?.toString() ??
                                '',
                            decoration: InputDecoration(labelText: key),
                            onChanged: (v) => _toolArgValues[key] = v,
                          ),
                        ),
                      );
                    }
                  }
                }
                if (children.isEmpty) return const SizedBox.shrink();
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: children,
                );
              },
            ),
          ],
        ],
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
            child: Text(
              _proposalPreview(_proposal!),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        const Divider(),
        SegmentedButton<String>(
          segments: [
            ButtonSegment(
              value: 'repeating',
              label: Text('${l10n.schedTabRepeating} (${_repeating.length})'),
            ),
            ButtonSegment(
              value: 'once',
              label: Text('${l10n.schedTabOnce} (${_once.length})'),
            ),
            ButtonSegment(
              value: 'history',
              label: Text(
                '${l10n.schedTabHistory} (${_receipts.length + _dismissed.length})',
              ),
            ),
          ],
          selected: {_listView},
          onSelectionChanged: (s) => setState(() => _listView = s.first),
        ),
        const SizedBox(height: 8),
        if (_listView == 'repeating') ...[
          if (_repeating.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(l10n.schedNoneRepeating),
            )
          else
            ..._repeating.map((s) => _jobTile(s, l10n, accountId)),
        ] else if (_listView == 'once') ...[
          if (_once.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(l10n.schedNoneOnce),
            )
          else
            ..._once.map((s) => _jobTile(s, l10n, accountId)),
        ] else ...[
          Text(l10n.schedHistoryNotSet, style: Theme.of(context).textTheme.titleSmall),
          if (_dismissed.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(l10n.schedNoDismissed),
            )
          else
            ..._dismissed.take(20).map((d) {
              final status = d['status']?.toString() == 'expired'
                  ? l10n.schedDismissedExpired
                  : l10n.schedDismissedCanceled;
              final name = d['name']?.toString() ?? d['resolvedLocal']?.toString() ?? '';
              final when = d['resolvedLocal']?.toString() ?? '';
              return ListTile(
                dense: true,
                title: Text('$name · $status'),
                subtitle: Text(when),
              );
            }),
          const SizedBox(height: 8),
          Text(l10n.schedHistoryRuns, style: Theme.of(context).textTheme.titleSmall),
          if (_receipts.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(l10n.schedNoReceipts),
            )
          else
            ..._receipts.take(20).map((r) {
              final jobId = r['jobId']?.toString() ?? '';
              final status = r['execStatus']?.toString() ?? '';
              final when =
                  r['finishedAt']?.toString() ?? r['startedAt']?.toString() ?? '';
              return ListTile(
                dense: true,
                title: Text('$jobId · $status'),
                subtitle: Text(_formatNext(when)),
              );
            }),
        ],
      ],
    );
  }
}
