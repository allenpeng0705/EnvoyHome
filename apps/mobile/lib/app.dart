import 'package:flutter/material.dart';

import 'screens/home_shell.dart';
import 'screens/pair_screen.dart';
import 'state/session_controller.dart';
import 'theme.dart';

class EnvoyHomeApp extends StatefulWidget {
  const EnvoyHomeApp({super.key});

  @override
  State<EnvoyHomeApp> createState() => _EnvoyHomeAppState();
}

class _EnvoyHomeAppState extends State<EnvoyHomeApp> {
  final SessionController session = SessionController();

  @override
  void initState() {
    super.initState();
    session.restore();
  }

  @override
  void dispose() {
    session.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: session,
      builder: (context, _) {
        return MaterialApp(
          title: 'EnvoyHome',
          debugShowCheckedModeBanner: false,
          theme: buildEnvoyHomeTheme(),
          home: session.isConnected
              ? HomeShell(session: session)
              : PairScreen(session: session),
        );
      },
    );
  }
}
