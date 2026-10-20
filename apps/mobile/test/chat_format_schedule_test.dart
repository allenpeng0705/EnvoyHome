import 'package:envoyhome/chat_format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('V-CRON-11: humanizeScheduleChatText surfaces resolvedLocal', () {
    const raw =
        '{"proposalId":"p1","resolvedLocal":"2026-10-10 08:00 Asia/Shanghai","kind":"at"}';
    final line = humanizeScheduleChatText(raw);
    expect(line, contains('Proposed for 2026-10-10 08:00 Asia/Shanghai'));
    expect(line, isNot(contains('proposalId')));
    expect(line, isNot(contains('{')));
  });
}
