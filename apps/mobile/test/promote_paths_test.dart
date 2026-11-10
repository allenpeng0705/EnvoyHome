import 'package:envoyhome/promote_paths.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('canPromoteKnowledgePath matches Design §9.5j affordances', () {
    expect(canPromoteKnowledgePath('output/extracts/a.md'), isTrue);
    expect(canPromoteKnowledgePath('uploads/note.markdown'), isTrue);
    expect(canPromoteKnowledgePath('documents/x.md'), isTrue);
    expect(canPromoteKnowledgePath('output/exports/out.md'), isTrue);
    expect(canPromoteKnowledgePath('uploads/scan.extract.md'), isTrue);
    expect(canPromoteKnowledgePath('knowledge/already.md'), isFalse);
    expect(canPromoteKnowledgePath('output/exports/out.docx'), isFalse);
    expect(canPromoteKnowledgePath('../escape.md'), isFalse);
  });
}
