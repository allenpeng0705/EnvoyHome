/// Phone/tablet "More" hub — Member daily items first; Owner Advanced buried.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../l10n/locale_controller.dart';
import '../l10n/theme_controller.dart';
import '../state/session_controller.dart';
import 'chat_tab.dart';
import 'connections_screen.dart';
import 'llm_screen.dart';
import 'onboarding/setup_guide_screen.dart';
import 'pair_screen.dart';
import 'profiles_screen.dart';
import 'skills_screen.dart';
import 'system_screen.dart';

class MoreHub extends StatefulWidget {
  const MoreHub({
    super.key,
    required this.session,
    required this.locales,
    required this.themes,
    this.onRequestConnect,
    this.onRequestPairAgain,
    this.haHomeReady = false,
    this.deferOfflineActions = false,
  });

  final SessionController session;
  final LocaleController locales;
  final ThemeController themes;
  final VoidCallback? onRequestConnect;
  final VoidCallback? onRequestPairAgain;
  final bool haHomeReady;
  /// Parent [ConnectionBanner] owns Connect/Reconnect — keep More copy-only.
  final bool deferOfflineActions;

  @override
  State<MoreHub> createState() => _MoreHubState();
}

class _MoreHubState extends State<MoreHub> {
  bool _ownerDevice = false;
  bool _ownerProbed = false;

  @override
  void initState() {
    super.initState();
    widget.session.addListener(_onSession);
    unawaited(_probeOwner());
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSession);
    super.dispose();
  }

  void _onSession() {
    unawaited(_probeOwner());
    if (mounted) setState(() {});
  }

  Future<void> _probeOwner() async {
    final home = widget.session.session;
    if (home == null) {
      if (mounted) {
        setState(() {
          _ownerDevice = false;
          _ownerProbed = true;
        });
      }
      return;
    }
    try {
      final own = await home.getHouseholdOwner();
      final ownerId = own['ownerAccountId']?.toString();
      final ids = widget.session.hello?['accountIds'];
      final bound = ids is List
          ? ids.map((e) => e.toString()).where((s) => s.isNotEmpty).toList()
          : <String>[];
      final isOwner = ownerId != null &&
          ownerId.isNotEmpty &&
          bound.length == 1 &&
          bound.first == ownerId;
      if (mounted) {
        setState(() {
          _ownerDevice = isOwner;
          _ownerProbed = true;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _ownerDevice = false;
          _ownerProbed = true;
        });
      }
    }
  }

  Future<bool> _pairFromGuide(BuildContext context) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => PairScreen(session: widget.session)),
    );
    return widget.session.isConnected;
  }

  void _push(Widget page) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final session = widget.session;
    final connected = session.isConnected;

    if (!connected) {
      final saved = session.hasSavedPairing;
      final showActions = !widget.deferOfflineActions;
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Text(l10n.navMore, style: theme.textTheme.titleLarge),
          const SizedBox(height: 16),
          Text(
            saved ? l10n.connectGuideReconnectHint : l10n.connectGuideHint,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              height: 1.35,
            ),
          ),
          if (session.error != null &&
              session.error!.isNotEmpty &&
              showActions) ...[
            const SizedBox(height: 12),
            Text(
              session.error!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
          ],
          if (showActions) ...[
            const SizedBox(height: 16),
            if (saved)
              FilledButton.icon(
                onPressed: session.busy ? null : widget.onRequestConnect,
                icon: const Icon(Icons.link),
                label: Text(l10n.shellReconnect),
              ),
            if (saved) const SizedBox(height: 8),
            FilledButton.tonalIcon(
              onPressed: session.busy ? null : widget.onRequestPairAgain,
              icon: const Icon(Icons.qr_code_2),
              label: Text(saved ? l10n.shellPairNewDevice : l10n.shellConnect),
            ),
            const SizedBox(height: 16),
          ] else
            const SizedBox(height: 16),
          _openTile(
            context,
            icon: Icons.info_outline,
            title: l10n.setupGuideTitle,
            subtitle: l10n.settingsSetupGuideSubtitle,
            onTap: () => unawaited(
              showSetupGuide(
                context,
                onPairNow: () => _pairFromGuide(context),
              ),
            ),
          ),
          _appearanceSection(context, l10n),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        Text(l10n.navMore, style: theme.textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(
          l10n.moreHubHint,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 16),
        _sectionLabel(context, l10n.moreSectionDaily),
        _openTile(
          context,
          icon: Icons.person_outline,
          title: l10n.navProfiles,
          subtitle: l10n.settingsProfilesSubtitle,
          onTap: () => _push(ProfilesScreen(session: session)),
        ),
        _openTile(
          context,
          icon: Icons.folder_outlined,
          title: l10n.sysTabFiles,
          subtitle: l10n.moreFilesSubtitle,
          onTap: () => _push(SystemScreen(session: session, initialTab: 1)),
        ),
        if (widget.haHomeReady)
          _openTile(
            context,
            icon: Icons.home_outlined,
            title: l10n.navHomeChat,
            subtitle: l10n.moreHomeChatSubtitle,
            onTap: () => _push(
              Scaffold(
                appBar: AppBar(title: Text(l10n.navHomeChat)),
                body: ChatTab(session: session, purpose: 'home'),
              ),
            ),
          ),
        _appearanceSection(context, l10n),
        _openTile(
          context,
          icon: Icons.info_outline,
          title: l10n.setupGuideTitle,
          subtitle: l10n.settingsSetupGuideSubtitle,
          onTap: () => unawaited(showSetupGuide(context)),
        ),
        const SizedBox(height: 12),
        _sectionLabel(context, l10n.moreSectionAdvanced),
        // Fail closed: hide Owner tools until probe completes (no Member flash).
        if (!_ownerProbed)
          const Padding(
            padding: EdgeInsets.only(bottom: 12),
            child: Align(
              alignment: Alignment.centerLeft,
              child: SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          )
        else if (_ownerDevice) ...[
          _openTile(
            context,
            icon: Icons.smart_toy_outlined,
            title: l10n.navLlm,
            subtitle: l10n.settingsLlmSubtitle,
            onTap: () => _push(LlmScreen(session: session)),
          ),
          _openTile(
            context,
            icon: Icons.link_outlined,
            title: l10n.navConnections,
            subtitle: l10n.settingsConnectionsSubtitle,
            onTap: () => _push(ConnectionsScreen(session: session)),
          ),
          _openTile(
            context,
            icon: Icons.auto_awesome_outlined,
            title: l10n.navSkills,
            subtitle: l10n.settingsSkillsSubtitle,
            onTap: () => _push(SkillsScreen(session: session)),
          ),
          _openTile(
            context,
            icon: Icons.account_tree_outlined,
            title: l10n.skillsTabWorkflows,
            subtitle: l10n.settingsWorkflowsSubtitle,
            onTap: () => _push(WorkflowsScreen(session: session)),
          ),
        ] else
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(
              l10n.moreAdvancedOwnerOnly,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                height: 1.35,
              ),
            ),
          ),
        _openTile(
          context,
          icon: Icons.monitor_heart_outlined,
          title: l10n.navSystem,
          subtitle: l10n.settingsSystemSubtitle,
          onTap: () => _push(SystemScreen(session: session)),
        ),
      ],
    );
  }

  Widget _appearanceSection(BuildContext context, AppLocalizations l10n) {
    final theme = Theme.of(context);
    final mode = widget.themes.mode;
    final localeId = widget.locales.override?.languageCode ??
        Localizations.localeOf(context).languageCode;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      elevation: 0,
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.palette_outlined),
            title: Text(l10n.appThemePicker),
            subtitle: Text(
              mode == ThemeMode.dark
                  ? l10n.appThemeDark
                  : mode == ThemeMode.light
                      ? l10n.appThemeLight
                      : l10n.appThemeSystem,
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () async {
              final next = await showModalBottomSheet<ThemeMode>(
                context: context,
                builder: (ctx) => SafeArea(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ListTile(
                        title: Text(l10n.appThemeSystem),
                        onTap: () => Navigator.pop(ctx, ThemeMode.system),
                      ),
                      ListTile(
                        title: Text(l10n.appThemeLight),
                        onTap: () => Navigator.pop(ctx, ThemeMode.light),
                      ),
                      ListTile(
                        title: Text(l10n.appThemeDark),
                        onTap: () => Navigator.pop(ctx, ThemeMode.dark),
                      ),
                    ],
                  ),
                ),
              );
              if (next != null) await widget.themes.setMode(next);
            },
          ),
          Divider(height: 1, color: theme.dividerColor),
          ListTile(
            leading: const Icon(Icons.language),
            title: Text(l10n.appLanguage),
            subtitle: Text(localeLabels[localeId] ?? localeId),
            trailing: const Icon(Icons.chevron_right),
            onTap: () async {
              final next = await showModalBottomSheet<String>(
                context: context,
                builder: (ctx) => SafeArea(
                  child: ListView(
                    shrinkWrap: true,
                    children: [
                      for (final id in supportedLocaleIds)
                        ListTile(
                          title: Text(localeLabels[id] ?? id),
                          onTap: () => Navigator.pop(ctx, id),
                        ),
                    ],
                  ),
                ),
              );
              if (next != null) await widget.locales.setLocaleId(next);
            },
          ),
        ],
      ),
    );
  }

  Widget _sectionLabel(BuildContext context, String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, top: 4),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              letterSpacing: 0.3,
            ),
      ),
    );
  }

  Widget _openTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      leading: Icon(icon),
      title: Text(title),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    );
  }
}
