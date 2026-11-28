/// Chat tab — thin StatefulWidget API; implementation lives in `chat/` parts.
///
/// Layout: [chat_tab_state.dart] (State) + focused widgets under `chat/`
/// (bubble, composer, Needs-you panel, approval card, models/helpers).
library;

import 'dart:async';
import 'dart:convert';

import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:speech_to_text/speech_to_text.dart';

import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:url_launcher/url_launcher.dart';

import '../chat_format.dart';
import '../chat_think.dart';
import '../client_context.dart';
import '../l10n/app_localizations.dart';
import '../sandbox_paths.dart';
import '../state/needs_you_controller.dart';
import '../state/session_controller.dart';
import '../utils/open_external_url.dart';
import 'artifact_viewer_screen.dart';
import 'chat/browser_form_files.dart';
import 'chat/chat_approval_card.dart';
import 'chat/chat_composer_bar.dart';
import 'chat/chat_connect_guide.dart';
import 'chat/chat_helpers.dart';
import 'chat/chat_message_bubble.dart';
import 'chat/chat_models.dart';
import 'chat/chat_needs_you_panel.dart';
import 'system_screen.dart';


part 'chat/chat_tab_state.dart';

class ChatTab extends StatefulWidget {
  const ChatTab({
    super.key,
    required this.session,
    this.purpose = 'general',
    this.onRequestConnect,
    this.onRequestPairAgain,
    this.schedulesPaneOverride,
    this.embedInSchedulesHub = false,
    this.showHomeModeToggle = false,
    this.deferOfflineActions = false,
    this.needsYou,
  });

  final SessionController session;
  final String purpose;
  /// When unpaired, empty state offers Connect / Reconnect.
  final VoidCallback? onRequestConnect;
  /// Opens the pairing screen to mint a fresh join (optional secondary).
  final VoidCallback? onRequestPairAgain;
  /// When [embedInSchedulesHub] is true, hub owns Chat vs Histories selection.
  final String? schedulesPaneOverride;
  /// Hide inner Chat/Histories tabs — Schedules hub renders them.
  final bool embedInSchedulesHub;
  /// General chat may switch to Home purpose via a chip (HA ready).
  final bool showHomeModeToggle;
  /// Parent already shows [ConnectionBanner] — keep offline empty state text-only.
  final bool deferOfflineActions;
  /// Shell-global Needs-you counter / open requests (optional).
  final NeedsYouController? needsYou;

  @override
  State<ChatTab> createState() => _ChatTabState();
}

