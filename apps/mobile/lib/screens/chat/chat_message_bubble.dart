import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import 'chat_helpers.dart';
import 'chat_models.dart';

/// Transcript bubble chrome (body widgets supplied by parent for assistant).
class ChatMessageBubble extends StatelessWidget {
  const ChatMessageBubble({
    super.key,
    required this.bubble,
    required this.bodyChildren,
    required this.busy,
    this.onCopy,
    this.onDelete,
  });

  final ChatBubble bubble;
  final List<Widget> bodyChildren;
  final bool busy;
  final VoidCallback? onCopy;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    final isUser = bubble.role == 'user';
    final isSystem = bubble.role == 'system';
    if (isSystem) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Center(
          child: Text(
            bubble.text,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
            ),
          ),
        ),
      );
    }

    final children = <Widget>[...bodyChildren];
    if (bubble.media.isNotEmpty) {
      if (children.isNotEmpty) children.add(const SizedBox(height: 6));
      children.add(
        Wrap(
          spacing: 6,
          runSpacing: 4,
          children: [
            for (final m in bubble.media)
              Chip(
                avatar: Icon(
                  chatMediaIcon(m['kind']?.toString()),
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
    if (children.isEmpty) return const SizedBox.shrink();

    final canDelete =
        bubble.messageId != null && bubble.messageId!.isNotEmpty && !busy;
    final canCopy = chatCopyTextForBubble(bubble).isNotEmpty && !busy && onCopy != null;

    final bubbleBox = Container(
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
        children: children,
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
              bubbleBox,
              if ((canCopy && onCopy != null) || (canDelete && onDelete != null))
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (canCopy && onCopy != null)
                        ChatBubbleIconButton(
                          icon: Icons.content_copy,
                          tooltip: l10n.chatCopyMessage,
                          onPressed: onCopy!,
                        ),
                      if (canDelete && onDelete != null)
                        ChatBubbleIconButton(
                          icon: Icons.delete_outline,
                          tooltip: l10n.chatDeleteMessage,
                          onPressed: onDelete!,
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
}
