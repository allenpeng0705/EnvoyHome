import 'package:envoyhome/chat_think.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('splits closed think from reply', () {
    final parts = splitAssistantSegments(
      '<think>plan</think>\nHello there',
    );
    expect(parts.length, 2);
    expect(parts[0].isThink, isTrue);
    expect(parts[0].text, 'plan');
    expect(parts[1].kind, 'text');
    expect(parts[1].text.trim(), 'Hello there');
  });

  test('unclosed think is still a think segment', () {
    final parts = splitAssistantSegments('<think>still working');
    expect(parts, hasLength(1));
    expect(parts.single.isThink, isTrue);
    expect(parts.single.text, 'still working');
  });

  test('plain text unchanged', () {
    final parts = splitAssistantSegments('Just a reply');
    expect(parts, hasLength(1));
    expect(parts.single.kind, 'text');
    expect(parts.single.text, 'Just a reply');
  });
}
