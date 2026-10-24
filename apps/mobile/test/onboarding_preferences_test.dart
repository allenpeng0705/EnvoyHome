/// First-launch onboarding prefs: upgrade migration must not re-show slides.
library;

import 'package:envoyhome/services/onboarding_preferences.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('fresh install still shows onboarding after migration', () async {
    SharedPreferences.setMockInitialValues({});
    await OnboardingPreferences.migrateExistingInstallIfNeeded();
    expect(await OnboardingPreferences.hasCompletedSlides(), isFalse);
    expect(await OnboardingPreferences.hasCompletedGuide(), isFalse);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool(OnboardingPreferences.introducedKey), isTrue);
  });

  test('upgrade with prior join skips onboarding', () async {
    SharedPreferences.setMockInitialValues({
      OnboardingPreferences.joinPersistKey: 'envoy://pair?token=x',
    });
    await OnboardingPreferences.migrateExistingInstallIfNeeded();
    expect(await OnboardingPreferences.hasCompletedSlides(), isTrue);
    expect(await OnboardingPreferences.hasCompletedGuide(), isTrue);
  });

  test('upgrade with language preference skips onboarding', () async {
    SharedPreferences.setMockInitialValues({
      OnboardingPreferences.localeKey: 'zh',
    });
    await OnboardingPreferences.migrateExistingInstallIfNeeded();
    expect(await OnboardingPreferences.hasCompletedSlides(), isTrue);
    expect(await OnboardingPreferences.hasCompletedGuide(), isTrue);
  });

  test('migration is one-shot and does not flip completed flags later', () async {
    SharedPreferences.setMockInitialValues({});
    await OnboardingPreferences.migrateExistingInstallIfNeeded();
    expect(await OnboardingPreferences.hasCompletedSlides(), isFalse);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      OnboardingPreferences.joinPersistKey,
      'envoy://pair?token=x',
    );
    await OnboardingPreferences.migrateExistingInstallIfNeeded();
    expect(await OnboardingPreferences.hasCompletedSlides(), isFalse);
  });
}
