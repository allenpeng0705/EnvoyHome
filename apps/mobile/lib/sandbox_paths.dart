/// Sandbox-relative / workspace paths the thin client can open via
/// [home.getArtifactContent]. Prefer backtick-quoted paths (Unicode OK).
/// Matches Design §9.5d: output|documents|knowledge|uploads|workspace.
final _backtickPathRe = RegExp(
  r'`((?:output|documents|knowledge|uploads|workspace)/[^`\n]+)`',
);

final _barePathRe = RegExp(
  r'(?<![`\w])((?:output|documents|knowledge|uploads|workspace)/[A-Za-z0-9_./\-]+\.[A-Za-z0-9]+)(?![`\w])',
);

bool _isSafeArtifactPath(String p) {
  if (p.isEmpty || p.contains('..')) return false;
  if (p.contains('\u0000')) return false;
  return true;
}

/// Unique openable file paths mentioned in assistant / system text.
List<String> extractSandboxFilePaths(String text) {
  final seen = <String>{};
  final out = <String>[];
  void add(String raw) {
    final p = raw.replaceAll(r'\', '/').trim();
    if (!_isSafeArtifactPath(p)) return;
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
