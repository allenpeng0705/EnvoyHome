import 'package:flutter/foundation.dart';

/// Shell-global Needs-you signal (Design `2026-11-28` sticky strip).
///
/// [ChatTab] owns the actionable cards (approvals / choices / schedule / plan)
/// and reports a count here. [HomeShell] shows a badge + jump strip on other
/// tabs so pending work is never trapped inside Chat.
class NeedsYouController extends ChangeNotifier {
  int _count = 0;
  int _openGeneration = 0;

  int get count => _count;
  bool get hasItems => _count > 0;

  /// Bumped when the shell asks Chat to open/expand the Needs-you strip.
  int get openGeneration => _openGeneration;

  void reportCount(int count) {
    final next = count < 0 ? 0 : count;
    if (next == _count) return;
    _count = next;
    notifyListeners();
  }

  void clear() => reportCount(0);

  /// Jump UX: shell tapped the sticky strip — Chat should expand Needs-you.
  void requestOpen() {
    _openGeneration++;
    notifyListeners();
  }
}
