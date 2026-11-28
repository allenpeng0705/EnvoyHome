import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';

/// Bottom composer row (attach / mic / text / send / stop).
class ChatComposerBar extends StatelessWidget {
  const ChatComposerBar({
    super.key,
    required this.textController,
    required this.focusNode,
    required this.sending,
    required this.listening,
    required this.turnActive,
    required this.isHome,
    required this.isSchedules,
    required this.onAttach,
    required this.onToggleVoice,
    required this.onSend,
    required this.onCancelTurn,
    required this.onFieldTap,
  });

  final TextEditingController textController;
  final FocusNode focusNode;
  final bool sending;
  final bool listening;
  final bool turnActive;
  final bool isHome;
  final bool isSchedules;
  final VoidCallback? onAttach;
  final VoidCallback? onToggleVoice;
  final VoidCallback? onSend;
  final VoidCallback? onCancelTurn;
  final VoidCallback? onFieldTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    return Material(
      color: theme.scaffoldBackgroundColor,
      child: SafeArea(
        top: false,
        bottom: MediaQuery.viewInsetsOf(context).bottom == 0,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (!isSchedules)
                IconButton(
                  tooltip: l10n.chatAttach,
                  onPressed: sending ? null : onAttach,
                  icon: const Icon(Icons.attach_file_outlined, size: 22),
                  visualDensity: VisualDensity.compact,
                ),
              IconButton(
                tooltip: listening ? l10n.chatVoiceStop : l10n.chatVoiceStart,
                onPressed: sending ? null : onToggleVoice,
                icon: Icon(
                  listening ? Icons.mic : Icons.mic_none_outlined,
                  size: 22,
                  color: listening ? theme.colorScheme.error : null,
                ),
                visualDensity: VisualDensity.compact,
              ),
              Expanded(
                child: TextField(
                  controller: textController,
                  focusNode: focusNode,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  style: theme.textTheme.bodyMedium,
                  decoration: InputDecoration(
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    hintText: isHome
                        ? l10n.homeChatHint
                        : isSchedules
                            ? l10n.schedulesChatHint
                            : l10n.chatHint,
                  ),
                  onSubmitted: (_) => onSend?.call(),
                  onTap: onFieldTap,
                ),
              ),
              const SizedBox(width: 4),
              if (turnActive && !sending)
                IconButton.filledTonal(
                  onPressed: onCancelTurn,
                  icon: const Icon(Icons.stop_rounded),
                ),
              IconButton.filled(
                onPressed: sending ? null : onSend,
                icon: sending
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
    );
  }
}
