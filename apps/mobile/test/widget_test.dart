import 'package:flutter_test/flutter_test.dart';
import 'package:envoyhome/app.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Unpaired shell shows connect guide', (tester) async {
    await tester.pumpWidget(const EnvoyHomeApp());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('EnvoyHome'), findsWidgets);
    expect(find.text('Connect to your home'), findsOneWidget);
    expect(find.text('Connect'), findsWidgets);
    expect(find.text('Chat'), findsOneWidget);
  });
}
