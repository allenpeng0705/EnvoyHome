import 'package:envoyhome/l10n/app_localizations.dart';
import 'package:envoyhome/screens/chat_tab.dart';
import 'package:envoyhome/screens/schedules_hub_screen.dart';
import 'package:envoyhome/state/session_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

Widget _app(Widget home) {
  return MaterialApp(
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    supportedLocales: AppLocalizations.supportedLocales,
    home: Scaffold(body: home),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('hub shows Jobs · Scenes · Histories + Ask CTA', (tester) async {
    final session = SessionController();
    await tester.pumpWidget(
      _app(
        SchedulesHubScreen(
          session: session,
          onRequestConnect: () {},
        ),
      ),
    );
    await tester.pump();
    expect(find.text('Jobs'), findsOneWidget);
    expect(find.text('Scenes'), findsOneWidget);
    expect(find.text('Histories'), findsOneWidget);
    expect(find.text('Ask to schedule'), findsOneWidget);
    // Offline: Ask is disabled (not a Connect shortcut).
    final ask = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Ask to schedule'),
    );
    expect(ask.onPressed, isNull);
    session.dispose();
  });

  testWidgets('Ask-style ChatTab hides nested Chat|Histories chrome',
      (tester) async {
    final session = SessionController();
    // Mirrors SchedulesHubScreen._openAskSchedule flags (no live daemon).
    await tester.pumpWidget(
      _app(
        ChatTab(
          session: session,
          purpose: 'schedules',
          embedInSchedulesHub: true,
          schedulesPaneOverride: 'chat',
          onRequestConnect: () {},
        ),
      ),
    );
    await tester.pump();
    expect(find.text('Histories'), findsNothing);
    // Offline guide title, not schedules "Chat" pane tab.
    expect(find.text('Chat'), findsNothing);
    expect(find.text('Connect to your home'), findsOneWidget);
    session.dispose();
  });

  testWidgets('deferOfflineActions hides panel Connect on Jobs', (tester) async {
    final session = SessionController();
    await tester.pumpWidget(
      _app(
        SchedulesHubScreen(
          session: session,
          onRequestConnect: () {},
          deferOfflineActions: true,
        ),
      ),
    );
    await tester.pump();
    // Jobs panel need-connect copy without a Connect/Reconnect button when deferred.
    expect(
      find.textContaining('manage jobs, scenes'),
      findsOneWidget,
    );
    expect(find.widgetWithText(FilledButton, 'Connect'), findsNothing);
    expect(find.widgetWithText(FilledButton, 'Reconnect'), findsNothing);
    session.dispose();
  });
}
