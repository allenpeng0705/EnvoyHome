/// Design §9.5 output-tier helpers (peer: daemon `output-format.ts` / desktop `chat-markdown.js`).
library;

import 'dart:convert';

/// Design §7.4 — humanize schedule propose/confirm/list JSON (no raw dump).
String? formatScheduleToolJson(Object? raw) {
  if (raw is! Map) return null;
  final o = Map<String, dynamic>.from(raw);
  final resolved = o['resolvedLocal']?.toString().trim() ?? '';
  if (resolved.isNotEmpty) {
    final msg = o['message']?.toString().trim() ?? '';
    final suffix = msg.isEmpty
        ? ''
        : ' — ${msg.length > 80 ? '${msg.substring(0, 80)}' : msg}';
    return 'Proposed for $resolved$suffix — not armed yet. Confirm after you agree.';
  }
  if (o['armed'] == true) {
    final job = o['job'];
    final next = job is Map ? job['nextRunAt']?.toString() : null;
    final nextBit =
        next != null && next.isNotEmpty ? ' · next $next' : '';
    return 'Schedule armed$nextBit.';
  }
  final jobs = o['jobs'];
  if (jobs is List) {
    final n = jobs.length;
    return '$n schedule${n == 1 ? '' : 's'} listed.';
  }
  return null;
}

/// Replace bare or fenced schedule JSON with a plain line (Design 2026-10-19j).
String humanizeScheduleChatText(String text) {
  final trimmed = text.trim();
  if (trimmed.isEmpty) return text;
  try {
    final line = formatScheduleToolJson(jsonDecode(trimmed));
    if (line != null) return line;
  } catch (_) {}
  return text.replaceAllMapped(
    RegExp(r'```(?:json)?\s*([\s\S]*?)```', caseSensitive: false),
    (m) {
      try {
        final line = formatScheduleToolJson(jsonDecode(m.group(1)!.trim()));
        return line ?? m.group(0)!;
      } catch (_) {
        return m.group(0)!;
      }
    },
  );
}

/// `plain` | `markdown` | `link`
String classifyChatFormat(String text) {
  final s = text.trim();
  if (s.isEmpty) return 'plain';
  final mdCue = RegExp(
    r'```|^\s{0,3}#{1,6}\s|^\s*([-*+]|\d+\.)\s|\[[^\]]+\]\([^)]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`',
    multiLine: true,
  );
  if (mdCue.hasMatch(s)) return 'markdown';
  if (s.length <= 240 && !RegExp(r'\n\s*\n').hasMatch(s)) return 'plain';
  return 'markdown';
}

String? normalizeChatFormat(Object? raw) {
  final s = raw?.toString();
  if (s == 'plain' || s == 'markdown' || s == 'link') return s;
  return null;
}
