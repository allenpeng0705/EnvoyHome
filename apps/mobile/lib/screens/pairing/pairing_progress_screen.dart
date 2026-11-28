/// Full-screen handshake waiting room (EnvoyGo `pairing_progress_screen` peer).
///
/// Replaces a bare button spinner so slow LAN/mesh dials stay cancellable and
/// readable — especially App Review / first-pair paths.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import 'pairing_errors.dart';

class PairingProgressResult {
  final bool cancelled;
  final String? error;
  const PairingProgressResult._({this.cancelled = false, this.error});
  const PairingProgressResult.cancelled() : this._(cancelled: true);
  const PairingProgressResult.success() : this._();
  const PairingProgressResult.error(String error) : this._(error: error);
}

typedef PairingConnectFn = Future<void> Function();

class PairingProgressScreen extends StatefulWidget {
  const PairingProgressScreen({
    super.key,
    required this.connect,
    this.onCancelRequested,
    this.titleHint,
  });

  final PairingConnectFn connect;
  /// Best-effort abort (soft-pause / dispose). Called when the user confirms cancel.
  final Future<void> Function()? onCancelRequested;
  final String? titleHint;

  @override
  State<PairingProgressScreen> createState() => _PairingProgressScreenState();
}

class _PairingProgressScreenState extends State<PairingProgressScreen> {
  Timer? _ticker;
  Duration _elapsed = Duration.zero;
  bool _started = false;
  bool _cancelled = false;
  bool _popped = false;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _popped) return;
      setState(() => _elapsed = _elapsed + const Duration(seconds: 1));
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _started) return;
      _started = true;
      unawaited(_run());
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  void _safePop(PairingProgressResult result) {
    if (!mounted || _popped) return;
    _popped = true;
    _ticker?.cancel();
    Navigator.of(context).pop(result);
  }

  Future<void> _run() async {
    try {
      await widget.connect();
      if (_cancelled) {
        _safePop(const PairingProgressResult.cancelled());
        return;
      }
      _safePop(const PairingProgressResult.success());
    } catch (e) {
      if (_cancelled) {
        _safePop(const PairingProgressResult.cancelled());
        return;
      }
      _safePop(PairingProgressResult.error(_friendlyError(e)));
    }
  }

  String _friendlyError(Object e) {
    if (!mounted) {
      final raw = e
          .toString()
          .replaceFirst('Bad state: ', '')
          .replaceFirst('Exception: ', '')
          .replaceFirst('StateError: ', '');
      return raw.trim().isEmpty ? 'Connection failed' : raw;
    }
    return pairingFriendlyError(e, AppLocalizations.of(context));
  }

  String _formatElapsed(Duration d) {
    final mm = d.inMinutes.remainder(60).toString();
    final ss = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$mm:$ss';
  }

  ({String label, String hint}) _stageFor(Duration elapsed, AppLocalizations l10n) {
    final secs = elapsed.inSeconds;
    if (secs < 10) {
      return (label: l10n.pairStageInitial, hint: l10n.pairStageInitialHint);
    }
    if (secs < 30) {
      return (label: l10n.pairStageConnecting, hint: l10n.pairStageConnectingHint);
    }
    if (secs < 60) {
      return (label: l10n.pairStageHandshaking, hint: l10n.pairStageHandshakingHint);
    }
    if (secs < 90) {
      return (label: l10n.pairStageVerifying, hint: l10n.pairStageSlowHint);
    }
    return (label: l10n.pairStageVerifying, hint: l10n.pairStageVerySlowHint);
  }

  Future<void> _onCancelPressed() async {
    if (_cancelled) return;
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.pairCancelConfirmTitle),
        content: Text(l10n.pairCancelConfirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.pairKeepWaiting),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.pairCancel),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted || _popped) return;
    setState(() => _cancelled = true);
    _ticker?.cancel();
    final onCancel = widget.onCancelRequested;
    if (onCancel != null) {
      try {
        await onCancel();
      } catch (_) {/* best-effort */}
    }
    _safePop(const PairingProgressResult.cancelled());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final stage = _stageFor(_elapsed, l10n);
    final hint = widget.titleHint;

    return PopScope(
      canPop: false,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.pairProgressTitle),
          automaticallyImplyLeading: false,
        ),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            child: Column(
              children: [
                const SizedBox(height: 12),
                Icon(Icons.link, size: 48, color: theme.colorScheme.primary),
                const SizedBox(height: 16),
                Text(
                  l10n.pairProgressSubtitle,
                  style: theme.textTheme.titleMedium,
                  textAlign: TextAlign.center,
                ),
                if (hint != null && hint.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    hint,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
                const SizedBox(height: 32),
                const SizedBox(
                  width: 56,
                  height: 56,
                  child: CircularProgressIndicator(strokeWidth: 5),
                ),
                const SizedBox(height: 24),
                Text(
                  l10n.pairElapsed(_formatElapsed(_elapsed)),
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  stage.label,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  stage.hint,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    height: 1.35,
                  ),
                  textAlign: TextAlign.center,
                ),
                if (_elapsed.inSeconds >= 30) ...[
                  const SizedBox(height: 20),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primaryContainer
                          .withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Text(
                      l10n.pairStillWorking,
                      style: theme.textTheme.bodySmall?.copyWith(height: 1.35),
                    ),
                  ),
                ],
                if (_elapsed.inSeconds >= 120) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      border: Border.all(color: theme.colorScheme.outlineVariant),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Text(
                      l10n.pairTroubleHint,
                      style: theme.textTheme.bodySmall?.copyWith(height: 1.35),
                    ),
                  ),
                ],
                const Spacer(),
                Text(
                  l10n.pairDontClose,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: _cancelled ? null : () => unawaited(_onCancelPressed()),
                  child: Text(l10n.pairCancel),
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
