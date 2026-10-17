import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../l10n/locale_controller.dart';
import '../l10n/theme_controller.dart';
import '../services/push_service.dart';
import '../state/session_controller.dart';
import 'chat_tab.dart';
import 'connections_screen.dart';
import 'llm_screen.dart';
import 'pair_screen.dart';
import 'settings_hub.dart';
import 'skills_screen.dart';
import 'system_screen.dart';

const _kWideBreakpoint = 840.0;

class HomeShell extends StatefulWidget {
  const HomeShell({
    super.key,
    required this.session,
    required this.locales,
    required this.themes,
  });

  final SessionController session;
  final LocaleController locales;
  final ThemeController themes;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  /// Phone: Chat / Home? / Settings. Tablet: Chat / Home? / LLM / Connections / Skills / System.
  int _tab = 0;
  bool _haHomeReady = false;
  final _accountCtrl = TextEditingController();
  final _settingsNav = GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();
    _accountCtrl.text = widget.session.accountId ?? '';
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
    unawaited(_refreshHaReady());
    widget.session.addListener(_onSession);
  }

  void _onSession() {
    unawaited(_refreshHaReady());
    if (mounted) setState(() {});
  }

  Future<void> _openPairing() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => PairScreen(session: widget.session),
      ),
    );
  }

  /// Prefer silent reconnect from saved pairing; open QR only when none saved.
  Future<void> _requestConnect() async {
    if (widget.session.hasSavedPairing) {
      await widget.session.reconnect();
      return;
    }
    await _openPairing();
  }

  Future<void> _refreshHaReady() async {
    final home = widget.session.session;
    if (home == null) {
      if (mounted) setState(() => _haHomeReady = false);
      return;
    }
    try {
      final st = await home.getChannelStatus(id: 'homeassistant');
      final ready = st['ready'] == true ||
          (st['enabled'] == true &&
              (st['config'] is Map) &&
              ((st['config'] as Map)['baseUrl']?.toString().isNotEmpty ?? false));
      if (!mounted) return;
      setState(() {
        _haHomeReady = ready;
        if (!_haHomeReady && _isOnHomeTab) {
          _tab = 0;
        }
      });
    } catch (_) {
      if (mounted) setState(() => _haHomeReady = false);
    }
  }

  bool get _isOnHomeTab {
    if (!_haHomeReady) return false;
    return _tab == 1;
  }

  void _onPushTap(Map<String, dynamic> data) {
    final type = data['type']?.toString();
    final account = data['accountId']?.toString();
    if (account != null && account.isNotEmpty) {
      widget.session.setAccountId(account);
      _accountCtrl.text = account;
    }
    if (type == 'approval' || type == 'test') {
      setState(() => _tab = 0);
    } else if (type == 'schedule' || type == 'schedule-fired') {
      setState(() => _tab = _phoneSettingsIndex);
    }
  }

  int get _phoneSettingsIndex => _haHomeReady ? 2 : 1;

  @override
  void dispose() {
    widget.session.removeListener(_onSession);
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

  Future<void> _createAccount() async {
    final home = widget.session.session;
    final l10n = AppLocalizations.of(context);
    if (home == null) return;
    final nameCtrl = TextEditingController();
    final idCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.shellCreateProfile),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameCtrl,
              decoration: InputDecoration(labelText: l10n.shellProfileDisplayName),
              autofocus: true,
            ),
            TextField(
              controller: idCtrl,
              decoration: InputDecoration(
                labelText: l10n.shellProfileIdOptional,
                hintText: 'alice',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.shellCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.shellCreate),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final name = nameCtrl.text.trim();
    if (name.isEmpty) return;
    try {
      final res = await home.createAccount(
        displayName: name,
        accountId: idCtrl.text.trim().isEmpty ? null : idCtrl.text.trim(),
      );
      final account = res['account'];
      final newId = account is Map
          ? account['accountId']?.toString() ?? account['id']?.toString()
          : null;
      if (newId != null && newId.isNotEmpty) {
        widget.session.setAccountId(newId);
        _accountCtrl.text = newId;
      }
      // Refresh hello so chips update if daemon returns new accountIds.
      final hello = await home.hello();
      widget.session.applyHello(hello);
      if (mounted) setState(() {});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.shellProfileCreated)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.shellProfileCreateFailed('$e'))),
        );
      }
    }
  }

  List<Widget> _phoneBodies(SessionController session) {
    final connected = session.isConnected;
    return [
      ChatTab(
        session: session,
        purpose: 'general',
        onRequestConnect: connected ? null : _requestConnect,
        onRequestPairAgain: connected ? null : _openPairing,
      ),
      if (connected && _haHomeReady) ChatTab(session: session, purpose: 'home'),
      Navigator(
        key: _settingsNav,
        onGenerateRoute: (settings) => MaterialPageRoute(
          builder: (_) => SettingsHub(
            session: session,
            onRequestConnect: connected ? null : _requestConnect,
            onRequestPairAgain: connected ? null : _openPairing,
          ),
          settings: settings,
        ),
      ),
    ];
  }

  List<NavigationDestination> _phoneDestinations(AppLocalizations l10n) {
    final connected = widget.session.isConnected;
    return [
      NavigationDestination(
        icon: const Icon(Icons.chat_bubble_outline),
        selectedIcon: const Icon(Icons.chat_bubble),
        label: l10n.navChat,
      ),
      if (connected && _haHomeReady)
        NavigationDestination(
          icon: const Icon(Icons.home_outlined),
          selectedIcon: const Icon(Icons.home),
          label: l10n.navHomeChat,
        ),
      NavigationDestination(
        icon: const Icon(Icons.settings_outlined),
        selectedIcon: const Icon(Icons.settings),
        label: l10n.navSettings,
      ),
    ];
  }

  /// Tablet bodies follow desktop sidebar order (Settings hub when unpaired).
  List<Widget> _tabletBodies(SessionController session) {
    final connected = session.isConnected;
    if (!connected) {
      return [
        ChatTab(
          session: session,
          purpose: 'general',
          onRequestConnect: _requestConnect,
          onRequestPairAgain: _openPairing,
        ),
        _SettingsPane(
          child: SettingsHub(
            session: session,
            onRequestConnect: _requestConnect,
            onRequestPairAgain: _openPairing,
          ),
        ),
      ];
    }
    return [
      ChatTab(session: session, purpose: 'general'),
      if (_haHomeReady) ChatTab(session: session, purpose: 'home'),
      // Nested navigator so each Settings section can push editors.
      _SettingsPane(child: LlmScreen(session: session)),
      _SettingsPane(child: ConnectionsScreen(session: session)),
      _SettingsPane(child: SkillsScreen(session: session)),
      _SettingsPane(child: SystemScreen(session: session)),
    ];
  }

  List<NavigationRailDestination> _tabletDestinations(AppLocalizations l10n) {
    final connected = widget.session.isConnected;
    if (!connected) {
      return [
        NavigationRailDestination(
          icon: const Icon(Icons.chat_bubble_outline),
          selectedIcon: const Icon(Icons.chat_bubble),
          label: Text(l10n.navChat),
        ),
        NavigationRailDestination(
          icon: const Icon(Icons.settings_outlined),
          selectedIcon: const Icon(Icons.settings),
          label: Text(l10n.navSettings),
        ),
      ];
    }
    return [
      NavigationRailDestination(
        icon: const Icon(Icons.chat_bubble_outline),
        selectedIcon: const Icon(Icons.chat_bubble),
        label: Text(l10n.navChat),
      ),
      if (_haHomeReady)
        NavigationRailDestination(
          icon: const Icon(Icons.home_outlined),
          selectedIcon: const Icon(Icons.home),
          label: Text(l10n.navHomeChat),
        ),
      NavigationRailDestination(
        icon: const Icon(Icons.smart_toy_outlined),
        selectedIcon: const Icon(Icons.smart_toy),
        label: Text(l10n.navLlm),
      ),
      NavigationRailDestination(
        icon: const Icon(Icons.link_outlined),
        selectedIcon: const Icon(Icons.link),
        label: Text(l10n.navConnections),
      ),
      NavigationRailDestination(
        icon: const Icon(Icons.auto_awesome_outlined),
        selectedIcon: const Icon(Icons.auto_awesome),
        label: Text(l10n.navSkills),
      ),
      NavigationRailDestination(
        icon: const Icon(Icons.settings_outlined),
        selectedIcon: const Icon(Icons.settings),
        label: Text(l10n.navSystem),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    final l10n = AppLocalizations.of(context);
    final connected = session.isConnected;
    final product = session.hello?['product'] ?? l10n.appName;
    final mesh = (session.hello?['mesh'] as Map?)?['kind'] ?? '—';
    final healthOk = session.health?['ok'] == true;
    final theme = Theme.of(context);
    final bound = _helloAccounts;
    final wide = MediaQuery.sizeOf(context).width >= _kWideBreakpoint;

    final statusLabel = !connected
        ? l10n.shellOffline
        : (healthOk ? l10n.shellOnline : l10n.shellDegraded);
    final statusColor = !connected
        ? theme.colorScheme.onSurface.withValues(alpha: 0.45)
        : (healthOk ? theme.colorScheme.primary : theme.colorScheme.error);

    final appBar = AppBar(
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
                connected
                    ? (healthOk ? Icons.circle : Icons.error_outline)
                    : Icons.circle_outlined,
                size: 12,
                color: statusColor,
              ),
              label: Text(statusLabel),
              visualDensity: VisualDensity.compact,
              padding: EdgeInsets.zero,
            ),
          ),
        ),
        PopupMenuButton<ThemeMode>(
          tooltip: l10n.appThemePicker,
          icon: Icon(
            Theme.of(context).brightness == Brightness.dark
                ? Icons.dark_mode_outlined
                : Icons.light_mode_outlined,
          ),
          onSelected: (mode) => widget.themes.setMode(mode),
          itemBuilder: (context) {
            final current = widget.themes.mode;
            PopupMenuItem<ThemeMode> item(ThemeMode mode, String label) {
              final theme = Theme.of(context);
              return PopupMenuItem<ThemeMode>(
                value: mode,
                child: Text(
                  label,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurface,
                    fontWeight: mode == current
                        ? FontWeight.w700
                        : FontWeight.w400,
                  ),
                ),
              );
            }

            return [
              item(ThemeMode.system, l10n.appThemeSystem),
              item(ThemeMode.light, l10n.appThemeLight),
              item(ThemeMode.dark, l10n.appThemeDark),
            ];
          },
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
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Theme.of(context).colorScheme.onSurface,
                          fontWeight:
                              id == current ? FontWeight.w700 : FontWeight.w400,
                        ),
                  ),
                ),
            ];
          },
        ),
        if (connected)
          IconButton(
            tooltip: l10n.shellDisconnect,
            onPressed: () => session.disconnect(),
            icon: const Icon(Icons.link_off),
          )
        else if (session.hasSavedPairing) ...[
          IconButton(
            tooltip: l10n.shellReconnect,
            onPressed: session.busy ? null : _requestConnect,
            icon: session.busy
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.link),
          ),
          IconButton(
            tooltip: l10n.shellConnect,
            onPressed: _openPairing,
            icon: const Icon(Icons.qr_code_2),
          ),
        ] else
          IconButton(
            tooltip: l10n.shellConnect,
            onPressed: _openPairing,
            icon: const Icon(Icons.qr_code_2),
          ),
      ],
    );

    final profileCard = !connected
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: bound.isEmpty
                              ? Text(
                                  l10n.shellProfilePending,
                                  style: theme.textTheme.bodyMedium,
                                )
                              : bound.length == 1
                                  ? Text(
                                      l10n.shellProfileOne(bound.first),
                                      style: theme.textTheme.titleSmall?.copyWith(
                                        fontWeight: FontWeight.w600,
                                      ),
                                    )
                                  : Text(
                                      l10n.shellProfile,
                                      style: theme.textTheme.labelLarge,
                                    ),
                        ),
                        TextButton.icon(
                          onPressed: _createAccount,
                          icon: const Icon(Icons.person_add_alt_1, size: 18),
                          label: Text(l10n.shellCreateProfile),
                        ),
                      ],
                    ),
                    if (bound.length > 1) ...[
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
          );

    if (wide) {
      final destinations = _tabletDestinations(l10n);
      final bodies = _tabletBodies(session);
      final maxIdx = destinations.length - 1;
      final selected = _tab.clamp(0, maxIdx);
      return Scaffold(
        appBar: appBar,
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: selected,
              onDestinationSelected: (i) => setState(() => _tab = i),
              labelType: NavigationRailLabelType.all,
              destinations: destinations,
            ),
            const VerticalDivider(width: 1),
            Expanded(
              child: Column(
                children: [
                  profileCard,
                  Expanded(
                    child: IndexedStack(
                      index: selected,
                      children: bodies,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    final bodies = _phoneBodies(session);
    final dests = _phoneDestinations(l10n);
    final maxIdx = dests.length - 1;
    final selected = _tab.clamp(0, maxIdx);

    return Scaffold(
      appBar: appBar,
      body: Column(
        children: [
          profileCard,
          Expanded(
            child: IndexedStack(
              index: selected,
              children: bodies,
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selected,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: dests,
      ),
    );
  }
}

/// Hosts a Settings section that already has its own AppBar (Llm/Connections/…).
class _SettingsPane extends StatelessWidget {
  const _SettingsPane({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    // Screens use Scaffold+AppBar; nest under a navigator so push works.
    return Navigator(
      onGenerateRoute: (settings) => MaterialPageRoute(
        builder: (_) => child,
        settings: settings,
      ),
    );
  }
}
