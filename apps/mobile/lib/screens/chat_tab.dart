import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';

class ChatTab extends StatefulWidget {
  const ChatTab({super.key, required this.session});

  final SessionController session;

  @override
  State<ChatTab> createState() => _ChatTabState();
}

class _ChatBubble {
  _ChatBubble({required this.role, required this.text});
  final String role;
  final String text;
}

class _ChatTabState extends State<ChatTab> {
  final _textCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final _bubbles = <_ChatBubble>[];
  final _unsubs = <void Function()>[];
  String? _sessionId;
  String? _assistantDraft;
  bool _sending = false;
  bool _subscribed = false;
  List<Map<String, dynamic>> _pending = [];
  bool _approvalsLoading = false;

  @override
  void initState() {
    super.initState();
    widget.session.addListener(_onSessionChanged);
    _ensureSubscribed();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_refreshApprovals());
    });
  }

  @override
  void didUpdateWidget(covariant ChatTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.session != widget.session) {
      oldWidget.session.removeListener(_onSessionChanged);
      widget.session.addListener(_onSessionChanged);
    }
    if (oldWidget.session.session != widget.session.session) {
      _teardownSubs();
      _sessionId = null;
      _subscribed = false;
      _ensureSubscribed();
      unawaited(_refreshApprovals());
    }
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSessionChanged);
    _teardownSubs();
    _textCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _onSessionChanged() {
    unawaited(_refreshApprovals());
  }

  void _teardownSubs() {
    for (final u in _unsubs) {
      u();
    }
    _unsubs.clear();
  }

  Future<void> _ensureSubscribed() async {
    final home = widget.session.session;
    if (home == null || _subscribed) return;
    try {
      await home.subscribe(const [
        'home:turn-delta',
        'home:turn-finished',
        'home:approval-needed',
        'home:approval-resolved',
      ]);
      _unsubs.add(home.onEvent('home:turn-delta', _onTurnDelta));
      _unsubs.add(home.onEvent('home:turn-finished', _onTurnFinished));
      _unsubs.add(home.onEvent('home:approval-needed', _onApprovalEvent));
      _unsubs.add(home.onEvent('home:approval-resolved', _onApprovalEvent));
      _subscribed = true;
    } catch (e) {
      if (mounted) {
        setState(() {
          _bubbles.add(
            _ChatBubble(
              role: 'system',
              text: AppLocalizations.of(context).chatSubscribeFailed('$e'),
            ),
          );
        });
      }
    }
  }

  void _onApprovalEvent(dynamic _) {
    unawaited(_refreshApprovals());
  }

  Future<void> _refreshApprovals() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (home == null || accountId == null || accountId.isEmpty) {
      if (mounted) setState(() => _pending = []);
      return;
    }
    if (mounted) setState(() => _approvalsLoading = true);
    try {
      final listed = await home.listApprovals(accountId: accountId);
      final raw = listed['approvals'];
      final rows = raw is List
          ? raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
          : <Map<String, dynamic>>[];
      if (!mounted) return;
      setState(() {
        _pending = rows;
        _approvalsLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _approvalsLoading = false);
    }
  }

  Future<void> _answer(Map<String, dynamic> row, String decision) async {
    final home = widget.session.session;
    if (home == null) return;
    final l10n = AppLocalizations.of(context);
    try {
      await home.answerApproval(
        id: row['id'] as String,
        decision: decision,
        argsDigest: row['argsDigest'] as String? ?? '',
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            decision == 'allow' ? l10n.approvalsAllowed : l10n.approvalsDenied,
          ),
        ),
      );
      await _refreshApprovals();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.approvalsFailed('$e'))),
      );
    }
  }

  bool _isActuation(Map<String, dynamic> row) {
    final tool = row['tool']?.toString() ?? '';
    return tool == 'ha_call_service' ||
        tool == 'mqtt_publish' ||
        row['objectId'] != null ||
        row['safetyClass'] == true;
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollCtrl.hasClients) return;
      _scrollCtrl.animateTo(
        _scrollCtrl.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  void _onTurnDelta(dynamic data) {
    if (data is! Map) return;
    final map = Map<String, dynamic>.from(data);
    if (map['kind']?.toString() != 'text') return;
    final text = map['text']?.toString();
    if (text == null || text.isEmpty) return;
    if (!mounted) return;
    setState(() {
      _assistantDraft = (_assistantDraft ?? '') + text;
    });
    _scrollToEnd();
  }

  void _onTurnFinished(dynamic data) {
    if (!mounted) return;
    setState(() {
      final draft = _assistantDraft?.trim();
      if (draft != null && draft.isNotEmpty) {
        _bubbles.add(_ChatBubble(role: 'assistant', text: draft));
      }
      _assistantDraft = null;
    });
    final sessionId = _sessionId;
    if (sessionId != null) {
      unawaited(_reloadTranscript(sessionId));
    }
    unawaited(_refreshApprovals());
    _scrollToEnd();
  }

  Future<void> _reloadTranscript(String sessionId) async {
    final home = widget.session.session;
    if (home == null) return;
    try {
      final body = await home.getTranscript(sessionId: sessionId, limit: 80);
      final messages = body['messages'];
      if (messages is! List || !mounted) return;
      final next = <_ChatBubble>[];
      for (final m in messages) {
        if (m is! Map) continue;
        final role = (m['role'] ?? m['speaker'] ?? 'unknown').toString();
        final text = (m['text'] ?? m['content'] ?? '').toString();
        if (text.isEmpty) continue;
        next.add(_ChatBubble(role: role, text: text));
      }
      if (next.isNotEmpty) {
        setState(() {
          _bubbles
            ..clear()
            ..addAll(next);
        });
        _scrollToEnd();
      }
    } catch (_) {
      // keep streamed bubbles
    }
  }

  Future<void> _send() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    final text = _textCtrl.text.trim();
    final l10n = AppLocalizations.of(context);
    if (home == null || accountId == null || text.isEmpty) {
      setState(() {
        _bubbles.add(_ChatBubble(
          role: 'system',
          text: accountId == null ? l10n.chatNeedAccount : l10n.chatEmptyMessage,
        ));
      });
      return;
    }
    await _ensureSubscribed();
    if (!mounted) return;
    setState(() => _sending = true);
    try {
      _sessionId ??= (await home.openSession(
        accountId: accountId,
        title: l10n.chatSessionTitle,
      ))['sessionId'] as String?;
      if (_sessionId == null) throw StateError('no sessionId');
      if (!mounted) return;
      setState(() {
        _bubbles.add(_ChatBubble(role: 'user', text: text));
        _assistantDraft = '';
        _textCtrl.clear();
      });
      _scrollToEnd();
      final sent = await home.sendMessage(
        accountId: accountId,
        sessionId: _sessionId!,
        text: text,
      );
      final status = sent['status']?.toString();
      if (status != null && status != 'started' && status != 'ok') {
        if (!mounted) return;
        setState(() {
          _bubbles.add(_ChatBubble(role: 'system', text: l10n.chatStatus(status)));
        });
      }
      unawaited(_refreshApprovals());
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _bubbles.add(_ChatBubble(role: 'system', text: l10n.chatError('$e')));
        _assistantDraft = null;
      });
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Widget _bubble(_ChatBubble b) {
    final theme = Theme.of(context);
    final isUser = b.role == 'user';
    final isSystem = b.role == 'system';
    if (isSystem) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Center(
          child: Text(
            b.text,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
            ),
          ),
        ),
      );
    }
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.82,
        ),
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: isUser
                ? theme.colorScheme.primary.withValues(alpha: 0.14)
                : Colors.white.withValues(alpha: 0.92),
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(16),
              topRight: const Radius.circular(16),
              bottomLeft: Radius.circular(isUser ? 16 : 4),
              bottomRight: Radius.circular(isUser ? 4 : 16),
            ),
            border: Border.all(
              color: theme.colorScheme.primary.withValues(alpha: isUser ? 0.35 : 0.08),
            ),
          ),
          child: Text(b.text, style: theme.textTheme.bodyMedium),
        ),
      ),
    );
  }

  Widget _approvalCard(Map<String, dynamic> row, AppLocalizations l10n, ThemeData theme) {
    final actuation = _isActuation(row);
    final objectId = row['objectId']?.toString();
    final desired = row['desiredState']?.toString();
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: theme.colorScheme.primary.withValues(alpha: 0.08),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                if (actuation)
                  Chip(
                    label: Text(l10n.approvalsActuation),
                    visualDensity: VisualDensity.compact,
                  ),
                if (row['risk'] != null)
                  Chip(
                    label: Text('${row['risk']}'),
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              '${row['tool'] ?? l10n.approvalsTitle}',
              style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              '${row['summary'] ?? row['argsDigest'] ?? ''}',
              style: theme.textTheme.bodyMedium,
            ),
            if (objectId != null && objectId.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                desired != null && desired.isNotEmpty
                    ? '$objectId → $desired'
                    : objectId,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                ),
              ),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                FilledButton(
                  onPressed: () => _answer(row, 'allow'),
                  child: Text(l10n.approvalsAllow),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: () => _answer(row, 'deny'),
                  child: Text(l10n.approvalsDeny),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final draft = _assistantDraft;
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    final empty = _bubbles.isEmpty && (draft == null || draft.isEmpty);

    return Column(
      children: [
        if (_pending.isNotEmpty || _approvalsLoading)
          Material(
            color: theme.scaffoldBackgroundColor,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_pending.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6, left: 4),
                      child: Text(
                        l10n.chatPendingApprovals(_pending.length),
                        style: theme.textTheme.labelLarge?.copyWith(
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                          letterSpacing: 0.4,
                        ),
                      ),
                    ),
                  if (_approvalsLoading && _pending.isEmpty)
                    const LinearProgressIndicator(),
                  ..._pending.map((row) => _approvalCard(row, l10n, theme)),
                ],
              ),
            ),
          ),
        Expanded(
          child: empty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.chat_bubble_outline,
                          size: 40,
                          color: theme.colorScheme.primary.withValues(alpha: 0.45),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          l10n.chatEmptyTitle,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          l10n.chatEmptyHint,
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _refreshApprovals,
                  child: ListView.builder(
                    controller: _scrollCtrl,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                    itemCount: _bubbles.length +
                        (draft != null && draft.isNotEmpty ? 1 : 0),
                    itemBuilder: (_, i) {
                      if (i < _bubbles.length) return _bubble(_bubbles[i]);
                      return _bubble(_ChatBubble(role: 'assistant', text: draft!));
                    },
                  ),
                ),
        ),
        Material(
          color: theme.scaffoldBackgroundColor,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: _textCtrl,
                      minLines: 1,
                      maxLines: 5,
                      textInputAction: TextInputAction.send,
                      decoration: InputDecoration(
                        hintText: l10n.chatHint,
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _sending ? null : _send,
                    icon: _sending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send_rounded),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
