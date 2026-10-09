import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Same language set as EnvoyMesh Social / EnvoyGo / desktop Settings.
const supportedLocaleIds = ['en', 'zh', 'ko', 'ja', 'fr', 'de', 'it'];

const localeLabels = <String, String>{
  'en': 'English',
  'zh': '中文',
  'ko': '한국어',
  'ja': '日本語',
  'fr': 'Français',
  'de': 'Deutsch',
  'it': 'Italiano',
};

const _storageKey = 'envoyhome.locale';

class LocaleController extends ChangeNotifier {
  LocaleController();

  Locale? _override;
  bool _ready = false;

  bool get ready => _ready;

  /// Null means follow the device locale (within [supportedLocaleIds]).
  Locale? get override => _override;

  Locale resolve(Locale? device) {
    if (_override != null) return _override!;
    final primary = device?.languageCode.toLowerCase() ?? 'en';
    if (supportedLocaleIds.contains(primary)) {
      return Locale(primary);
    }
    return const Locale('en');
  }

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(_storageKey);
    if (stored != null && supportedLocaleIds.contains(stored)) {
      _override = Locale(stored);
    }
    _ready = true;
    notifyListeners();
  }

  Future<void> setLocaleId(String? id) async {
    final prefs = await SharedPreferences.getInstance();
    if (id == null || id.isEmpty) {
      _override = null;
      await prefs.remove(_storageKey);
    } else if (supportedLocaleIds.contains(id)) {
      _override = Locale(id);
      await prefs.setString(_storageKey, id);
    }
    notifyListeners();
  }
}
