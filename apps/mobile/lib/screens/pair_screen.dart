import 'dart:async';
import 'dart:io' show Platform;

import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:permission_handler/permission_handler.dart';

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

  /// Android: CameraX preview inside a [ListView] often stays black. Open a
  /// full-screen scanner instead, after an explicit runtime CAMERA grant.
  Future<void> _scanQr() async {
    final l10n = AppLocalizations.of(context);
    final status = await _requestCameraPermission();
    if (!mounted) return;
    if (!status.isGranted) {
      final forever = status.isPermanentlyDenied;
      setState(() {
        _formError =
            forever ? l10n.pairCameraDeniedForever : l10n.pairCameraDenied;
      });
      if (forever) {
        final open = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: Text(l10n.pairScanQr),
            content: Text(l10n.pairCameraDeniedForever),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: Text(MaterialLocalizations.of(ctx).cancelButtonLabel),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: Text(l10n.pairOpenSettings),
              ),
            ],
          ),
        );
        if (open == true) {
          await openAppSettings();
        }
      }
      return;
    }

    // Let the Activity finish resuming after the system permission sheet
    // before CameraX bindToLifecycle runs.
    await Future<void>.delayed(const Duration(milliseconds: 250));
    if (!mounted) return;

    final uri = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const _PairQrScannerPage()),
    );
    if (!mounted || uri == null || uri.isEmpty) return;
    _uriCtrl.text = uri;
    await _connectUri(uri);
  }

  Future<PermissionStatus> _requestCameraPermission() async {
    if (kIsWeb) return PermissionStatus.denied;
    try {
      if (!(Platform.isAndroid || Platform.isIOS)) {
        return PermissionStatus.denied;
      }
    } catch (_) {
      return PermissionStatus.denied;
    }
    var status = await Permission.camera.status;
    if (status.isGranted) return status;
    return Permission.camera.request();
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
        FilledButton.icon(
          onPressed: session.busy ? null : _scanQr,
          icon: const Icon(Icons.qr_code_scanner),
          label: Text(AppLocalizations.of(context).pairScanQr),
        ),
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
          decoration: InputDecoration(
              labelText: AppLocalizations.of(context).pairSshHost),
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
                decoration: InputDecoration(
                    labelText: AppLocalizations.of(context).pairSshPort),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _sshPasswordCtrl,
          obscureText: true,
          decoration: InputDecoration(
              labelText: AppLocalizations.of(context).pairSshPassword),
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

/// Full-screen QR scanner — avoids embedding CameraX in a scrollable [ListView].
///
/// Does **not** stop the camera on [AppLifecycleState.inactive]: that state
/// fires during route transitions / permission UI on Android and was racing
/// CameraX `bindToLifecycle`, leaving a permanent "camera could not start".
class _PairQrScannerPage extends StatefulWidget {
  const _PairQrScannerPage();

  @override
  State<_PairQrScannerPage> createState() => _PairQrScannerPageState();
}

class _PairQrScannerPageState extends State<_PairQrScannerPage> {
  late MobileScannerController _controller;
  /// Bumps to force a fresh [MobileScanner] + controller on Retry.
  int _generation = 0;
  bool _handled = false;

  @override
  void initState() {
    super.initState();
    _controller = _newController();
  }

  MobileScannerController _newController() {
    return MobileScannerController(
      // Let MobileScanner attach() then start — avoids controllerNotAttached.
      autoStart: true,
      formats: const [BarcodeFormat.qrCode],
      detectionSpeed: DetectionSpeed.noDuplicates,
    );
  }

  Future<void> _retryCamera() async {
    _handled = false;
    final old = _controller;
    setState(() {
      _generation += 1;
      _controller = _newController();
    });
    // Dispose after the widget tree drops the old MobileScanner.
    await Future<void>.delayed(const Duration(milliseconds: 50));
    try {
      await old.dispose();
    } catch (e) {
      debugPrint('[pair] old controller dispose: $e');
    }
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;
    final value = capture.barcodes
        .map((b) => b.rawValue)
        .whereType<String>()
        .firstWhere(
          (v) => v.startsWith('envoy://pair'),
          orElse: () => '',
        );
    if (value.isEmpty) return;
    _handled = true;
    unawaited(_controller.stop());
    if (mounted) {
      Navigator.of(context).pop(value);
    }
  }

  @override
  void dispose() {
    unawaited(_controller.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(l10n.pairScanQr),
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            key: ValueKey<int>(_generation),
            controller: _controller,
            // Avoid stop-on-inactive; that races CameraX during push transitions.
            useAppLifecycleState: false,
            onDetect: _onDetect,
            errorBuilder: (context, error) {
              final detail =
                  error.errorDetails?.message ?? error.errorCode.message;
              debugPrint('[pair] scanner error: ${error.errorCode} $detail');
              return _ScannerErrorPane(
                message: l10n.pairScannerError,
                detail: detail,
                onRetry: () => unawaited(_retryCamera()),
                onClose: () => Navigator.of(context).pop(),
                closeLabel: l10n.pairCloseScanner,
                retryLabel: l10n.pairRetryCamera,
                errorColor: theme.colorScheme.error,
              );
            },
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  l10n.pairScannerHint,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    shadows: [Shadow(blurRadius: 8, color: Colors.black)],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ScannerErrorPane extends StatelessWidget {
  const _ScannerErrorPane({
    required this.message,
    required this.onRetry,
    required this.onClose,
    required this.closeLabel,
    required this.retryLabel,
    required this.errorColor,
    this.detail,
  });

  final String message;
  final String? detail;
  final VoidCallback onRetry;
  final VoidCallback onClose;
  final String closeLabel;
  final String retryLabel;
  final Color errorColor;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.videocam_off, color: errorColor, size: 48),
              const SizedBox(height: 16),
              Text(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white),
              ),
              if (detail != null && detail!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  detail!,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.65),
                    fontSize: 12,
                  ),
                ),
              ],
              const SizedBox(height: 20),
              FilledButton(
                onPressed: onRetry,
                child: Text(retryLabel),
              ),
              TextButton(
                onPressed: onClose,
                child: Text(closeLabel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
