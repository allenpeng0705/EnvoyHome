import 'dart:async';

import 'package:envoyhome/l10n/app_localizations.dart';
import 'package:envoyhome/l10n/locale_controller.dart';
import 'package:envoyhome/l10n/theme_controller.dart';
import 'package:envoyhome/screens/chat/chat_connect_guide.dart';
import 'package:envoyhome/screens/more_hub.dart';
import 'package:envoyhome/screens/pairing/pairing_progress_screen.dart';
import 'package:envoyhome/state/session_controller.dart';
import 'package:envoyhome/widgets/connection_banner.dart';
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
    home: home,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('ConnectionBanner', () {
    testWidgets('unpaired shows Connect only', (tester) async {
      final session = SessionController();
      var pair = 0;
      await tester.pumpWidget(
        _app(
          Scaffold(
            body: ConnectionBanner(
              session: session,
              onReconnect: () {},
              onPairNew: () => pair++,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Connect'), findsOneWidget);
      expect(find.text('Reconnect'), findsNothing);
      await tester.tap(find.text('Connect'));
      expect(pair, 1);
      session.dispose();
    });

    testWidgets('saved pairing shows Reconnect + Pair new device', (tester) async {
      final session = SessionController();
      session.debugPrimeSavedPairing(
        'envoy://pair?wsUrl=ws%3A%2F%2F127.0.0.1%3A4780%2Fws'
        '&token=tok&ownerPublicKey=pk&ownerId=oid',
      );
      var reconnect = 0;
      var pair = 0;
      await tester.pumpWidget(
        _app(
          Scaffold(
            body: ConnectionBanner(
              session: session,
              onReconnect: () => reconnect++,
              onPairNew: () => pair++,
              error: 'dial timed out',
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Reconnect'), findsOneWidget);
      expect(find.text('Pair new device'), findsOneWidget);
      expect(find.text('dial timed out'), findsOneWidget);
      await tester.tap(find.text('Reconnect'));
      await tester.tap(find.text('Pair new device'));
      expect(reconnect, 1);
      expect(pair, 1);
      session.dispose();
    });
  });

  group('ChatConnectGuide', () {
    testWidgets('fresh install CTA is Connect', (tester) async {
      var connect = 0;
      await tester.pumpWidget(
        _app(
          ChatConnectGuide(
            onConnect: () => connect++,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Connect to your home'), findsOneWidget);
      expect(find.text('Connect'), findsOneWidget);
      expect(find.text('Pair new device'), findsNothing);
      await tester.tap(find.text('Connect'));
      expect(connect, 1);
    });

    testWidgets('defer actions keeps copy without CTAs', (tester) async {
      await tester.pumpWidget(
        _app(
          const ChatConnectGuide(
            showActions: false,
            onConnect: null,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Connect to your home'), findsOneWidget);
      expect(find.text('Connect'), findsNothing);
      expect(find.text('Reconnect'), findsNothing);
    });

    testWidgets('saved pairing offers Reconnect + Pair new', (tester) async {
      var reconnect = 0;
      var pair = 0;
      await tester.pumpWidget(
        _app(
          ChatConnectGuide(
            hasSavedPairing: true,
            onConnect: () => reconnect++,
            onPairAgain: () => pair++,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Reconnect'), findsOneWidget);
      expect(find.text('Pair new device'), findsOneWidget);
      await tester.tap(find.text('Reconnect'));
      await tester.tap(find.text('Pair new device'));
      expect(reconnect, 1);
      expect(pair, 1);
    });
  });

  group('PairingProgressScreen', () {
    testWidgets('pops success when connect completes', (tester) async {
      PairingProgressResult? result;
      await tester.pumpWidget(
        _app(
          Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () async {
                    result = await Navigator.of(context).push<PairingProgressResult>(
                      MaterialPageRoute(
                        builder: (_) => PairingProgressScreen(
                          connect: () async {},
                        ),
                      ),
                    );
                  },
                  child: const Text('go'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('go'));
      await tester.pump(); // post-frame start
      await tester.pump(); // connect completes + pop
      expect(result, isA<PairingProgressResult>());
      expect(result!.cancelled, isFalse);
      expect(result!.error, isNull);
    });

    testWidgets('pops friendly error on failure', (tester) async {
      PairingProgressResult? result;
      await tester.pumpWidget(
        _app(
          Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () async {
                    result = await Navigator.of(context).push<PairingProgressResult>(
                      MaterialPageRoute(
                        builder: (_) => PairingProgressScreen(
                          connect: () async {
                            throw StateError('connection refused');
                          },
                        ),
                      ),
                    );
                  },
                  child: const Text('go'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('go'));
      await tester.pump();
      await tester.pump();
      expect(result, isNotNull);
      expect(result!.error, isNotNull);
      expect(result!.error!.toLowerCase(), contains('reach'));
    });

    testWidgets('cancel confirm pops cancelled once', (tester) async {
      PairingProgressResult? result;
      var cancelCalls = 0;
      final hang = Completer<void>();
      await tester.pumpWidget(
        _app(
          Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () async {
                    result = await Navigator.of(context).push<PairingProgressResult>(
                      MaterialPageRoute(
                        builder: (_) => PairingProgressScreen(
                          connect: () => hang.future,
                          onCancelRequested: () async {
                            cancelCalls++;
                          },
                        ),
                      ),
                    );
                  },
                  child: const Text('go'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('go'));
      await tester.pump(); // route + post-frame start
      await tester.pump(const Duration(seconds: 1)); // ticker tick (avoid pumpAndSettle — spinner)
      expect(find.text('Cancel'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pump();
      expect(find.text('Cancel connecting?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Cancel'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(result, isNotNull);
      expect(result!.cancelled, isTrue);
      expect(cancelCalls, 1);
    });
  });

  group('MoreHub offline', () {
    testWidgets('shows reconnect path when pairing saved', (tester) async {
      final session = SessionController();
      session.debugPrimeSavedPairing(
        'envoy://pair?wsUrl=ws%3A%2F%2F127.0.0.1%3A4780%2Fws'
        '&token=tok&ownerPublicKey=pk&ownerId=oid',
      );
      var reconnect = 0;
      await tester.pumpWidget(
        _app(
          Scaffold(
            body: MoreHub(
              session: session,
              locales: LocaleController(),
              themes: ThemeController(),
              onRequestConnect: () => reconnect++,
              onRequestPairAgain: () {},
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('More'), findsWidgets);
      expect(find.text('Reconnect'), findsOneWidget);
      await tester.tap(find.text('Reconnect'));
      expect(reconnect, 1);
      // Owner Advanced must not flash while offline.
      expect(find.text('LLM'), findsNothing);
      expect(find.text('Connections'), findsNothing);
      session.dispose();
    });
  });
}
