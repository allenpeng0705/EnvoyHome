import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../l10n/locale_controller.dart';
import '../l10n/theme_controller.dart';
import '../services/push_service.dart';
import '../state/needs_you_controller.dart';
import '../state/session_controller.dart';
import '../widgets/connection_banner.dart';
import '../widgets/needs_you_jump_strip.dart';
import 'chat_tab.dart';
import 'more_hub.dart';
import 'pair_screen.dart';
import 'pairing/pairing_progress_screen.dart';
import 'schedules_hub_screen.dart';

const _kWideBreakpoint = 840.0;

/// Phone: Chat · Reminders · More. Tablet: same three destinations (no desktop dump).
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
  /// 0 Chat · 1 Reminders · 2 More
  int _tab = 0;
  bool _haHomeReady = false;
  final _moreNav = GlobalKey<NavigatorState>();
  final _needsYou = NeedsYouController();
  String? _lastShownError;

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
    _needsYou.addListener(_onNeedsYou);
  }

  void _onNeedsYou() {
    if (mounted) setState(() {});
  }

  void _openNeedsYou() {
    setState(() => _tab = 0);
    _needsYou.requestOpen();
  }

  void _onSession() {
    unawaited(_refreshHaReady());
    _maybeShowSessionError();
    if (!widget.session.isConnected) _needsYou.clear();
    if (mounted) setState(() {});
  }

  void _maybeShowSessionError() {
    final err = widget.session.error;
    if (err == null || err.isEmpty || err == _lastShownError) return;
    if (widget.session.isConnected || widget.session.busy) return;
    // Offline: [ConnectionBanner] / connect guides own the message — no snackbar.
    _lastShownError = err;
  }

  Future<void> _openPairing() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => PairScreen(session: widget.session)),
    );
  }

  Future<void> _requestConnect() async {
    _lastShownError = null;
    // No credential on disk → go straight to QR/pair (don't spin a doomed reconnect).
    if (!widget.session.hasSavedPairing) {
      await _openPairing();
      return;
    }
    await _reconnectWithProgress();
  }

  Future<void> _reconnectWithProgress() async {
    final result = await Navigator.of(context).push<PairingProgressResult>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => PairingProgressScreen(
          connect: () async {
            await widget.session.reconnect();
            if (!widget.session.isConnected) {
              throw StateError(widget.session.error ?? 'Reconnect failed');
            }
          },
          onCancelRequested: () => widget.session.disconnect(),
        ),
      ),
    );
    if (!mounted) return;
    if (result is PairingProgressResult &&
        result.error != null &&
        result.error!.isNotEmpty) {
      _lastShownError = result.error;
      setState(() {});
    }
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
      setState(() => _haHomeReady = ready);
    } catch (_) {
      if (mounted) setState(() => _haHomeReady = false);
    }
  }

  void _onPushTap(Map<String, dynamic> data) {
    final type = data['type']?.toString();
    final account = data['accountId']?.toString();
    if (account != null && account.isNotEmpty) {
      widget.session.setAccountId(account);
    }
    final tab = pushTapTabIndex(type);
    if (tab != null) setState(() => _tab = tab);
    if (pushTapOpensNeedsYou(type)) _needsYou.requestOpen();
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSession);
    _needsYou.removeListener(_onNeedsYou);
    _needsYou.dispose();
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
      session.setAccountId(value.substring('profile:'.length));
      setState(() {});
      return;
    }
    switch (value) {
      case 'conn:disconnect':
        await session.disconnect();
        return;
      case 'conn:forget':
        await _confirmForgetPairing();
        return;
    }
  }

  List<Widget> _bodies(SessionController session) {
    final connected = session.isConnected;
    return [
      ChatTab(
        session: session,
        purpose: 'general',
        onRequestConnect: connected ? null : _requestConnect,
        onRequestPairAgain: connected ? null : _openPairing,
        showHomeModeToggle: connected && _haHomeReady,
        deferOfflineActions: true,
        needsYou: _needsYou,
      ),
      SchedulesHubScreen(
        session: session,
        onRequestConnect: connected ? null : _requestConnect,
        onRequestPairAgain: connected ? null : _openPairing,
        deferOfflineActions: true,
      ),
      Navigator(
        key: _moreNav,
        onGenerateRoute: (settings) => MaterialPageRoute(
          builder: (_) => MoreHub(
            session: session,
            locales: widget.locales,
            themes: widget.themes,
            onRequestConnect: connected ? null : _requestConnect,
            onRequestPairAgain: connected ? null : _openPairing,
            haHomeReady: _haHomeReady,
            deferOfflineActions: true,
          ),
          settings: settings,
        ),
      ),
    ];
  }

  Widget _chatNavIcon({required bool selected}) {
    final icon = Icon(selected ? Icons.chat_bubble : Icons.chat_bubble_outline);
    final n = _needsYou.count;
    if (n <= 0) return icon;
    return Badge(
      label: Text(n > 9 ? '9+' : '$n'),
      child: icon,
    );
  }

  List<NavigationDestination> _destinations(AppLocalizations l10n) {
    return [
      NavigationDestination(
        icon: _chatNavIcon(selected: false),
        selectedIcon: _chatNavIcon(selected: true),
        label: l10n.navChat,
      ),
      NavigationDestination(
        icon: const Icon(Icons.event_outlined),
        selectedIcon: const Icon(Icons.event),
        label: l10n.navReminders,
      ),
      NavigationDestination(
        icon: const Icon(Icons.more_horiz),
        selectedIcon: const Icon(Icons.more_horiz),
        label: l10n.navMore,
      ),
    ];
  }

  List<NavigationRailDestination> _railDestinations(AppLocalizations l10n) {
    return [
      NavigationRailDestination(
        icon: _chatNavIcon(selected: false),
        selectedIcon: _chatNavIcon(selected: true),
        label: Text(l10n.navChat),
      ),
      NavigationRailDestination(
        icon: const Icon(Icons.event_outlined),
        selectedIcon: const Icon(Icons.event),
        label: Text(l10n.navReminders),
      ),
      NavigationRailDestination(
        icon: const Icon(Icons.more_horiz),
        selectedIcon: const Icon(Icons.more_horiz),
        label: Text(l10n.navMore),
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
      // Offline Connect/Reconnect/Pair live on [ConnectionBanner] only.
      // Overflow: Disconnect (+ profiles) when online; Forget when paired-offline.
      actions: [
        if (connected || session.hasSavedPairing)
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
            itemBuilder: (context) {
              if (!connected) {
                return [
                  PopupMenuItem(
                    value: 'conn:forget',
                    child: Text(
                      l10n.shellForgetPairing,
                      style: menuStyle(selected: false),
                    ),
                  ),
                ];
              }
              return [
                PopupMenuItem(
                  value: 'conn:disconnect',
                  child: Text(
                    l10n.shellDisconnect,
                    style: menuStyle(selected: false),
                  ),
                ),
                if (bound.length > 1) ...[
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
              ];
            },
          ),
      ],
    );

    final bodies = _bodies(session);
    final selected = _tab.clamp(0, 2);
    final keyboardOpen = MediaQuery.viewInsetsOf(context).bottom > 0;

    final content = Column(
      children: [
        if (!connected)
          ConnectionBanner(
            session: session,
            onReconnect: () => unawaited(_requestConnect()),
            onPairNew: () => unawaited(_openPairing()),
            error: _lastShownError ?? session.error,
          ),
        // Sticky Needs-you on non-Chat tabs (Chat hosts the actionable strip).
        if (connected && selected != 0 && _needsYou.hasItems)
          NeedsYouJumpStrip(
            count: _needsYou.count,
            onOpen: _openNeedsYou,
          ),
        Expanded(
          child: IndexedStack(
            index: selected,
            children: bodies,
          ),
        ),
      ],
    );

    if (wide) {
      return Scaffold(
        appBar: appBar,
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: selected,
              onDestinationSelected: (i) => setState(() => _tab = i),
              labelType: NavigationRailLabelType.all,
              destinations: _railDestinations(l10n),
            ),
            const VerticalDivider(width: 1),
            Expanded(child: content),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: appBar,
      resizeToAvoidBottomInset: true,
      body: content,
      bottomNavigationBar: keyboardOpen
          ? null
          : NavigationBar(
              selectedIndex: selected,
              onDestinationSelected: (i) => setState(() => _tab = i),
              destinations: _destinations(l10n),
            ),
    );
  }
}
