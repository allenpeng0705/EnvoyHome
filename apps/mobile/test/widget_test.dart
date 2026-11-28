import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:envoyhome/app.dart';
import 'package:envoyhome/services/onboarding_preferences.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Unpaired shell shows connect guide', (tester) async {
    // Skip first-launch slides + setup guide (EnvoyDev peer pattern).
    SharedPreferences.setMockInitialValues({
      OnboardingPreferences.slidesKey: true,
      OnboardingPreferences.guideKey: true,
      OnboardingPreferences.introducedKey: true,
    });

    await tester.pumpWidget(const EnvoyHomeApp());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('EnvoyHome'), findsWidgets);
    expect(find.text('Connect to your home'), findsOneWidget);
    // Unpaired offline: banner owns Connect — no empty overflow menu.
    expect(find.byIcon(Icons.more_vert), findsNothing);
    expect(find.text('online'), findsNothing);
    expect(find.text('offline'), findsNothing);
    // Bottom nav — Chat · Reminders · More (Design 2026-11-28).
    expect(find.text('Chats'), findsOneWidget);
    expect(find.text('Reminders'), findsOneWidget);
    expect(find.text('More'), findsOneWidget);
    // Persistent offline banner owns the CTA (chat empty state is text-only).
    expect(find.text('Pair this phone with your home desktop'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Connect'), findsOneWidget);
  });

  testWidgets('Unpaired shell navigates Reminders and More', (tester) async {
    SharedPreferences.setMockInitialValues({
      OnboardingPreferences.slidesKey: true,
      OnboardingPreferences.guideKey: true,
      OnboardingPreferences.introducedKey: true,
    });

    await tester.pumpWidget(const EnvoyHomeApp());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    await tester.tap(find.text('Reminders'));
    await tester.pumpAndSettle();
    expect(find.text('Jobs'), findsOneWidget);
    expect(find.text('Ask to schedule'), findsOneWidget);

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    // Banner owns Connect; More is copy-only offline (no Owner Advanced flash).
    expect(find.widgetWithText(FilledButton, 'Connect'), findsOneWidget);
    expect(find.text('LLM'), findsNothing);
    expect(find.text('Connections'), findsNothing);
  });

  testWidgets('Fresh install shows welcome slides', (tester) async {
    SharedPreferences.setMockInitialValues({});

    await tester.pumpWidget(const EnvoyHomeApp());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Welcome to EnvoyHome'), findsOneWidget);
    expect(find.text('Next'), findsOneWidget);
    expect(find.text('Skip'), findsOneWidget);
  });
}
