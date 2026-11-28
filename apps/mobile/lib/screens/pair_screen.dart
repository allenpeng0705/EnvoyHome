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
import 'pairing/pairing_progress_screen.dart';

/// QR-first pairing (EnvoyGo scan peer). Host/SSH live under Advanced.
class PairScreen extends StatefulWidget {
  const PairScreen({
    super.key,
    required this.session,
  });

  final SessionController session;

  @override
  State<PairScreen> createState() => _PairScreenState();
}

class _PairScreenState extends State<PairScreen> {
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
  bool _advancedOpen = false;

  @override
  void initState() {
    super.initState();
    unawaited(promptLocalNetworkAccessEarly());
  }

  @override
  void dispose() {
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

  Future<void> _runWithProgress(Future<void> Function() connect) async {
    setState(() => _formError = null);
    final result = await Navigator.of(context).push<PairingProgressResult>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => PairingProgressScreen(
          connect: connect,
          onCancelRequested: () async {
            // Soft-pause so auto-redial does not fight the cancel.
            await widget.session.disconnect();
          },
        ),
      ),
    );
    if (!mounted || result == null) return;
    if (result.cancelled) return;
    if (result.error != null && result.error!.isNotEmpty) {
      setState(() => _formError = result.error);
      return;
    }
    if (widget.session.isConnected && Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    } else if (widget.session.error != null) {
      setState(() => _formError = widget.session.error);
    }
  }

  Future<void> _connectUri(String uri) async {
    final trimmed = uri.trim();
    if (trimmed.isEmpty) {
      setState(() => _formError = AppLocalizations.of(context).pairUriHint);
      return;
    }
    await _runWithProgress(() async {
      await widget.session.connectWithUri(trimmed);
      if (!widget.session.isConnected) {
        throw StateError(widget.session.error ?? 'Connect failed');
      }
    });
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
    await _runWithProgress(() async {
      await widget.session.connectWithPairing((draft as JoinDraftBuilt).pairing);
      if (!widget.session.isConnected) {
        throw StateError(widget.session.error ?? 'Connect failed');
      }
    });
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
    await _runWithProgress(() async {
      await widget.session.connectWithPairing((draft as JoinDraftBuilt).pairing);
      if (!widget.session.isConnected) {
        throw StateError(widget.session.error ?? 'Connect failed');
      }
    });
  }

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
        if (open == true) await openAppSettings();
      }
      return;
    }

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
    final busy = session.busy;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.shellConnect)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        children: [
          Text(
            l10n.pairLede,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.65),
              height: 1.35,
            ),
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: busy ? null : () => unawaited(_scanQr()),
            icon: const Icon(Icons.qr_code_scanner),
            label: Text(l10n.pairScanQr),
          ),
          const SizedBox(height: 20),
          Text(
            l10n.pairPasteInstead,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _uriCtrl,
            minLines: 2,
            maxLines: 4,
            decoration: InputDecoration(
              labelText: l10n.pairUriLabel,
              hintText: l10n.pairUriHint,
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.tonal(
            onPressed: busy ? null : () => unawaited(_connectUri(_uriCtrl.text)),
            child: Text(l10n.pairConnect),
          ),
          if (err != null && err.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(
              err,
              style: TextStyle(color: theme.colorScheme.error, height: 1.35),
            ),
          ],
          const SizedBox(height: 20),
          ExpansionTile(
            initiallyExpanded: _advancedOpen,
            onExpansionChanged: (v) => setState(() => _advancedOpen = v),
            title: Text(l10n.pairAdvanced),
            subtitle: Text(l10n.pairAdvancedSubtitle),
            childrenPadding: const EdgeInsets.fromLTRB(0, 0, 0, 12),
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  l10n.pairTabHost,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                l10n.pairDirectHint,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _endpointCtrl,
                decoration: InputDecoration(
                  labelText: l10n.pairHostPort,
                  hintText: l10n.pairHostPortHint,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _tokenCtrl,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: l10n.pairToken,
                  helperText: l10n.pairTokenHelper,
                ),
              ),
              const SizedBox(height: 12),
              FilledButton.tonal(
                onPressed: busy ? null : () => unawaited(_connectDirect()),
                child: Text(l10n.pairConnectHost),
              ),
              const SizedBox(height: 24),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  l10n.pairTabSsh,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                l10n.pairSshHint,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _sshHostCtrl,
                decoration: InputDecoration(labelText: l10n.pairSshHost),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _sshUserCtrl,
                      decoration: InputDecoration(
                        labelText: l10n.pairSshUser,
                        hintText: l10n.pairSshUserHint,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  SizedBox(
                    width: 96,
                    child: TextField(
                      controller: _sshPortCtrl,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(labelText: l10n.pairSshPort),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _sshPasswordCtrl,
                obscureText: true,
                decoration: InputDecoration(labelText: l10n.pairSshPassword),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _daemonCtrl,
                decoration: InputDecoration(
                  labelText: l10n.pairDaemon,
                  hintText: l10n.pairDaemonHint,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _sshTokenCtrl,
                obscureText: true,
                decoration: InputDecoration(labelText: l10n.pairTokenOptional),
              ),
              const SizedBox(height: 12),
              FilledButton.tonal(
                onPressed: busy ? null : () => unawaited(_connectSsh()),
                child: Text(l10n.pairConnectSsh),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            l10n.pairFooter,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
            ),
          ),
        ],
      ),
    );
  }
}

/// Full-screen QR scanner — avoids embedding CameraX in a scrollable [ListView].
class _PairQrScannerPage extends StatefulWidget {
  const _PairQrScannerPage();

  @override
  State<_PairQrScannerPage> createState() => _PairQrScannerPageState();
}

class _PairQrScannerPageState extends State<_PairQrScannerPage> {
  late MobileScannerController _controller;
  int _generation = 0;
  bool _handled = false;

  @override
  void initState() {
    super.initState();
    _controller = _newController();
  }

  MobileScannerController _newController() {
    return MobileScannerController(
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
    if (mounted) Navigator.of(context).pop(value);
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
              FilledButton(onPressed: onRetry, child: Text(retryLabel)),
              TextButton(onPressed: onClose, child: Text(closeLabel)),
            ],
          ),
        ),
      ),
    );
  }
}
