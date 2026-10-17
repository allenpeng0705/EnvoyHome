import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:speech_to_text/speech_to_text.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';

const _kChatAttachMaxFiles = 8;
const _kChatAttachMaxBytes = 8 * 1024 * 1024;

class _PendingAttach {
  _PendingAttach({
    required this.id,
    required this.name,
    required this.bytes,
    this.mimeType,
  });
  final String id;
  final String name;
  final Uint8List bytes;
  final String? mimeType;
  int get size => bytes.length;
}

class _ChatBubble {
  _ChatBubble({
    required this.role,
    required this.text,
    this.media = const [],
  });
  final String role;
  final String text;
  final List<Map<String, dynamic>> media;
}

/// General Chat (`purpose: general`) or Home chat (`purpose: home`).
class ChatTab extends StatefulWidget {
  const ChatTab({
    super.key,
    required this.session,
    this.purpose = 'general',
    this.onRequestConnect,
    this.onRequestPairAgain,
  });

  final SessionController session;
  final String purpose;
  /// When unpaired, empty state offers Connect / Reconnect.
  final VoidCallback? onRequestConnect;
  /// Opens the pairing screen to mint a fresh join (optional secondary).
  final VoidCallback? onRequestPairAgain;

  @override
  State<ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends State<ChatTab> {
  final _textCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final _bubbles = <_ChatBubble>[];
  final _unsubs = <void Function()>[];
  final _pendingFiles = <_PendingAttach>[];
  final _speech = SpeechToText();

  String? _sessionId;
  String? _turnId;
  String? _assistantDraft;
  bool _sending = false;
  bool _subscribed = false;
  bool _listening = false;
  bool _speechAvailable = false;
  List<Map<String, dynamic>> _pending = [];
  List<Map<String, dynamic>> _boundSources = [];
  bool _approvalsLoading = false;

  bool get _isHome => widget.purpose == 'home';

  String _sessionStorageKey(String accountId) =>
      'envoyhome.${_isHome ? 'homeChat' : 'chat'}SessionId.$accountId';

  @override
  void initState() {
    super.initState();
    widget.session.addListener(_onSessionChanged);
    _ensureSubscribed();
    unawaited(_initSpeech());
    unawaited(_restoreSession());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        unawaited(_refreshApprovals());
        if (_isHome) unawaited(_loadBoundSources());
      }
    });
  }

  @override
  void didUpdateWidget(covariant ChatTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.session != widget.session) {
      oldWidget.session.removeListener(_onSessionChanged);
      widget.session.addListener(_onSessionChanged);
    }
    if (oldWidget.session.session != widget.session.session ||
        oldWidget.purpose != widget.purpose) {
      _teardownSubs();
      _sessionId = null;
      _subscribed = false;
      _bubbles.clear();
      _pendingFiles.clear();
      _ensureSubscribed();
      unawaited(_restoreSession());
      unawaited(_refreshApprovals());
      if (_isHome) unawaited(_loadBoundSources());
    }
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSessionChanged);
    _teardownSubs();
    unawaited(_speech.stop());
    _textCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _onSessionChanged() {
    unawaited(_refreshApprovals());
    if (_isHome) unawaited(_loadBoundSources());
  }

  Future<void> _initSpeech() async {
    try {
      final ok = await _speech.initialize(
        onError: (_) {
          if (mounted) setState(() => _listening = false);
        },
        onStatus: (status) {
          if (!mounted) return;
          if (status == 'done' || status == 'notListening') {
            setState(() => _listening = false);
          }
        },
      );
      if (mounted) setState(() => _speechAvailable = ok);
    } catch (_) {
      if (mounted) setState(() => _speechAvailable = false);
    }
  }

  Future<void> _restoreSession() async {
    final accountId = widget.session.accountId;
    if (accountId == null || accountId.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    final id = prefs.getString(_sessionStorageKey(accountId));
    if (id == null || id.isEmpty || !mounted) return;
    setState(() => _sessionId = id);
    unawaited(_reloadTranscript(id));
  }

  Future<void> _persistSession(String sessionId) async {
    final accountId = widget.session.accountId;
    if (accountId == null || accountId.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_sessionStorageKey(accountId), sessionId);
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

  Future<void> _loadBoundSources() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (home == null || accountId == null) {
      if (mounted) setState(() => _boundSources = []);
      return;
    }
    try {
      final body = await home.listSources(accountId: accountId);
      final raw = body['sources'];
      final rows = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final s in raw) {
          if (s is! Map) continue;
          final m = Map<String, dynamic>.from(s);
          if (m['bound'] == true &&
              (m['accountId']?.toString() == accountId || m['shared'] == true)) {
            rows.add(m);
          }
        }
      }
      if (mounted) setState(() => _boundSources = rows);
    } catch (_) {
      if (mounted) setState(() => _boundSources = []);
    }
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
      final tid = map['turnId']?.toString();
      if (tid != null && tid.isNotEmpty) _turnId = tid;
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
      _turnId = null;
      _sending = false;
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
    final accountId = widget.session.accountId;
    if (home == null || accountId == null) return;
    try {
      final body = await home.getTranscript(
        accountId: accountId,
        sessionId: sessionId,
        limit: 80,
      );
      final messages = body['messages'];
      if (messages is! List || !mounted) return;
      final next = <_ChatBubble>[];
      for (final m in messages) {
        if (m is! Map) continue;
        final role = (m['role'] ?? m['speaker'] ?? 'unknown').toString();
        final text = (m['text'] ?? m['content'] ?? '').toString();
        final mediaRaw = m['media'];
        final media = <Map<String, dynamic>>[];
        if (mediaRaw is List) {
          for (final item in mediaRaw) {
            if (item is Map) media.add(Map<String, dynamic>.from(item));
          }
        }
        if (text.isEmpty && media.isEmpty) continue;
        next.add(_ChatBubble(role: role, text: text, media: media));
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

  Future<void> _pickFiles() async {
    final l10n = AppLocalizations.of(context);
    if (_pendingFiles.length >= _kChatAttachMaxFiles) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chatAttachTooMany(_kChatAttachMaxFiles))),
      );
      return;
    }
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      withData: true,
    );
    if (result == null || !mounted) return;
    final room = _kChatAttachMaxFiles - _pendingFiles.length;
    var added = 0;
    for (final f in result.files.take(room)) {
      final bytes = f.bytes;
      if (bytes == null) continue;
      if (bytes.length > _kChatAttachMaxBytes) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              l10n.chatAttachTooLarge(f.name, '${_kChatAttachMaxBytes ~/ (1024 * 1024)}'),
            ),
          ),
        );
        continue;
      }
      _pendingFiles.add(
        _PendingAttach(
          id: '${DateTime.now().microsecondsSinceEpoch}_${f.name}',
          name: f.name,
          bytes: bytes,
          mimeType: f.extension != null ? _mimeFromExt(f.extension!) : null,
        ),
      );
      added++;
    }
    setState(() {});
    if (added > 0 && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chatAttachAdded(added))),
      );
    }
  }

  String? _mimeFromExt(String ext) {
    switch (ext.toLowerCase()) {
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'pdf':
        return 'application/pdf';
      case 'mp3':
        return 'audio/mpeg';
      case 'mp4':
        return 'video/mp4';
      default:
        return null;
    }
  }

  Future<void> _toggleVoice() async {
    final l10n = AppLocalizations.of(context);
    if (!_speechAvailable) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chatVoiceUnsupported)),
      );
      return;
    }
    if (_listening) {
      await _speech.stop();
      setState(() => _listening = false);
      return;
    }
    setState(() => _listening = true);
    await _speech.listen(
      onResult: (result) {
        if (!mounted) return;
        setState(() {
          _textCtrl.text = result.recognizedWords;
          _textCtrl.selection = TextSelection.collapsed(
            offset: _textCtrl.text.length,
          );
        });
      },
      listenOptions: SpeechListenOptions(
        partialResults: true,
        cancelOnError: true,
      ),
    );
  }

  Future<void> _cancelTurn() async {
    final home = widget.session.session;
    final turnId = _turnId;
    if (home == null || turnId == null) return;
    try {
      await home.cancelTurn(turnId: turnId);
    } catch (_) {}
    if (mounted) {
      setState(() {
        _sending = false;
        _turnId = null;
        _assistantDraft = null;
      });
    }
  }

  Future<void> _send() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    final text = _textCtrl.text.trim();
    final l10n = AppLocalizations.of(context);
    final hasMedia = _pendingFiles.isNotEmpty;
    if (home == null || accountId == null) {
      setState(() {
        _bubbles.add(_ChatBubble(
          role: 'system',
          text: accountId == null ? l10n.chatNeedAccount : l10n.chatEmptyMessage,
        ));
      });
      return;
    }
    if (text.isEmpty && !hasMedia) {
      setState(() {
        _bubbles.add(_ChatBubble(role: 'system', text: l10n.chatEmptyMessage));
      });
      return;
    }
    await _ensureSubscribed();
    if (!mounted) return;
    if (_listening) {
      await _speech.stop();
      setState(() => _listening = false);
    }
    setState(() => _sending = true);
    final localFiles = List<_PendingAttach>.from(_pendingFiles);
    try {
      final media = <Map<String, dynamic>>[];
      for (final item in localFiles) {
        final up = await home.uploadChatMedia(
          accountId: accountId,
          fileName: item.name,
          contentBase64: base64Encode(item.bytes),
          mimeType: item.mimeType,
        );
        media.add({
          'kind': up['kind'],
          'uri': up['uri'],
          'fileName': up['fileName'] ?? item.name,
          if (up['mimeType'] != null) 'mimeType': up['mimeType'],
          if (up['bytes'] != null) 'bytes': up['bytes'],
        });
      }
      _sessionId ??= (await home.openSession(
        accountId: accountId,
        title: _isHome ? l10n.homeChatSessionTitle : l10n.chatSessionTitle,
        purpose: widget.purpose,
      ))['sessionId'] as String?;
      if (_sessionId == null) throw StateError('no sessionId');
      await _persistSession(_sessionId!);
      if (!mounted) return;
      final displayText = text.isEmpty ? l10n.chatAttachedOnly : text;
      setState(() {
        _bubbles.add(_ChatBubble(role: 'user', text: displayText, media: media));
        _assistantDraft = '';
        _textCtrl.clear();
        _pendingFiles.clear();
      });
      _scrollToEnd();
      final sent = await home.sendMessage(
        accountId: accountId,
        sessionId: _sessionId!,
        text: text,
        media: media.isEmpty ? null : media,
      );
      _turnId = sent['turnId']?.toString();
      final status = sent['status']?.toString();
      if (status != null && status != 'started' && status != 'ok') {
        if (!mounted) return;
        setState(() {
          _bubbles.add(_ChatBubble(role: 'system', text: l10n.chatStatus(status)));
          _sending = false;
        });
      }
      unawaited(_refreshApprovals());
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _bubbles.add(_ChatBubble(role: 'system', text: l10n.chatError('$e')));
        _assistantDraft = null;
        _sending = false;
      });
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
                ? theme.colorScheme.primary.withValues(alpha: 0.16)
                : theme.colorScheme.surfaceContainerHighest,
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
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (b.text.isNotEmpty) Text(b.text, style: theme.textTheme.bodyMedium),
              if (b.media.isNotEmpty) ...[
                if (b.text.isNotEmpty) const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    for (final m in b.media)
                      Chip(
                        avatar: Icon(
                          _mediaIcon(m['kind']?.toString()),
                          size: 16,
                        ),
                        label: Text(
                          m['fileName']?.toString() ??
                              m['uri']?.toString() ??
                              m['kind']?.toString() ??
                              'file',
                        ),
                        visualDensity: VisualDensity.compact,
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  IconData _mediaIcon(String? kind) {
    switch (kind) {
      case 'image':
        return Icons.image_outlined;
      case 'audio':
        return Icons.audiotrack_outlined;
      case 'video':
        return Icons.videocam_outlined;
      default:
        return Icons.attach_file;
    }
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
    final connected = widget.session.isConnected;
    final empty = _bubbles.isEmpty && (draft == null || draft.isEmpty);

    if (!connected) {
      return _ConnectGuide(
        hasSavedPairing: widget.session.hasSavedPairing,
        busy: widget.session.busy,
        onConnect: widget.onRequestConnect,
        onPairAgain: widget.onRequestPairAgain,
      );
    }

    return Column(
      children: [
        if (_isHome && _boundSources.isNotEmpty)
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              children: [
                for (final s in _boundSources)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: Chip(
                      label: Text(
                        s['name']?.toString() ??
                            s['objectId']?.toString() ??
                            s['sourceId']?.toString() ??
                            '?',
                      ),
                      visualDensity: VisualDensity.compact,
                    ),
                  ),
              ],
            ),
          ),
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
                          _isHome ? Icons.home_outlined : Icons.chat_bubble_outline,
                          size: 40,
                          color: theme.colorScheme.primary.withValues(alpha: 0.45),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          _isHome ? l10n.homeChatEmptyTitle : l10n.chatEmptyTitle,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _isHome ? l10n.homeChatEmptyHint : l10n.chatEmptyHint,
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
        if (_pendingFiles.isNotEmpty)
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                for (final f in _pendingFiles)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: InputChip(
                      label: Text(f.name),
                      onDeleted: _sending
                          ? null
                          : () => setState(() => _pendingFiles.remove(f)),
                    ),
                  ),
              ],
            ),
          ),
        Material(
          color: theme.scaffoldBackgroundColor,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  IconButton(
                    tooltip: l10n.chatAttach,
                    onPressed: _sending ? null : _pickFiles,
                    icon: const Icon(Icons.attach_file),
                  ),
                  IconButton(
                    tooltip: _listening ? l10n.chatVoiceStop : l10n.chatVoiceStart,
                    onPressed: _sending ? null : _toggleVoice,
                    icon: Icon(
                      _listening ? Icons.mic : Icons.mic_none,
                      color: _listening ? theme.colorScheme.error : null,
                    ),
                  ),
                  Expanded(
                    child: TextField(
                      controller: _textCtrl,
                      minLines: 1,
                      maxLines: 5,
                      textInputAction: TextInputAction.send,
                      decoration: InputDecoration(
                        hintText: _isHome ? l10n.homeChatHint : l10n.chatHint,
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 4),
                  if (_sending && _turnId != null)
                    IconButton.filledTonal(
                      onPressed: _cancelTurn,
                      icon: const Icon(Icons.stop_rounded),
                    )
                  else
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

/// First-launch / unpaired empty Chat — same chrome as the app, one CTA.
class _ConnectGuide extends StatelessWidget {
  const _ConnectGuide({
    this.hasSavedPairing = false,
    this.busy = false,
    this.onConnect,
    this.onPairAgain,
  });

  final bool hasSavedPairing;
  final bool busy;
  final VoidCallback? onConnect;
  final VoidCallback? onPairAgain;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: Image.asset(
                'assets/logo.png',
                width: 64,
                height: 64,
                filterQuality: FilterQuality.high,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              l10n.connectGuideTitle,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              hasSavedPairing
                  ? l10n.connectGuideReconnectHint
                  : l10n.connectGuideHint,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.62),
                height: 1.4,
              ),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: busy ? null : onConnect,
              icon: Icon(hasSavedPairing ? Icons.link : Icons.qr_code_2),
              label: Text(
                hasSavedPairing ? l10n.shellReconnect : l10n.shellConnect,
              ),
            ),
            if (hasSavedPairing && onPairAgain != null) ...[
              const SizedBox(height: 8),
              TextButton(
                onPressed: busy ? null : onPairAgain,
                child: Text(l10n.shellConnect),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
