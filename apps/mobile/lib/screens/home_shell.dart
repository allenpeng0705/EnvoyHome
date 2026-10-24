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
import 'profiles_screen.dart';
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
  /// Phone: Chat / Home? / Settings. Tablet: Chat / Home? / Profiles / LLM / Connections / Skills / System.
  int _tab = 0;
  bool _haHomeReady = false;
  final _settingsNav = GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();
    final bound = _helloAccounts;
    if (bound.length == 1 &&
        (widget.session.accountId == null || widget.session.accountId!.isEmpty)) {
      widget.session.setAccountId(bound.first);
    }
    PushService.instance.onTap = _onPushTap;
    final pending = PushService.instance.consumePendingTap();
    if (pending != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _onPushTap(pending));
    }
    unawaited(_refreshHaReady());
    widget.session.addListener(_onSession);
  }

  String? _lastShownError;

  void _onSession() {
    unawaited(_refreshHaReady());
    _maybeShowSessionError();
    if (mounted) setState(() {});
  }

  void _maybeShowSessionError() {
    final err = widget.session.error;
    if (err == null || err.isEmpty || err == _lastShownError) return;
    if (widget.session.isConnected || widget.session.busy) return;
    _lastShownError = err;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final messenger = ScaffoldMessenger.maybeOf(context);
      messenger?.showSnackBar(
        SnackBar(
          content: Text(err),
          duration: const Duration(seconds: 6),
        ),
      );
    });
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
    _lastShownError = null;
    // Reload join from prefs when memory is empty (soft-disconnect / cold edge).
    if (!widget.session.hasSavedPairing) {
      await widget.session.reconnect();
      if (widget.session.isConnected) return;
      if (!widget.session.hasSavedPairing) {
        await _openPairing();
        return;
      }
      // Prefs had a join; reconnect already ran (and may have failed).
      if (mounted) _maybeShowSessionError();
      return;
    }
    await widget.session.reconnect();
    if (mounted) _maybeShowSessionError();
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
        final wasReady = _haHomeReady;
        _haHomeReady = ready;
        // Home chat is inserted at index 1 when HA becomes ready — remap selection.
        if (!wasReady && ready) {
          if (_tab >= 1) _tab = _tab + 1;
        } else if (wasReady && !ready) {
          if (_tab == 1) {
            _tab = 0;
          } else if (_tab > 1) {
            _tab = _tab - 1;
          }
        }
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          final wasReady = _haHomeReady;
          _haHomeReady = false;
          if (wasReady) {
            if (_tab == 1) {
              _tab = 0;
            } else if (_tab > 1) {
              _tab = _tab - 1;
            }
          }
        });
      }
    }
  }

  void _onPushTap(Map<String, dynamic> data) {
    final type = data['type']?.toString();
    final account = data['accountId']?.toString();
    if (account != null && account.isNotEmpty) {
      widget.session.setAccountId(account);
    }
    // Design `2026-10-22f` tap targets (Chat=0, Schedules=1).
    final tab = pushTapTabIndex(type);
    if (tab != null) setState(() => _tab = tab);
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSession);
    if (PushService.instance.onTap == _onPushTap) {
      PushService.instance.onTap = null;
    }
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

  Future<void> _confirmForgetPairing() async {
    final l10n = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.shellForgetPairing),
        content: Text(l10n.connForgetConfirm('this phone')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.shellCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.shellForgetPairing),
          ),
        ],
      ),
    );
    if (ok == true && mounted) {
      await widget.session.disconnect(forgetPairing: true);
    }
  }

  Future<void> _onShellMenu(String value) async {
    final session = widget.session;
    if (value.startsWith('profile:')) {
      final id = value.substring('profile:'.length);
      session.setAccountId(id);
      setState(() {});
      return;
    }
    if (value.startsWith('locale:')) {
      await widget.locales.setLocaleId(value.substring('locale:'.length));
      return;
    }
    switch (value) {
      case 'theme:system':
        await widget.themes.setMode(ThemeMode.system);
        return;
      case 'theme:light':
        await widget.themes.setMode(ThemeMode.light);
        return;
      case 'theme:dark':
        await widget.themes.setMode(ThemeMode.dark);
        return;
      case 'conn:reconnect':
        await _requestConnect();
        return;
      case 'conn:disconnect':
        await session.disconnect();
        return;
      case 'conn:forget':
        await _confirmForgetPairing();
        return;
      case 'conn:pair':
        await _openPairing();
        return;
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
      ChatTab(
        session: session,
        purpose: 'schedules',
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
      NavigationDestination(
        icon: const Icon(Icons.event_outlined),
        selectedIcon: const Icon(Icons.event),
        label: l10n.navSchedulesChat,
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
        ChatTab(
          session: session,
          purpose: 'schedules',
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
      ChatTab(session: session, purpose: 'schedules'),
      if (_haHomeReady) ChatTab(session: session, purpose: 'home'),
      // Nested navigator so each Settings section can push editors.
      _SettingsPane(child: ProfilesScreen(session: session)),
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
          icon: const Icon(Icons.event_outlined),
          selectedIcon: const Icon(Icons.event),
          label: Text(l10n.navSchedulesChat),
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
      NavigationRailDestination(
        icon: const Icon(Icons.event_outlined),
        selectedIcon: const Icon(Icons.event),
        label: Text(l10n.navSchedulesChat),
      ),
      if (_haHomeReady)
        NavigationRailDestination(
          icon: const Icon(Icons.home_outlined),
          selectedIcon: const Icon(Icons.home),
          label: Text(l10n.navHomeChat),
        ),
      NavigationRailDestination(
        icon: const Icon(Icons.people_outline),
        selectedIcon: const Icon(Icons.people),
        label: Text(l10n.navProfiles),
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
    final healthOk = session.health?['ok'] == true;
    final theme = Theme.of(context);
    final bound = _helloAccounts;
    final wide = MediaQuery.sizeOf(context).width >= _kWideBreakpoint;

    final statusColor = !connected
        ? theme.colorScheme.onSurface.withValues(alpha: 0.35)
        : (healthOk ? theme.colorScheme.primary : theme.colorScheme.error);
    final statusTip = !connected
        ? l10n.shellOffline
        : (healthOk ? l10n.shellOnline : l10n.shellDegraded);

    final themeMode = widget.themes.mode;
    final localeId = widget.locales.override?.languageCode ??
        Localizations.localeOf(context).languageCode;

    TextStyle menuStyle({required bool selected}) =>
        theme.textTheme.bodyMedium!.copyWith(
          color: theme.colorScheme.onSurface,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
        );

    final appBar = AppBar(
      titleSpacing: 12,
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
          const SizedBox(width: 8),
          Tooltip(
            message: statusTip,
            child: Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: statusColor,
                shape: BoxShape.circle,
              ),
            ),
          ),
        ],
      ),
      actions: [
        PopupMenuButton<String>(
          tooltip: MaterialLocalizations.of(context).moreButtonTooltip,
          enabled: !session.busy,
          icon: session.busy
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.more_vert),
          onSelected: (value) => unawaited(_onShellMenu(value)),
          itemBuilder: (context) => [
            if (connected) ...[
              PopupMenuItem(
                value: 'conn:disconnect',
                child: Text(l10n.shellDisconnect, style: menuStyle(selected: false)),
              ),
            ] else ...[
              if (session.hasSavedPairing)
                PopupMenuItem(
                  value: 'conn:reconnect',
                  child: Text(l10n.shellReconnect, style: menuStyle(selected: false)),
                ),
              PopupMenuItem(
                value: 'conn:pair',
                child: Text(l10n.shellConnect, style: menuStyle(selected: false)),
              ),
              if (session.hasSavedPairing)
                PopupMenuItem(
                  value: 'conn:forget',
                  child: Text(
                    l10n.shellForgetPairing,
                    style: menuStyle(selected: false),
                  ),
                ),
            ],
            if (connected && bound.length > 1) ...[
              const PopupMenuDivider(),
              for (final id in bound)
                PopupMenuItem(
                  value: 'profile:$id',
                  child: Text(
                    l10n.shellProfileOne(id),
                    style: menuStyle(selected: session.accountId == id),
                  ),
                ),
            ],
            const PopupMenuDivider(),
            PopupMenuItem(
              value: 'theme:system',
              child: Text(
                '${l10n.appThemePicker}: ${l10n.appThemeSystem}',
                style: menuStyle(selected: themeMode == ThemeMode.system),
              ),
            ),
            PopupMenuItem(
              value: 'theme:light',
              child: Text(
                '${l10n.appThemePicker}: ${l10n.appThemeLight}',
                style: menuStyle(selected: themeMode == ThemeMode.light),
              ),
            ),
            PopupMenuItem(
              value: 'theme:dark',
              child: Text(
                '${l10n.appThemePicker}: ${l10n.appThemeDark}',
                style: menuStyle(selected: themeMode == ThemeMode.dark),
              ),
            ),
            const PopupMenuDivider(),
            for (final id in supportedLocaleIds)
              PopupMenuItem(
                value: 'locale:$id',
                child: Text(
                  '${l10n.appLanguage}: ${localeLabels[id] ?? id}',
                  style: menuStyle(selected: id == localeId),
                ),
              ),
          ],
        ),
      ],
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
              child: IndexedStack(
                index: selected,
                children: bodies,
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
    // Soft keyboard: hide the bottom nav so chat isn't squeezed above
    // NavigationBar + keyboard (newest bubbles were ending up under the keys).
    final keyboardOpen = MediaQuery.viewInsetsOf(context).bottom > 0;

    return Scaffold(
      appBar: appBar,
      resizeToAvoidBottomInset: true,
      body: IndexedStack(
        index: selected,
        children: bodies,
      ),
      bottomNavigationBar: keyboardOpen
          ? null
          : NavigationBar(
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
