import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';
import 'artifact_viewer_screen.dart';

/// Profile-scoped File Explore (Design §9.5d / V-OUT-4).
/// Browses sandbox tops + R3-effective workspace/ via home.listSandboxEntries.
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

  @override
  void initState() {
    super.initState();
    widget.session.addListener(_onSession);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_loadPath(''));
    });
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSession);
    super.dispose();
  }

  void _onSession() {
    if (mounted) unawaited(_loadPath(_path));
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
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    final atRoots = _path.isEmpty;

    if (_loading && _entries.isEmpty && _error == null) {
      return const Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: () => _loadPath(_path),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(l10n.artifactsTitle, style: theme.textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(l10n.artifactsHint, style: theme.textTheme.bodySmall),
          const SizedBox(height: 12),
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
    if (n < 1024) return '$n B';
    if (n < 1024 * 1024) return '${(n / 1024).toStringAsFixed(1)} KB';
    return '${(n / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
