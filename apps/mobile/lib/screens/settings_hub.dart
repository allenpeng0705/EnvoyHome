import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';
import 'connections_screen.dart';
import 'llm_screen.dart';
import 'skills_screen.dart';
import 'system_screen.dart';

/// Settings hub listing desktop §10.1 groups (LLM / Connections / Skills / System).
/// Profiles live under System (first tab) — Design `2026-10-18ai`.
class SettingsHub extends StatelessWidget {
  const SettingsHub({
    super.key,
    required this.session,
    this.onRequestConnect,
    this.onRequestPairAgain,
  });

  final SessionController session;
  final VoidCallback? onRequestConnect;
  final VoidCallback? onRequestPairAgain;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);

    if (!session.isConnected) {
      final saved = session.hasSavedPairing;
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Text(l10n.navSettings, style: theme.textTheme.titleLarge),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    l10n.connectGuideTitle,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    saved
                        ? l10n.connectGuideReconnectHint
                        : l10n.settingsNeedConnect,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.62),
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: session.busy ? null : onRequestConnect,
                    icon: Icon(saved ? Icons.link : Icons.qr_code_2),
                    label: Text(saved ? l10n.shellReconnect : l10n.shellConnect),
                  ),
                  if (saved && onRequestPairAgain != null) ...[
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: session.busy ? null : onRequestPairAgain,
                      child: Text(l10n.shellConnect),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        Text(l10n.navSettings, style: theme.textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(l10n.settingsHubHint, style: theme.textTheme.bodySmall),
        const SizedBox(height: 16),
        _tile(
          context,
          icon: Icons.smart_toy_outlined,
          title: l10n.navLlm,
          subtitle: l10n.settingsLlmSubtitle,
          builder: (_) => LlmScreen(session: session),
        ),
        _tile(
          context,
          icon: Icons.link_outlined,
          title: l10n.navConnections,
          subtitle: l10n.settingsConnectionsSubtitle,
          builder: (_) => ConnectionsScreen(session: session),
        ),
        _tile(
          context,
          icon: Icons.auto_awesome_outlined,
          title: l10n.navSkills,
          subtitle: l10n.settingsSkillsSubtitle,
          builder: (_) => SkillsScreen(session: session),
        ),
        _tile(
          context,
          icon: Icons.settings_outlined,
          title: l10n.navSystem,
          subtitle: l10n.settingsSystemSubtitle,
          builder: (_) => SystemScreen(session: session),
        ),
      ],
    );
  }

  Widget _tile(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required WidgetBuilder builder,
  }) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(builder: builder),
          );
        },
      ),
    );
  }
}
