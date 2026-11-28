import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';

/// Expandable Needs-you strip (cards supplied by parent).
class ChatNeedsYouPanel extends StatelessWidget {
  const ChatNeedsYouPanel({
    super.key,
    required this.count,
    required this.expanded,
    required this.onToggleExpanded,
    required this.children,
  });

  final int count;
  final bool expanded;
  final VoidCallback onToggleExpanded;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    if (count <= 0 && children.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    final titleCount = count > 0 ? count : children.length;
    return Material(
      color: theme.colorScheme.primaryContainer.withValues(alpha: 0.35),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: onToggleExpanded,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
              child: Row(
                children: [
                  Icon(
                    Icons.priority_high_rounded,
                    size: 18,
                    color: theme.colorScheme.primary,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      l10n.needsYouTitle(titleCount),
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Icon(
                    expanded ? Icons.expand_more : Icons.chevron_right,
                    size: 22,
                  ),
                ],
              ),
            ),
          ),
          if (expanded)
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 280),
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: children,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
