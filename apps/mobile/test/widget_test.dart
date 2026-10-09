import 'package:flutter_test/flutter_test.dart';
import 'package:envoyhome/app.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Pair screen shows EnvoyHome brand', (tester) async {
    await tester.pumpWidget(const EnvoyHomeApp());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('EnvoyHome'), findsWidgets);
    expect(find.textContaining('host:port'), findsOneWidget);
    expect(find.text('Link'), findsOneWidget);
    expect(find.text('SSH'), findsOneWidget);
  });
}
