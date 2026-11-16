import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app.dart';
import 'services/push_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);
  // Push is optional. Never block first frame on FCM/APNs — a hang would leave
  // the native splash up; a failure only means no wake notifications.
  unawaited(
    PushService.instance.initialize().catchError((Object e, StackTrace st) {
      debugPrint('[push] initialize error (app continues): $e\n$st');
    }),
  );
  runApp(const EnvoyHomeApp());
}
