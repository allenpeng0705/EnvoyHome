// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Korean (`ko`).
class AppLocalizationsKo extends AppLocalizations {
  AppLocalizationsKo([String locale = 'ko']) : super(locale);

  @override
  String get appName => 'EnvoyHome';

  @override
  String get appLanguage => '언어';

  @override
  String get appThemePicker => '모양';

  @override
  String get appThemeSystem => '시스템';

  @override
  String get appThemeLight => '라이트';

  @override
  String get appThemeDark => '다크';

  @override
  String get pairLede =>
      'EnvoyMesh로 홈 데스크톱에 연결 — QR 스캔, host:port 입력, 또는 SSH 경유.';

  @override
  String get pairTabLink => '링크';

  @override
  String get pairTabHost => '호스트:포트';

  @override
  String get pairTabSsh => 'SSH';

  @override
  String get pairFooter => 'com.envoymesh.envoyhome · 페어링 후 푸시';

  @override
  String get pairCloseScanner => '스캐너 닫기';

  @override
  String get pairScanQr => '페어링 QR 스캔';

  @override
  String get pairUriLabel => '페어링 URI';

  @override
  String get pairUriHint => 'envoy://pair?…&app=EnvoyHome';

  @override
  String get pairConnect => '연결';

  @override
  String get pairDirectHint =>
      '이 네트워크(LAN / Tailscale)에서 데스크톱에 연결합니다. 토큰이 필요합니다.';

  @override
  String get pairHostPort => '호스트:포트';

  @override
  String get pairHostPortHint => '192.168.1.10:4780';

  @override
  String get pairToken => '페어링 토큰';

  @override
  String get pairTokenHelper => '데스크톱 설정 → 기기 페어링';

  @override
  String get pairSshHint => 'SSH 홉으로 터널링합니다. 데몬은 루프백을 봅니다 — 토큰은 선택.';

  @override
  String get pairSshHost => 'SSH 호스트';

  @override
  String get pairSshUser => '사용자';

  @override
  String get pairSshUserHint => 'root';

  @override
  String get pairSshPort => '포트';

  @override
  String get pairSshPassword => 'SSH 비밀번호';

  @override
  String get pairDaemon => '원격 데몬';

  @override
  String get pairDaemonHint => '127.0.0.1:4780';

  @override
  String get pairTokenOptional => '토큰(선택)';

  @override
  String get shellOnline => '온라인';

  @override
  String get shellDegraded => '저하';

  @override
  String get shellOffline => '오프라인';

  @override
  String get shellConnect => '연결';

  @override
  String get shellReconnect => '다시 연결';

  @override
  String get shellDisconnect => '연결 해제';

  @override
  String get shellForgetPairing => '페어링 지우기';

  @override
  String get connectGuideTitle => '홈에 연결';

  @override
  String get connectGuideHint =>
      '데스크톱에서 설정 → 기기 페어링의 QR을 스캔하거나 페어링 링크/호스트를 입력하세요.';

  @override
  String get connectGuideReconnectHint =>
      '이 휴대폰은 이미 페어링되어 있습니다. 다시 연결하거나, 다른 홈이면 다시 페어링하세요.';

  @override
  String get settingsNeedConnect => '연결하면 LLM, 연결, 스킬, 시스템을 설정할 수 있습니다.';

  @override
  String get shellProfilePending => '프로필은 이 기기의 페어링에서 선택됩니다.';

  @override
  String shellProfileOne(String id) {
    return '프로필 · $id';
  }

  @override
  String get shellProfile => '프로필';

  @override
  String shellMeshHint(String mesh) {
    return 'mesh $mesh · 탭을 당겨 새로고침';
  }

  @override
  String get shellCreateProfile => 'Create';

  @override
  String get shellProfileDisplayName => 'Display name';

  @override
  String get shellProfileIdOptional => 'Account id (optional)';

  @override
  String get shellCancel => 'Cancel';

  @override
  String get shellCreate => 'Create';

  @override
  String get shellProfileCreated => 'Profile created';

  @override
  String shellProfileCreateFailed(String error) {
    return 'Create failed: $error';
  }

  @override
  String get navChat => '채팅';

  @override
  String get navHomeChat => 'Home';

  @override
  String get navSettings => 'Settings';

  @override
  String get navLlm => 'LLM';

  @override
  String get navConnections => 'Connections';

  @override
  String get navSkills => 'Skills';

  @override
  String get navSystem => 'System';

  @override
  String get navApprovals => '승인';

  @override
  String get navModels => '모델';

  @override
  String get navArtifacts => '산출물';

  @override
  String get settingsHubHint =>
      'Configure the home daemon from your phone. Some owner-only actions need a trusted device.';

  @override
  String get settingsLlmSubtitle => 'Models, Local, Routing, Memory';

  @override
  String get settingsConnectionsSubtitle =>
      'Pairing, Home Assistant, MQTT, Channels';

  @override
  String get settingsSkillsSubtitle => 'Skills, Workflows, Schedules';

  @override
  String get settingsSystemSubtitle => 'Shared files, Health, Grants';

  @override
  String get homeChatSessionTitle => 'Phone home chat';

  @override
  String get homeChatEmptyTitle => 'Talk to your home';

  @override
  String get homeChatEmptyHint =>
      'Smart-home tools stay available here. Approvals still gate actuations.';

  @override
  String get homeChatHint => 'Ask about lights, locks, climate…';

  @override
  String get chatAttach => 'Attach';

  @override
  String chatAttachTooMany(int n) {
    return 'At most $n files';
  }

  @override
  String chatAttachTooLarge(String name, String mb) {
    return '$name exceeds $mb MB';
  }

  @override
  String chatAttachAdded(int n) {
    return 'Attached $n file(s)';
  }

  @override
  String get chatAttachedOnly => '(attachment)';

  @override
  String get chatVoiceStart => 'Dictate';

  @override
  String get chatVoiceStop => 'Stop dictation';

  @override
  String get chatVoiceUnsupported =>
      'Speech recognition is not available on this device.';

  @override
  String get llmTabModels => 'Models';

  @override
  String get llmTabLocal => 'Local';

  @override
  String get llmTabRouting => 'Routing';

  @override
  String get llmTabMemory => 'Memory';

  @override
  String get llmLocalDownloadHint =>
      'Search Hugging Face and download GGUF files onto the home machine.';

  @override
  String get llmHfSearchHint => 'Search models…';

  @override
  String get llmSearch => 'Search';

  @override
  String get llmCancelDownload => 'Cancel';

  @override
  String get llmResumeDownload => 'Resume';

  @override
  String llmGgufFiles(String repo) {
    return 'GGUF in $repo';
  }

  @override
  String get llmRoutingHint => 'Choose where turns may run for this profile.';

  @override
  String get llmFilterAny => 'Smart / any';

  @override
  String get llmFilterCloud => 'Cloud only';

  @override
  String get llmFilterLocal => 'Local only';

  @override
  String get llmAutoSwitch => 'Auto model switch';

  @override
  String get llmCompactNow => 'Compact memory now';

  @override
  String get llmFlushEnabled => 'Flush standing notes';

  @override
  String get llmReviewEnabled => 'Review before learn write';

  @override
  String get llmInjectMode => 'Inject budget mode';

  @override
  String get llmInjectAuto => 'Auto';

  @override
  String get llmInjectBaseline => 'Baseline';

  @override
  String get llmInjectCustom => 'Custom';

  @override
  String get llmPendingLearns => 'Pending learns';

  @override
  String get llmNoPendingLearns => 'No pending learns.';

  @override
  String get connTabPairing => 'Pairing';

  @override
  String get connTabHa => 'Home Assistant';

  @override
  String get connTabMqtt => 'MQTT';

  @override
  String get connTabChannels => 'Channels';

  @override
  String get connPairingHint =>
      'Mint and revoke phones from desktop Settings → Pair devices. This list is read-only on mobile.';

  @override
  String get connNoDevices => 'No paired devices listed.';

  @override
  String get connEnabled => 'Enabled';

  @override
  String get connDisabled => 'Disabled';

  @override
  String get connReady => 'Ready';

  @override
  String get connHealthy => 'Healthy';

  @override
  String get connUnhealthy => 'Unhealthy';

  @override
  String get connHaUrl => 'HA base URL';

  @override
  String get connHaToken => 'Access token';

  @override
  String get connMqttUrl => 'Broker URL';

  @override
  String get connMqttPassword => 'Password';

  @override
  String get connSaveEnable => 'Save & enable';

  @override
  String get connBindTitle => 'Object bindings';

  @override
  String connBoundTo(String id) {
    return 'Bound to $id';
  }

  @override
  String get connUnbound => 'Unbound';

  @override
  String get connChannelsHint =>
      'Paste a bot token and enable. Prefer desktop for first-time setup.';

  @override
  String get connBotToken => 'Bot token';

  @override
  String get connDisable => 'Disable';

  @override
  String get connSenderBinds => 'Sender → profile';

  @override
  String get connSenderBindsHint =>
      'Link an IM sender id to the active profile.';

  @override
  String get connBindChannel => 'Channel';

  @override
  String get connChannelAccount => 'Channel account';

  @override
  String get connSenderId => 'Sender id';

  @override
  String get connBindSender => 'Bind sender';

  @override
  String get skillsTabSkills => 'Skills';

  @override
  String get skillsVerify => 'Verify';

  @override
  String get skillsVerified => 'Skill verified';

  @override
  String get skillsTabWorkflows => 'Workflows';

  @override
  String get skillsTabSchedules => 'Schedules';

  @override
  String get skillsInstallUrl => 'Install from URL';

  @override
  String get skillsInstall => 'Install';

  @override
  String get skillsClawHubSearch => 'ClawHub search';

  @override
  String get schedWhenHint => 'When (natural language)';

  @override
  String get schedMessageHint => 'Reminder message';

  @override
  String get schedPropose => 'Propose';

  @override
  String get schedConfirm => 'Confirm reminder';

  @override
  String get schedKindNotify => 'Notify';

  @override
  String get schedKindWorkflow => 'Workflow';

  @override
  String get schedKindTool => 'Tool';

  @override
  String get schedWorkflowId => 'Workflow id';

  @override
  String get schedToolName => 'Tool name';

  @override
  String get wfEditorTitle => 'Workflow';

  @override
  String get wfEnable => 'Enable';

  @override
  String get wfDisable => 'Disable';

  @override
  String get wfTools => 'Insert tool';

  @override
  String get wfId => 'Workflow id';

  @override
  String get wfAiPrompt => 'Describe the workflow';

  @override
  String get wfAiPromptHint => 'e.g. turn off lights at 11pm if nobody home';

  @override
  String get wfAiDraft => 'Draft with AI';

  @override
  String get wfDiagramNodes => 'Nodes (phone diagram)';

  @override
  String get wfNoNodes => 'No nodes yet — draft or paste YAML.';

  @override
  String get wfYaml => 'YAML';

  @override
  String get wfSave => 'Validate & save';

  @override
  String get wfRun => 'Test run';

  @override
  String get wfDrafted => 'Draft applied';

  @override
  String get wfSaved => 'Saved';

  @override
  String get wfRan => 'Run started';

  @override
  String get sysTabFiles => 'Shared files';

  @override
  String get sysTabHealth => 'Health';

  @override
  String get sysTabGrants => 'Grants';

  @override
  String get sysTestPush => 'Send test push';

  @override
  String get sysTestPushSent => 'Test push requested';

  @override
  String get sysDoctorFix => 'Fix';

  @override
  String get sysDoctorFixAll => 'Fix all';

  @override
  String sysDoctorFixed(String ids) {
    return 'Fixed: $ids';
  }

  @override
  String get sysNoIssues => 'No doctor issues.';

  @override
  String get sysNoGrants => 'No grants.';

  @override
  String get chatNeedAccount => '채팅 전에 위에서 계정을 선택하세요.';

  @override
  String get chatEmptyMessage => '빈 메시지.';

  @override
  String get chatSessionTitle => '휴대폰 채팅';

  @override
  String get chatEmptyTitle => '홈 에이전트에게 메시지';

  @override
  String get chatEmptyHint =>
      '턴은 홈 데몬에서 실행됩니다. 에이전트에 권한이 필요하면 허용/거부가 여기에 표시됩니다.';

  @override
  String get chatHint => '메시지…';

  @override
  String chatSubscribeFailed(String error) {
    return '구독 실패: $error';
  }

  @override
  String chatStatus(String status) {
    return '상태: $status';
  }

  @override
  String chatError(String error) {
    return '오류: $error';
  }

  @override
  String get approvalsTitle => '승인';

  @override
  String get approvalsHint => '결정을 기다리는 도구 및 작동 요청.';

  @override
  String get approvalsNeedAccount => '승인을 불러오려면 계정을 선택하세요.';

  @override
  String get approvalsEmptyTitle => '받은편지함 비어 있음';

  @override
  String get approvalsEmptyHint => '지금 대기 중인 항목이 없습니다.';

  @override
  String get approvalsActuation => '작동';

  @override
  String get approvalsAllow => '허용';

  @override
  String get approvalsDeny => '거부';

  @override
  String get approvalsAllowed => '허용됨';

  @override
  String get approvalsDenied => '거부됨';

  @override
  String approvalsFailed(String error) {
    return '실패: $error';
  }

  @override
  String get modelsTitle => '모델';

  @override
  String get modelsOwnerHint =>
      '홈 기기에서 Local 또는 Ollama를 사용하세요. 첫 설정은 데스크톱을 권장합니다.';

  @override
  String get modelsReadonlyHint =>
      '이 기기는 읽기 전용입니다. 데스크톱 설정 → 모델(또는 소유자 신뢰 폰)에서 Local을 켜세요.';

  @override
  String get modelsLocal => '로컬 모델';

  @override
  String get modelsOwnerTrusted => '로컬 엔진 상태는 소유자 신뢰 기기가 필요합니다.';

  @override
  String get modelsResponding => '응답 중';

  @override
  String get modelsNotResponding => '응답 없음';

  @override
  String get modelsDisabled => '사용 안 함';

  @override
  String get modelsGguf => '디스크의 GGUF';

  @override
  String get modelsEnableLocal => 'Local 사용';

  @override
  String get modelsUseOllama => 'Ollama 사용';

  @override
  String get modelsDisable => '사용 안 함';

  @override
  String get modelsLocalOnly => '계정 로컬 전용';

  @override
  String get modelsThisAccount => '이 계정';

  @override
  String get modelsNeedAccount => '위에서 accountId를 설정하세요.';

  @override
  String modelsDefault(String id) {
    return '기본: $id';
  }

  @override
  String modelsPool(String filter) {
    return '풀: $filter';
  }

  @override
  String get modelsModeMesh => 'Mesh 로컬';

  @override
  String get modelsModeSpawn => 'Home llama-server';

  @override
  String get modelsModeOllama => 'Ollama';

  @override
  String get modelsModeOff => '꺼짐';

  @override
  String get modelsNotConnected => '연결되지 않음';

  @override
  String get modelsSetAccount => '기본 모델과 풀을 보려면 accountId를 설정하세요.';

  @override
  String get modelsUpdated => '업데이트됨';

  @override
  String get modelsLocalEnabled => 'Local 사용됨';

  @override
  String get modelsOllamaEnabled => 'Ollama 사용됨';

  @override
  String get modelsLocalDisabled => 'Local 해제됨';

  @override
  String get modelsLocalOnlySet => '로컬 전용 라우팅 설정됨';

  @override
  String get modelsDefaultLabel => '기본';

  @override
  String get modelsOffLabel => '끔';

  @override
  String get modelsTest => 'Test';

  @override
  String get modelsSetDefault => 'Set default';

  @override
  String modelsTestOk(String id) {
    return 'Tested $id';
  }

  @override
  String modelsDefaultSet(String id) {
    return 'Default → $id';
  }

  @override
  String get artifactsTitle => '산출물';

  @override
  String get artifactsHint => '홈 데몬의 서명된 링크. 탭하여 엽니다.';

  @override
  String get artifactsNeedAccount => '산출물을 보려면 계정을 선택하세요.';

  @override
  String get artifactsEmptyTitle => '산출물 없음';

  @override
  String get artifactsEmptyHint => '에이전트가 파일을 만든 뒤 당겨서 새로고침하세요.';

  @override
  String get artifactsUrlCopied => '열 수 없음 — URL 복사됨';

  @override
  String artifactsOpenFailed(String error) {
    return '열기 실패: $error';
  }

  @override
  String chatPendingApprovals(int count) {
    return '승인 대기 $count건';
  }
}
