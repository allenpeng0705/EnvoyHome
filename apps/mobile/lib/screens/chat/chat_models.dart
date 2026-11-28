/// Chat transcript models + compact bubble action button.
library;

import 'dart:typed_data';

import 'package:flutter/material.dart';

class PendingAttach {
  PendingAttach({
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

class ChatBubble {
  ChatBubble({
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
  /// Relative path under `accounts/<id>/files/` — preferred open (mesh/paired).
  final String? artifactPath;
  /// Optional signed HTTP URL when publicBaseUrl is reachable.
  final String? artifactUrl;
}

/// Compact icon-only action — peer EnvoyGo `_EhBubbleIconButton` / EnvoyMesh Social.
class ChatBubbleIconButton extends StatelessWidget {
  const ChatBubbleIconButton({
    super.key,
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
