import 'package:flutter_test/flutter_test.dart';
import 'package:envoyhome/app.dart';

void main() {
  testWidgets('Pair screen shows EnvoyHome brand', (tester) async {
    await tester.pumpWidget(const EnvoyHomeApp());
    await tester.pump();
    expect(find.text('EnvoyHome'), findsWidgets);
    expect(find.textContaining('host:port'), findsOneWidget);
    expect(find.text('Link'), findsOneWidget);
    expect(find.text('SSH'), findsOneWidget);
  });
}
