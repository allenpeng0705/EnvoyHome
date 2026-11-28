import 'package:envoyhome/l10n/app_localizations.dart';
import 'package:envoyhome/l10n/locale_controller.dart';
import 'package:envoyhome/l10n/theme_controller.dart';
import 'package:envoyhome/screens/more_hub.dart';
import 'package:envoyhome/state/session_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('offline unpaired shows Connect CTA', (tester) async {
    final session = SessionController();
    var pair = 0;
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: MoreHub(
            session: session,
            locales: LocaleController(),
            themes: ThemeController(),
            onRequestPairAgain: () => pair++,
          ),
        ),
      ),
    );
    await tester.pump();
    expect(find.text('Connect'), findsOneWidget);
    expect(find.text('Reconnect'), findsNothing);
    expect(find.text('LLM'), findsNothing);
    await tester.tap(find.text('Connect'));
    expect(pair, 1);
    session.dispose();
  });

  testWidgets('deferOfflineActions keeps copy without CTAs', (tester) async {
    final session = SessionController();
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: MoreHub(
            session: session,
            locales: LocaleController(),
            themes: ThemeController(),
            onRequestConnect: () {},
            onRequestPairAgain: () {},
            deferOfflineActions: true,
          ),
        ),
      ),
    );
    await tester.pump();
    expect(find.text('Connect'), findsNothing);
    expect(find.text('Reconnect'), findsNothing);
    expect(
      find.textContaining('Settings → Pair devices'),
      findsOneWidget,
    );
    session.dispose();
  });

  testWidgets('appearance section is always available offline', (tester) async {
    final session = SessionController();
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: MoreHub(
            session: session,
            locales: LocaleController(),
            themes: ThemeController(),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(find.text('Appearance'), findsOneWidget);
    expect(find.text('Language'), findsOneWidget);
    session.dispose();
  });
}
