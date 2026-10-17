import 'dart:async';

import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../l10n/app_localizations.dart';
import '../services/local_network_prompt.dart';
import '../state/session_controller.dart';

class PairScreen extends StatefulWidget {
  const PairScreen({
    super.key,
    required this.session,
  });

  final SessionController session;

  @override
  State<PairScreen> createState() => _PairScreenState();
}

class _PairScreenState extends State<PairScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  final _uriCtrl = TextEditingController();
  final _endpointCtrl = TextEditingController(text: '192.168.1.1:4780');
  final _tokenCtrl = TextEditingController();
  final _sshHostCtrl = TextEditingController();
  final _sshUserCtrl = TextEditingController();
  final _sshPortCtrl = TextEditingController(text: '22');
  final _sshPasswordCtrl = TextEditingController();
  final _daemonCtrl = TextEditingController(text: '127.0.0.1:4780');
  final _sshTokenCtrl = TextEditingController();
  bool _scanning = false;
  String? _formError;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    widget.session.addListener(_onSession);
    // Surface iOS Local Network permission before the first pair dial.
    unawaited(promptLocalNetworkAccessEarly());
  }

  void _onSession() {
    if (!mounted) return;
    if (widget.session.isConnected && Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }
  }

  @override
  void dispose() {
    widget.session.removeListener(_onSession);
    _tabs.dispose();
    _uriCtrl.dispose();
    _endpointCtrl.dispose();
    _tokenCtrl.dispose();
    _sshHostCtrl.dispose();
    _sshUserCtrl.dispose();
    _sshPortCtrl.dispose();
    _sshPasswordCtrl.dispose();
    _daemonCtrl.dispose();
    _sshTokenCtrl.dispose();
    super.dispose();
  }

  Future<void> _connectUri(String uri) async {
    setState(() => _formError = null);
    await widget.session.connectWithUri(uri);
  }

  Future<void> _connectDirect() async {
    final draft = buildDirectJoin(
      endpoint: _endpointCtrl.text,
      token: _tokenCtrl.text,
    );
    if (draft is JoinDraftRefused) {
      setState(() => _formError = draft.message);
      return;
    }
    setState(() => _formError = null);
    await widget.session.connectWithPairing((draft as JoinDraftBuilt).pairing);
  }

  Future<void> _connectSsh() async {
    final draft = buildSshJoin(
      sshHost: _sshHostCtrl.text,
      user: _sshUserCtrl.text,
      port: _sshPortCtrl.text,
      password: _sshPasswordCtrl.text,
      daemonEndpoint: _daemonCtrl.text,
      token: _sshTokenCtrl.text,
    );
    if (draft is JoinDraftRefused) {
      setState(() => _formError = draft.message);
      return;
    }
    setState(() => _formError = null);
    await widget.session.connectWithPairing((draft as JoinDraftBuilt).pairing);
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    final err = _formError ?? session.error;
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.shellConnect),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
            child: Text(
              l10n.pairLede,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.65),
                height: 1.35,
              ),
            ),
          ),
          TabBar(
            controller: _tabs,
            isScrollable: true,
            tabs: [
              Tab(text: l10n.pairTabLink),
              Tab(text: l10n.pairTabHost),
              Tab(text: l10n.pairTabSsh),
            ],
          ),
          Expanded(
            child: TabBarView(
              controller: _tabs,
              children: [
                _linkTab(session),
                _directTab(session),
                _sshTab(session),
              ],
            ),
          ),
          if (err != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: Text(
                err,
                style: TextStyle(color: theme.colorScheme.error),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Text(
              l10n.pairFooter,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _linkTab(SessionController session) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
      children: [
        if (_scanning) ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: AspectRatio(
              aspectRatio: 1,
              child: MobileScanner(
                onDetect: (capture) {
                  final value = capture.barcodes
                      .map((b) => b.rawValue)
                      .whereType<String>()
                      .firstWhere(
                        (v) => v.startsWith('envoy://pair'),
                        orElse: () => '',
                      );
                  if (value.isEmpty || session.busy) return;
                  setState(() => _scanning = false);
                  _uriCtrl.text = value;
                  _connectUri(value);
                },
              ),
            ),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: () => setState(() => _scanning = false),
            child: Text(AppLocalizations.of(context).pairCloseScanner),
          ),
        ] else ...[
          FilledButton.icon(
            onPressed:
                session.busy ? null : () => setState(() => _scanning = true),
            icon: const Icon(Icons.qr_code_scanner),
            label: Text(AppLocalizations.of(context).pairScanQr),
          ),
        ],
        const SizedBox(height: 20),
        TextField(
          controller: _uriCtrl,
          minLines: 3,
          maxLines: 5,
          decoration: InputDecoration(
            labelText: AppLocalizations.of(context).pairUriLabel,
            hintText: AppLocalizations.of(context).pairUriHint,
          ),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: session.busy ? null : () => _connectUri(_uriCtrl.text),
          child: session.busy
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(AppLocalizations.of(context).pairConnect),
        ),
      ],
    );
  }

  Widget _directTab(SessionController session) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
      children: [
        Text(
          AppLocalizations.of(context).pairDirectHint,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context)
                    .colorScheme
                    .onSurface
                    .withValues(alpha: 0.65),
              ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _endpointCtrl,
          decoration: InputDecoration(
            labelText: AppLocalizations.of(context).pairHostPort,
            hintText: AppLocalizations.of(context).pairHostPortHint,
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _tokenCtrl,
          obscureText: true,
          decoration: InputDecoration(
            labelText: AppLocalizations.of(context).pairToken,
            helperText: AppLocalizations.of(context).pairTokenHelper,
          ),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: session.busy ? null : _connectDirect,
          child: session.busy
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(AppLocalizations.of(context).pairConnect),
        ),
      ],
    );
  }

  Widget _sshTab(SessionController session) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
      children: [
        Text(
          AppLocalizations.of(context).pairSshHint,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context)
                    .colorScheme
                    .onSurface
                    .withValues(alpha: 0.65),
              ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _sshHostCtrl,
          decoration: InputDecoration(labelText: AppLocalizations.of(context).pairSshHost),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _sshUserCtrl,
                decoration: InputDecoration(
                  labelText: AppLocalizations.of(context).pairSshUser,
                  hintText: AppLocalizations.of(context).pairSshUserHint,
                ),
              ),
            ),
            const SizedBox(width: 12),
            SizedBox(
              width: 96,
              child: TextField(
                controller: _sshPortCtrl,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: AppLocalizations.of(context).pairSshPort),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _sshPasswordCtrl,
          obscureText: true,
          decoration: InputDecoration(labelText: AppLocalizations.of(context).pairSshPassword),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _daemonCtrl,
          decoration: InputDecoration(
            labelText: AppLocalizations.of(context).pairDaemon,
            hintText: AppLocalizations.of(context).pairDaemonHint,
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _sshTokenCtrl,
          obscureText: true,
          decoration: InputDecoration(
            labelText: AppLocalizations.of(context).pairTokenOptional,
          ),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: session.busy ? null : _connectSsh,
          child: session.busy
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(AppLocalizations.of(context).pairConnect),
        ),
      ],
    );
  }
}
