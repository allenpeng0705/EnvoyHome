import 'package:envoyhome/l10n/app_localizations.dart';
import 'package:envoyhome/state/needs_you_controller.dart';
import 'package:envoyhome/widgets/needs_you_jump_strip.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('NeedsYouController reports and opens', () {
    final c = NeedsYouController();
    var ticks = 0;
    c.addListener(() => ticks++);

    expect(c.hasItems, isFalse);
    c.reportCount(2);
    expect(c.count, 2);
    expect(c.hasItems, isTrue);
    expect(ticks, 1);

    c.reportCount(2);
    expect(ticks, 1); // no-op

    c.reportCount(-3);
    expect(c.count, 0);
    expect(ticks, 2);

    c.reportCount(5);
    final gen = c.openGeneration;
    c.requestOpen();
    expect(c.openGeneration, gen + 1);
    expect(ticks, 4);

    c.clear();
    expect(c.count, 0);
    c.dispose();
  });

  testWidgets('NeedsYouJumpStrip hidden when count is 0', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: NeedsYouJumpStrip(count: 0, onOpen: () {}),
        ),
      ),
    );
    expect(find.byType(InkWell), findsNothing);
  });

  testWidgets('NeedsYouJumpStrip opens on tap', (tester) async {
    var opened = 0;
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: NeedsYouJumpStrip(
            count: 3,
            onOpen: () => opened++,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Needs you'), findsOneWidget);
    expect(find.text('Review'), findsOneWidget);
    await tester.tap(find.text('Review'));
    expect(opened, 1);
  });
}
