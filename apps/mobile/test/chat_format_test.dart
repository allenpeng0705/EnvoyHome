import 'package:envoyhome/chat_format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('classifyChatFormat: markdown cues including sandbox links', () {
    expect(classifyChatFormat('hi'), 'plain');
    expect(
      classifyChatFormat('See [report](output/exports/a.docx)'),
      'markdown',
    );
    expect(
      classifyChatFormat('Saved as `documents/note.md`'),
      'markdown',
    );
    expect(
      classifyChatFormat('# Heading\n\nBody'),
      'markdown',
    );
  });

  test('normalizeChatFormat accepts wire tiers only', () {
    expect(normalizeChatFormat('plain'), 'plain');
    expect(normalizeChatFormat('markdown'), 'markdown');
    expect(normalizeChatFormat('link'), 'link');
    expect(normalizeChatFormat('LINK'), isNull);
    expect(normalizeChatFormat(null), isNull);
    expect(normalizeChatFormat(''), isNull);
  });

  test('humanizeScheduleChatText leaves non-schedule text alone', () {
    const text = 'Exported docx: `output/exports/a.docx`';
    expect(humanizeScheduleChatText(text), text);
  });
}
