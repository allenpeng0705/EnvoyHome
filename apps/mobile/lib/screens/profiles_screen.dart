import 'dart:async';

import 'package:flutter/material.dart';

import '../device_privacy.dart';
import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';
import 'home_folder_browser_screen.dart';

/// Profiles + per-seat workspace (Design §10.1 accounts / account.detail / §4.1.1).
/// When [embedded] is true (System → Profiles tab), omit the Scaffold/AppBar.
class ProfilesScreen extends StatefulWidget {
  const ProfilesScreen({
    super.key,
    required this.session,
    this.embedded = false,
  });

  final SessionController session;
  final bool embedded;

  @override
  State<ProfilesScreen> createState() => _ProfilesScreenState();
}

class _ProfilesScreenState extends State<ProfilesScreen> {
  List<Map<String, dynamic>> _accounts = [];
  final Map<String, Map<String, dynamic>> _workspaceById = {};
  final Set<String> _workspaceDenied = {};
  String? _ownerAccountId;
  String? _error;
  bool _busy = false;
  bool _shareLocation = false;
  bool _shareLocationBusy = false;

  bool get _isOwnerDevice {
    final owner = _ownerAccountId;
    if (owner == null || owner.isEmpty) return false;
    final ids = _helloAccountIds;
    return ids.length == 1 && ids.first == owner;
  }

  List<String> get _helloAccountIds {
    final raw = widget.session.hello?['accountIds'];
    if (raw is! List) return const [];
    return raw.map((e) => e.toString()).where((s) => s.isNotEmpty).toList();
  }

  @override
  void initState() {
    super.initState();
    unawaited(_reload());
  }

  Future<void> _reload() async {
    final shareLoc = await getShareLocationWithHome();
    if (mounted) setState(() => _shareLocation = shareLoc);
    final home = widget.session.session;
    if (home == null) return;
    setState(() => _busy = true);
    try {
      final listed = await home.listAccounts();
      final accountsRaw = listed['accounts'];
      final accounts = <Map<String, dynamic>>[];
      if (accountsRaw is List) {
        for (final a in accountsRaw) {
          if (a is Map) accounts.add(Map<String, dynamic>.from(a));
        }
      }

      String? ownerId;
      try {
        final own = await home.getHouseholdOwner();
        ownerId = own['ownerAccountId']?.toString();
      } catch (_) {
        ownerId = null;
      }

      final wsMap = <String, Map<String, dynamic>>{};
      final denied = <String>{};
      await Future.wait(
        accounts.map((a) async {
          final id = a['accountId']?.toString();
          if (id == null || id.isEmpty) return;
          try {
            final ws = await home.getWorkspace(accountId: id);
            wsMap[id] = Map<String, dynamic>.from(ws);
          } catch (_) {
            denied.add(id);
          }
        }),
      );

      if (!mounted) return;
      setState(() {
        _accounts = accounts;
        _ownerAccountId = ownerId;
        _workspaceById
          ..clear()
          ..addAll(wsMap);
        _workspaceDenied
          ..clear()
          ..addAll(denied);
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _setShareLocation(bool enabled) async {
    final l10n = AppLocalizations.of(context);
    setState(() => _shareLocationBusy = true);
    try {
      if (enabled) {
        final granted = await requestLocationPermissionForHome();
        if (!granted) {
          await setShareLocationWithHome(false);
          if (!mounted) return;
          setState(() => _shareLocation = false);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(l10n.profilesShareLocationDenied)),
          );
          return;
        }
      }
      await setShareLocationWithHome(enabled);
      if (!mounted) return;
      setState(() => _shareLocation = enabled);
      if (enabled) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.profilesShareLocationOn)),
        );
      }
    } finally {
      if (mounted) setState(() => _shareLocationBusy = false);
    }
  }

  Future<void> _createProfile() async {
    final l10n = AppLocalizations.of(context);
    final nameCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.profilesAddTitle),
        content: TextField(
          controller: nameCtrl,
          autofocus: true,
          decoration: InputDecoration(labelText: l10n.shellProfileDisplayName),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.shellCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.shellCreate),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final name = nameCtrl.text.trim();
    if (name.isEmpty) return;
    final home = widget.session.session;
    if (home == null) return;
    try {
      await home.createAccount(displayName: name);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.shellProfileCreated)),
        );
      }
      await _reload();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.shellProfileCreateFailed('$e'))),
        );
      }
    }
  }

  Future<void> _transferTo(String toAccountId, String label) async {
    final l10n = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.profilesTransferTitle),
        content: Text(l10n.profilesTransferBody(label)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.shellCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.profilesTransferConfirm),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final home = widget.session.session;
    if (home == null) return;
    try {
      await home.transferHouseholdOwner(toAccountId: toAccountId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.profilesTransferDone(label))),
        );
      }
      await _reload();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.profilesTransferFailed('$e'))),
        );
      }
    }
  }

  Future<void> _removeWorkspaceMount(String accountId, String mountId) async {
    final home = widget.session.session;
    if (home == null || mountId.isEmpty) return;
    try {
      await home.removeWorkspaceMount(accountId: accountId, id: mountId);
      await _reload();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    }
  }

  Future<void> _editWorkspace(Map<String, dynamic> account) async {
    final l10n = AppLocalizations.of(context);
    final accountId = account['accountId']?.toString() ?? '';
    if (accountId.isEmpty) return;
    final isOwnerSeat = _ownerAccountId != null && accountId == _ownerAccountId;
    final ws = _workspaceById[accountId];
    final hasMounts = ws?['configured'] == true;
    // Add-folder sheet: start empty so upsert does not replace existing mounts.
    final pathCtrl = TextEditingController();
    var mode = 'ro';

    final applied = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: StatefulBuilder(
            builder: (ctx, setLocal) {
              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    l10n.profilesWorkspaceEdit,
                    style: Theme.of(ctx).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    l10n.profilesWorkspaceHint,
                    style: Theme.of(ctx).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: pathCtrl,
                    readOnly: true,
                    onTap: () async {
                      final picked = await HomeFolderBrowserScreen.open(
                        ctx,
                        session: widget.session,
                        initialPath: pathCtrl.text.trim().isNotEmpty
                            ? pathCtrl.text.trim()
                            : null,
                        title: l10n.profilesWorkspaceBrowse,
                      );
                      if (picked != null && picked.isNotEmpty) {
                        setLocal(() => pathCtrl.text = picked);
                      }
                    },
                    decoration: InputDecoration(
                      labelText: l10n.profilesWorkspacePath,
                      hintText: l10n.profilesWorkspaceBrowseHint,
                      suffixIcon: IconButton(
                        tooltip: l10n.profilesWorkspaceBrowse,
                        icon: const Icon(Icons.folder_open_outlined),
                        onPressed: () async {
                          final picked = await HomeFolderBrowserScreen.open(
                            ctx,
                            session: widget.session,
                            initialPath: pathCtrl.text.trim().isNotEmpty
                                ? pathCtrl.text.trim()
                                : null,
                            title: l10n.profilesWorkspaceBrowse,
                          );
                          if (picked != null && picked.isNotEmpty) {
                            setLocal(() => pathCtrl.text = picked);
                          }
                        },
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SegmentedButton<String>(
                    segments: [
                      ButtonSegment(value: 'ro', label: Text(l10n.profilesWorkspaceRo)),
                      ButtonSegment(value: 'rw', label: Text(l10n.profilesWorkspaceRw)),
                    ],
                    selected: {mode},
                    onSelectionChanged: (s) => setLocal(() => mode = s.first),
                  ),
                  const SizedBox(height: 12),
                  if (isOwnerSeat)
                    OutlinedButton.icon(
                      onPressed: () async {
                        // Home-machine roots from daemon — not the phone OS.
                        var root = '/';
                        try {
                          final home = widget.session.session;
                          if (home != null) {
                            final info = await home.getHomeFsInfo();
                            final roots = info['roots'];
                            final platform = info['platform']?.toString();
                            final list = <String>[];
                            if (roots is List) {
                              for (final r in roots) {
                                final s = r?.toString() ?? '';
                                if (s.isNotEmpty) list.add(s);
                              }
                            }
                            if (platform == 'win32' ||
                                list.any((r) => RegExp(r'^[A-Za-z]:').hasMatch(r))) {
                              root = list.firstWhere(
                                (r) => RegExp(r'^C:[\\/]?$', caseSensitive: false)
                                    .hasMatch(r.trim()),
                                orElse: () => list.isNotEmpty ? list.first : r'C:\',
                              );
                            } else if (list.isNotEmpty) {
                              root = list.first;
                            }
                          }
                        } catch (_) {
                          root = '/';
                        }
                        pathCtrl.text = root;
                        setLocal(() {});
                      },
                      icon: const Icon(Icons.computer),
                      label: Text(l10n.profilesWorkspaceUseRoot),
                    ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      if (hasMounts)
                        TextButton(
                          onPressed: () async {
                            final home = widget.session.session;
                            if (home == null) return;
                            try {
                              await home.clearWorkspace(accountId: accountId);
                              if (ctx.mounted) Navigator.pop(ctx, true);
                            } catch (e) {
                              if (ctx.mounted) {
                                ScaffoldMessenger.of(ctx).showSnackBar(
                                  SnackBar(content: Text('$e')),
                                );
                              }
                            }
                          },
                          child: Text(l10n.profilesWorkspaceClear),
                        ),
                      const Spacer(),
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, false),
                        child: Text(l10n.shellCancel),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(
                        onPressed: () async {
                          final path = pathCtrl.text.trim();
                          if (path.isEmpty) return;
                          final isRoot = path == '/' ||
                              path == '/System/Volumes/Data' ||
                              RegExp(r'^[A-Za-z]:[\\/]?$').hasMatch(path);
                          final crossSeat = accountId != widget.session.accountId;
                          if (isRoot) {
                            final confirm = await showDialog<bool>(
                              context: ctx,
                              builder: (c2) => AlertDialog(
                                title: Text(l10n.profilesWorkspaceRootTitle),
                                content: Text(l10n.profilesWorkspaceRootBody),
                                actions: [
                                  TextButton(
                                    onPressed: () => Navigator.pop(c2, false),
                                    child: Text(l10n.shellCancel),
                                  ),
                                  FilledButton(
                                    onPressed: () => Navigator.pop(c2, true),
                                    child: Text(l10n.profilesWorkspaceRootOk),
                                  ),
                                ],
                              ),
                            );
                            if (confirm != true) return;
                          } else if (crossSeat) {
                            final name =
                                account['displayName']?.toString() ?? accountId;
                            final confirm = await showDialog<bool>(
                              context: ctx,
                              builder: (c2) => AlertDialog(
                                title: Text(l10n.profilesWorkspaceCrossTitle),
                                content: Text(l10n.profilesWorkspaceCrossBody(name)),
                                actions: [
                                  TextButton(
                                    onPressed: () => Navigator.pop(c2, false),
                                    child: Text(l10n.shellCancel),
                                  ),
                                  FilledButton(
                                    onPressed: () => Navigator.pop(c2, true),
                                    child: Text(l10n.profilesWorkspaceApply),
                                  ),
                                ],
                              ),
                            );
                            if (confirm != true) return;
                          }
                          final home = widget.session.session;
                          if (home == null) return;
                          try {
                            await home.upsertWorkspaceMount(
                              accountId: accountId,
                              hostPath: path,
                              mode: mode,
                            );
                            if (ctx.mounted) Navigator.pop(ctx, true);
                          } catch (e) {
                            if (ctx.mounted) {
                              ScaffoldMessenger.of(ctx).showSnackBar(
                                SnackBar(content: Text('$e')),
                              );
                            }
                          }
                        },
                        child: Text(l10n.profilesWorkspaceApply),
                      ),
                    ],
                  ),
                ],
              );
            },
          ),
        );
      },
    );
    if (applied == true) await _reload();
  }

  Future<void> _setToolPolicy(String accountId, String policy) async {
    final home = widget.session.session;
    if (home == null) return;
    try {
      await home.updateAccount(accountId: accountId, toolPolicy: policy);
      await _reload();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    }
  }

  Future<void> _renameAccount(Map<String, dynamic> account) async {
    final l10n = AppLocalizations.of(context);
    final accountId = account['accountId']?.toString() ?? '';
    if (accountId.isEmpty) return;
    final ctrl = TextEditingController(
      text: account['displayName']?.toString() ?? '',
    );
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.profilesRenameTitle),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: InputDecoration(labelText: l10n.shellProfileDisplayName),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.shellCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.profilesRenameSave),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final name = ctrl.text.trim();
    if (name.isEmpty) return;
    final home = widget.session.session;
    if (home == null) return;
    try {
      await home.updateAccount(accountId: accountId, displayName: name);
      await _reload();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    }
  }

  Future<void> _editTimeZone(Map<String, dynamic> account) async {
    final l10n = AppLocalizations.of(context);
    final accountId = account['accountId']?.toString() ?? '';
    if (accountId.isEmpty) return;
    final ctrl = TextEditingController(
      text: account['timeZone']?.toString() ?? '',
    );
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.profilesTimeZoneTitle),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: InputDecoration(hintText: l10n.profilesTimeZoneHint),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.shellCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.profilesTimeZoneSave),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final tz = ctrl.text.trim();
    if (tz.isEmpty) return;
    final home = widget.session.session;
    if (home == null) return;
    try {
      await home.updateAccount(accountId: accountId, timeZone: tz);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.profilesTimeZoneDone(tz))),
        );
      }
      await _reload();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    }
  }

  Future<void> _deleteAccount(Map<String, dynamic> account) async {
    final l10n = AppLocalizations.of(context);
    final accountId = account['accountId']?.toString() ?? '';
    final name = account['displayName']?.toString() ?? accountId;
    if (accountId.isEmpty) return;
    if (_ownerAccountId != null && accountId == _ownerAccountId) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.profilesDeleteOwnerBlocked)),
      );
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.profilesDeleteTitle),
        content: Text(l10n.profilesDeleteBody(name)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.shellCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.profilesDeleteConfirm),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final home = widget.session.session;
    if (home == null) return;
    try {
      await home.deleteAccount(accountId: accountId, confirm: true, force: true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.profilesDeleteDone(name))),
        );
      }
      await _reload();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final body = RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          if (widget.embedded)
            Row(
              children: [
                Expanded(
                  child: Text(
                    l10n.profilesIntro,
                    style: theme.textTheme.bodySmall,
                  ),
                ),
                if (_isOwnerDevice)
                  IconButton(
                    tooltip: l10n.profilesAddTitle,
                    onPressed: _busy ? null : _createProfile,
                    icon: const Icon(Icons.person_add_alt_1),
                  ),
                IconButton(
                  tooltip: l10n.profilesRefresh,
                  onPressed: _busy ? null : _reload,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            )
          else
            Text(l10n.profilesIntro, style: theme.textTheme.bodySmall),
          if (!_isOwnerDevice) ...[
              const SizedBox(height: 8),
              Text(
                l10n.profilesMemberHint,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.62),
                ),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
            ],
            const SizedBox(height: 12),
            Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: SwitchListTile(
                contentPadding: const EdgeInsets.fromLTRB(16, 4, 12, 4),
                title: Text(l10n.profilesShareLocationTitle),
                subtitle: Text(l10n.profilesShareLocationSubtitle),
                value: _shareLocation,
                onChanged: _shareLocationBusy
                    ? null
                    : (v) => unawaited(_setShareLocation(v)),
              ),
            ),
            if (_busy && _accounts.isEmpty)
              const Center(child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(),
              )),
            ..._accounts.map((a) {
              final id = a['accountId']?.toString() ?? '';
              final name = a['displayName']?.toString() ?? id;
              final isOwner = _ownerAccountId != null && id == _ownerAccountId;
              final isSelf = id == widget.session.accountId;
              final denied = _workspaceDenied.contains(id);
              final ws = _workspaceById[id];
              final mountsRaw = ws?['mounts'];
              final mounts = <Map<String, dynamic>>[];
              if (mountsRaw is List) {
                for (final m in mountsRaw) {
                  if (m is Map) mounts.add(Map<String, dynamic>.from(m));
                }
              } else if (ws?['configured'] == true &&
                  (ws?['displayPath']?.toString().isNotEmpty ?? false)) {
                mounts.add({
                  'id': 'folder',
                  'displayPath': ws?['displayPath'],
                  'mode': ws?['mode'],
                  'filesystemRoot': ws?['filesystemRoot'],
                  'active': ws?['active'],
                });
              }
              final configured = ws?['configured'] == true && mounts.isNotEmpty;
              final pathLabel = denied
                  ? l10n.profilesWorkspaceDenied
                  : configured
                      ? null
                      : l10n.profilesWorkspaceUnset;
              final others = _accounts
                  .where((o) => o['accountId']?.toString() != id)
                  .toList();
              final canRename = _isOwnerDevice || _helloAccountIds.contains(id);

              return Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              name,
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          if (isSelf)
                            Padding(
                              padding: const EdgeInsets.only(left: 8),
                              child: Tooltip(
                                message: l10n.profilesActiveBadge,
                                child: Container(
                                  width: 8,
                                  height: 8,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: const Color(0xFF3D9A6A),
                                    boxShadow: [
                                      BoxShadow(
                                        color: const Color(0xFF3D9A6A)
                                            .withValues(alpha: 0.28),
                                        blurRadius: 0,
                                        spreadRadius: 3,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          if (isOwner)
                            Padding(
                              padding: const EdgeInsets.only(left: 8),
                              child: Text(
                                l10n.profilesOwnerBadge,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.onSurface
                                      .withValues(alpha: 0.55),
                                ),
                              ),
                            ),
                        ],
                      ),
                      Text(id, style: theme.textTheme.bodySmall),
                      Text(
                        (a['timeZone']?.toString().isNotEmpty ?? false)
                            ? l10n.profilesTimeZoneValue(
                                a['timeZone']!.toString(),
                              )
                            : l10n.profilesTimeZoneUnset,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.62),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        l10n.profilesWorkspaceTitle,
                        style: theme.textTheme.labelLarge,
                      ),
                      const SizedBox(height: 4),
                      if (pathLabel != null)
                        Text(
                          pathLabel,
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontFamily: denied ? null : 'monospace',
                          ),
                        )
                      else
                        ...mounts.map((m) {
                          final mp = m['displayPath']?.toString() ?? '';
                          final mid = m['id']?.toString() ?? '';
                          final mRoot = m['filesystemRoot'] == true;
                          final mInactive = m['active'] == false;
                          final mMode = m['mode']?.toString() == 'rw'
                              ? l10n.profilesWorkspaceRw
                              : l10n.profilesWorkspaceRo;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        mp,
                                        style: theme.textTheme.bodySmall
                                            ?.copyWith(fontFamily: 'monospace'),
                                      ),
                                      Text(
                                        [
                                          if (mid.isNotEmpty) mid,
                                          mMode,
                                          if (mRoot)
                                            l10n.profilesWorkspaceWholeMachine,
                                          if (mInactive)
                                            l10n.profilesWorkspaceInactive,
                                        ].join(' · '),
                                        style: theme.textTheme.labelSmall
                                            ?.copyWith(
                                          color: mInactive
                                              ? theme.colorScheme.error
                                              : null,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                if (_isOwnerDevice && mid.isNotEmpty)
                                  IconButton(
                                    tooltip: l10n.profilesWorkspaceRemove,
                                    visualDensity: VisualDensity.compact,
                                    icon: const Icon(Icons.close, size: 18),
                                    onPressed: () =>
                                        _removeWorkspaceMount(id, mid),
                                  ),
                              ],
                            ),
                          );
                        }),
                      const SizedBox(height: 8),
                      if (_isOwnerDevice) ...[
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            OutlinedButton.icon(
                              onPressed: () => _editWorkspace(a),
                              icon: const Icon(Icons.folder_outlined, size: 18),
                              label: Text(l10n.profilesWorkspaceEdit),
                            ),
                            OutlinedButton.icon(
                              onPressed: () => _renameAccount(a),
                              icon: const Icon(Icons.edit_outlined, size: 18),
                              label: Text(l10n.profilesRename),
                            ),
                            OutlinedButton.icon(
                              onPressed: () => _editTimeZone(a),
                              icon: const Icon(Icons.schedule_outlined, size: 18),
                              label: Text(l10n.profilesTimeZoneEdit),
                            ),
                            if (!isOwner)
                              OutlinedButton.icon(
                                onPressed: () => _deleteAccount(a),
                                icon: const Icon(Icons.delete_outline, size: 18),
                                label: Text(l10n.profilesDelete),
                              ),
                            if (isOwner && others.isNotEmpty)
                              ...others.map((o) {
                                final oid = o['accountId']?.toString() ?? '';
                                final oname =
                                    o['displayName']?.toString() ?? oid;
                                return OutlinedButton(
                                  onPressed: () => _transferTo(oid, oname),
                                  child: Text(l10n.profilesTransferTo(oname)),
                                );
                              }),
                            PopupMenuButton<String>(
                              tooltip: l10n.profilesToolPolicy,
                              onSelected: (v) => _setToolPolicy(id, v),
                              itemBuilder: (_) => [
                                PopupMenuItem(
                                  value: 'standard',
                                  child: Text(l10n.profilesToolPolicyStandard),
                                ),
                                PopupMenuItem(
                                  value: 'restricted',
                                  child: Text(l10n.profilesToolPolicyRestricted),
                                ),
                              ],
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 8,
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      Icons.shield_outlined,
                                      size: 18,
                                      color: theme.colorScheme.primary,
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      l10n.profilesToolPolicy,
                                      style: theme.textTheme.labelLarge?.copyWith(
                                        color: theme.colorScheme.primary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ] else ...[
                        Text(
                          l10n.profilesWorkspaceMemberNote,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.62),
                          ),
                        ),
                        if (canRename) ...[
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              OutlinedButton.icon(
                                onPressed: () => _renameAccount(a),
                                icon: const Icon(Icons.edit_outlined, size: 18),
                                label: Text(l10n.profilesRename),
                              ),
                              OutlinedButton.icon(
                                onPressed: () => _editTimeZone(a),
                                icon: const Icon(Icons.schedule_outlined, size: 18),
                                label: Text(l10n.profilesTimeZoneEdit),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );

    if (widget.embedded) return body;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.navProfiles),
        actions: [
          if (_isOwnerDevice)
            IconButton(
              tooltip: l10n.profilesAddTitle,
              onPressed: _busy ? null : _createProfile,
              icon: const Icon(Icons.person_add_alt_1),
            ),
          IconButton(
            tooltip: l10n.profilesRefresh,
            onPressed: _busy ? null : _reload,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: body,
    );
  }
}
