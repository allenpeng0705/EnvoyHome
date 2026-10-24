import 'dart:async';

import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';
import 'models_tab.dart';

/// LLM Settings: Models | Local | Routing | Memory (Design §10.1).
class LlmScreen extends StatelessWidget {
  const LlmScreen({super.key, required this.session});

  final SessionController session;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.navLlm),
          bottom: TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: l10n.llmTabModels),
              Tab(text: l10n.llmTabLocal),
              Tab(text: l10n.llmTabRouting),
              Tab(text: l10n.llmTabMemory),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            ModelsTab(session: session),
            _LocalDownloadTab(session: session),
            _RoutingTab(session: session),
            _MemoryTab(session: session),
          ],
        ),
      ),
    );
  }
}

class _LocalDownloadTab extends StatefulWidget {
  const _LocalDownloadTab({required this.session});
  final SessionController session;

  @override
  State<_LocalDownloadTab> createState() => _LocalDownloadTabState();
}

class _LocalDownloadTabState extends State<_LocalDownloadTab> {
  final _queryCtrl = TextEditingController(text: 'gguf');
  final _unsubs = <void Function()>[];
  /// Session whose download progress listener is live — rebind after redial.
  EnvoyHomeSession? _boundSession;
  List<Map<String, dynamic>> _models = [];
  List<Map<String, dynamic>> _files = [];
  String? _selectedRepo;
  String? _lastDownloadFile;
  String? _error;
  String? _progress;
  bool _busy = false;
  bool _owner = false;

  @override
  void initState() {
    super.initState();
    _boundSession = widget.session.session;
    widget.session.addListener(_onSessionChanged);
    unawaited(_probe());
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSessionChanged);
    _clearUnsubs();
    _queryCtrl.dispose();
    super.dispose();
  }

  void _clearUnsubs() {
    for (final u in _unsubs) {
      u();
    }
    _unsubs.clear();
  }

  void _onSessionChanged() {
    final home = widget.session.session;
    if (identical(home, _boundSession)) return;
    _clearUnsubs();
    _boundSession = home;
    if (home == null) {
      if (mounted) setState(() => _owner = false);
      return;
    }
    unawaited(_probe());
  }

  Future<void> _probe() async {
    final home = widget.session.session;
    if (home == null) return;
    _boundSession = home;
    try {
      await home.getLocalEngineStatus();
      if (!mounted || !identical(widget.session.session, home)) return;
      setState(() => _owner = true);
      if (_unsubs.isNotEmpty) return;
      _unsubs.add(home.onEvent('home:local-model-download', (data) {
        if (!mounted || data is! Map) return;
        final m = Map<String, dynamic>.from(data);
        final status = m['status']?.toString() ?? '';
        final recv = m['bytesReceived'];
        final total = m['bytesTotal'];
        setState(() {
          _progress = total != null && total != 0
              ? '$status · $recv / $total'
              : '$status · $recv';
        });
      }));
    } catch (_) {
      if (!mounted || !identical(widget.session.session, home)) return;
      setState(() => _owner = false);
    }
  }

  Future<void> _search() async {
    final home = widget.session.session;
    if (home == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final body = await home.searchHuggingFaceModels(query: _queryCtrl.text.trim());
      final raw = body['models'];
      final list = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final m in raw) {
          if (m is Map) list.add(Map<String, dynamic>.from(m));
        }
      }
      if (mounted) {
        setState(() {
          _models = list;
          _files = [];
          _selectedRepo = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _listFiles(String repoId) async {
    final home = widget.session.session;
    if (home == null) return;
    setState(() {
      _busy = true;
      _selectedRepo = repoId;
      _error = null;
    });
    try {
      final body = await home.listHuggingFaceGgufFiles(repoId: repoId);
      final raw = body['files'];
      final list = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final m in raw) {
          if (m is Map) list.add(Map<String, dynamic>.from(m));
        }
      }
      if (mounted) setState(() => _files = list);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _download(Map<String, dynamic> file) async {
    final home = widget.session.session;
    if (home == null) return;
    final url = file['url']?.toString();
    if (url == null || url.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
      _progress = 'starting…';
      _lastDownloadFile = file['path']?.toString();
    });
    try {
      final res = await home.downloadLocalModelUrl(url: url);
      _lastDownloadFile = res['fileName']?.toString() ?? _lastDownloadFile;
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
    if (!_owner) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(l10n.modelsReadonlyHint, textAlign: TextAlign.center),
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(l10n.llmLocalDownloadHint, style: theme.textTheme.bodySmall),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _queryCtrl,
                decoration: InputDecoration(hintText: l10n.llmHfSearchHint),
                onSubmitted: (_) => _search(),
              ),
            ),
            const SizedBox(width: 8),
            FilledButton(
              onPressed: _busy ? null : _search,
              child: Text(l10n.llmSearch),
            ),
          ],
        ),
        if (_progress != null) ...[
          const SizedBox(height: 8),
          Text(_progress!, style: theme.textTheme.bodySmall),
          Row(
            children: [
              TextButton(
                onPressed: _lastDownloadFile == null
                    ? null
                    : () => widget.session.session?.cancelLocalModelDownload(
                          fileName: _lastDownloadFile!,
                        ),
                child: Text(l10n.llmCancelDownload),
              ),
              TextButton(
                onPressed: _lastDownloadFile == null
                    ? null
                    : () => widget.session.session?.resumeLocalModelDownload(
                          fileName: _lastDownloadFile!,
                        ),
                child: Text(l10n.llmResumeDownload),
              ),
            ],
          ),
        ],
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
          ),
        const SizedBox(height: 12),
        ..._models.map(
          (m) => ListTile(
            title: Text(m['id']?.toString() ?? '?'),
            subtitle: Text(
              '↓ ${m['downloads'] ?? 0} · ♥ ${m['likes'] ?? 0}',
            ),
            onTap: _busy ? null : () => _listFiles(m['id']!.toString()),
          ),
        ),
        if (_files.isNotEmpty) ...[
          const Divider(),
          Text(
            l10n.llmGgufFiles(_selectedRepo ?? ''),
            style: theme.textTheme.titleSmall,
          ),
          ..._files.map(
            (f) => ListTile(
              title: Text(f['path']?.toString() ?? '?'),
              subtitle: Text('${f['size'] ?? ''} bytes'),
              trailing: IconButton(
                icon: const Icon(Icons.download),
                onPressed: _busy ? null : () => _download(f),
              ),
            ),
          ),
        ],
        if (_busy) const LinearProgressIndicator(),
      ],
    );
  }
}

class _RoutingTab extends StatefulWidget {
  const _RoutingTab({required this.session});
  final SessionController session;

  @override
  State<_RoutingTab> createState() => _RoutingTabState();
}

class _RoutingTabState extends State<_RoutingTab> {
  String _filter = 'any';
  bool _auto = false;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    unawaited(_reload());
  }

  Future<void> _reload() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (home == null || accountId == null) return;
    try {
      final p = await home.listProviders(accountId: accountId);
      if (!mounted) return;
      setState(() {
        _filter = p['placementFilter']?.toString() ?? 'any';
        _auto = p['autoModelSwitch'] == true;
      });
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _setFilter(String filter) async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (home == null || accountId == null) return;
    setState(() => _busy = true);
    try {
      await home.setPlacementFilter(accountId: accountId, filter: filter);
      if (mounted) setState(() => _filter = filter);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _setAuto(bool v) async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (home == null || accountId == null) return;
    setState(() => _busy = true);
    try {
      await home.setAutoModelSwitch(accountId: accountId, enabled: v);
      if (mounted) setState(() => _auto = v);
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
        Text(l10n.llmRoutingHint),
        const SizedBox(height: 12),
        if (_error != null)
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        RadioListTile<String>(
          title: Text(l10n.llmFilterAny),
          value: 'any',
          groupValue: _filter,
          onChanged: _busy ? null : (v) => _setFilter(v!),
        ),
        RadioListTile<String>(
          title: Text(l10n.llmFilterCloud),
          value: 'cloud',
          groupValue: _filter,
          onChanged: _busy ? null : (v) => _setFilter(v!),
        ),
        RadioListTile<String>(
          title: Text(l10n.llmFilterLocal),
          value: 'local',
          groupValue: _filter,
          onChanged: _busy ? null : (v) => _setFilter(v!),
        ),
        SwitchListTile(
          title: Text(l10n.llmAutoSwitch),
          value: _auto,
          onChanged: _busy ? null : _setAuto,
        ),
      ],
    );
  }
}

class _MemoryTab extends StatefulWidget {
  const _MemoryTab({required this.session});
  final SessionController session;

  @override
  State<_MemoryTab> createState() => _MemoryTabState();
}

class _MemoryTabState extends State<_MemoryTab> {
  Map<String, dynamic>? _memory;
  List<Map<String, dynamic>> _learns = [];
  String? _error;
  bool _busy = false;
  bool _flushEnabled = true;
  bool _reviewEnabled = true;
  String _injectMode = 'auto';

  @override
  void initState() {
    super.initState();
    unawaited(_reload());
  }

  Future<void> _reload() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (home == null || accountId == null) return;
    setState(() => _busy = true);
    try {
      final mem = await home.listMemory(accountId: accountId);
      final learns = await home.listPendingLearns(accountId: accountId);
      final raw = learns['learns'];
      final list = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final m in raw) {
          if (m is Map) list.add(Map<String, dynamic>.from(m));
        }
      }
      final settings = mem['settings'] is Map
          ? Map<String, dynamic>.from(mem['settings'] as Map)
          : mem;
      if (mounted) {
        setState(() {
          _memory = mem;
          _learns = list;
          _flushEnabled = settings['flushEnabled'] != false;
          _reviewEnabled = settings['reviewEnabled'] != false;
          _injectMode = settings['injectBudgetMode']?.toString() ?? 'auto';
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveSettings({
    bool? flush,
    bool? review,
    String? inject,
  }) async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (home == null || accountId == null) return;
    setState(() => _busy = true);
    try {
      await home.setMemorySettings(
        accountId: accountId,
        settings: {
          if (flush != null) 'flushEnabled': flush,
          if (review != null) 'reviewEnabled': review,
          if (inject != null) 'injectBudgetMode': inject,
        },
      );
      await _reload();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _accept(String id) async {
    final home = widget.session.session;
    if (home == null) return;
    await home.acceptLearn(id: id);
    await _reload();
  }

  Future<void> _reject(String id) async {
    final home = widget.session.session;
    if (home == null) return;
    await home.rejectLearn(id: id);
    await _reload();
  }

  Future<void> _compact() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (home == null || accountId == null) return;
    setState(() => _busy = true);
    try {
      await home.compactMemory(accountId: accountId);
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
    final caps = _memory?['caps'] ?? _memory?['settings'];
    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null)
            Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
          if (caps != null)
            Text('$caps', style: theme.textTheme.bodySmall),
          SwitchListTile(
            title: Text(l10n.llmFlushEnabled),
            value: _flushEnabled,
            onChanged: _busy
                ? null
                : (v) {
                    setState(() => _flushEnabled = v);
                    unawaited(_saveSettings(flush: v));
                  },
          ),
          SwitchListTile(
            title: Text(l10n.llmReviewEnabled),
            value: _reviewEnabled,
            onChanged: _busy
                ? null
                : (v) {
                    setState(() => _reviewEnabled = v);
                    unawaited(_saveSettings(review: v));
                  },
          ),
          Text(l10n.llmInjectMode, style: theme.textTheme.titleSmall),
          SegmentedButton<String>(
            segments: [
              ButtonSegment(value: 'auto', label: Text(l10n.llmInjectAuto)),
              ButtonSegment(
                value: 'baseline',
                label: Text(l10n.llmInjectBaseline),
              ),
              ButtonSegment(
                value: 'custom',
                label: Text(l10n.llmInjectCustom),
              ),
            ],
            selected: {_injectMode},
            onSelectionChanged: _busy
                ? null
                : (s) {
                    final v = s.first;
                    setState(() => _injectMode = v);
                    unawaited(_saveSettings(inject: v));
                  },
          ),
          const SizedBox(height: 8),
          FilledButton.tonal(
            onPressed: _busy ? null : _compact,
            child: Text(l10n.llmCompactNow),
          ),
          const SizedBox(height: 16),
          Text(l10n.llmPendingLearns, style: theme.textTheme.titleMedium),
          if (_learns.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(l10n.llmNoPendingLearns, style: theme.textTheme.bodySmall),
            ),
          ..._learns.map((row) {
            final id = row['id']?.toString() ?? '';
            return Card(
              child: ListTile(
                title: Text(row['kind']?.toString() ?? id),
                subtitle: Text(
                  row['summary']?.toString() ??
                      row['diff']?.toString() ??
                      '',
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: Wrap(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.check),
                      onPressed: id.isEmpty ? null : () => _accept(id),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: id.isEmpty ? null : () => _reject(id),
                    ),
                  ],
                ),
              ),
            );
          }),
          if (_busy) const LinearProgressIndicator(),
        ],
      ),
    );
  }
}
