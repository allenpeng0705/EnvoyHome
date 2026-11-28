import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';

/// Persistent offline / degraded strip (clear Reconnect vs Pair new).
class ConnectionBanner extends StatelessWidget {
  const ConnectionBanner({
    super.key,
    required this.session,
    required this.onReconnect,
    required this.onPairNew,
    this.error,
  });

  final SessionController session;
  final VoidCallback onReconnect;
  final VoidCallback onPairNew;
  final String? error;

  @override
  Widget build(BuildContext context) {
    if (session.isConnected) return const SizedBox.shrink();
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final saved = session.hasSavedPairing;
    final err = error ?? session.error;

    return Material(
      color: theme.colorScheme.errorContainer.withValues(alpha: 0.55),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                saved ? l10n.bannerOfflineSaved : l10n.bannerOfflineUnpaired,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              if (err != null && err.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  err,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onErrorContainer,
                    height: 1.3,
                  ),
                ),
              ],
              const SizedBox(height: 10),
              Row(
                children: [
                  if (saved)
                    FilledButton(
                      onPressed: session.busy ? null : onReconnect,
                      child: Text(l10n.shellReconnect),
                    ),
                  if (saved) const SizedBox(width: 8),
                  FilledButton.tonal(
                    onPressed: session.busy ? null : onPairNew,
                    child: Text(
                      saved ? l10n.shellPairNewDevice : l10n.shellConnect,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
