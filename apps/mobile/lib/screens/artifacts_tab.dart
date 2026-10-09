import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../state/session_controller.dart';

class ArtifactsTab extends StatefulWidget {
  const ArtifactsTab({super.key, required this.session});

  final SessionController session;

  @override
  State<ArtifactsTab> createState() => _ArtifactsTabState();
}

class _ArtifactsTabState extends State<ArtifactsTab> {
  List<Map<String, dynamic>> _items = [];
  String? _error;
  bool _loading = false;

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

  Future<void> _reload() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (home == null || accountId == null) {
      setState(() {
        _items = [];
        _error = accountId == null ? 'Set an account to list artifacts.' : null;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final body = await home.listArtifacts(accountId: accountId);
      final raw = body['artifacts'];
      final list = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final a in raw) {
          if (a is Map) list.add(Map<String, dynamic>.from(a));
        }
      }
      if (mounted) {
        setState(() {
          _items = list;
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

  Future<void> _open(Map<String, dynamic> art) async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    final path = art['path']?.toString();
    if (home == null || accountId == null || path == null || path.isEmpty) {
      return;
    }
    try {
      final minted = await home.getArtifactUrl(
        accountId: accountId,
        path: path,
        ttlSec: 3600,
      );
      final url = minted['url']?.toString();
      if (url == null || url.isEmpty) {
        throw StateError('no url');
      }
      final uri = Uri.parse(url);
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!mounted) return;
      if (!ok) {
        await Clipboard.setData(ClipboardData(text: url));
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open — URL copied')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Open failed: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (_loading && _items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Artifacts', style: theme.textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(
            'Signed links from the home daemon. Tap to open.',
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                _error!,
                style: TextStyle(color: theme.colorScheme.error),
              ),
            ),
          if (_items.isEmpty && _error == null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 48),
              child: Column(
                children: [
                  Icon(
                    Icons.attach_file,
                    size: 40,
                    color: theme.colorScheme.primary.withValues(alpha: 0.4),
                  ),
                  const SizedBox(height: 12),
                  Text('No artifacts yet', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(
                    'Pull to refresh after the agent produces a file.',
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          for (final a in _items)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Card(
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor:
                        theme.colorScheme.primary.withValues(alpha: 0.12),
                    child: Icon(
                      Icons.description_outlined,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                  title: Text(
                    a['path']?.toString() ?? a['id']?.toString() ?? '?',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text(a['createdAt']?.toString() ?? ''),
                  trailing: const Icon(Icons.open_in_new),
                  onTap: () => _open(a),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
