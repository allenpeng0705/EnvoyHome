import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../state/session_controller.dart';

class PairScreen extends StatefulWidget {
  const PairScreen({super.key, required this.session});

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
  }

  @override
  void dispose() {
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
    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFFF0EEF8),
              Color(0xFFE4DFF5),
              Color(0xFFF5F0FA),
            ],
          ),
        ),
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 28, 24, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: Image.asset(
                        'assets/logo.png',
                        width: 72,
                        height: 72,
                        filterQuality: FilterQuality.high,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'EnvoyHome',
                      style: theme.textTheme.displaySmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.8,
                        color: const Color(0xFF1A1430),
                        height: 1.05,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Join the home desktop over EnvoyMesh — scan a QR, enter host:port, or hop via SSH.',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: const Color(0xFF5B5678),
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              TabBar(
                controller: _tabs,
                labelColor: const Color(0xFF1A1430),
                unselectedLabelColor: const Color(0xFF7A7494),
                indicatorColor: theme.colorScheme.primary,
                tabs: const [
                  Tab(text: 'Link'),
                  Tab(text: 'Host:port'),
                  Tab(text: 'SSH'),
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
                  padding: const EdgeInsets.fromLTRB(24, 0, 24, 12),
                  child: Text(
                    err,
                    style: TextStyle(color: theme.colorScheme.error),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
                child: Text(
                  'com.envoymesh.envoyhome · push after pair',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: const Color(0xFF5B5678),
                  ),
                ),
              ),
            ],
          ),
        ),
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
            child: const Text('Close scanner'),
          ),
        ] else ...[
          FilledButton.icon(
            onPressed:
                session.busy ? null : () => setState(() => _scanning = true),
            icon: const Icon(Icons.qr_code_scanner),
            label: const Text('Scan pairing QR'),
          ),
        ],
        const SizedBox(height: 20),
        TextField(
          controller: _uriCtrl,
          minLines: 3,
          maxLines: 5,
          decoration: const InputDecoration(
            labelText: 'Pairing URI',
            hintText: 'envoy://pair?…&app=EnvoyHome',
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
              : const Text('Connect'),
        ),
      ],
    );
  }

  Widget _directTab(SessionController session) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
      children: [
        Text(
          'Reach the desktop on this network (LAN / Tailscale). Token is required.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: const Color(0xFF5B5678),
              ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _endpointCtrl,
          decoration: const InputDecoration(
            labelText: 'Host:port',
            hintText: '192.168.1.10:4780',
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _tokenCtrl,
          obscureText: true,
          decoration: const InputDecoration(
            labelText: 'Pairing token',
            helperText: 'From desktop Settings → Pair devices',
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
              : const Text('Connect'),
        ),
      ],
    );
  }

  Widget _sshTab(SessionController session) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
      children: [
        Text(
          'Tunnel through an SSH hop. The daemon sees loopback — token is optional.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: const Color(0xFF5B5678),
              ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _sshHostCtrl,
          decoration: const InputDecoration(labelText: 'SSH host'),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _sshUserCtrl,
                decoration: const InputDecoration(
                  labelText: 'User',
                  hintText: 'root',
                ),
              ),
            ),
            const SizedBox(width: 12),
            SizedBox(
              width: 96,
              child: TextField(
                controller: _sshPortCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Port'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _sshPasswordCtrl,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'SSH password'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _daemonCtrl,
          decoration: const InputDecoration(
            labelText: 'Daemon on far side',
            hintText: '127.0.0.1:4780',
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _sshTokenCtrl,
          obscureText: true,
          decoration: const InputDecoration(
            labelText: 'Token (optional)',
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
              : const Text('Connect'),
        ),
      ],
    );
  }
}
