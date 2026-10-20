/// Split assistant text into visible reply vs model `<think>` reasoning.
///
/// Unclosed think (streaming) is treated as a think segment through end-of-string.
/// Peer: desktop `splitAssistantSegments` / EnvoyCoder thought tile (collapsed by default).
library;

class ChatSegment {
  const ChatSegment({required this.kind, required this.text});

  /// `text` = visible reply; `think` = model reasoning.
  final String kind;
  final String text;

  bool get isThink => kind == 'think';
}

final _thinkBlock = RegExp(
  r'<think\b[^>]*>([\s\S]*?)(?:</think>|$)',
  caseSensitive: false,
);
final _bareThinkTag = RegExp(r'</?think\b[^>]*>', caseSensitive: false);

List<ChatSegment> splitAssistantSegments(String raw) {
  if (raw.isEmpty) return const [];
  final parts = <ChatSegment>[];
  var last = 0;
  for (final m in _thinkBlock.allMatches(raw)) {
    if (m.start > last) {
      final chunk = raw.substring(last, m.start).replaceAll(_bareThinkTag, '');
      if (chunk.isNotEmpty) {
        parts.add(ChatSegment(kind: 'text', text: chunk));
      }
    }
    parts.add(ChatSegment(kind: 'think', text: m.group(1) ?? ''));
    last = m.end;
  }
  if (last < raw.length) {
    final chunk = raw.substring(last).replaceAll(_bareThinkTag, '');
    if (chunk.isNotEmpty) {
      parts.add(ChatSegment(kind: 'text', text: chunk));
    }
  }
  if (parts.isEmpty && raw.trim().isNotEmpty) {
    parts.add(ChatSegment(kind: 'text', text: raw));
  }
  return parts;
}
