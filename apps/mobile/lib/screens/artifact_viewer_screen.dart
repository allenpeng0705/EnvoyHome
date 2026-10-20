import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';

/// In-app artifact open — peer EnvoyMesh Feed `BrowserScreen` + `libraryRead`.
/// Fetches bytes over the paired `home.*` session so the phone never needs a
/// public `publicBaseUrl` / HTTPS reachability to the home daemon.
/// Binary exports (docx/pdf/…) use Share/Save via the OS sheet.
class ArtifactViewerScreen extends StatefulWidget {
  const ArtifactViewerScreen({
    super.key,
    required this.session,
    required this.path,
    this.title,
  });

  final SessionController session;
  final String path;
  final String? title;

  @override
  State<ArtifactViewerScreen> createState() => _ArtifactViewerScreenState();
}

class _ArtifactViewerScreenState extends State<ArtifactViewerScreen> {
  bool _loading = true;
  bool _sharing = false;
  bool _copying = false;
  bool _openingBrowser = false;
  String? _error;
  String? _mimeType;
  String? _text;
  Uint8List? _bytes;
  String? _signedUrl;

  String get _fileName {
    final p = widget.path.replaceAll(r'\', '/');
    final slash = p.lastIndexOf('/');
    return slash >= 0 ? p.substring(slash + 1) : p;
  }

  bool get _canShare =>
      !_loading && _error == null && (_bytes != null || _text != null);

  bool get _canCopyLink =>
      !_loading && _error == null && _signedUrl != null && _signedUrl!.isNotEmpty;

  bool get _canOpenInBrowser => _canCopyLink;

  bool _isReachablePublicUrl(String url) {
    try {
      final u = Uri.parse(url);
      final h = u.host.toLowerCase();
      return h.isNotEmpty &&
          h != '127.0.0.1' &&
          h != 'localhost' &&
          h != '::1';
    } catch (_) {
      return false;
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_load());
    });
  }

  Future<void> _load() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    final l10n = AppLocalizations.of(context);
    if (home == null || accountId == null) {
      setState(() {
        _loading = false;
        _error = l10n.artifactsNeedAccount;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final body = await home.getArtifactContent(
        accountId: accountId,
        path: widget.path,
      );
      final mime = body['mimeType']?.toString() ?? 'application/octet-stream';
      final encoding = body['encoding']?.toString();
      String? text;
      Uint8List? bytes;
      if (encoding == 'utf8') {
        text = body['text']?.toString() ?? '';
      } else {
        final b64 = body['base64']?.toString();
        if (b64 != null && b64.isNotEmpty) {
          bytes = Uint8List.fromList(base64Decode(b64));
        }
      }
      String? signed;
      final pathNorm = widget.path.replaceAll(r'\', '/');
      if (!pathNorm.startsWith('workspace/')) {
        try {
          final minted = await home.getArtifactUrl(
            accountId: accountId,
            path: widget.path,
          );
          final url = minted['url']?.toString();
          if (url != null && _isReachablePublicUrl(url)) signed = url;
        } catch (_) {
          /* optional signed link */
        }
      }
      if (!mounted) return;
      setState(() {
        _mimeType = mime;
        _text = text;
        _bytes = bytes;
        _signedUrl = signed;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      final raw = '$e';
      final tooLarge = RegExp(r'8 MiB|exceeds .*bytes', caseSensitive: false)
          .hasMatch(raw);
      setState(() {
        _loading = false;
        _error = tooLarge ? l10n.artifactsTooLarge : l10n.artifactsOpenFailed(raw);
      });
    }
  }

  Future<void> _copySignedLink() async {
    final url = _signedUrl;
    if (url == null || url.isEmpty || _copying) return;
    final l10n = AppLocalizations.of(context);
    setState(() => _copying = true);
    try {
      await Clipboard.setData(ClipboardData(text: url));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.artifactsLinkCopied)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.artifactsCopyLinkFailed)),
      );
    } finally {
      if (mounted) setState(() => _copying = false);
    }
  }

  Future<void> _openInBrowser() async {
    final url = _signedUrl;
    if (url == null || url.isEmpty || _openingBrowser) return;
    final l10n = AppLocalizations.of(context);
    setState(() => _openingBrowser = true);
    try {
      final uri = Uri.parse(url);
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.artifactsOpenInBrowserFailed)),
        );
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.artifactsOpenInBrowserFailed)),
      );
    } finally {
      if (mounted) setState(() => _openingBrowser = false);
    }
  }

  Future<void> _share() async {
    if (!_canShare || _sharing) return;
    final l10n = AppLocalizations.of(context);
    setState(() => _sharing = true);
    try {
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/$_fileName');
      if (_bytes != null) {
        await file.writeAsBytes(_bytes!, flush: true);
      } else {
        await file.writeAsString(_text ?? '', flush: true);
      }
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: _mimeType, name: _fileName)],
          subject: _fileName,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.artifactsShareFailed('$e'))),
      );
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context);
    final title = (widget.title?.trim().isNotEmpty == true)
        ? widget.title!.trim()
        : _fileName;

    return Scaffold(
      appBar: AppBar(
        title: Text(title, overflow: TextOverflow.ellipsis),
        actions: [
          if (_canOpenInBrowser)
            IconButton(
              tooltip: l10n.artifactsOpenInBrowser,
              onPressed:
                  _openingBrowser ? null : () => unawaited(_openInBrowser()),
              icon: const Icon(Icons.open_in_browser),
            ),
          if (_canCopyLink)
            IconButton(
              tooltip: l10n.artifactsCopyLink,
              onPressed: _copying ? null : () => unawaited(_copySignedLink()),
              icon: const Icon(Icons.link),
            ),
          if (_canShare)
            IconButton(
              tooltip: l10n.artifactsShare,
              onPressed: _sharing ? null : () => unawaited(_share()),
              icon: _sharing
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.share_outlined),
            ),
          IconButton(
            tooltip: l10n.artifactsRefresh,
            onPressed: _loading ? null : () => unawaited(_load()),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _buildBody(theme, l10n),
    );
  }

  Widget _buildBody(ThemeData theme, AppLocalizations l10n) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => unawaited(_load()),
                child: Text(l10n.artifactsRetry),
              ),
            ],
          ),
        ),
      );
    }
    final mime = (_mimeType ?? '').toLowerCase();
    if (mime.startsWith('image/') && _bytes != null) {
      return InteractiveViewer(
        child: Center(child: Image.memory(_bytes!, fit: BoxFit.contain)),
      );
    }
    if (_text != null) {
      final data = _text!;
      if (mime.contains('markdown') || widget.path.toLowerCase().endsWith('.md')) {
        return Markdown(
          data: data,
          selectable: true,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          styleSheet: MarkdownStyleSheet.fromTheme(theme),
        );
      }
      return SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        child: SelectableText(
          data,
          style: theme.textTheme.bodyMedium?.copyWith(height: 1.45),
        ),
      );
    }
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              l10n.artifactsBinaryHint,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _sharing ? null : () => unawaited(_share()),
              icon: const Icon(Icons.share_outlined),
              label: Text(l10n.artifactsShare),
            ),
          ],
        ),
      ),
    );
  }
}
