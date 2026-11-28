import '../../l10n/app_localizations.dart';

/// Map dial/handshake failures to short, actionable copy.
String pairingFriendlyError(Object e, AppLocalizations l10n) {
  final raw = e
      .toString()
      .replaceFirst('Bad state: ', '')
      .replaceFirst('Exception: ', '')
      .replaceFirst('StateError: ', '');
  final lower = raw.toLowerCase();
  if (lower.contains('app mismatch') || lower.contains('wrong app')) {
    return l10n.pairErrorWrongApp;
  }
  if (lower.contains('timeout') || lower.contains('timed out')) {
    return l10n.pairErrorTimeout;
  }
  if (lower.contains('unreachable') ||
      lower.contains('connection refused') ||
      lower.contains('failed host lookup') ||
      lower.contains('network is unreachable')) {
    return l10n.pairErrorUnreachable;
  }
  if (lower.contains('expired') || lower.contains('invalid')) {
    return l10n.pairErrorExpired;
  }
  if (raw.trim().isEmpty) return l10n.pairErrorGeneric;
  return raw;
}
