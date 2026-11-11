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
    expect(extractSandboxFilePaths('share/household/a.md'), isEmpty);
  });

  test('normalizes ./ and slash collapse in backticks', () {
    expect(
      extractSandboxFilePaths('Wrote `./documents//note.md`'),
      ['documents/note.md'],
    );
  });

  test('parseSandboxArtifactHref accepts sandbox markdown links', () {
    expect(
      parseSandboxArtifactHref('output/exports/report.docx'),
      'output/exports/report.docx',
    );
    expect(
      parseSandboxArtifactHref('./documents/note.md'),
      'documents/note.md',
    );
    expect(
      parseSandboxArtifactHref('output%2Fexports%2Fhi.docx'),
      'output/exports/hi.docx',
    );
    expect(
      parseSandboxArtifactHref('envoyhome://artifact/uploads/a.pdf'),
      'uploads/a.pdf',
    );
    expect(
      parseSandboxArtifactHref('artifact://knowledge/clip.md'),
      'knowledge/clip.md',
    );
    expect(
      parseSandboxArtifactHref('EnvoyHome://artifact/documents/web-clip.md'),
      'documents/web-clip.md',
    );
  });

  test('parseSandboxArtifactHref rejects http and traversal', () {
    expect(parseSandboxArtifactHref('https://example.com/a.pdf'), isNull);
    expect(parseSandboxArtifactHref('http://127.0.0.1/artifacts/x'), isNull);
    expect(parseSandboxArtifactHref('mailto:a@b.c'), isNull);
    expect(parseSandboxArtifactHref('tel:+1'), isNull);
    expect(parseSandboxArtifactHref('output/../secret.txt'), isNull);
    expect(parseSandboxArtifactHref('tmp/foo.docx'), isNull);
    expect(parseSandboxArtifactHref('share/x.md'), isNull);
    expect(parseSandboxArtifactHref(''), isNull);
    expect(parseSandboxArtifactHref(null), isNull);
  });

  test('chat chip filter excludes spill artifactPath (Design §9.5d)', () {
    const spill = 'output/replies/turn-1.md';
    const text =
        'Summary.\n\nExported docx: `output/exports/memo.docx`\n'
        'Also see `$spill`';
    final mentioned = extractSandboxFilePaths(text).where((p) => p != spill).toList();
    expect(mentioned, ['output/exports/memo.docx']);
  });
}
