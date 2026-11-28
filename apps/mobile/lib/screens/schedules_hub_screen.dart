import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';
import 'chat_tab.dart';
import 'skills_screen.dart';

/// Reminders hub: Jobs · Scenes · Histories (no nested schedules-chat maze).
/// Schedule NL opens via [Ask] → dedicated schedules ChatTab route.
class SchedulesHubScreen extends StatefulWidget {
  const SchedulesHubScreen({
    super.key,
    required this.session,
    this.onRequestConnect,
    this.onRequestPairAgain,
    this.deferOfflineActions = false,
  });

  final SessionController session;
  final VoidCallback? onRequestConnect;
  final VoidCallback? onRequestPairAgain;
  /// Parent [ConnectionBanner] owns offline CTAs — panels stay text-only.
  final bool deferOfflineActions;

  @override
  State<SchedulesHubScreen> createState() => _SchedulesHubScreenState();
}

class _SchedulesHubScreenState extends State<SchedulesHubScreen>
    with SingleTickerProviderStateMixin {
  /// Jobs(0) · Scenes(1) · Histories(2)
  static const _tabCount = 3;
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: _tabCount, vsync: this);
    _tabs.addListener(() {
      if (mounted) setState(() {});
    });
  }

  void _openHistories() {
    if (_tabs.index == 2) return;
    _tabs.animateTo(2);
  }

  void _openAskSchedule() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => Scaffold(
          appBar: AppBar(
            title: Text(AppLocalizations.of(context).remindersAskTitle),
          ),
          // Chat-only — Histories stays on the hub tab (no nested Chat|Histories).
          body: ChatTab(
            session: widget.session,
            purpose: 'schedules',
            embedInSchedulesHub: true,
            schedulesPaneOverride: 'chat',
            onRequestConnect: widget.onRequestConnect,
            onRequestPairAgain: widget.onRequestPairAgain,
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final accountKey = widget.session.accountId ?? '';
    final theme = Theme.of(context);

    return Column(
      children: [
        Material(
          color: theme.colorScheme.surface,
          child: TabBar(
            controller: _tabs,
            isScrollable: true,
            tabs: [
              Tab(text: l10n.schedulesTabJobs),
              Tab(text: l10n.skillsTabScenes),
              Tab(text: l10n.schedulesChatTabHistories),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: Align(
            alignment: Alignment.centerLeft,
            child: FilledButton.tonalIcon(
              // Don't repurpose "Ask to schedule" as Connect — banner owns that.
              onPressed:
                  widget.session.isConnected ? _openAskSchedule : null,
              icon: const Icon(Icons.chat_bubble_outline, size: 18),
              label: Text(l10n.remindersAskCta),
            ),
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabs,
            children: [
              ScheduleJobsPanel(
                key: ValueKey('schedules-jobs-$accountKey'),
                session: widget.session,
                onOpenHistories: _openHistories,
                onRequestConnect: widget.deferOfflineActions
                    ? null
                    : widget.onRequestConnect,
              ),
              ScheduleScenesPanel(
                key: ValueKey('schedules-scenes-$accountKey'),
                session: widget.session,
                onRequestConnect: widget.deferOfflineActions
                    ? null
                    : widget.onRequestConnect,
              ),
              ChatTab(
                key: ValueKey('schedules-hub-histories-$accountKey'),
                session: widget.session,
                purpose: 'schedules',
                onRequestConnect: widget.onRequestConnect,
                onRequestPairAgain: widget.onRequestPairAgain,
                embedInSchedulesHub: true,
                schedulesPaneOverride: 'histories',
                deferOfflineActions: widget.deferOfflineActions,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
