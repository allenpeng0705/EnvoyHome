import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';

bool chatApprovalIsActuation(Map<String, dynamic> row) {
  final tool = row['tool']?.toString() ?? '';
  return tool == 'ha_call_service' ||
      tool == 'mqtt_publish' ||
      row['objectId'] != null ||
      row['safetyClass'] == true;
}

/// Single pending approval card (Allow / Deny).
class ChatApprovalCard extends StatelessWidget {
  const ChatApprovalCard({
    super.key,
    required this.row,
    required this.onAllow,
    required this.onDeny,
  });

  final Map<String, dynamic> row;
  final VoidCallback onAllow;
  final VoidCallback onDeny;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    final actuation = chatApprovalIsActuation(row);
    final objectId = row['objectId']?.toString();
    final desired = row['desiredState']?.toString();
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: theme.colorScheme.primary.withValues(alpha: 0.08),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                if (actuation)
                  Chip(
                    label: Text(l10n.approvalsActuation),
                    visualDensity: VisualDensity.compact,
                  ),
                if (row['risk'] != null)
                  Chip(
                    label: Text('${row['risk']}'),
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              '${row['tool'] ?? l10n.approvalsTitle}',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '${row['summary'] ?? row['argsDigest'] ?? ''}',
              style: theme.textTheme.bodyMedium,
            ),
            if (objectId != null && objectId.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                desired != null && desired.isNotEmpty
                    ? '$objectId → $desired'
                    : objectId,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                ),
              ),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                FilledButton(
                  onPressed: onAllow,
                  child: Text(l10n.approvalsAllow),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: onDeny,
                  child: Text(l10n.approvalsDeny),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
