/// Sandbox-relative / workspace paths the thin client can open via
/// [home.getArtifactContent]. Prefer backtick-quoted paths (Unicode OK).
/// Matches Design §9.5d: output|documents|knowledge|uploads|workspace.
final _backtickPathRe = RegExp(
  r'`((?:\./)*(?:output|documents|knowledge|uploads|workspace)/[^`\n]+)`',
);

final _barePathRe = RegExp(
  r'(?<![`\w])((?:\./)*(?:output|documents|knowledge|uploads|workspace)/[A-Za-z0-9_./\-]+\.[A-Za-z0-9]+)(?![`\w])',
);

final _sandboxPrefixRe = RegExp(
  r'^(?:output|documents|knowledge|uploads|workspace)/',
);

bool _isSafeArtifactPath(String p) {
  if (p.isEmpty || p.contains('..')) return false;
  if (p.contains('\u0000')) return false;
  return true;
}

String _normalizeArtifactPath(String raw) {
  var p = raw.replaceAll(r'\', '/').trim();
  while (p.startsWith('./')) {
    p = p.substring(2);
  }
  while (p.startsWith('/')) {
    p = p.substring(1);
  }
  p = p.replaceAll(RegExp(r'/{2,}'), '/');
  return p;
}

/// Unique openable file paths mentioned in assistant / system text.
List<String> extractSandboxFilePaths(String text) {
  final seen = <String>{};
  final out = <String>[];
  void add(String raw) {
    final p = _normalizeArtifactPath(raw);
    if (!_isSafeArtifactPath(p)) return;
    if (!_sandboxPrefixRe.hasMatch(p)) return;
    if (seen.add(p)) out.add(p);
  }

  for (final m in _backtickPathRe.allMatches(text)) {
    add(m.group(1) ?? '');
  }
  for (final m in _barePathRe.allMatches(text)) {
    add(m.group(1) ?? '');
  }
  return out;
}

/// Parse a markdown / chip href into a jail path for [home.getArtifactContent].
/// Accepts sandbox-relative paths (optionally percent-encoded). Rejects http(s)
/// and traversal — those stay external or closed.
String? parseSandboxArtifactHref(String? href) {
  if (href == null) return null;
  var raw = href.trim();
  if (raw.isEmpty) return null;
  final lower = raw.toLowerCase();
  if (lower.startsWith('http://') ||
      lower.startsWith('https://') ||
      lower.startsWith('mailto:') ||
      lower.startsWith('tel:')) {
    return null;
  }
  // Optional thin-client schemes (not Normative; tolerate if a client minted them).
  const schemes = ['envoyhome://artifact/', 'artifact://'];
  for (final s in schemes) {
    if (lower.startsWith(s)) {
      raw = raw.substring(s.length);
      break;
    }
  }
  try {
    raw = Uri.decodeFull(raw);
  } catch (_) {
    /* keep raw */
  }
  final p = _normalizeArtifactPath(raw);
  if (!_isSafeArtifactPath(p)) return null;
  if (!_sandboxPrefixRe.hasMatch(p)) return null;
  return p;
}
