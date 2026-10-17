import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _storageKey = 'envoyhome.themeMode';

/// system | light | dark — same choices as desktop appearance menu.
class ThemeController extends ChangeNotifier {
  ThemeMode _mode = ThemeMode.system;
  bool _ready = false;

  bool get ready => _ready;
  ThemeMode get mode => _mode;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(_storageKey);
    _mode = _parse(stored) ?? ThemeMode.system;
    _ready = true;
    notifyListeners();
  }

  Future<void> setMode(ThemeMode mode) async {
    _mode = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_storageKey, _encode(mode));
    notifyListeners();
  }

  static String _encode(ThemeMode mode) {
    switch (mode) {
      case ThemeMode.light:
        return 'light';
      case ThemeMode.dark:
        return 'dark';
      case ThemeMode.system:
        return 'system';
    }
  }

  static ThemeMode? _parse(String? raw) {
    switch (raw) {
      case 'light':
        return ThemeMode.light;
      case 'dark':
        return ThemeMode.dark;
      case 'system':
        return ThemeMode.system;
      default:
        return null;
    }
  }
}
