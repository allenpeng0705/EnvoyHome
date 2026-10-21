import 'dart:async';
import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:speech_to_text/speech_to_text.dart';

import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:url_launcher/url_launcher.dart';

import '../chat_format.dart';
import '../chat_think.dart';
import '../client_context.dart';
import '../l10n/app_localizations.dart';
import '../sandbox_paths.dart';
import '../state/session_controller.dart';
import 'artifact_viewer_screen.dart';

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
    this.messageId,
    this.format,
    this.artifactPath,
    this.artifactUrl,
  });
  final String role;
  final String text;
  final List<Map<String, dynamic>> media;
  final String? messageId;
  /// Design §9.5: plain | markdown | link
  final String? format;
  /// Relative path under accounts/<id>/files/ — preferred open (mesh/paired).
  final String? artifactPath;
  /// Optional signed HTTP URL when publicBaseUrl is reachable.
  final String? artifactUrl;
}

/// Compact icon-only action — peer EnvoyGo `_EhBubbleIconButton` / EnvoyMesh Social.
class _BubbleIconButton extends StatelessWidget {
  const _BubbleIconButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Tooltip(
      message: tooltip,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(6),
          child: Padding(
            padding: const EdgeInsets.all(6),
            child: Icon(icon, size: 16, color: scheme.onSurfaceVariant),
          ),
        ),
      ),
    );
  }
}

/// General Chat (`purpose: general`), Home chat (`home`), or Schedules (`schedules`).
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
  /// Optional title chosen at New chat; applied on first `openSession`.
  String _pendingNewChatTitle = '';
  String? _turnId;
  String? _assistantDraft;
  String? _draftFormat;
  String? _draftArtifactPath;
  String? _draftArtifactUrl;
  String? _trackedAccountId;
  bool _wasConnected = false;
  bool _sending = false;
  bool _subscribed = false;
  bool _listening = false;
  bool _speechAvailable = false;
  List<Map<String, dynamic>> _pending = [];
  List<Map<String, dynamic>> _pendingChoices = [];
  final Map<String, Set<String>> _choiceManySelected = {};
  final Map<String, TextEditingController> _choiceTextCtrls = {};
  List<Map<String, dynamic>> _boundSources = [];
  bool _approvalsLoading = false;
  bool _choicesLoading = false;
  /// Schedules chat: Chat vs Histories (Not set + Runs).
  String _schedulesPane = 'chat';
  List<Map<String, dynamic>> _scheduleDismissed = [];
  List<Map<String, dynamic>> _scheduleReceipts = [];
  bool _scheduleHistoryLoading = false;
  /// General Chats: ChatGPT-style list ↔ thread (Home stays single-thread).
  bool _showSessionList = true;
  /// When true, the session list shows archived chats (includeArchived).
  bool _showArchived = false;
  List<Map<String, dynamic>> _sessionRows = [];
  bool _sessionsLoading = false;

  bool get _isHome => widget.purpose == 'home';
  bool get _isSchedules => widget.purpose == 'schedules';
  /// Home and Schedules are one thread per profile (no Chats list).
  bool get _singleThread => _isHome || _isSchedules;

  String _sessionStorageKey(String accountId) {
    final slot = _isHome
        ? 'homeChat'
        : _isSchedules
            ? 'schedulesChat'
            : 'chat';
    return 'envoyhome.${slot}SessionId.$accountId';
  }

  @override
  void initState() {
    super.initState();
    _trackedAccountId = widget.session.accountId;
    _wasConnected = widget.session.isConnected;
    widget.session.addListener(_onSessionChanged);
    _ensureSubscribed();
    unawaited(_initSpeech());
    if (_singleThread) {
      _showSessionList = false;
      unawaited(_restoreSession());
    } else {
      unawaited(_loadSessionList());
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        unawaited(_refreshApprovals());
        unawaited(_refreshChoices());
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
    if (oldWidget.purpose != widget.purpose) {
      _teardownSubs();
      _sessionId = null;
      _pendingNewChatTitle = '';
      _subscribed = false;
      _bubbles.clear();
      _pendingFiles.clear();
      _ensureSubscribed();
      unawaited(_restoreSession());
      unawaited(_refreshApprovals());
      unawaited(_refreshChoices());
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
    for (final c in _choiceTextCtrls.values) {
      c.dispose();
    }
    _choiceTextCtrls.clear();
    super.dispose();
  }

  void _onSessionChanged() {
    final connected = widget.session.isConnected;
    final accountId = widget.session.accountId;
    if (accountId != _trackedAccountId) {
      _trackedAccountId = accountId;
      _sessionId = null;
      _pendingNewChatTitle = '';
      _bubbles.clear();
      _assistantDraft = null;
      if (_singleThread) {
        _showSessionList = false;
        unawaited(_restoreSession());
      } else {
        _showSessionList = true;
        unawaited(_loadSessionList());
      }
    } else if (connected && !_wasConnected) {
      // SessionController is the same object — compare connected edge, not
      // oldWidget.session.session (already updated when didUpdateWidget runs).
      if (_singleThread) {
        unawaited(_restoreSession());
      } else {
        unawaited(_loadSessionList());
      }
    }
    _wasConnected = connected;
    unawaited(_refreshApprovals());
    unawaited(_refreshChoices());
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
    final home = widget.session.session;
    if (accountId == null || accountId.isEmpty || home == null) return;
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString(_sessionStorageKey(accountId));
    if (id != null && id.isNotEmpty) {
      if (!mounted) return;
      setState(() => _sessionId = id);
      try {
        await _reloadTranscript(id);
        unawaited(_refreshChoices());
        return;
      } catch (_) {
        // Stale pointer — fall through (Home may still have a daemon session).
        await prefs.remove(_sessionStorageKey(accountId));
        if (mounted) {
          setState(() {
            _sessionId = null;
            _bubbles.clear();
          });
        }
        id = null;
      }
    }
    // Dedicated chat: one session per profile — reuse from daemon list if present.
    if (_singleThread) {
      try {
        final body = await home.listSessions(accountId: accountId);
        final raw = body['sessions'];
        if (raw is List) {
          for (final s in raw) {
            if (s is! Map) continue;
            if ((s['purpose']?.toString() ?? 'general') != widget.purpose) continue;
            final sid = s['sessionId']?.toString();
            if (sid == null || sid.isEmpty) continue;
            await _persistSession(sid);
            if (!mounted) return;
            setState(() => _sessionId = sid);
            await _reloadTranscript(sid);
            unawaited(_refreshChoices());
            return;
          }
        }
      } catch (_) {
        /* open on first send */
      }
    }
  }

  Future<void> _persistSession(String sessionId) async {
    final accountId = widget.session.accountId;
    if (accountId == null || accountId.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_sessionStorageKey(accountId), sessionId);
  }

  /// Home: prefer an existing daemon home session before minting.
  Future<String?> _ensureSessionId() async {
    if (_sessionId != null && _sessionId!.isNotEmpty) return _sessionId;
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    final l10n = AppLocalizations.of(context);
    if (home == null || accountId == null) return null;
    if (_singleThread) {
      try {
        final body = await home.listSessions(accountId: accountId);
        final raw = body['sessions'];
        if (raw is List) {
          for (final s in raw) {
            if (s is! Map) continue;
            if ((s['purpose']?.toString() ?? 'general') != widget.purpose) continue;
            final sid = s['sessionId']?.toString();
            if (sid == null || sid.isEmpty) continue;
            await _persistSession(sid);
            if (mounted) setState(() => _sessionId = sid);
            return sid;
          }
        }
      } catch (_) {
        /* mint below */
      }
    }
    final pendingTitle = !_singleThread ? _pendingNewChatTitle.trim() : '';
    final opened = await home.openSession(
      accountId: accountId,
      // Dedicated: fixed title. General: optional New-chat name; else first-message auto-title.
      title: _isHome
          ? l10n.homeChatSessionTitle
          : _isSchedules
              ? l10n.schedulesChatSessionTitle
              : (pendingTitle.isEmpty ? null : pendingTitle),
      purpose: widget.purpose,
    );
    final sid = opened['sessionId'] as String?;
    if (sid == null || sid.isEmpty) return null;
    await _persistSession(sid);
    if (mounted) {
      setState(() {
        _sessionId = sid;
        if (!_singleThread) _pendingNewChatTitle = '';
      });
    } else if (!_singleThread) {
      _pendingNewChatTitle = '';
    }
    return sid;
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
        'home:choice-needed',
        'home:choice-resolved',
      ]);
      _unsubs.add(home.onEvent('home:turn-delta', _onTurnDelta));
      _unsubs.add(home.onEvent('home:turn-finished', _onTurnFinished));
      _unsubs.add(home.onEvent('home:approval-needed', _onApprovalEvent));
      _unsubs.add(home.onEvent('home:approval-resolved', _onApprovalEvent));
      _unsubs.add(home.onEvent('home:choice-needed', _onChoiceEvent));
      _unsubs.add(home.onEvent('home:choice-resolved', _onChoiceEvent));
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

  void _onChoiceEvent(dynamic data) {
    if (data is Map) {
      final sid = data['sessionId']?.toString();
      if (sid != null && sid.isNotEmpty && _sessionId != null && sid != _sessionId) {
        return;
      }
    }
    unawaited(_refreshChoices());
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

  Future<void> _refreshChoices() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    final sessionId = _sessionId;
    if (home == null ||
        accountId == null ||
        accountId.isEmpty ||
        sessionId == null ||
        sessionId.isEmpty) {
      if (mounted) setState(() => _pendingChoices = []);
      return;
    }
    if (mounted) setState(() => _choicesLoading = true);
    try {
      final listed = await home.listChoices(
        accountId: accountId,
        sessionId: sessionId,
      );
      final raw = listed['choices'];
      final rows = raw is List
          ? raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
          : <Map<String, dynamic>>[];
      if (!mounted) return;
      final alive = rows.map((r) => r['id']?.toString() ?? '').toSet();
      _choiceManySelected.removeWhere((k, _) => !alive.contains(k));
      for (final id in _choiceTextCtrls.keys.toList()) {
        if (!alive.contains(id)) {
          _choiceTextCtrls.remove(id)?.dispose();
        }
      }
      setState(() {
        _pendingChoices = rows;
        _choicesLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _choicesLoading = false);
    }
  }

  Future<void> _answerChoice(
    Map<String, dynamic> row, {
    String? optionId,
    List<String>? optionIds,
    String? text,
    bool cancel = false,
  }) async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (home == null || accountId == null) return;
    final l10n = AppLocalizations.of(context);
    final id = row['id']?.toString();
    if (id == null || id.isEmpty) return;
    try {
      await home.answerChoice(
        accountId: accountId,
        id: id,
        optionId: optionId,
        optionIds: optionIds,
        text: text,
        cancel: cancel,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(cancel ? l10n.choiceCardCanceled : l10n.choiceCardAnswered),
        ),
      );
      await _refreshChoices();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.choiceCardFailed('$e'))),
      );
    }
  }

  String? _choiceExpiryLabel(Map<String, dynamic> row, AppLocalizations l10n) {
    final raw = row['expiresAt']?.toString();
    if (raw == null || raw.isEmpty) return null;
    final ms = DateTime.tryParse(raw)?.difference(DateTime.now()).inMilliseconds;
    if (ms == null) return null;
    if (ms <= 0) return l10n.choiceCardExpired;
    final mins = (ms / 60000).ceil().clamp(1, 9999);
    return l10n.choiceCardExpiresIn(mins);
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
    // Ignore turns for other sessions (Home + Chats both stay mounted).
    final sid = map['sessionId']?.toString();
    if (sid == null || sid.isEmpty || sid != _sessionId) return;
    if (map['kind']?.toString() != 'text') return;
    final text = map['text']?.toString();
    if (text == null || text.isEmpty) return;
    if (!mounted) return;
    setState(() {
      final tid = map['turnId']?.toString();
      if (tid != null && tid.isNotEmpty) _turnId = tid;
      final fmt = normalizeChatFormat(map['format']);
      if (fmt != null) _draftFormat = fmt;
      final path = map['artifactPath']?.toString();
      if (path != null && path.isNotEmpty) _draftArtifactPath = path;
      final art = map['artifactUrl']?.toString();
      if (art != null && art.isNotEmpty) _draftArtifactUrl = art;
      // Thin-client spill: `link` + artifactPath replaces the streamed draft (not append).
      if (fmt == 'link' && path != null && path.isNotEmpty) {
        _assistantDraft = text;
      } else {
        _assistantDraft = (_assistantDraft ?? '') + text;
      }
    });
    _scrollToEnd();
  }

  void _onTurnFinished(dynamic data) {
    if (!mounted) return;
    if (data is Map) {
      final sid = data['sessionId']?.toString();
      if (sid == null || sid.isEmpty || sid != _sessionId) return;
    }
    setState(() {
      final draft = _assistantDraft?.trim();
      if (draft != null && draft.isNotEmpty) {
        _bubbles.add(_ChatBubble(
          role: 'assistant',
          text: draft,
          format: _draftFormat ?? classifyChatFormat(draft),
          artifactPath: _draftArtifactPath,
          artifactUrl: _draftArtifactUrl,
        ));
      }
      _assistantDraft = null;
      _draftFormat = null;
      _draftArtifactPath = null;
      _draftArtifactUrl = null;
      _turnId = null;
      _sending = false;
    });
    final sessionId = _sessionId;
    if (sessionId != null) {
      unawaited(_reloadTranscript(sessionId));
    }
    if (!_singleThread) unawaited(_loadSessionList());
    unawaited(_refreshApprovals());
    unawaited(_refreshChoices());
    _scrollToEnd();
  }

  Future<void> _reloadTranscript(String sessionId) async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (home == null || accountId == null) {
      throw StateError('not connected');
    }
    final body = await home.getTranscript(
      accountId: accountId,
      sessionId: sessionId,
      limit: 80,
    );
    final messages = body['messages'];
    if (messages is! List) {
      throw StateError('bad transcript');
    }
    if (!mounted) return;
    final next = <_ChatBubble>[];
    for (final m in messages) {
      if (m is! Map) continue;
      final role = (m['role'] ?? m['speaker'] ?? 'unknown').toString();
      final text = (m['text'] ?? m['content'] ?? '').toString();
      final messageId = m['messageId']?.toString();
      final mediaRaw = m['media'];
      final media = <Map<String, dynamic>>[];
      if (mediaRaw is List) {
        for (final item in mediaRaw) {
          if (item is Map) media.add(Map<String, dynamic>.from(item));
        }
      }
      if (text.isEmpty && media.isEmpty) continue;
      final format = normalizeChatFormat(m['format']);
      final artifactPath = m['artifactPath']?.toString();
      final artifactUrl = m['artifactUrl']?.toString();
      next.add(_ChatBubble(
        role: role,
        text: text,
        media: media,
        messageId: messageId,
        format: role == 'assistant' ? (format ?? classifyChatFormat(text)) : format,
        artifactPath: (artifactPath != null && artifactPath.isNotEmpty) ? artifactPath : null,
        artifactUrl: (artifactUrl != null && artifactUrl.isNotEmpty) ? artifactUrl : null,
      ));
    }
    setState(() {
      _bubbles
        ..clear()
        ..addAll(next);
    });
    _scrollToEnd();
  }

  /// Chats list: only user-messaged general sessions (hide schedule/inbound/empty).
  bool _isUserFacingGeneralChat(Map s) {
    final purpose = s['purpose']?.toString() ?? 'general';
    if (purpose != 'general') return false;
    final count = s['messageCount'];
    final n = count is num ? count.toInt() : 0;
    if (n <= 0) return false;
    final channel = s['channel']?.toString();
    if (channel != null && channel.isNotEmpty) return false;
    final title = (s['title']?.toString() ?? '').trim();
    if (title.isEmpty) return true;
    final lower = title.toLowerCase();
    if (lower.startsWith('schedule:')) return false;
    if (lower.startsWith('workflow-test:')) return false;
    if (lower == 'hatch') return false;
    if (lower.endsWith(' inbound')) return false;
    return true;
  }

  Future<void> _loadSessionList() async {
    if (_singleThread) return;
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (home == null || accountId == null) return;
    if (mounted) setState(() => _sessionsLoading = true);
    try {
      final body = await home.listSessions(
        accountId: accountId,
        includeArchived: _showArchived,
      );
      final raw = body['sessions'];
      final rows = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final s in raw) {
          if (s is! Map) continue;
          if (!_isUserFacingGeneralChat(s)) continue;
          final archived = s['archivedAt'] != null;
          if (_showArchived != archived) continue;
          rows.add(Map<String, dynamic>.from(s));
        }
      }
      if (!mounted) return;
      setState(() {
        _sessionRows = rows.take(40).toList();
        _sessionsLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _sessionsLoading = false);
    }
  }

  Future<void> _startNewChat({bool askName = true}) async {
    if (_singleThread) return;
    if (_sending) {
      final l10n = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.chatBusyTurn)));
      return;
    }
    final l10n = AppLocalizations.of(context);
    var title = '';
    if (askName) {
      final chosen = await _promptOptionalNewChatTitle(l10n);
      if (chosen == null || !mounted) return;
      title = chosen;
    }
    final accountId = widget.session.accountId;
    // ChatGPT-style: don't mint a session until the first send — avoids empty
    // list rows the user never messaged.
    if (accountId != null) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_sessionStorageKey(accountId));
    }
    if (!mounted) return;
    setState(() {
      _sessionId = null;
      _pendingNewChatTitle = title;
      _bubbles.clear();
      _assistantDraft = null;
      _turnId = null;
      _showSessionList = false;
    });
    unawaited(_pruneAndReloadSessions());
  }

  /// Returns null on cancel; empty string = untitled (auto-title later).
  Future<String?> _promptOptionalNewChatTitle(AppLocalizations l10n) async {
    final controller = TextEditingController();
    final next = await showDialog<String>(
      context: context,
      builder: (ctx) {
        String? error;
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            void createNamed() {
              final trimmed = controller.text.trim();
              if (trimmed.isEmpty) {
                setLocal(() => error = l10n.chatNewNeedName);
                return;
              }
              Navigator.of(ctx).pop(trimmed.length > 120 ? trimmed.substring(0, 120) : trimmed);
            }

            return AlertDialog(
              title: Text(l10n.chatNew),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    l10n.chatNewNameHint,
                    style: Theme.of(ctx).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(ctx).colorScheme.onSurface.withValues(alpha: 0.65),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: controller,
                    autofocus: true,
                    maxLength: 120,
                    decoration: InputDecoration(
                      labelText: l10n.chatNewNamePrompt,
                      hintText: l10n.chatNewNamePlaceholder,
                      errorText: error,
                    ),
                    onChanged: (_) {
                      if (error != null) setLocal(() => error = null);
                    },
                    onSubmitted: (_) {
                      final trimmed = controller.text.trim();
                      // Enter: named if filled, otherwise start without name.
                      Navigator.of(ctx).pop(
                        trimmed.isEmpty
                            ? ''
                            : (trimmed.length > 120 ? trimmed.substring(0, 120) : trimmed),
                      );
                    },
                  ),
                ],
              ),
              actionsAlignment: MainAxisAlignment.end,
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  child: Text(l10n.chatCancel),
                ),
                TextButton(
                  onPressed: () => Navigator.of(ctx).pop(''),
                  child: Text(l10n.chatNewSkip),
                ),
                FilledButton(
                  onPressed: createNamed,
                  child: Text(l10n.chatNewCreate),
                ),
              ],
            );
          },
        );
      },
    );
    controller.dispose();
    if (next == null) return null;
    return next.trim().length > 120 ? next.trim().substring(0, 120) : next.trim();
  }

  Future<void> _pruneAndReloadSessions() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (home == null || accountId == null) {
      await _loadSessionList();
      return;
    }
    try {
      final body = await home.listSessions(accountId: accountId);
      final raw = body['sessions'];
      if (raw is List) {
        for (final s in raw) {
          if (s is! Map) continue;
          if ((s['purpose']?.toString() ?? 'general') != 'general') continue;
          final count = s['messageCount'];
          final n = count is num ? count.toInt() : 0;
          if (n > 0) continue;
          final sid = s['sessionId']?.toString();
          if (sid == null || sid.isEmpty || sid == _sessionId) continue;
          await home.removeSession(accountId: accountId, sessionId: sid);
        }
      }
    } catch (_) {
      /* best-effort cleanup */
    }
    await _loadSessionList();
  }

  Future<void> _renamePendingOrSession({String? sessionId, String? currentTitle}) async {
    if (_singleThread) return;
    if (_sending) {
      final l10n = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.chatBusyTurn)));
      return;
    }
    final l10n = AppLocalizations.of(context);
    // Named New chat before first send — edit the pending title locally.
    if (sessionId == null || sessionId.isEmpty) {
      final controller = TextEditingController(text: _pendingNewChatTitle);
      final next = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(l10n.chatRenameAction),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLength: 120,
            decoration: InputDecoration(
              labelText: l10n.chatRenamePrompt,
              hintText: l10n.chatNewNamePlaceholder,
            ),
            onSubmitted: (v) => Navigator.of(ctx).pop(v),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: Text(MaterialLocalizations.of(ctx).cancelButtonLabel),
            ),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(controller.text),
              child: Text(l10n.chatRenameAction),
            ),
          ],
        ),
      );
      controller.dispose();
      if (next == null || !mounted) return;
      final trimmed = next.trim();
      setState(() {
        _pendingNewChatTitle = trimmed.length > 120 ? trimmed.substring(0, 120) : trimmed;
      });
      return;
    }
    await _renameSession(sessionId, currentTitle: currentTitle);
  }

  Future<void> _renameSession(String sessionId, {String? currentTitle}) async {
    if (_singleThread) return;
    if (_sending) {
      final l10n = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.chatBusyTurn)));
      return;
    }
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    final l10n = AppLocalizations.of(context);
    if (home == null || accountId == null) return;
    final initial = (currentTitle ?? '').trim();
    final controller = TextEditingController(
      text: initial.isEmpty || initial == l10n.chatUntitled || initial == l10n.chatNew
          ? ''
          : initial,
    );
    final next = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.chatRenameAction),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 120,
          decoration: InputDecoration(labelText: l10n.chatRenamePrompt),
          onSubmitted: (v) => Navigator.of(ctx).pop(v),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(l10n.chatCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text),
            child: Text(l10n.chatRenameAction),
          ),
        ],
      ),
    );
    controller.dispose();
    if (next == null || !mounted) return;
    final trimmed = next.trim();
    if (trimmed.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.chatRenameEmpty)));
      return;
    }
    try {
      final body = await home.renameSession(
        accountId: accountId,
        sessionId: sessionId,
        title: trimmed,
      );
      final title = body['title']?.toString() ?? trimmed;
      if (!mounted) return;
      setState(() {
        for (final s in _sessionRows) {
          if (s['sessionId']?.toString() == sessionId) {
            s['title'] = title;
          }
        }
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.chatRenameDone)));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _selectSession(String sessionId, {bool fromArchive = false}) async {
    if (_singleThread) return;
    if (_sending) {
      final l10n = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.chatBusyTurn)));
      return;
    }
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (fromArchive && home != null && accountId != null) {
      try {
        await home.unarchiveSession(accountId: accountId, sessionId: sessionId);
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
        return;
      }
    }
    await _persistSession(sessionId);
    if (!mounted) return;
    setState(() {
      _sessionId = sessionId;
      _pendingNewChatTitle = '';
      _bubbles.clear();
      _assistantDraft = null;
      _showSessionList = false;
      _showArchived = false;
    });
    try {
      await _reloadTranscript(sessionId);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).chatError('$e'))),
      );
    }
  }

  Future<void> _unarchiveSession(String sessionId) async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    final l10n = AppLocalizations.of(context);
    if (home == null || accountId == null) return;
    if (_sending) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.chatBusyTurn)));
      return;
    }
    try {
      await home.unarchiveSession(accountId: accountId, sessionId: sessionId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.chatUnarchiveDone)));
      await _loadSessionList();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _openSessionList() async {
    if (_singleThread) return;
    setState(() {
      _showSessionList = true;
      _showArchived = false;
    });
    await _loadSessionList();
  }

  Future<void> _openArchivedList() async {
    if (_singleThread) return;
    setState(() {
      _showSessionList = true;
      _showArchived = true;
    });
    await _loadSessionList();
  }

  Future<void> _showTrashMenu() async {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    if (_sending) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.chatBusyTurn)));
      return;
    }
    final canAct = _sessionId != null || _pendingNewChatTitle.trim().isNotEmpty;
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      backgroundColor: theme.colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        final scheme = Theme.of(ctx).colorScheme;
        Widget tile({
          required IconData icon,
          required String label,
          required String value,
          bool enabled = true,
          bool danger = false,
        }) {
          final color = !enabled
              ? scheme.onSurface.withValues(alpha: 0.28)
              : danger
                  ? scheme.error
                  : scheme.onSurface;
          return ListTile(
            enabled: enabled,
            leading: Icon(icon, color: color, size: 22),
            title: Text(
              label,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: color,
                fontWeight: danger ? FontWeight.w600 : FontWeight.w500,
              ),
            ),
            onTap: enabled ? () => Navigator.pop(ctx, value) : null,
            contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 2),
          );
        }

        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
                  child: Text(
                    l10n.chatTrashMenu,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.2,
                    ),
                  ),
                ),
                if (!_singleThread)
                  tile(
                    icon: Icons.drive_file_rename_outline,
                    label: l10n.chatRenameAction,
                    value: 'rename',
                    enabled: canAct,
                  ),
                tile(
                  icon: Icons.delete_sweep_outlined,
                  label: l10n.chatEmptyAction,
                  value: 'empty',
                  enabled: _sessionId != null && _bubbles.isNotEmpty,
                ),
                if (!_singleThread)
                  tile(
                    icon: Icons.archive_outlined,
                    label: l10n.chatArchiveAction,
                    value: 'archive',
                    enabled: _sessionId != null,
                  ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  child: Divider(
                    height: 1,
                    color: scheme.onSurface.withValues(alpha: 0.08),
                  ),
                ),
                tile(
                  icon: Icons.delete_outline,
                  label: l10n.chatRemoveAction,
                  value: 'remove',
                  enabled: canAct,
                  danger: true,
                ),
              ],
            ),
          ),
        );
      },
    );
    if (!mounted || action == null) return;
    // Let the sheet finish dismissing before opening another route (iOS).
    await Future<void>.delayed(Duration.zero);
    if (!mounted) return;
    if (action == 'rename') {
      await _renamePendingOrSession(
        sessionId: _sessionId,
        currentTitle: _threadTitle(l10n),
      );
    } else if (action == 'empty') {
      await _emptyChat();
    } else if (action == 'archive') {
      await _archiveSession(_sessionId);
    } else if (action == 'remove') {
      if (_sessionId == null) {
        setState(() {
          _pendingNewChatTitle = '';
          _bubbles.clear();
          _assistantDraft = null;
          _showSessionList = true;
        });
        return;
      }
      await _removeSession(_sessionId);
    }
  }

  Future<bool> _confirm({
    required String title,
    required String body,
    required String confirmLabel,
    bool danger = false,
  }) async {
    final l10n = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        final scheme = Theme.of(ctx).colorScheme;
        return AlertDialog(
          title: Text(title),
          content: Text(body),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(l10n.chatCancel),
            ),
            FilledButton(
              style: danger
                  ? FilledButton.styleFrom(
                      backgroundColor: scheme.error,
                      foregroundColor: scheme.onError,
                    )
                  : null,
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(confirmLabel),
            ),
          ],
        );
      },
    );
    return ok == true;
  }

  Future<void> _emptyChat() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    final sessionId = _sessionId;
    final l10n = AppLocalizations.of(context);
    if (_sending) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.chatBusyTurn)));
      return;
    }
    if (home == null || accountId == null) return;
    if (sessionId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chatNoSession)),
      );
      return;
    }
    final ok = await _confirm(
      title: l10n.chatEmptyConfirmTitle,
      body: l10n.chatEmptyConfirmBody,
      confirmLabel: l10n.chatEmptyAction,
    );
    if (!ok || !mounted) return;
    try {
      await home.clearTranscript(accountId: accountId, sessionId: sessionId);
      if (!mounted) return;
      setState(() {
        _bubbles.clear();
        _assistantDraft = null;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chatError('$e'))),
      );
    }
  }

  Future<void> _archiveSession(String? sessionId) async {
    if (_singleThread || sessionId == null || sessionId.isEmpty) return;
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    final l10n = AppLocalizations.of(context);
    if (_sending) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.chatBusyTurn)));
      return;
    }
    if (home == null || accountId == null) return;
    final ok = await _confirm(
      title: l10n.chatArchiveConfirmTitle,
      body: l10n.chatArchiveConfirmBody,
      confirmLabel: l10n.chatArchiveAction,
    );
    if (!ok || !mounted) return;
    try {
      await home.archiveSession(accountId: accountId, sessionId: sessionId);
      if (!mounted) return;
      if (sessionId == _sessionId) {
        setState(() {
          _sessionId = null;
          _pendingNewChatTitle = '';
          _bubbles.clear();
          _assistantDraft = null;
          _showSessionList = true;
        });
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(_sessionStorageKey(accountId));
      }
      await _loadSessionList();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chatError('$e'))),
      );
    }
  }

  Future<void> _removeSession(String? sessionId) async {
    if (sessionId == null || sessionId.isEmpty) return;
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    final l10n = AppLocalizations.of(context);
    if (_sending) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.chatBusyTurn)));
      return;
    }
    if (home == null || accountId == null) return;
    final ok = await _confirm(
      title: l10n.chatRemoveConfirmTitle,
      body: l10n.chatRemoveConfirmBody,
      confirmLabel: l10n.chatRemoveAction,
      danger: true,
    );
    if (!ok || !mounted) return;
    try {
      await home.removeSession(accountId: accountId, sessionId: sessionId);
      if (!mounted) return;
      if (sessionId == _sessionId) {
        setState(() {
          _sessionId = null;
          _pendingNewChatTitle = '';
          _bubbles.clear();
          _assistantDraft = null;
          if (!_singleThread) _showSessionList = true;
        });
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove(_sessionStorageKey(accountId));
      }
      if (!_singleThread) await _loadSessionList();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chatRemoveDone)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chatError('$e'))),
      );
    }
  }

  String _copyTextForBubble(_ChatBubble b) {
    if (b.role == 'assistant') {
      final visible = splitAssistantSegments(b.text)
          .where((s) => !s.isThink)
          .map((s) => s.text)
          .join()
          .trim();
      if (visible.isNotEmpty) return visible;
    }
    return b.text.trim();
  }

  Future<void> _copyBubble(_ChatBubble b) async {
    final text = _copyTextForBubble(b);
    if (text.isEmpty) return;
    final l10n = AppLocalizations.of(context);
    await Clipboard.setData(ClipboardData(text: text));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(l10n.chatCopied)),
    );
  }

  Future<void> _deleteBubble(_ChatBubble b) async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    final sessionId = _sessionId;
    final messageId = b.messageId;
    final l10n = AppLocalizations.of(context);
    if (_sending) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.chatBusyTurn)));
      return;
    }
    if (home == null || accountId == null) return;
    if (sessionId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chatNoSession)),
      );
      return;
    }
    if (messageId == null || messageId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chatDeleteFailed)),
      );
      return;
    }
    try {
      final result = await home.deleteTranscriptMessages(
        accountId: accountId,
        sessionId: sessionId,
        messageIds: [messageId],
      );
      final removed = result['removed'];
      if (removed is num && removed < 1) {
        throw StateError(l10n.chatDeleteFailed);
      }
      if (!mounted) return;
      setState(() => _bubbles.remove(b));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chatError('$e'))),
      );
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
      final sessionId = await _ensureSessionId();
      if (sessionId == null) throw StateError('no sessionId');
      if (!mounted) return;
      final displayText = text.isEmpty ? l10n.chatAttachedOnly : text;
      setState(() {
        _bubbles.add(_ChatBubble(role: 'user', text: displayText, media: media));
        _assistantDraft = '';
        _textCtrl.clear();
        _pendingFiles.clear();
      });
      _scrollToEnd();
      final clientContext = await buildClientContext(context);
      final sent = await home.sendMessage(
        accountId: accountId,
        sessionId: sessionId,
        text: text,
        media: media.isEmpty ? null : media,
        clientContext: clientContext,
      );
      _turnId = sent['turnId']?.toString();
      final status = sent['status']?.toString();
      if (status != null && status != 'started' && status != 'ok') {
        if (!mounted) return;
        setState(() {
          _bubbles.add(_ChatBubble(role: 'system', text: l10n.chatStatus(status)));
          _sending = false;
        });
      } else {
        // Pick up durable messageIds so Delete works before the assistant finishes.
        try {
          await _reloadTranscript(sessionId);
        } catch (_) {
          /* keep optimistic bubbles */
        }
      }
      if (!_singleThread) unawaited(_loadSessionList());
      unawaited(_refreshApprovals());
      unawaited(_refreshChoices());
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _bubbles.add(_ChatBubble(role: 'system', text: l10n.chatError('$e')));
        _assistantDraft = null;
        _sending = false;
      });
    }
  }

  String _threadTitle(AppLocalizations l10n) {
    if (_isHome) return l10n.navHomeChat;
    if (_isSchedules) return l10n.navSchedulesChat;
    if (_showSessionList) {
      return _showArchived ? l10n.chatArchivedTitle : l10n.navChat;
    }
    if (_sessionId == null) {
      final pending = _pendingNewChatTitle.trim();
      return pending.isEmpty ? l10n.chatNew : pending;
    }
    for (final s in _sessionRows) {
      if (s['sessionId']?.toString() == _sessionId) {
        final t = s['title']?.toString().trim();
        if (t != null && t.isNotEmpty) return t;
      }
    }
    for (final b in _bubbles) {
      if (b.role == 'user' && b.text.trim().isNotEmpty) {
        final t = b.text.trim().replaceAll(RegExp(r'\s+'), ' ');
        return t.length > 40 ? '${t.substring(0, 40)}…' : t;
      }
    }
    return l10n.chatUntitled;
  }

  Future<void> _refreshScheduleHistories() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    if (!_isSchedules || home == null || accountId == null || accountId.isEmpty) {
      if (mounted) {
        setState(() {
          _scheduleDismissed = [];
          _scheduleReceipts = [];
        });
      }
      return;
    }
    if (mounted) setState(() => _scheduleHistoryLoading = true);
    try {
      final listed = await home.listSchedules(accountId: accountId);
      final dismissedRaw = listed['dismissed'];
      final dismissed = <Map<String, dynamic>>[];
      if (dismissedRaw is List) {
        for (final d in dismissedRaw) {
          if (d is Map) dismissed.add(Map<String, dynamic>.from(d));
        }
      }
      final receiptsBody = await home.listScheduleReceipts(
        accountId: accountId,
        limit: 20,
      );
      final receiptsRaw = receiptsBody['receipts'];
      final receipts = <Map<String, dynamic>>[];
      if (receiptsRaw is List) {
        for (final r in receiptsRaw) {
          if (r is Map) receipts.add(Map<String, dynamic>.from(r));
        }
      }
      if (!mounted) return;
      setState(() {
        _scheduleDismissed = dismissed;
        _scheduleReceipts = receipts;
        _scheduleHistoryLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _scheduleHistoryLoading = false);
    }
  }

  String _dismissedTitle(Map<String, dynamic> d, AppLocalizations l10n) {
    final name = d['name']?.toString().trim() ?? '';
    if (name.isNotEmpty) return name;
    final msg = d['message']?.toString().trim() ?? '';
    if (msg.isNotEmpty) return msg;
    final local = d['resolvedLocal']?.toString().trim() ?? '';
    if (local.isEmpty) return '—';
    if (local.toLowerCase().startsWith('cron ')) return l10n.schedTabRepeating;
    return local;
  }

  String? _dismissedWhen(Map<String, dynamic> d) {
    final local = d['resolvedLocal']?.toString().trim() ?? '';
    if (local.isEmpty || local.toLowerCase().startsWith('cron ')) return null;
    return local;
  }

  String _formatHistWhen(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')} '
        '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }

  Widget _histRow({
    required ThemeData theme,
    required String title,
    required String badge,
    Color? badgeFg,
    Color? badgeBg,
    String? meta,
    String? foot,
  }) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: badgeBg ??
                        theme.colorScheme.onSurface.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    badge,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: badgeFg ?? theme.colorScheme.onSurface.withValues(alpha: 0.7),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            if (meta != null && meta.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(meta, style: theme.textTheme.bodySmall),
            ],
            if (foot != null && foot.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                foot,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _schedulesHistoriesBody(AppLocalizations l10n, ThemeData theme) {
    if (_scheduleHistoryLoading &&
        _scheduleDismissed.isEmpty &&
        _scheduleReceipts.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    return RefreshIndicator(
      onRefresh: _refreshScheduleHistories,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Text(
            l10n.schedulesChatHistoriesHint,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
              height: 1.4,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            l10n.schedHistoryNotSet,
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          if (_scheduleDismissed.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                l10n.schedNoDismissed,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                ),
              ),
            )
          else
            ..._scheduleDismissed.take(20).map((d) {
              final expired = d['status']?.toString() == 'expired';
              return _histRow(
                theme: theme,
                title: _dismissedTitle(d, l10n),
                badge: expired
                    ? l10n.schedDismissedExpired
                    : l10n.schedDismissedCanceled,
                badgeFg: expired
                    ? theme.colorScheme.tertiary
                    : theme.colorScheme.onSurface.withValues(alpha: 0.7),
                badgeBg: expired
                    ? theme.colorScheme.tertiary.withValues(alpha: 0.14)
                    : theme.colorScheme.onSurface.withValues(alpha: 0.08),
                meta: _dismissedWhen(d),
                foot: l10n.schedulesChatClosedAt(
                  _formatHistWhen(d['closedAt']?.toString()),
                ),
              );
            }),
          const SizedBox(height: 16),
          Text(
            l10n.schedHistoryRuns,
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          if (_scheduleReceipts.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                l10n.schedNoReceipts,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                ),
              ),
            )
          else
            ..._scheduleReceipts.take(20).map((r) {
              final status = r['execStatus']?.toString() ?? '—';
              final ok = status == 'ok';
              final err = status == 'error';
              return _histRow(
                theme: theme,
                title: (r['jobId']?.toString() ?? '—'),
                badge: status,
                badgeFg: ok
                    ? theme.colorScheme.primary
                    : err
                        ? theme.colorScheme.error
                        : null,
                badgeBg: ok
                    ? theme.colorScheme.primary.withValues(alpha: 0.12)
                    : err
                        ? theme.colorScheme.error.withValues(alpha: 0.12)
                        : null,
                foot: l10n.schedulesChatRanAt(
                  _formatHistWhen(
                    r['finishedAt']?.toString() ?? r['startedAt']?.toString(),
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _schedulesPaneTabs(AppLocalizations l10n, ThemeData theme) {
    Widget tab(String id, String label) {
      final selected = _schedulesPane == id;
      return Expanded(
        child: InkWell(
          onTap: _sending
              ? null
              : () {
                  if (id == _schedulesPane) return;
                  setState(() => _schedulesPane = id);
                  if (id == 'histories') unawaited(_refreshScheduleHistories());
                },
          child: Container(
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(
                  width: 2,
                  color: selected ? theme.colorScheme.primary : Colors.transparent,
                ),
              ),
            ),
            child: Text(
              label,
              style: theme.textTheme.labelLarge?.copyWith(
                color: selected
                    ? theme.colorScheme.primary
                    : theme.colorScheme.onSurface.withValues(alpha: 0.55),
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
        ),
      );
    }

    return Material(
      color: theme.scaffoldBackgroundColor,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(color: theme.dividerColor.withValues(alpha: 0.6)),
          ),
        ),
        child: Row(
          children: [
            tab('chat', l10n.schedulesChatTabChat),
            tab('histories', l10n.schedulesChatTabHistories),
          ],
        ),
      ),
    );
  }

  Widget _chatChrome(AppLocalizations l10n, ThemeData theme) {
    final inList = !_singleThread && _showSessionList;
    return Material(
      color: theme.scaffoldBackgroundColor,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
        child: Row(
          children: [
            if (!_singleThread && !inList)
              IconButton(
                tooltip: l10n.navChat,
                onPressed: _sending ? null : () => unawaited(_openSessionList()),
                icon: const Icon(Icons.arrow_back, size: 20),
              ),
            Expanded(
              child: (!_singleThread && !inList)
                  ? InkWell(
                      onTap: _sending
                          ? null
                          : () {
                              unawaited(
                                _renamePendingOrSession(
                                  sessionId: _sessionId,
                                  currentTitle: _threadTitle(l10n),
                                ),
                              );
                            },
                      child: Text(
                        _threadTitle(l10n),
                        style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                        overflow: TextOverflow.ellipsis,
                      ),
                    )
                  : Text(
                      inList ? l10n.navChat : _threadTitle(l10n),
                      style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                      overflow: TextOverflow.ellipsis,
                    ),
            ),
            if (!_singleThread && inList && !_showArchived)
              IconButton(
                tooltip: l10n.chatNew,
                onPressed: _sending ? null : _startNewChat,
                icon: const Icon(Icons.add, size: 22),
              ),
            if (!inList)
              IconButton(
                tooltip: l10n.chatTrashMenu,
                onPressed: _sending ? null : _showTrashMenu,
                icon: const Icon(Icons.delete_outline, size: 20),
              ),
          ],
        ),
      ),
    );
  }

  Widget _sessionList(AppLocalizations l10n, ThemeData theme) {
    if (_sessionsLoading && _sessionRows.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_sessionRows.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _showArchived ? l10n.chatArchivedEmpty : l10n.chatSessionsEmpty,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                ),
              ),
              if (!_showArchived) ...[
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: _sending ? null : _startNewChat,
                  icon: const Icon(Icons.add, size: 18),
                  label: Text(l10n.chatNew),
                ),
              ],
            ],
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _loadSessionList,
      child: ListView.builder(
        itemCount: _sessionRows.length,
        itemBuilder: (_, i) {
          final s = _sessionRows[i];
          final sid = s['sessionId']?.toString() ?? '';
          final title = (s['title']?.toString().trim().isNotEmpty == true)
              ? s['title'].toString()
              : l10n.chatUntitled;
          final current = sid == _sessionId;
          return ListTile(
            selected: current,
            selectedTileColor: theme.colorScheme.onSurface.withValues(alpha: 0.08),
            title: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodyLarge?.copyWith(
                fontWeight: current ? FontWeight.w600 : FontWeight.w500,
              ),
            ),
            trailing: PopupMenuButton<String>(
              tooltip: l10n.chatTrashMenu,
              icon: Icon(
                Icons.more_horiz,
                size: 20,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.45),
              ),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              onSelected: (action) {
                // Defer until the popup route has popped — otherwise iOS drops the confirm dialog.
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (!mounted) return;
                  if (action == 'rename') {
                    unawaited(_renameSession(sid, currentTitle: title));
                  } else if (action == 'archive') {
                    unawaited(_archiveSession(sid));
                  } else if (action == 'unarchive') {
                    unawaited(_unarchiveSession(sid));
                  } else if (action == 'remove') {
                    unawaited(_removeSession(sid));
                  }
                });
              },
              itemBuilder: (ctx) {
                final scheme = Theme.of(ctx).colorScheme;
                PopupMenuItem<String> item({
                  required String value,
                  required IconData icon,
                  required String label,
                  bool danger = false,
                }) {
                  final color = danger ? scheme.error : scheme.onSurface;
                  return PopupMenuItem(
                    value: value,
                    child: Row(
                      children: [
                        Icon(icon, size: 20, color: color),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            label,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: color,
                              fontWeight: danger ? FontWeight.w600 : FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }

                if (_showArchived) {
                  return [
                    item(
                      value: 'unarchive',
                      icon: Icons.unarchive_outlined,
                      label: l10n.chatUnarchiveAction,
                    ),
                    const PopupMenuDivider(),
                    item(
                      value: 'remove',
                      icon: Icons.delete_outline,
                      label: l10n.chatRemoveAction,
                      danger: true,
                    ),
                  ];
                }
                return [
                  item(
                    value: 'rename',
                    icon: Icons.drive_file_rename_outline,
                    label: l10n.chatRenameAction,
                  ),
                  item(
                    value: 'archive',
                    icon: Icons.archive_outlined,
                    label: l10n.chatArchiveAction,
                  ),
                  const PopupMenuDivider(),
                  item(
                    value: 'remove',
                    icon: Icons.delete_outline,
                    label: l10n.chatRemoveAction,
                    danger: true,
                  ),
                ];
              },
            ),
            onTap: () => unawaited(_selectSession(sid, fromArchive: _showArchived)),
          );
        },
      ),
    );
  }

  Widget _bubble(_ChatBubble b) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
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
    final bodyChildren = <Widget>[];
    if (isUser) {
      if (b.text.isNotEmpty) {
        bodyChildren.add(Text(b.text, style: theme.textTheme.bodyMedium));
      }
    } else {
      bodyChildren.addAll(_assistantBody(b, theme, l10n));
    }
    if (b.media.isNotEmpty) {
      if (bodyChildren.isNotEmpty) bodyChildren.add(const SizedBox(height: 6));
      bodyChildren.add(
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
      );
    }
    if (bodyChildren.isEmpty) return const SizedBox.shrink();
    final canDelete =
        b.messageId != null && b.messageId!.isNotEmpty && !_sending;
    final canCopy = _copyTextForBubble(b).isNotEmpty && !_sending;
    // EnvoyGo / EnvoyMesh Social peer: muted copy+delete icons *below* the bubble
    // (not inside the tinted surface — that looked like a green block).
    final bubble = Container(
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
        children: bodyChildren,
      ),
    );
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.82,
        ),
        child: Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Column(
            crossAxisAlignment:
                isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              bubble,
              if (canCopy || canDelete)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (canCopy)
                        _BubbleIconButton(
                          icon: Icons.content_copy,
                          tooltip: l10n.chatCopyMessage,
                          onPressed: () => unawaited(_copyBubble(b)),
                        ),
                      if (canDelete)
                        _BubbleIconButton(
                          icon: Icons.delete_outline,
                          tooltip: l10n.chatDeleteMessage,
                          onPressed: () => unawaited(_deleteBubble(b)),
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  /// Collapsed-by-default think tiles + visible reply (EnvoyCoder `_ThoughtTile` peer).
  /// Visible reply uses Design §9.5 format (plain Text vs markdown).
  List<Widget> _assistantBody(_ChatBubble b, ThemeData theme, AppLocalizations l10n) {
    final segments = splitAssistantSegments(humanizeScheduleChatText(b.text));
    final format = b.format ?? classifyChatFormat(
      segments.where((s) => !s.isThink).map((s) => s.text).join(),
    );
    final out = <Widget>[];
    for (final seg in segments) {
      if (seg.isThink) {
        out.add(
          Theme(
            data: theme.copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              tilePadding: EdgeInsets.zero,
              childrenPadding: const EdgeInsets.only(bottom: 4),
              dense: true,
              visualDensity: VisualDensity.compact,
              title: Text(
                l10n.chatThought,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                  fontWeight: FontWeight.w500,
                ),
              ),
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    seg.text,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.65),
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      } else if (seg.text.isNotEmpty) {
        if (format == 'plain') {
          out.add(Text(seg.text, style: theme.textTheme.bodyMedium));
        } else {
          out.add(
            MarkdownBody(
              data: seg.text,
              selectable: true,
              styleSheet: MarkdownStyleSheet.fromTheme(theme).copyWith(
                p: theme.textTheme.bodyMedium,
                code: theme.textTheme.bodySmall?.copyWith(
                  fontFamily: 'monospace',
                  backgroundColor: theme.colorScheme.onSurface.withValues(alpha: 0.06),
                ),
              ),
              onTapLink: (text, href, title) {
                if (href == null || href.isEmpty) return;
                unawaited(launchUrl(Uri.parse(href), mode: LaunchMode.externalApplication));
              },
            ),
          );
        }
      }
    }
    final path = b.artifactPath;
    final artUrl = b.artifactUrl;
    // Mesh-first: show open whenever artifactPath is set (EnvoyMesh libraryRead peer).
    final canOpen =
        (path != null && path.isNotEmpty) ||
        (format == 'link' && artUrl != null && artUrl.isNotEmpty);
    if (canOpen) {
      out.add(
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: TextButton.icon(
            onPressed: () {
              if (path != null && path.isNotEmpty) {
                unawaited(
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => ArtifactViewerScreen(
                        session: widget.session,
                        path: path,
                      ),
                    ),
                  ),
                );
                return;
              }
              // Fallback only when path is missing (legacy) and URL is reachable.
              if (artUrl != null && artUrl.isNotEmpty) {
                unawaited(launchUrl(Uri.parse(artUrl), mode: LaunchMode.externalApplication));
              }
            },
            icon: const Icon(Icons.article_outlined, size: 16),
            label: Text(l10n.chatOpenArtifact),
          ),
        ),
      );
    }
    // Sandbox paths mentioned in the reply (e.g. export_document uri) — open over home.*.
    final mentioned = extractSandboxFilePaths(b.text)
        .where((p) => p != path)
        .toList();
    if (mentioned.isNotEmpty) {
      out.add(
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Wrap(
            spacing: 4,
            runSpacing: 0,
            children: [
              for (final p in mentioned)
                TextButton.icon(
                  onPressed: () {
                    unawaited(
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => ArtifactViewerScreen(
                            session: widget.session,
                            path: p,
                          ),
                        ),
                      ),
                    );
                  },
                  icon: const Icon(Icons.insert_drive_file_outlined, size: 16),
                  label: Text(
                    l10n.chatOpenFile(p.split('/').last),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
          ),
        ),
      );
    }
    return out;
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

  Widget _choiceCard(Map<String, dynamic> row, AppLocalizations l10n, ThemeData theme) {
    final id = row['id']?.toString() ?? '';
    final selection = row['selection']?.toString() ?? 'one';
    final question = row['question']?.toString() ?? '';
    final expiry = _choiceExpiryLabel(row, l10n);
    final expired = expiry == l10n.choiceCardExpired;
    final optionsRaw = row['options'];
    final options = optionsRaw is List
        ? optionsRaw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
        : <Map<String, dynamic>>[];

    Widget cancelBtn = OutlinedButton(
      onPressed: expired ? null : () => unawaited(_answerChoice(row, cancel: true)),
      child: Text(l10n.choiceCardCancel),
    );

    Widget body;
    if (expired) {
      body = Text(
        l10n.choiceCardExpiredHint,
        style: theme.textTheme.bodySmall?.copyWith(
          color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
        ),
      );
    } else if (selection == 'text') {
      final ctrl = _choiceTextCtrls.putIfAbsent(id, TextEditingController.new);
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: ctrl,
            maxLines: row['multiline'] == true ? 4 : 2,
            decoration: InputDecoration(
              border: const OutlineInputBorder(),
              isDense: true,
              hintText: l10n.choiceCardTextPlaceholder,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton(
                onPressed: () {
                  final text = ctrl.text.trim();
                  if (text.isEmpty) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(l10n.choiceCardPickOne)),
                    );
                    return;
                  }
                  unawaited(_answerChoice(row, text: text));
                },
                child: Text(l10n.choiceCardConfirm),
              ),
              cancelBtn,
            ],
          ),
        ],
      );
    } else if (selection == 'many') {
      final selected = _choiceManySelected.putIfAbsent(id, () => <String>{});
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final o in options)
            CheckboxListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              value: selected.contains(o['id']?.toString()),
              title: Text(o['label']?.toString() ?? ''),
              onChanged: (v) {
                setState(() {
                  final oid = o['id']?.toString();
                  if (oid == null) return;
                  if (v == true) {
                    selected.add(oid);
                  } else {
                    selected.remove(oid);
                  }
                });
              },
            ),
          const SizedBox(height: 4),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton(
                onPressed: () {
                  if (selected.isEmpty) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(l10n.choiceCardPickOne)),
                    );
                    return;
                  }
                  unawaited(_answerChoice(row, optionIds: selected.toList()));
                },
                child: Text(l10n.choiceCardConfirm),
              ),
              cancelBtn,
            ],
          ),
        ],
      );
    } else {
      body = Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final o in options)
            o['destructive'] == true
                ? OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: theme.colorScheme.error,
                    ),
                    onPressed: () => unawaited(
                      _answerChoice(row, optionId: o['id']?.toString()),
                    ),
                    child: Text(o['label']?.toString() ?? ''),
                  )
                : FilledButton.tonal(
                    onPressed: () => unawaited(
                      _answerChoice(row, optionId: o['id']?.toString()),
                    ),
                    child: Text(o['label']?.toString() ?? ''),
                  ),
          cancelBtn,
        ],
      );
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: theme.colorScheme.secondaryContainer.withValues(alpha: expired ? 0.18 : 0.35),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    question,
                    style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                if (expiry != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Chip(
                      label: Text(expiry),
                      visualDensity: VisualDensity.compact,
                      labelStyle: theme.textTheme.labelSmall,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            body,
          ],
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

    if (!_singleThread && _showSessionList) {
      return Column(
        children: [
          _chatChrome(l10n, theme),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: SegmentedButton<bool>(
              segments: [
                ButtonSegment<bool>(
                  value: false,
                  label: Text(l10n.chatTabActive),
                  icon: const Icon(Icons.chat_bubble_outline, size: 16),
                ),
                ButtonSegment<bool>(
                  value: true,
                  label: Text(l10n.chatTabArchived),
                  icon: const Icon(Icons.archive_outlined, size: 16),
                ),
              ],
              selected: {_showArchived},
              onSelectionChanged: _sending
                  ? null
                  : (s) {
                      final archived = s.first;
                      if (archived) {
                        unawaited(_openArchivedList());
                      } else {
                        unawaited(_openSessionList());
                      }
                    },
            ),
          ),
          Expanded(child: _sessionList(l10n, theme)),
        ],
      );
    }

    final showSchedulesHistories = _isSchedules && _schedulesPane == 'histories';

    return Column(
      children: [
        _chatChrome(l10n, theme),
        if (_isSchedules) _schedulesPaneTabs(l10n, theme),
        if (showSchedulesHistories)
          Expanded(child: _schedulesHistoriesBody(l10n, theme))
        else ...[
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
        if (_pending.isNotEmpty ||
            _approvalsLoading ||
            _pendingChoices.isNotEmpty ||
            _choicesLoading)
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
                  if (_pendingChoices.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6, left: 4, top: 4),
                      child: Text(
                        l10n.chatPendingChoices(_pendingChoices.length),
                        style: theme.textTheme.labelLarge?.copyWith(
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                          letterSpacing: 0.4,
                        ),
                      ),
                    ),
                  if (_choicesLoading && _pendingChoices.isEmpty)
                    const LinearProgressIndicator(),
                  ..._pendingChoices.map((row) => _choiceCard(row, l10n, theme)),
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
                          _isHome
                              ? Icons.home_outlined
                              : _isSchedules
                                  ? Icons.event_outlined
                                  : Icons.chat_bubble_outline,
                          size: 40,
                          color: theme.colorScheme.primary.withValues(alpha: 0.45),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          _isHome
                              ? l10n.homeChatEmptyTitle
                              : _isSchedules
                                  ? l10n.schedulesChatEmptyTitle
                                  : l10n.chatEmptyTitle,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _isHome
                              ? l10n.homeChatEmptyHint
                              : _isSchedules
                                  ? l10n.schedulesChatEmptyHint
                                  : l10n.chatEmptyHint,
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: () async {
                    await _refreshApprovals();
                    await _refreshChoices();
                  },
                  child: ListView.builder(
                    controller: _scrollCtrl,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                    itemCount: _bubbles.length +
                        (draft != null && draft.isNotEmpty ? 1 : 0),
                    itemBuilder: (_, i) {
                      if (i < _bubbles.length) return _bubble(_bubbles[i]);
                      return _bubble(_ChatBubble(
                        role: 'assistant',
                        text: draft!,
                        format: _draftFormat ?? classifyChatFormat(draft),
                        artifactPath: _draftArtifactPath,
                        artifactUrl: _draftArtifactUrl,
                      ));
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
                    icon: const Icon(Icons.attach_file_outlined, size: 22),
                    visualDensity: VisualDensity.compact,
                  ),
                  IconButton(
                    tooltip: _listening ? l10n.chatVoiceStop : l10n.chatVoiceStart,
                    onPressed: _sending ? null : _toggleVoice,
                    icon: Icon(
                      _listening ? Icons.mic : Icons.mic_none_outlined,
                      size: 22,
                      color: _listening ? theme.colorScheme.error : null,
                    ),
                    visualDensity: VisualDensity.compact,
                  ),
                  Expanded(
                    child: TextField(
                      controller: _textCtrl,
                      minLines: 1,
                      maxLines: 5,
                      textInputAction: TextInputAction.send,
                      decoration: InputDecoration(
                        hintText: _isHome
                            ? l10n.homeChatHint
                            : _isSchedules
                                ? l10n.schedulesChatHint
                                : l10n.chatHint,
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
        ], // schedules chat pane (not histories)
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
