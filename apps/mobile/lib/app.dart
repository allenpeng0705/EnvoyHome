import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'l10n/app_localizations.dart';
import 'l10n/locale_controller.dart';
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
  final LocaleController locales = LocaleController();

  @override
  void initState() {
    super.initState();
    session.restore();
    locales.load();
  }

  @override
  void dispose() {
    session.dispose();
    locales.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([session, locales]),
      builder: (context, _) {
        return MaterialApp(
          onGenerateTitle: (context) => AppLocalizations.of(context).appName,
          debugShowCheckedModeBanner: false,
          theme: buildEnvoyHomeTheme(),
          locale: locales.override,
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          localeResolutionCallback: (device, supported) {
            return locales.resolve(device);
          },
          home: session.isConnected
              ? HomeShell(session: session, locales: locales)
              : PairScreen(session: session, locales: locales),
        );
      },
    );
  }
}
