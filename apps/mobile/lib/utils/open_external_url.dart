/// Open an https URL in the system browser (best-effort).
library;

import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

/// §9.5i — parity with daemon `assertHandoffOpenUrl` / `isBlockedHostname`.
bool isSafeHandoffOpenUrl(String raw) {
  final uri = Uri.tryParse(raw.trim());
  if (uri == null || !uri.isScheme('https')) return false;
  if (uri.userInfo.isNotEmpty) return false;
  var h = uri.host.toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) {
    h = h.substring(1, h.length - 1);
  }
  if (h.isEmpty ||
      h == 'localhost' ||
      h.endsWith('.localhost') ||
      h == '0.0.0.0' ||
      h == '::1' ||
      h == 'metadata.google.internal') {
    return false;
  }
  if (h.contains(':')) {
    if (h == '::1' ||
        h.startsWith('fc') ||
        h.startsWith('fd') ||
        h.startsWith('fe80')) {
      return false;
    }
  }
  final dotted = h.split('.');
  if (dotted.length == 4 && dotted.every((p) => RegExp(r'^\d+$').hasMatch(p))) {
    final a = int.parse(dotted[0]);
    final b = int.parse(dotted[1]);
    if (a == 10 || a == 127 || a == 0) return false;
    if (a == 169 && b == 254) return false;
    if (a == 172 && b >= 16 && b <= 31) return false;
    if (a == 192 && b == 168) return false;
  }
  return true;
}

Future<bool> openExternalUrl(String url) async {
  final uri = Uri.tryParse(url.trim());
  if (uri == null || !(uri.isScheme('http') || uri.isScheme('https'))) {
    return false;
  }
  try {
    return await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (e) {
    debugPrint('openExternalUrl failed: $e');
    return false;
  }
}

/// Open only after handoff SSRF checks (https + blocked host refuse).
Future<bool> openHandoffUrl(String url) async {
  if (!isSafeHandoffOpenUrl(url)) return false;
  return openExternalUrl(url);
}
