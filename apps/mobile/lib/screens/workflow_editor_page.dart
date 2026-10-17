import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';

/// Full-screen workflow authoring: AI draft + YAML (+ simple node list as phone DAG).
class WorkflowEditorPage extends StatefulWidget {
  const WorkflowEditorPage({
    super.key,
    required this.session,
    this.workflowId,
  });

  final SessionController session;
  final String? workflowId;

  @override
  State<WorkflowEditorPage> createState() => _WorkflowEditorPageState();
}

class _WorkflowEditorPageState extends State<WorkflowEditorPage> {
  final _idCtrl = TextEditingController();
  final _yamlCtrl = TextEditingController();
  final _promptCtrl = TextEditingController();
  String? _error;
  String? _note;
  bool _busy = false;
  List<String> _nodes = [];
  List<Map<String, dynamic>> _tools = [];

  @override
  void initState() {
    super.initState();
    if (widget.workflowId != null) {
      _idCtrl.text = widget.workflowId!;
      unawaited(_load());
    } else {
      _idCtrl.text = 'wf-${DateTime.now().millisecondsSinceEpoch}';
    }
    unawaited(_loadTools());
  }

  Future<void> _loadTools() async {
    final home = widget.session.session;
    if (home == null) return;
    try {
      final body = await home.listWorkflowTools();
      final raw = body['tools'];
      final list = <Map<String, dynamic>>[];
      if (raw is List) {
        for (final t in raw) {
          if (t is Map) list.add(Map<String, dynamic>.from(t));
        }
      }
      if (mounted) setState(() => _tools = list);
    } catch (_) {}
  }

  void _insertTool(String name) {
    final snippet = '\n  - id: step_${_nodes.length + 1}\n'
        '    type: tool\n'
        '    tool: $name\n';
    _yamlCtrl.text = '${_yamlCtrl.text.trimRight()}$snippet';
    _parseNodes(_yamlCtrl.text);
    setState(() {});
  }

  @override
  void dispose() {
    _idCtrl.dispose();
    _yamlCtrl.dispose();
    _promptCtrl.dispose();
    super.dispose();
  }

  void _parseNodes(String yaml) {
    final nodes = <String>[];
    for (final line in yaml.split('\n')) {
      final t = line.trimLeft();
      if (t.startsWith('- id:') || t.startsWith('id:')) {
        nodes.add(t.replaceFirst(RegExp(r'^-?\s*id:\s*'), '').trim());
      }
    }
    _nodes = nodes;
  }

  Future<void> _load() async {
    final home = widget.session.session;
    final id = widget.workflowId;
    if (home == null || id == null) return;
    setState(() => _busy = true);
    try {
      final body = await home.getWorkflow(id: id);
      final yaml = body['yaml']?.toString() ?? '';
      _yamlCtrl.text = yaml;
      _parseNodes(yaml);
      if (mounted) setState(() {});
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _draft() async {
    final home = widget.session.session;
    final accountId = widget.session.accountId;
    final prompt = _promptCtrl.text.trim();
    if (home == null || accountId == null || prompt.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final body = await home.draftWorkflow(
        accountId: accountId,
        text: prompt,
        currentYaml: _yamlCtrl.text.trim().isEmpty ? null : _yamlCtrl.text,
      );
      final yaml = body['yaml']?.toString() ?? '';
      _yamlCtrl.text = yaml;
      _parseNodes(yaml);
      if (mounted) setState(() => _note = AppLocalizations.of(context).wfDrafted);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _validateSave() async {
    final home = widget.session.session;
    if (home == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      var yaml = _yamlCtrl.text;
      // Ensure id is present for new workflows when YAML lacks one.
      if (!yaml.contains(RegExp(r'^id:\s*', multiLine: true)) &&
          _idCtrl.text.trim().isNotEmpty) {
        yaml = 'id: ${_idCtrl.text.trim()}\n$yaml';
        _yamlCtrl.text = yaml;
      }
      await home.validateWorkflow(yaml: yaml);
      await home.putWorkflow(
        yaml: yaml,
        accountId: widget.session.accountId,
      );
      _parseNodes(yaml);
      if (mounted) {
        setState(() => _note = AppLocalizations.of(context).wfSaved);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context).wfSaved)),
        );
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _run() async {
    final home = widget.session.session;
    final id = _idCtrl.text.trim();
    if (home == null || id.isEmpty) return;
    try {
      await home.runWorkflow(id: id, accountId: widget.session.accountId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context).wfRan)),
        );
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.wfEditorTitle),
        actions: [
          IconButton(
            tooltip: l10n.wfRun,
            onPressed: _busy ? null : _run,
            icon: const Icon(Icons.play_arrow),
          ),
          IconButton(
            tooltip: l10n.wfSave,
            onPressed: _busy ? null : _validateSave,
            icon: const Icon(Icons.save_outlined),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null)
            Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
          if (_note != null) Text(_note!, style: theme.textTheme.bodySmall),
          TextField(
            controller: _idCtrl,
            decoration: InputDecoration(labelText: l10n.wfId),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _promptCtrl,
            minLines: 2,
            maxLines: 4,
            decoration: InputDecoration(
              labelText: l10n.wfAiPrompt,
              hintText: l10n.wfAiPromptHint,
            ),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.tonal(
              onPressed: _busy ? null : _draft,
              child: Text(l10n.wfAiDraft),
            ),
          ),
          const SizedBox(height: 8),
          Text(l10n.wfDiagramNodes, style: theme.textTheme.titleSmall),
          if (_nodes.isEmpty)
            Text(l10n.wfNoNodes, style: theme.textTheme.bodySmall)
          else
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final n in _nodes)
                  Chip(label: Text(n), visualDensity: VisualDensity.compact),
              ],
            ),
          if (_tools.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(l10n.wfTools, style: theme.textTheme.titleSmall),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final t in _tools.take(24))
                  ActionChip(
                    label: Text(
                      t['name']?.toString() ?? t['id']?.toString() ?? '?',
                    ),
                    onPressed: () => _insertTool(
                      t['name']?.toString() ?? t['id']?.toString() ?? '',
                    ),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          Text(l10n.wfYaml, style: theme.textTheme.titleSmall),
          TextField(
            controller: _yamlCtrl,
            minLines: 12,
            maxLines: 24,
            style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
            decoration: const InputDecoration(border: OutlineInputBorder()),
            onChanged: (v) => setState(() => _parseNodes(v)),
          ),
          if (_busy) const LinearProgressIndicator(),
        ],
      ),
    );
  }
}
