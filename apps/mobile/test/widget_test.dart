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
    expect(find.text('Connect'), findsWidgets);
    // Slim shell chrome: overflow menu instead of status Chip / Create card.
    expect(find.byIcon(Icons.more_vert), findsOneWidget);
    expect(find.text('online'), findsNothing);
    expect(find.text('offline'), findsNothing);
    // Bottom nav labels (NavigationDestination) — Chats + Settings when unpaired.
    expect(find.text('Chats'), findsOneWidget);
    expect(find.text('Settings'), findsOneWidget);
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
