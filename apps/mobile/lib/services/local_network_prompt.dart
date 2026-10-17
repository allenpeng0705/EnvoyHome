import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

/// iOS shows the Local Network permission sheet only after the first real
/// LAN access. Fire a tiny mDNS-style probe when the pair screen opens so
/// the user can Allow before scanning / pasting a code.
Future<void> promptLocalNetworkAccessEarly() async {
  if (kIsWeb) return;
  try {
    if (!Platform.isIOS && !Platform.isAndroid) return;
  } catch (_) {
    return;
  }
  try {
    final socket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
    socket.broadcastEnabled = true;
    // 224.0.0.251:5353 — mDNS multicast; enough to surface the iOS dialog.
    socket.send(const [0], InternetAddress('224.0.0.251'), 5353);
    socket.close();
  } catch (e) {
    debugPrint('[local-network] early probe skipped: $e');
  }
}
