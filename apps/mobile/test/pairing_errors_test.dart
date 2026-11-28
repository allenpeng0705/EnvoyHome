import 'package:envoyhome/l10n/app_localizations.dart';
import 'package:envoyhome/screens/pairing/pairing_errors.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('pairingFriendlyError maps common failures', (tester) async {
    late AppLocalizations l10n;
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: Builder(
          builder: (context) {
            l10n = AppLocalizations.of(context);
            return const SizedBox.shrink();
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      pairingFriendlyError(StateError('connection refused'), l10n),
      l10n.pairErrorUnreachable,
    );
    expect(
      pairingFriendlyError(Exception('network is unreachable'), l10n),
      l10n.pairErrorUnreachable,
    );
    expect(
      pairingFriendlyError(Exception('timed out waiting'), l10n),
      l10n.pairErrorTimeout,
    );
    expect(
      pairingFriendlyError(Exception('token expired'), l10n),
      l10n.pairErrorExpired,
    );
    expect(
      pairingFriendlyError(Exception('wrong app'), l10n),
      l10n.pairErrorWrongApp,
    );
    expect(
      pairingFriendlyError(Exception('weird boom'), l10n),
      'weird boom',
    );
    expect(
      pairingFriendlyError(StateError('   '), l10n),
      l10n.pairErrorGeneric,
    );
  });
}
