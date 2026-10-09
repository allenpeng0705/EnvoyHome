import 'package:flutter/material.dart';

import '../services/push_service.dart';
import '../state/session_controller.dart';
import 'approvals_tab.dart';
import 'artifacts_tab.dart';
import 'chat_tab.dart';
import 'models_tab.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.session});

  final SessionController session;

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
      setState(() => _tab = 1);
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
    final product = session.hello?['product'] ?? 'EnvoyHome';
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
                label: Text(healthOk ? 'online' : 'degraded'),
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
              ),
            ),
          ),
          IconButton(
            tooltip: 'Disconnect',
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
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _accountCtrl,
                            decoration: const InputDecoration(
                              labelText: 'Account',
                              isDense: true,
                              border: InputBorder.none,
                              enabledBorder: InputBorder.none,
                              focusedBorder: InputBorder.none,
                              filled: false,
                              contentPadding: EdgeInsets.symmetric(vertical: 4),
                            ),
                            onSubmitted: session.setAccountId,
                          ),
                        ),
                        FilledButton.tonal(
                          onPressed: () =>
                              session.setAccountId(_accountCtrl.text),
                          child: const Text('Set'),
                        ),
                      ],
                    ),
                    if (bound.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final id in bound)
                            ActionChip(
                              label: Text(id),
                              onPressed: () {
                                _accountCtrl.text = id;
                                session.setAccountId(id);
                              },
                            ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 4),
                    Text(
                      'mesh $mesh · pull tabs to refresh',
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
                ApprovalsTab(session: session),
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
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'Chat',
          ),
          NavigationDestination(
            icon: Icon(Icons.verified_user_outlined),
            selectedIcon: Icon(Icons.verified_user),
            label: 'Approvals',
          ),
          NavigationDestination(
            icon: Icon(Icons.smart_toy_outlined),
            selectedIcon: Icon(Icons.smart_toy),
            label: 'Models',
          ),
          NavigationDestination(
            icon: Icon(Icons.attach_file_outlined),
            selectedIcon: Icon(Icons.attach_file),
            label: 'Artifacts',
          ),
        ],
      ),
    );
  }
}
