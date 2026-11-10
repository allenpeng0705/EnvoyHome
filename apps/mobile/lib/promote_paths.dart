/// Align with packages/daemon/src/promote-paths.ts (Design §9.5j).
bool canPromoteKnowledgePath(String path) {
  var p = path.replaceAll(r'\', '/').replaceFirst(RegExp(r'^\./+'), '').trim();
  if (p.isEmpty || p.contains('..') || p.startsWith('/')) return false;
  final lower = p.toLowerCase();
  if (!lower.endsWith('.md') && !lower.endsWith('.markdown')) return false;
  return p.startsWith('output/extracts/') ||
      p.startsWith('uploads/') ||
      p.startsWith('documents/') ||
      p.startsWith('output/exports/') ||
      lower.endsWith('.extract.md');
}
