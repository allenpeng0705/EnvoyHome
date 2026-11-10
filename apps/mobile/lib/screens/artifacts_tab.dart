import 'dart:async';

import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';
import 'artifact_viewer_screen.dart';

/// Profile-scoped File Explore (Design §9.5d / V-OUT-4).
/// Browses sandbox tops + R3-effective workspace/ via home.listSandboxEntries.
/// Owner LibreOffice card targets the **home** daemon host (V-OFFICE-11…14).
class ArtifactsTab extends StatefulWidget {
  const ArtifactsTab({super.key, required this.session});

  final SessionController session;

  @override
  State<ArtifactsTab> createState() => _ArtifactsTabState();
}

class _ArtifactsTabState extends State<ArtifactsTab> {
  String _path = '';
  String? _parent;
  List<String> _roots = const [];
  List<Map<String, dynamic>> _entries = [];
  String? _error;
  bool _loading = false;
  Map<String, dynamic>? _loStatus;
  bool _loBusy = false;
  Timer? _loPoll;

  @override
  void initState() {
    super.initState();
    widget.session.addListener(_onSession);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        unawaited(_loadPath(''));
        unawaited(_loadLoStatus());
      }
    });
  }

  @override
  void dispose() {
    _loPoll?.cancel();
    widget.session.removeListener(_onSession);
    super.dispose();
  }

  void _onSession() {
    if (mounted) {
      unawaited(_loadPath(_path));
      unawaited(_loadLoStatus());
    }
  }

  Future<void> _loadLoStatus() async {
    final home = widget.session.session;
    if (home == null) return;
    try {
      final st = await home.getDocumentExportStatus();
      if (!mounted) return;
      setState(() => _loStatus = st);
      final runtime = st['libreOfficeRuntime']?.toString();
      _loPoll?.cancel();
      if (runtime == 'downloading') {
        _loPoll = Timer(const Duration(seconds: 2), () {
          if (mounted) unawaited(_loadLoStatus());
        });
      }
    } catch (_) {
      /* Owner-scope; non-owner / older daemon — leave card empty */
    }
  }

  Future<void> _loInstall() async {
    final home = widget.session.session;
    if (home == null || _loBusy) return;
    setState(() => _loBusy = true);
    try {
      await home.installLibreOffice();
      await _loadLoStatus();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _loBusy = false);
    }
  }

  Future<void> _loCancel() async {
    final home = widget.session.session;
    if (home == null || _loBusy) return;
    setState(() => _loBusy = true);
    try {
      await home.cancelLibreOfficeInstall();
      await _loadLoStatus();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _loBusy = false);
    }
  }

  Future<void> _loNotNow() async {
    final home = widget.session.session;
    if (home == null || _loBusy) return;
    setState(() => _loBusy = true);
    try {
      await home.setLibreOfficeInstallPreference(declined: true, auto: false);
      await _loadLoStatus();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _loBusy = false);
    }
  }

  Future<void> _loCopyHint() async {
    final hint = _loStatus?['libreOfficeInstallHint']?.toString() ?? '';
    if (hint.isEmpty) return;
    final l10n = AppLocalizations.of(context);
    await Clipboard.setData(ClipboardData(text: hint));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(l10n.artifactsLoHintCopied)),
    );
  }

  Future<void> _loadPath(String? path) async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (home == null || accountId == null) {
      setState(() {
        _entries = [];
        _roots = const [];
        _path = '';
        _parent = null;
        _error = accountId == null
            ? AppLocalizations.of(context).artifactsNeedAccount
            : null;
        _loading = false;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final body = await home.listSandboxEntries(
        accountId: accountId,
        path: path ?? '',
      );
      final raw = body['entries'];
      final list = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final e in raw) {
          if (e is Map) list.add(Map<String, dynamic>.from(e));
        }
      }
      final rootsRaw = body['roots'];
      final roots = <String>[];
      if (rootsRaw is List) {
        for (final r in rootsRaw) {
          roots.add(r.toString());
        }
      }
      final nextPath = body['path']?.toString() ?? '';
      final parent = body['parent']?.toString();
      if (mounted) {
        setState(() {
          _path = nextPath;
          _parent = parent;
          _roots = roots;
          _entries = list;
          _loading = false;
        });
      }
    } catch (e) {
      if (!mounted) return;
      // Transport upgrade / brief drop — keep entries already shown.
      if (isTransientHomeRemoteDrop(e)) {
        setState(() {
          _loading = false;
          if (_entries.isNotEmpty || _roots.isNotEmpty) _error = null;
        });
        unawaited(Future<void>.delayed(const Duration(milliseconds: 400), () {
          if (!mounted) return;
          unawaited(_loadPath(_path));
        }));
        return;
      }
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _openFile(String path) async {
    if (path.isEmpty) return;
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ArtifactViewerScreen(
          session: widget.session,
          path: path,
        ),
      ),
    );
  }

  void _onEntryTap(Map<String, dynamic> entry) {
    final path = entry['path']?.toString() ?? '';
    final kind = entry['kind']?.toString() ?? '';
    if (path.isEmpty) return;
    if (kind == 'dir') {
      unawaited(_loadPath(path));
    } else {
      unawaited(_openFile(path));
    }
  }

  Widget _loCard(ThemeData theme, AppLocalizations l10n) {
    final st = _loStatus;
    if (st == null) return const SizedBox.shrink();
    final runtime = st['libreOfficeRuntime']?.toString() ?? 'missing';
    final ready = runtime == 'ready';
    final downloading = runtime == 'downloading';
    final failed = runtime == 'failed';
    final badge = ready
        ? l10n.artifactsLoReady
        : downloading
            ? l10n.artifactsLoDownloading
            : failed
                ? l10n.artifactsLoFailed
                : l10n.artifactsLoMissing;
    final dl = st['download'];
    String? progress;
    if (downloading && dl is Map) {
      final recv = (dl['bytesReceived'] is num)
          ? (dl['bytesReceived'] as num).toInt()
          : 0;
      final tot = (dl['bytesTotal'] is num)
          ? (dl['bytesTotal'] as num).toInt()
          : (st['approxBytes'] is num ? (st['approxBytes'] as num).toInt() : 0);
      progress = l10n.artifactsLoProgress(_fmtBytes(recv), _fmtBytes(tot));
    }
    final lastError = failed ? st['lastError']?.toString() : null;
    final hint = st['libreOfficeInstallHint']?.toString() ?? '';
    final why = st['whyText']?.toString().isNotEmpty == true
        ? st['whyText'].toString()
        : l10n.artifactsLoWhy;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(l10n.artifactsLoTitle, style: theme.textTheme.titleMedium),
                ),
                Chip(label: Text(badge)),
              ],
            ),
            const SizedBox(height: 6),
            Text(why, style: theme.textTheme.bodySmall),
            if (progress != null) ...[
              const SizedBox(height: 6),
              Text(progress, style: theme.textTheme.bodySmall),
            ],
            if (lastError != null && lastError.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                lastError.length > 240 ? lastError.substring(0, 240) : lastError,
                style: TextStyle(color: theme.colorScheme.error, fontSize: 12),
              ),
            ],
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (ready)
                  FilledButton.tonal(
                    onPressed: _loBusy ? null : () => unawaited(_loadLoStatus()),
                    child: Text(l10n.artifactsLoRefresh),
                  )
                else if (downloading) ...[
                  FilledButton.tonal(
                    onPressed: _loBusy ? null : () => unawaited(_loCancel()),
                    child: Text(l10n.artifactsLoCancel),
                  ),
                  TextButton(
                    onPressed: _loBusy ? null : () => unawaited(_loadLoStatus()),
                    child: Text(l10n.artifactsLoRefresh),
                  ),
                ] else ...[
                  FilledButton(
                    onPressed: _loBusy ? null : () => unawaited(_loInstall()),
                    child: Text(l10n.artifactsLoInstall),
                  ),
                  TextButton(
                    onPressed: _loBusy ? null : () => unawaited(_loNotNow()),
                    child: Text(l10n.artifactsLoNotNow),
                  ),
                  TextButton(
                    onPressed: _loBusy ? null : () => unawaited(_loadLoStatus()),
                    child: Text(l10n.artifactsLoRefresh),
                  ),
                ],
              ],
            ),
            if (!ready) ...[
              const SizedBox(height: 8),
              Text(l10n.artifactsLoInstallNote, style: theme.textTheme.bodySmall),
              if (hint.isNotEmpty) ...[
                const SizedBox(height: 6),
                SelectableText(hint, style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
                TextButton(
                  onPressed: () => unawaited(_loCopyHint()),
                  child: Text(l10n.artifactsLoCopyHint),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    final atRoots = _path.isEmpty;

    if (_loading && _entries.isEmpty && _error == null && _loStatus == null) {
      return const Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: () async {
        await Future.wait([_loadPath(_path), _loadLoStatus()]);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(l10n.artifactsTitle, style: theme.textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(l10n.artifactsHint, style: theme.textTheme.bodySmall),
          const SizedBox(height: 12),
          if (atRoots) _loCard(theme, l10n),
          if (!atRoots) ...[
            Text(
              _path,
              style: theme.textTheme.bodySmall?.copyWith(
                fontFamily: 'monospace',
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ActionChip(
                  avatar: const Icon(Icons.home_outlined, size: 18),
                  label: Text(l10n.filesRoots),
                  onPressed: () => unawaited(_loadPath('')),
                ),
                if (_parent != null)
                  ActionChip(
                    avatar: const Icon(Icons.arrow_upward, size: 18),
                    label: Text(l10n.filesParent),
                    onPressed: () => unawaited(_loadPath(_parent)),
                  ),
              ],
            ),
            const SizedBox(height: 8),
          ] else if (_roots.isNotEmpty) ...[
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final r in _roots)
                  ActionChip(
                    avatar: Icon(
                      r == 'workspace' ? Icons.computer_outlined : Icons.folder_outlined,
                      size: 18,
                    ),
                    label: Text(r),
                    onPressed: () => unawaited(_loadPath(r)),
                  ),
              ],
            ),
            const SizedBox(height: 8),
          ],
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                _error!,
                style: TextStyle(color: theme.colorScheme.error),
              ),
            ),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_entries.isEmpty && _error == null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 48),
              child: Column(
                children: [
                  Icon(
                    Icons.folder_open_outlined,
                    size: 40,
                    color: theme.colorScheme.primary.withValues(alpha: 0.4),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    atRoots ? l10n.artifactsEmptyTitle : l10n.filesEmptyFolder,
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    atRoots ? l10n.artifactsEmptyHint : l10n.artifactsHint,
                    style: theme.textTheme.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            )
          else
            for (final e in _entries)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Card(
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor:
                          theme.colorScheme.primary.withValues(alpha: 0.12),
                      child: Icon(
                        e['kind']?.toString() == 'dir'
                            ? Icons.folder_outlined
                            : Icons.description_outlined,
                        color: theme.colorScheme.primary,
                      ),
                    ),
                    title: Text(
                      e['name']?.toString() ?? e['path']?.toString() ?? '?',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    subtitle: e['kind']?.toString() == 'file' &&
                            e['size'] != null
                        ? Text(_formatSize(e['size']))
                        : (e['path']?.toString() != e['name']?.toString()
                            ? Text(
                                e['path']?.toString() ?? '',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              )
                            : null),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => _onEntryTap(e),
                  ),
                ),
              ),
        ],
      ),
    );
  }

  String _formatSize(Object? size) {
    final n = size is int ? size : int.tryParse('$size') ?? 0;
    return _fmtBytes(n);
  }

  String _fmtBytes(int n) {
    if (n < 1024) return '$n B';
    if (n < 1024 * 1024) return '${(n / 1024).toStringAsFixed(1)} KB';
    return '${(n / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
