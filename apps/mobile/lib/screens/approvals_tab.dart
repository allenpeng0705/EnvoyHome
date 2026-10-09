import 'package:flutter/material.dart';

import '../state/session_controller.dart';

class ApprovalsTab extends StatefulWidget {
  const ApprovalsTab({super.key, required this.session});

  final SessionController session;

  @override
  State<ApprovalsTab> createState() => _ApprovalsTabState();
}

class _ApprovalsTabState extends State<ApprovalsTab> {
  List<Map<String, dynamic>> _rows = [];
  String? _error;
  bool _loading = false;

  Future<void> _refresh() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (home == null || accountId == null) {
      setState(() => _error = 'Set an account to load approvals.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final listed = await home.listApprovals(accountId: accountId);
      final raw = listed['approvals'];
      final rows = raw is List
          ? raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
          : <Map<String, dynamic>>[];
      setState(() => _rows = rows);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _answer(Map<String, dynamic> row, String decision) async {
    final home = widget.session.session;
    if (home == null) return;
    try {
      await home.answerApproval(
        id: row['id'] as String,
        decision: decision,
        argsDigest: row['argsDigest'] as String? ?? '',
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(decision == 'allow' ? 'Allowed' : 'Denied')),
        );
      }
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e')),
      );
    }
  }

  bool _isActuation(Map<String, dynamic> row) {
    final t = row['tool']?.toString() ?? '';
    return t == 'ha_call_service' ||
        t == 'mqtt_publish' ||
        row['objectId'] != null ||
        row['safetyClass'] == true;
  }

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Approvals', style: theme.textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(
            'Tool and actuation requests waiting for a decision.',
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          if (_loading) const LinearProgressIndicator(),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                _error!,
                style: TextStyle(color: theme.colorScheme.error),
              ),
            ),
          if (!_loading && _rows.isEmpty && _error == null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 48),
              child: Column(
                children: [
                  Icon(
                    Icons.verified_user_outlined,
                    size: 40,
                    color: theme.colorScheme.primary.withValues(alpha: 0.4),
                  ),
                  const SizedBox(height: 12),
                  Text('Inbox clear', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(
                    'Nothing pending right now.',
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          for (final row in _rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          if (_isActuation(row))
                            Chip(
                              label: const Text('Actuation'),
                              visualDensity: VisualDensity.compact,
                            ),
                          Chip(
                            label: Text('${row['risk'] ?? '—'}'),
                            visualDensity: VisualDensity.compact,
                          ),
                          Chip(
                            label: Text('${row['origin'] ?? '—'}'),
                            visualDensity: VisualDensity.compact,
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '${row['tool'] ?? 'tool'}',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${row['summary'] ?? row['argsDigest'] ?? ''}',
                        style: theme.textTheme.bodyMedium,
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          FilledButton(
                            onPressed: () => _answer(row, 'allow'),
                            child: const Text('Allow'),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton(
                            onPressed: () => _answer(row, 'deny'),
                            child: const Text('Deny'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
