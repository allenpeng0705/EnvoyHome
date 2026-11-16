import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';
import 'chat_tab.dart';
import 'skills_screen.dart';

/// Schedules hub: Chat · Jobs · Scenes · Histories (desktop Option A parity).
class SchedulesHubScreen extends StatefulWidget {
  const SchedulesHubScreen({
    super.key,
    required this.session,
    this.onRequestConnect,
    this.onRequestPairAgain,
  });

  final SessionController session;
  final VoidCallback? onRequestConnect;
  final VoidCallback? onRequestPairAgain;

  @override
  State<SchedulesHubScreen> createState() => _SchedulesHubScreenState();
}

class _SchedulesHubScreenState extends State<SchedulesHubScreen>
    with SingleTickerProviderStateMixin {
  /// Tab order: Chat(0) · Jobs(1) · Scenes(2) · Histories(3).
  static const _tabCount = 4;
  static const _historiesTab = 3;
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: _tabCount, vsync: this);
    _tabs.addListener(_onTabTick);
  }

  void _onTabTick() {
    // Rebuild on every tick so Chat↔Histories (shared IndexedStack slot) updates
    // `schedulesPaneOverride` during the tab animation, not only after settle.
    setState(() {});
  }

  void _openHistories() {
    if (_tabs.index == _historiesTab) return;
    _tabs.animateTo(_historiesTab);
  }

  @override
  void dispose() {
    _tabs.removeListener(_onTabTick);
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final tab = _tabs.index;
    final schedulesPane = tab == _historiesTab ? 'histories' : 'chat';
    // IndexedStack: 0 = Chat/Histories (shared ChatTab), 1 = Jobs, 2 = Scenes.
    final stackIndex = switch (tab) {
      1 => 1, // Jobs
      2 => 2, // Scenes
      _ => 0, // Chat or Histories
    };
    final accountKey = widget.session.accountId ?? '';

    return Column(
      children: [
        Material(
          color: Theme.of(context).colorScheme.surface,
          child: TabBar(
            controller: _tabs,
            isScrollable: true,
            tabs: [
              Tab(text: l10n.schedulesChatTabChat),
              Tab(text: l10n.schedulesTabJobs),
              Tab(text: l10n.skillsTabScenes),
              Tab(text: l10n.schedulesChatTabHistories),
            ],
          ),
        ),
        Expanded(
          // Stable child count — do not swap Jobs/Scenes for connect placeholders
          // (IndexedStack indices would jump when connectivity flips).
          child: IndexedStack(
            index: stackIndex,
            children: [
              ChatTab(
                key: ValueKey('schedules-hub-chat-$accountKey'),
                session: widget.session,
                purpose: 'schedules',
                onRequestConnect: widget.onRequestConnect,
                onRequestPairAgain: widget.onRequestPairAgain,
                embedInSchedulesHub: true,
                schedulesPaneOverride: schedulesPane,
              ),
              ScheduleJobsPanel(
                key: ValueKey('schedules-jobs-$accountKey'),
                session: widget.session,
                onOpenHistories: _openHistories,
                onRequestConnect: widget.onRequestConnect,
              ),
              ScheduleScenesPanel(
                key: ValueKey('schedules-scenes-$accountKey'),
                session: widget.session,
                onRequestConnect: widget.onRequestConnect,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
