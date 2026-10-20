import 'package:envoyhome/sandbox_paths.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('extracts backtick and bare sandbox paths', () {
    const text =
        'Saved as `output/exports/report-1.docx` and also output/extracts/note.md';
    expect(
      extractSandboxFilePaths(text),
      ['output/exports/report-1.docx', 'output/extracts/note.md'],
    );
  });

  test('extracts workspace paths and unicode backtick names', () {
    const text =
        'Host copy at `workspace/Desktop/季度报告.docx` and workspace/notes/a.md';
    expect(
      extractSandboxFilePaths(text),
      ['workspace/Desktop/季度报告.docx', 'workspace/notes/a.md'],
    );
  });

  test('dedupes and rejects traversal', () {
    const text =
        'See `output/a.pdf` again output/a.pdf and `output/../secret.txt`';
    expect(extractSandboxFilePaths(text), ['output/a.pdf']);
  });

  test('ignores non-sandbox paths', () {
    expect(extractSandboxFilePaths('https://example.com/a.pdf'), isEmpty);
    expect(extractSandboxFilePaths('tmp/foo.docx'), isEmpty);
  });
}
