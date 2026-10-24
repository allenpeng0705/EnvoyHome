import 'dart:async';

import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../state/session_controller.dart';

enum _WfEditorMode { yaml, diagram }

class _WfStep {
  const _WfStep({required this.id, this.type, this.tool});
  final String id;
  final String? type;
  final String? tool;
}

/// Full-screen workflow authoring: AI draft + YAML ↔ Diagram (V-UX-9 phone parity).
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
  List<_WfStep> _steps = [];
  List<Map<String, dynamic>> _tools = [];
  _WfEditorMode _mode = _WfEditorMode.yaml;

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
    final snippet = '\n  - id: step_${_steps.length + 1}\n'
        '    type: tool\n'
        '    tool: $name\n';
    _yamlCtrl.text = '${_yamlCtrl.text.trimRight()}$snippet';
    _parseSteps(_yamlCtrl.text);
    setState(() {});
  }

  @override
  void dispose() {
    _idCtrl.dispose();
    _yamlCtrl.dispose();
    _promptCtrl.dispose();
    super.dispose();
  }

  void _parseSteps(String yaml) {
    final steps = <_WfStep>[];
    String? curId;
    String? curType;
    String? curTool;
    void flush() {
      if (curId != null && curId!.isNotEmpty) {
        steps.add(_WfStep(id: curId!, type: curType, tool: curTool));
      }
      curId = null;
      curType = null;
      curTool = null;
    }

    for (final raw in yaml.split('\n')) {
      final line = raw.trimRight();
      final t = line.trimLeft();
      final indent = line.length - t.length;
      if (t.startsWith('- id:')) {
        flush();
        curId = t.substring(5).trim();
      } else if (indent >= 2 && t.startsWith('id:') && curId == null) {
        // Top-level workflow id — skip for steps.
        continue;
      } else if (curId != null && t.startsWith('type:')) {
        curType = t.substring(5).trim();
      } else if (curId != null && t.startsWith('tool:')) {
        curTool = t.substring(5).trim();
      } else if (t.startsWith('- id:') == false &&
          t.startsWith('- ') &&
          indent <= 2 &&
          curId != null) {
        flush();
      }
    }
    flush();
    _steps = steps;
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
      _parseSteps(yaml);
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
      _parseSteps(yaml);
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
      _parseSteps(yaml);
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

  Widget _diagram(AppLocalizations l10n, ThemeData theme) {
    if (_steps.isEmpty) {
      return Text(l10n.wfDiagramEmpty, style: theme.textTheme.bodySmall);
    }
    return Column(
      children: [
        for (var i = 0; i < _steps.length; i++) ...[
          if (i > 0)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Text(l10n.wfDiagramEdge, style: theme.textTheme.titleMedium),
            ),
          Card(
            child: ListTile(
              leading: CircleAvatar(
                radius: 14,
                child: Text('${i + 1}', style: const TextStyle(fontSize: 12)),
              ),
              title: Text(_steps[i].id),
              subtitle: Text(
                [
                  if (_steps[i].type != null) _steps[i].type!,
                  if (_steps[i].tool != null) 'tool: ${_steps[i].tool}',
                ].join(' · '),
              ),
            ),
          ),
        ],
      ],
    );
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
          SegmentedButton<_WfEditorMode>(
            segments: [
              ButtonSegment(value: _WfEditorMode.diagram, label: Text(l10n.wfModeDiagram)),
              ButtonSegment(value: _WfEditorMode.yaml, label: Text(l10n.wfModeYaml)),
            ],
            selected: {_mode},
            onSelectionChanged: (s) => setState(() => _mode = s.first),
          ),
          const SizedBox(height: 12),
          if (_mode == _WfEditorMode.diagram) ...[
            Text(l10n.wfDiagramNodes, style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            _diagram(l10n, theme),
          ] else ...[
            if (_tools.isNotEmpty) ...[
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
              const SizedBox(height: 12),
            ],
            Text(l10n.wfYaml, style: theme.textTheme.titleSmall),
            TextField(
              controller: _yamlCtrl,
              minLines: 12,
              maxLines: 24,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
              decoration: const InputDecoration(border: OutlineInputBorder()),
              onChanged: (v) => setState(() => _parseSteps(v)),
            ),
          ],
          if (_busy) const LinearProgressIndicator(),
        ],
      ),
    );
  }
}
