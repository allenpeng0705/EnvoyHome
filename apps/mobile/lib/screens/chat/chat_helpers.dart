/// Pure helpers shared by [ChatTab] UI (no State / BuildContext).
library;

import 'package:flutter/material.dart';

import '../../chat_think.dart';
import '../../l10n/app_localizations.dart';
import 'chat_models.dart';

IconData chatMediaIcon(String? kind) {
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

String chatCopyTextForBubble(ChatBubble b) {
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

String chatDismissedTitle(Map<String, dynamic> d, AppLocalizations l10n) {
  final name = d['name']?.toString().trim() ?? '';
  if (name.isNotEmpty) return name;
  final msg = d['message']?.toString().trim() ?? '';
  if (msg.isNotEmpty) return msg;
  final local = d['resolvedLocal']?.toString().trim() ?? '';
  if (local.isEmpty) return '—';
  if (local.toLowerCase().startsWith('cron ')) return l10n.schedTabRepeating;
  return local;
}

String? chatDismissedWhen(Map<String, dynamic> d) {
  final local = d['resolvedLocal']?.toString().trim() ?? '';
  if (local.isEmpty || local.toLowerCase().startsWith('cron ')) return null;
  return local;
}

String chatRelativeSessionTime(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final t = DateTime.tryParse(iso)?.toLocal();
  if (t == null) return '';
  final now = DateTime.now();
  final diff = now.difference(t);
  if (diff.inMinutes < 1) return 'now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m';
  if (diff.inHours < 24) return '${diff.inHours}h';
  if (diff.inDays < 7) return '${diff.inDays}d';
  final sameYear = t.year == now.year;
  final m = t.month.toString().padLeft(2, '0');
  final d = t.day.toString().padLeft(2, '0');
  return sameYear ? '$m/$d' : '${t.year}/$m/$d';
}

String chatFormatHistWhen(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final dt = DateTime.tryParse(iso);
  if (dt == null) return iso;
  return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')} '
      '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
}

String? chatMimeFromExt(String ext) {
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
