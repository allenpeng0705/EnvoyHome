import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';

/// First-launch / unpaired empty Chat — one clear CTA (Reconnect vs Pair new).
class ChatConnectGuide extends StatelessWidget {
  const ChatConnectGuide({
    super.key,
    this.hasSavedPairing = false,
    this.busy = false,
    this.error,
    this.onConnect,
    this.onPairAgain,
    this.showActions = true,
  });

  final bool hasSavedPairing;
  final bool busy;
  final String? error;
  final VoidCallback? onConnect;
  final VoidCallback? onPairAgain;
  /// When false, parent chrome (e.g. [ConnectionBanner]) owns the CTAs.
  final bool showActions;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: Image.asset(
                'assets/logo.png',
                width: 64,
                height: 64,
                filterQuality: FilterQuality.high,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              l10n.connectGuideTitle,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              hasSavedPairing
                  ? l10n.connectGuideReconnectHint
                  : l10n.connectGuideHint,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.62),
                height: 1.4,
              ),
            ),
            // When [showActions] is false, parent chrome owns error + CTAs.
            if (showActions && error != null && error!.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                error!,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.error,
                  height: 1.35,
                ),
              ),
            ],
            if (showActions) ...[
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: busy ? null : onConnect,
                icon: Icon(hasSavedPairing ? Icons.link : Icons.qr_code_2),
                label: Text(
                  hasSavedPairing ? l10n.shellReconnect : l10n.shellConnect,
                ),
              ),
              if (hasSavedPairing && onPairAgain != null) ...[
                const SizedBox(height: 8),
                TextButton(
                  onPressed: busy ? null : onPairAgain,
                  child: Text(l10n.shellPairNewDevice),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}
