import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../l10n/locale_controller.dart';
import '../services/push_service.dart';
import '../state/session_controller.dart';
import 'artifacts_tab.dart';
import 'chat_tab.dart';
import 'models_tab.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({
    super.key,
    required this.session,
    required this.locales,
  });

  final SessionController session;
  final LocaleController locales;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;
  final _accountCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _accountCtrl.text = widget.session.accountId ?? '';
    // Single bound profile: no manual account id entry.
    final bound = _helloAccounts;
    if (bound.length == 1 &&
        (widget.session.accountId == null || widget.session.accountId!.isEmpty)) {
      widget.session.setAccountId(bound.first);
      _accountCtrl.text = bound.first;
    }
    PushService.instance.onTap = _onPushTap;
    final pending = PushService.instance.consumePendingTap();
    if (pending != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _onPushTap(pending));
    }
  }

  void _onPushTap(Map<String, dynamic> data) {
    final type = data['type']?.toString();
    if (type == 'approval' || type == 'test') {
      final account = data['accountId']?.toString();
      if (account != null && account.isNotEmpty) {
        widget.session.setAccountId(account);
        _accountCtrl.text = account;
      }
      // Approvals live in Chat (tab 0).
      setState(() => _tab = 0);
    }
  }

  @override
  void dispose() {
    if (PushService.instance.onTap == _onPushTap) {
      PushService.instance.onTap = null;
    }
    _accountCtrl.dispose();
    super.dispose();
  }

  List<String> get _helloAccounts {
    final ids = widget.session.hello?['accountIds'];
    if (ids is! List) return const [];
    return ids
        .whereType<String>()
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    final l10n = AppLocalizations.of(context);
    final product = session.hello?['product'] ?? l10n.appName;
    final mesh = (session.hello?['mesh'] as Map?)?['kind'] ?? '—';
    final healthOk = session.health?['ok'] == true;
    final theme = Theme.of(context);
    final bound = _helloAccounts;

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(7),
              child: Image.asset(
                'assets/logo.png',
                width: 28,
                height: 28,
                filterQuality: FilterQuality.high,
              ),
            ),
            const SizedBox(width: 10),
            Flexible(child: Text('$product')),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: Center(
              child: Chip(
                avatar: Icon(
                  healthOk ? Icons.circle : Icons.error_outline,
                  size: 12,
                  color: healthOk
                      ? theme.colorScheme.primary
                      : theme.colorScheme.error,
                ),
                label: Text(healthOk ? l10n.shellOnline : l10n.shellDegraded),
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
              ),
            ),
          ),
          PopupMenuButton<String>(
            tooltip: l10n.appLanguage,
            icon: const Icon(Icons.language),
            onSelected: (id) => widget.locales.setLocaleId(id),
            itemBuilder: (context) {
              final current = widget.locales.override?.languageCode ??
                  Localizations.localeOf(context).languageCode;
              return [
                for (final id in supportedLocaleIds)
                  PopupMenuItem(
                    value: id,
                    child: Text(
                      localeLabels[id] ?? id,
                      style: TextStyle(
                        fontWeight:
                            id == current ? FontWeight.w700 : FontWeight.w400,
                      ),
                    ),
                  ),
              ];
            },
          ),
          IconButton(
            tooltip: l10n.shellDisconnect,
            onPressed: () => session.disconnect(),
            icon: const Icon(Icons.link_off),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (bound.isEmpty)
                      Text(
                        l10n.shellProfilePending,
                        style: theme.textTheme.bodyMedium,
                      )
                    else if (bound.length == 1)
                      Text(
                        l10n.shellProfileOne(bound.first),
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      )
                    else ...[
                      Text(
                        l10n.shellProfile,
                        style: theme.textTheme.labelLarge,
                      ),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final id in bound)
                            ChoiceChip(
                              label: Text(id),
                              selected: session.accountId == id,
                              onSelected: (_) {
                                _accountCtrl.text = id;
                                session.setAccountId(id);
                                setState(() {});
                              },
                            ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 4),
                    Text(
                      l10n.shellMeshHint(mesh.toString()),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Expanded(
            child: IndexedStack(
              index: _tab,
              children: [
                ChatTab(session: session),
                ModelsTab(session: session),
                ArtifactsTab(session: session),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.chat_bubble_outline),
            selectedIcon: const Icon(Icons.chat_bubble),
            label: l10n.navChat,
          ),
          NavigationDestination(
            icon: const Icon(Icons.smart_toy_outlined),
            selectedIcon: const Icon(Icons.smart_toy),
            label: l10n.navModels,
          ),
          NavigationDestination(
            icon: const Icon(Icons.attach_file_outlined),
            selectedIcon: const Icon(Icons.attach_file),
            label: l10n.navArtifacts,
          ),
        ],
      ),
    );
  }
}
