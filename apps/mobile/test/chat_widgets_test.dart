import 'package:envoyhome/l10n/app_localizations.dart';
import 'package:envoyhome/screens/chat/chat_approval_card.dart';
import 'package:envoyhome/screens/chat/chat_composer_bar.dart';
import 'package:envoyhome/screens/chat/chat_message_bubble.dart';
import 'package:envoyhome/screens/chat/chat_models.dart';
import 'package:envoyhome/screens/chat/chat_needs_you_panel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _app(Widget home) {
  return MaterialApp(
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    supportedLocales: AppLocalizations.supportedLocales,
    home: Scaffold(body: home),
  );
}

void main() {
  group('chatApprovalIsActuation', () {
    test('detects HA / MQTT / object / safety class', () {
      expect(chatApprovalIsActuation({'tool': 'ha_call_service'}), isTrue);
      expect(chatApprovalIsActuation({'tool': 'mqtt_publish'}), isTrue);
      expect(chatApprovalIsActuation({'objectId': 'light.kitchen'}), isTrue);
      expect(chatApprovalIsActuation({'safetyClass': true}), isTrue);
      expect(chatApprovalIsActuation({'tool': 'web_search'}), isFalse);
    });
  });

  group('ChatApprovalCard', () {
    testWidgets('renders tool + allow/deny', (tester) async {
      var allow = 0;
      var deny = 0;
      await tester.pumpWidget(
        _app(
          ChatApprovalCard(
            row: {
              'tool': 'ha_call_service',
              'summary': 'Turn off porch',
              'objectId': 'light.porch',
              'desiredState': 'off',
              'risk': 'safety',
            },
            onAllow: () => allow++,
            onDeny: () => deny++,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('ha_call_service'), findsOneWidget);
      expect(find.text('Turn off porch'), findsOneWidget);
      expect(find.textContaining('light.porch'), findsOneWidget);
      expect(find.text('Actuation'), findsOneWidget);
      await tester.tap(find.text('Allow'));
      await tester.tap(find.text('Deny'));
      expect(allow, 1);
      expect(deny, 1);
    });
  });

  group('ChatNeedsYouPanel', () {
    testWidgets('hidden when empty', (tester) async {
      await tester.pumpWidget(
        _app(
          ChatNeedsYouPanel(
            count: 0,
            expanded: true,
            onToggleExpanded: () {},
            children: const [],
          ),
        ),
      );
      expect(find.byType(InkWell), findsNothing);
    });

    testWidgets('toggles expansion', (tester) async {
      var expanded = true;
      await tester.pumpWidget(
        StatefulBuilder(
          builder: (context, setState) => _app(
            ChatNeedsYouPanel(
              count: 2,
              expanded: expanded,
              onToggleExpanded: () => setState(() => expanded = !expanded),
              children: const [Text('card-a'), Text('card-b')],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('card-a'), findsOneWidget);
      await tester.tap(find.textContaining('Needs you'));
      await tester.pumpAndSettle();
      expect(find.text('card-a'), findsNothing);
      await tester.tap(find.textContaining('Needs you'));
      await tester.pumpAndSettle();
      expect(find.text('card-a'), findsOneWidget);
    });
  });

  group('ChatMessageBubble', () {
    testWidgets('system role is centered muted text', (tester) async {
      await tester.pumpWidget(
        _app(
          ChatMessageBubble(
            bubble: ChatBubble(role: 'system', text: 'Connected'),
            bodyChildren: const [],
            busy: false,
          ),
        ),
      );
      expect(find.text('Connected'), findsOneWidget);
      expect(find.byType(ChatBubbleIconButton), findsNothing);
    });

    testWidgets('user bubble shows copy when callback set', (tester) async {
      var copied = 0;
      await tester.pumpWidget(
        _app(
          ChatMessageBubble(
            bubble: ChatBubble(
              role: 'user',
              text: 'Hello',
              messageId: 'm1',
            ),
            bodyChildren: const [Text('Hello')],
            busy: false,
            onCopy: () => copied++,
            onDelete: () {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Hello'), findsWidgets);
      await tester.tap(find.byIcon(Icons.content_copy));
      expect(copied, 1);
      expect(find.byIcon(Icons.delete_outline), findsOneWidget);
    });

    testWidgets('busy hides actions', (tester) async {
      await tester.pumpWidget(
        _app(
          ChatMessageBubble(
            bubble: ChatBubble(
              role: 'user',
              text: 'Hello',
              messageId: 'm1',
            ),
            bodyChildren: const [Text('Hello')],
            busy: true,
            onCopy: () {},
            onDelete: () {},
          ),
        ),
      );
      expect(find.byIcon(Icons.content_copy), findsNothing);
      expect(find.byIcon(Icons.delete_outline), findsNothing);
    });

    testWidgets('media chips render', (tester) async {
      await tester.pumpWidget(
        _app(
          ChatMessageBubble(
            bubble: ChatBubble(
              role: 'user',
              text: '',
              media: [
                {'kind': 'image', 'fileName': 'shot.png'},
              ],
            ),
            bodyChildren: const [],
            busy: false,
          ),
        ),
      );
      expect(find.text('shot.png'), findsOneWidget);
    });
  });

  group('ChatComposerBar', () {
    testWidgets('schedules hides attach; send fires', (tester) async {
      final text = TextEditingController();
      final focus = FocusNode();
      var sent = 0;
      await tester.pumpWidget(
        _app(
          ChatComposerBar(
            textController: text,
            focusNode: focus,
            sending: false,
            listening: false,
            turnActive: false,
            isHome: false,
            isSchedules: true,
            onAttach: () {},
            onToggleVoice: () {},
            onSend: () => sent++,
            onCancelTurn: () {},
            onFieldTap: () {},
          ),
        ),
      );
      expect(find.byIcon(Icons.attach_file_outlined), findsNothing);
      await tester.tap(find.byIcon(Icons.send_rounded));
      expect(sent, 1);
      text.dispose();
      focus.dispose();
    });

    testWidgets('sending disables send and shows spinner', (tester) async {
      final text = TextEditingController();
      final focus = FocusNode();
      await tester.pumpWidget(
        _app(
          ChatComposerBar(
            textController: text,
            focusNode: focus,
            sending: true,
            listening: false,
            turnActive: true,
            isHome: true,
            isSchedules: false,
            onAttach: () {},
            onToggleVoice: () {},
            onSend: () {},
            onCancelTurn: () {},
            onFieldTap: () {},
          ),
        ),
      );
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.byIcon(Icons.stop_rounded), findsNothing);
      text.dispose();
      focus.dispose();
    });

    testWidgets('turn active shows stop', (tester) async {
      final text = TextEditingController();
      final focus = FocusNode();
      var cancelled = 0;
      await tester.pumpWidget(
        _app(
          ChatComposerBar(
            textController: text,
            focusNode: focus,
            sending: false,
            listening: true,
            turnActive: true,
            isHome: false,
            isSchedules: false,
            onAttach: () {},
            onToggleVoice: () {},
            onSend: () {},
            onCancelTurn: () => cancelled++,
            onFieldTap: () {},
          ),
        ),
      );
      expect(find.byIcon(Icons.mic), findsOneWidget);
      await tester.tap(find.byIcon(Icons.stop_rounded));
      expect(cancelled, 1);
      text.dispose();
      focus.dispose();
    });
  });

  group('ChatBubbleIconButton', () {
    testWidgets('invokes onPressed', (tester) async {
      var n = 0;
      await tester.pumpWidget(
        _app(
          ChatBubbleIconButton(
            icon: Icons.content_copy,
            tooltip: 'Copy',
            onPressed: () => n++,
          ),
        ),
      );
      await tester.tap(find.byIcon(Icons.content_copy));
      expect(n, 1);
    });
  });
}
