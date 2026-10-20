import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:envoyhome/device_privacy.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('share location pref defaults off', () async {
    expect(await getShareLocationWithHome(), isFalse);
  });

  test('share location pref persists', () async {
    await setShareLocationWithHome(true);
    expect(await getShareLocationWithHome(), isTrue);
    await setShareLocationWithHome(false);
    expect(await getShareLocationWithHome(), isFalse);
  });
}
