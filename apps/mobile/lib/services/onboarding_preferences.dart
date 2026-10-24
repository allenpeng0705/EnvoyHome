/// First-launch welcome slides + setup-guide completion flags.
///
/// Peer: EnvoyDev `apps/mobile/lib/services/onboarding_preferences.dart`
/// (EnvoyGo adds a profile step for mesh persona — not applicable to Home).
library;

import 'package:shared_preferences/shared_preferences.dart';

class OnboardingPreferences {
  static const slidesKey = 'envoyhome.onboarding.slides_completed';
  static const guideKey = 'envoyhome.onboarding.guide_completed';

  /// Set once the first-run migration has decided whether to skip onboarding for
  /// an install that already had EnvoyHome state before this feature shipped.
  static const introducedKey = 'envoyhome.onboarding.introduced';

  /// Same keys as [SessionController] / [LocaleController] — upgrades that
  /// already paired or chose a language skip the new first-run flow.
  static const joinPersistKey = 'envoyhome.joinPersist';
  static const pairUriKey = 'envoyhome.pairUri';
  static const localeKey = 'envoyhome.locale';

  static Future<bool> hasCompletedSlides() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(slidesKey) ?? false;
  }

  static Future<void> setSlidesCompleted() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(slidesKey, true);
  }

  static Future<bool> hasCompletedGuide() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(guideKey) ?? false;
  }

  static Future<void> setGuideCompleted() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(guideKey, true);
  }

  /// One-shot: existing installs must not re-see first-run slides after an update.
  ///
  /// Fresh installs have empty prefs → onboarding runs. Upgrades that already
  /// hold a join credential or a language choice skip it. Explicit slide/
  /// guide flags always win once set.
  static Future<void> migrateExistingInstallIfNeeded() async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.containsKey(introducedKey)) return;
    if (prefs.containsKey(slidesKey) || prefs.containsKey(guideKey)) {
      await prefs.setBool(introducedKey, true);
      return;
    }

    final prior = prefs.containsKey(joinPersistKey) ||
        prefs.containsKey(pairUriKey) ||
        prefs.containsKey(localeKey);
    if (prior) {
      await prefs.setBool(slidesKey, true);
      await prefs.setBool(guideKey, true);
    }
    await prefs.setBool(introducedKey, true);
  }
}
