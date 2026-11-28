import 'package:envoyhome/l10n/app_localizations.dart';
import 'package:envoyhome/screens/chat/chat_helpers.dart';
import 'package:envoyhome/screens/chat/chat_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('chatMediaIcon maps kinds', () {
    expect(chatMediaIcon('image'), Icons.image_outlined);
    expect(chatMediaIcon('audio'), Icons.audiotrack_outlined);
    expect(chatMediaIcon('video'), Icons.videocam_outlined);
    expect(chatMediaIcon('other'), Icons.attach_file);
    expect(chatMediaIcon(null), Icons.attach_file);
  });

  test('chatMimeFromExt covers common types', () {
    expect(chatMimeFromExt('PNG'), 'image/png');
    expect(chatMimeFromExt('jpg'), 'image/jpeg');
    expect(chatMimeFromExt('jpeg'), 'image/jpeg');
    expect(chatMimeFromExt('pdf'), 'application/pdf');
    expect(chatMimeFromExt('mp4'), 'video/mp4');
    expect(chatMimeFromExt('xyz'), isNull);
  });

  test('chatCopyTextForBubble strips assistant think tiles', () {
    final assistant = ChatBubble(
      role: 'assistant',
      text: '<think>secret</think>\nHello there',
    );
    expect(chatCopyTextForBubble(assistant), 'Hello there');
    final user = ChatBubble(role: 'user', text: '  hi  ');
    expect(chatCopyTextForBubble(user), 'hi');
  });

  test('chatRelativeSessionTime buckets', () {
    final now = DateTime.now();
    expect(chatRelativeSessionTime(null), '');
    expect(chatRelativeSessionTime(''), '');
    expect(
      chatRelativeSessionTime(now.subtract(const Duration(seconds: 20)).toIso8601String()),
      'now',
    );
    expect(
      chatRelativeSessionTime(now.subtract(const Duration(minutes: 12)).toIso8601String()),
      '12m',
    );
  });

  testWidgets('chatDismissedTitle prefers name then message', (tester) async {
    late AppLocalizations l10n;
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: Builder(
          builder: (context) {
            l10n = AppLocalizations.of(context);
            return const SizedBox.shrink();
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      chatDismissedTitle({'name': 'Lights out', 'message': 'ignored'}, l10n),
      'Lights out',
    );
    expect(
      chatDismissedTitle({'message': 'Turn off porch'}, l10n),
      'Turn off porch',
    );
    expect(
      chatDismissedTitle({'resolvedLocal': 'cron 0 * * * *'}, l10n),
      l10n.schedTabRepeating,
    );
    expect(chatDismissedWhen({'resolvedLocal': 'cron 0 * * * *'}), isNull);
    expect(
      chatDismissedWhen({'resolvedLocal': '2026-11-28 09:00'}),
      '2026-11-28 09:00',
    );
    expect(chatFormatHistWhen(null), '—');
    expect(chatFormatHistWhen('not-a-date'), 'not-a-date');
  });
}
