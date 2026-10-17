import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'l10n/app_localizations.dart';
import 'l10n/locale_controller.dart';
import 'l10n/theme_controller.dart';
import 'screens/home_shell.dart';
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
  final ThemeController themes = ThemeController();

  @override
  void initState() {
    super.initState();
    session.restore();
    locales.load();
    themes.load();
  }

  @override
  void dispose() {
    session.dispose();
    locales.dispose();
    themes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([session, locales, themes]),
      builder: (context, _) {
        return MaterialApp(
          onGenerateTitle: (context) => AppLocalizations.of(context).appName,
          debugShowCheckedModeBanner: false,
          theme: buildEnvoyHomeLightTheme(),
          darkTheme: buildEnvoyHomeDarkTheme(),
          themeMode: themes.mode,
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
          // Always the tab shell — guide to Connect when unpaired.
          home: HomeShell(
            session: session,
            locales: locales,
            themes: themes,
          ),
        );
      },
    );
  }
}
