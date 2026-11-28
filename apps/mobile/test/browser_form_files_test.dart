import 'package:envoyhome/screens/chat/browser_form_files.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('isAllowedBrowserFormFileName', () {
    test('allows known extensions', () {
      expect(isAllowedBrowserFormFileName('a.PDF'), isTrue);
      expect(isAllowedBrowserFormFileName('x.png'), isTrue);
      expect(isAllowedBrowserFormFileName('sheet.xlsx'), isTrue);
      expect(isAllowedBrowserFormFileName('notes.txt'), isTrue);
    });

    test('refuses unknown or extensionless', () {
      expect(isAllowedBrowserFormFileName('a.exe'), isFalse);
      expect(isAllowedBrowserFormFileName('noext'), isFalse);
      expect(isAllowedBrowserFormFileName(''), isFalse);
    });
  });

  group('mimeFromBrowserFormFileName', () {
    test('maps common types', () {
      expect(mimeFromBrowserFormFileName('a.jpg'), 'image/jpeg');
      expect(mimeFromBrowserFormFileName('a.JPEG'), 'image/jpeg');
      expect(mimeFromBrowserFormFileName('a.pdf'), 'application/pdf');
      expect(mimeFromBrowserFormFileName('a.csv'), 'text/csv');
      expect(mimeFromBrowserFormFileName('a.bin'), isNull);
    });
  });

  group('isDataSpreadsheetName', () {
    test('csv and xlsx only', () {
      expect(isDataSpreadsheetName('a.csv'), isTrue);
      expect(isDataSpreadsheetName('a.XLSX'), isTrue);
      expect(isDataSpreadsheetName('a.xls'), isFalse);
      expect(isDataSpreadsheetName('a.pdf'), isFalse);
    });
  });

  group('matchesBrowserFormFileAccept', () {
    test('empty accept allows all', () {
      expect(matchesBrowserFormFileAccept('x.exe'), isTrue);
      expect(matchesBrowserFormFileAccept('x.exe', accept: '  '), isTrue);
    });

    test('extension tokens', () {
      expect(
        matchesBrowserFormFileAccept('a.png', accept: '.png,.jpg'),
        isTrue,
      );
      expect(
        matchesBrowserFormFileAccept('a.gif', accept: '.png,.jpg'),
        isFalse,
      );
      expect(
        matchesBrowserFormFileAccept('a.png', accept: 'png'),
        isTrue,
      );
    });

    test('mime tokens and wildcards', () {
      expect(
        matchesBrowserFormFileAccept(
          'a.png',
          accept: 'image/png',
          mimeHint: 'image/png',
        ),
        isTrue,
      );
      expect(
        matchesBrowserFormFileAccept(
          'a.png',
          accept: 'image/*',
          mimeHint: 'image/png',
        ),
        isTrue,
      );
      expect(
        matchesBrowserFormFileAccept(
          'a.pdf',
          accept: 'image/*',
          mimeHint: 'application/pdf',
        ),
        isFalse,
      );
    });
  });

  test('attach caps are stable', () {
    expect(kChatAttachMaxFiles, 8);
    expect(kChatAttachMaxBytes, 8 * 1024 * 1024);
  });
}
