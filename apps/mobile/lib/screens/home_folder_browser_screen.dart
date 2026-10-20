import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';

/// Browse absolute folders on the home machine (Owner-scope).
/// Peer: EnvoyGo `HomeFolderBrowser` / EnvoyMesh `listHomeFsEntries`.
class HomeFolderBrowserScreen extends StatefulWidget {
  const HomeFolderBrowserScreen({
    super.key,
    required this.session,
    this.initialPath,
    this.title,
  });

  final SessionController session;
  final String? initialPath;
  final String? title;

  /// Returns the selected absolute directory path, or null if cancelled.
  static Future<String?> open(
    BuildContext context, {
    required SessionController session,
    String? initialPath,
    String? title,
  }) {
    return Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => HomeFolderBrowserScreen(
          session: session,
          initialPath: initialPath,
          title: title,
        ),
      ),
    );
  }

  @override
  State<HomeFolderBrowserScreen> createState() =>
      _HomeFolderBrowserScreenState();
}

class _HomeFolderBrowserScreenState extends State<HomeFolderBrowserScreen> {
  bool _loading = true;
  String? _error;
  String _platform = 'other';
  String _homeDir = '';
  String _currentPath = '';
  String? _parent;
  List<Map<String, dynamic>> _entries = const [];
  bool _showingRoots = false;
  List<String> _roots = const [];

  @override
  void initState() {
    super.initState();
    unawaited(_bootstrap());
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final home = widget.session.session;
    if (home == null) {
      setState(() {
        _loading = false;
        _error = 'Not connected';
      });
      return;
    }
    try {
      final info = await home.getHomeFsInfo();
      final platform = info['platform']?.toString() ?? 'other';
      final homeDir = info['homeDir']?.toString() ?? '';
      final roots = (info['roots'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const <String>[];
      final start = widget.initialPath?.trim().isNotEmpty == true
          ? widget.initialPath!.trim()
          : (homeDir.isNotEmpty
              ? homeDir
              : (roots.isNotEmpty ? roots.first : '/'));
      if (!mounted) return;
      setState(() {
        _platform = platform;
        _homeDir = homeDir;
        _roots = roots;
      });
      await _loadPath(start);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _loadPath(String? path, {bool roots = false}) async {
    final home = widget.session.session;
    if (home == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if (roots) {
        if (_platform != 'win32' && _roots.length == 1) {
          final result = await home.listHomeFsEntries(
            path: _roots.first,
            dirsOnly: true,
          );
          _applyListing(result);
          return;
        }
        if (!mounted) return;
        setState(() {
          _showingRoots = true;
          _currentPath = '';
          _parent = null;
          _entries = _roots
              .map((r) => {'name': r, 'kind': 'dir', 'path': r})
              .toList();
          _loading = false;
        });
        return;
      }
      final result = await home.listHomeFsEntries(
        path: path,
        dirsOnly: true,
      );
      _applyListing(result);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  void _applyListing(Map<String, dynamic> result) {
    final entries = (result['entries'] as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .where((e) => e['kind']?.toString() == 'dir')
        .toList();
    if (!mounted) return;
    setState(() {
      _showingRoots = false;
      _currentPath = result['path']?.toString() ?? '';
      _parent = result['parent']?.toString();
      _entries = entries;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final rootsLabel =
        _platform == 'win32' ? l10n.homeFolderDrives : l10n.homeFolderComputer;
    final atRoot =
        !_showingRoots && _roots.isNotEmpty && _roots.contains(_currentPath);
    final showRootsJump =
        !_showingRoots && (_platform == 'win32' || !atRoot);
    final showHomeJump =
        !_showingRoots && _homeDir.isNotEmpty && _currentPath != _homeDir;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title ?? l10n.homeFolderTitle),
        actions: [
          TextButton(
            onPressed: _currentPath.isEmpty || _showingRoots
                ? null
                : () => Navigator.of(context).pop(_currentPath),
            child: Text(l10n.homeFolderSelect),
          ),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Text(
              _showingRoots
                  ? rootsLabel
                  : (_currentPath.isEmpty ? '…' : _currentPath),
              style: theme.textTheme.bodySmall?.copyWith(
                fontFamily: 'monospace',
              ),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                _error!,
                style: TextStyle(color: theme.colorScheme.error),
              ),
            ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : ListView(
                    children: [
                      if (showRootsJump)
                        ListTile(
                          leading: const Icon(Icons.storage_outlined),
                          title: Text(rootsLabel),
                          onTap: () => unawaited(_loadPath(null, roots: true)),
                        ),
                      if (showHomeJump)
                        ListTile(
                          leading: const Icon(Icons.home_outlined),
                          title: Text(l10n.homeFolderHome),
                          onTap: () => unawaited(_loadPath(_homeDir)),
                        ),
                      if (_parent != null && !_showingRoots)
                        ListTile(
                          leading: const Icon(Icons.arrow_upward),
                          title: Text(l10n.homeFolderParent),
                          onTap: () => unawaited(_loadPath(_parent)),
                        ),
                      for (final entry in _entries)
                        ListTile(
                          leading: const Icon(Icons.folder_outlined),
                          title: Text(entry['name']?.toString() ?? ''),
                          onTap: () => unawaited(
                            _loadPath(entry['path']?.toString()),
                          ),
                        ),
                      if (!_loading && _entries.isEmpty)
                        ListTile(
                          title: Text(l10n.homeFolderNoSubfolders),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}
