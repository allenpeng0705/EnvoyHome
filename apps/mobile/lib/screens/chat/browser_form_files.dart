/// Browser form / chat attach file helpers (§9.5g.3 / P2-J).
library;

const kChatAttachMaxFiles = 8;
const kChatAttachMaxBytes = 8 * 1024 * 1024;
/// §9.5g.3 / P2-J — align daemon BROWSER_FORM_FILE_EXT_ALLOW.
const kBrowserFormFileExtAllow = <String>{
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.txt',
  '.csv',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
};

bool isAllowedBrowserFormFileName(String name) {
  final lower = name.toLowerCase();
  final dot = lower.lastIndexOf('.');
  if (dot < 0) return false;
  return kBrowserFormFileExtAllow.contains(lower.substring(dot));
}

const kBrowserFormFileExtMime = <String, String>{
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

String? mimeFromBrowserFormFileName(String name) {
  final lower = name.toLowerCase();
  final dot = lower.lastIndexOf('.');
  if (dot < 0) return null;
  return kBrowserFormFileExtMime[lower.substring(dot)];
}

bool isDataSpreadsheetName(String name) {
  final lower = name.toLowerCase();
  return lower.endsWith('.csv') || lower.endsWith('.xlsx');
}

/// Align daemon `matchesBrowserFormFileAccept`.
bool matchesBrowserFormFileAccept(
  String fileName, {
  String? accept,
  String? mimeHint,
}) {
  final raw = accept?.trim() ?? '';
  if (raw.isEmpty) return true;
  final lowerName = fileName.toLowerCase();
  final dot = lowerName.lastIndexOf('.');
  final ext = dot >= 0 ? lowerName.substring(dot) : '';
  final mime = (mimeHint ?? mimeFromBrowserFormFileName(fileName) ?? '')
      .toLowerCase()
      .split(';')
      .first
      .trim();
  final tokens = raw
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .where((t) => t.isNotEmpty)
      .toList();
  if (tokens.isEmpty) return true;
  for (final t in tokens) {
    if (t.startsWith('.')) {
      if (ext == t) return true;
      continue;
    }
    if (t.endsWith('/*')) {
      if (mime.startsWith(t.substring(0, t.length - 1))) return true;
      continue;
    }
    if (t.contains('/')) {
      if (mime == t) return true;
      continue;
    }
    if (ext == '.$t') return true;
  }
  return false;
}

