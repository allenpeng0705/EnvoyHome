import 'dart:async';

import 'package:flutter/material.dart';

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

  @override
  void initState() {
    super.initState();
    _ensureSubscribed();
  }

  @override
  void didUpdateWidget(covariant ChatTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.session.session != widget.session.session) {
      _teardownSubs();
      _sessionId = null;
      _subscribed = false;
      _ensureSubscribed();
    }
  }

  @override
  void dispose() {
    _teardownSubs();
    _textCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
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
      ]);
      _unsubs.add(home.onEvent('home:turn-delta', _onTurnDelta));
      _unsubs.add(home.onEvent('home:turn-finished', _onTurnFinished));
      _subscribed = true;
    } catch (e) {
      if (mounted) {
        setState(() {
          _bubbles.add(_ChatBubble(role: 'system', text: 'subscribe failed: $e'));
        });
      }
    }
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
    if (home == null || accountId == null || text.isEmpty) {
      setState(() {
        _bubbles.add(_ChatBubble(
          role: 'system',
          text: accountId == null
              ? 'Set an account above before chatting.'
              : 'Empty message.',
        ));
      });
      return;
    }
    await _ensureSubscribed();
    setState(() => _sending = true);
    try {
      _sessionId ??= (await home.openSession(
        accountId: accountId,
        title: 'Phone chat',
      ))['sessionId'] as String?;
      if (_sessionId == null) throw StateError('no sessionId');
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
        setState(() {
          _bubbles.add(_ChatBubble(role: 'system', text: 'status: $status'));
        });
      }
    } catch (e) {
      setState(() {
        _bubbles.add(_ChatBubble(role: 'system', text: 'error: $e'));
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

  @override
  Widget build(BuildContext context) {
    final draft = _assistantDraft;
    final theme = Theme.of(context);
    final empty = _bubbles.isEmpty && (draft == null || draft.isEmpty);

    return Column(
      children: [
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
                          'Message your home agent',
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Turns run on the desktop daemon. Approvals may appear on the Approvals tab.',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                )
              : ListView.builder(
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
                      decoration: const InputDecoration(
                        hintText: 'Message…',
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
