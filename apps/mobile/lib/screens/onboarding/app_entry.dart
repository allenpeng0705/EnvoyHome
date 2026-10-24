/// First-launch gate: welcome slides → setup guide → [HomeShell].
///
/// Peer: EnvoyDev `AppEntry` in `apps/mobile/lib/main.dart` and EnvoyGo
/// `screens/onboarding/app_entry.dart` (without the mesh profile step).
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../../l10n/locale_controller.dart';
import '../../l10n/theme_controller.dart';
import '../../services/onboarding_preferences.dart';
import '../../state/session_controller.dart';
import '../home_shell.dart';
import '../pair_screen.dart';
import 'setup_guide_screen.dart';
import 'welcome_slides_screen.dart';

class AppEntry extends StatefulWidget {
  const AppEntry({
    super.key,
    required this.session,
    required this.locales,
    required this.themes,
  });

  final SessionController session;
  final LocaleController locales;
  final ThemeController themes;

  @override
  State<AppEntry> createState() => _AppEntryState();
}

class _AppEntryState extends State<AppEntry> {
  bool _loading = true;
  bool _showSlides = false;
  bool _showGuide = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    await OnboardingPreferences.migrateExistingInstallIfNeeded();
    final slidesDone = await OnboardingPreferences.hasCompletedSlides();
    final guideDone = await OnboardingPreferences.hasCompletedGuide();
    if (!mounted) return;
    setState(() {
      _loading = false;
      _showSlides = !slidesDone;
      _showGuide = slidesDone && !guideDone;
    });
  }

  void _onSlidesFinished() {
    if (!mounted) return;
    setState(() {
      _showSlides = false;
      _showGuide = true;
    });
  }

  Future<bool> _pairNow() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => PairScreen(session: widget.session),
      ),
    );
    if (!mounted) return false;
    if (!widget.session.isConnected) return false;
    setState(() => _showGuide = false);
    return true;
  }

  void _enterShell() {
    if (!mounted) return;
    setState(() => _showGuide = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_showSlides) {
      return WelcomeSlidesScreen(onFinished: _onSlidesFinished);
    }
    if (_showGuide) {
      return SetupGuideScreen(
        isFirstLaunch: true,
        requirePairing: true,
        onPairLater: _enterShell,
        onPairNow: _pairNow,
      );
    }
    return HomeShell(
      session: widget.session,
      locales: widget.locales,
      themes: widget.themes,
    );
  }
}
