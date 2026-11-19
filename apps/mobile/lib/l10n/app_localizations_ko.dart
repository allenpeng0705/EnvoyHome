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
  String get pairCameraDenied => '페어링 QR을 스캔하려면 카메라 권한이 필요합니다.';

  @override
  String get pairCameraDeniedForever =>
      '카메라 접근이 차단되었습니다. 시스템 설정에서 허용한 뒤 다시 시도하세요.';

  @override
  String get pairOpenSettings => '설정 열기';

  @override
  String get pairScannerHint => '데스크톱 페어링 QR을 비추세요';

  @override
  String get pairScannerError => '카메라를 시작할 수 없습니다. 페어링 링크를 붙여넣을 수도 있습니다.';

  @override
  String get pairRetryCamera => '다시 시도';

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
  String get shellCreateProfile => '만들기';

  @override
  String get shellProfileDisplayName => '표시 이름';

  @override
  String get shellProfileIdOptional => '계정 id(선택)';

  @override
  String get shellCancel => '취소';

  @override
  String get shellCreate => '만들기';

  @override
  String get shellProfileCreated => '프로필이 생성됨';

  @override
  String shellProfileCreateFailed(String error) {
    return '생성 실패: $error';
  }

  @override
  String get navChat => '채팅';

  @override
  String get navHomeChat => '홈';

  @override
  String get navSchedulesChat => '일정';

  @override
  String get navSettings => '설정';

  @override
  String get navLlm => 'LLM';

  @override
  String get navConnections => '연결';

  @override
  String get navSkills => '스킬';

  @override
  String get navSystem => '시스템';

  @override
  String get navProfiles => '프로필';

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
  String get settingsProfilesSubtitle => 'Owner, 작업 공간 폴더, 도구 정책';

  @override
  String get settingsLlmSubtitle => '모델, 로컬, 라우팅, 메모리';

  @override
  String get settingsConnectionsSubtitle =>
      'Pairing, Home Assistant, MQTT, Channels';

  @override
  String get settingsSkillsSubtitle => '스킬 팩 설치 및 관리';

  @override
  String get settingsWorkflowsSubtitle => 'DAG 워크플로 — 초안, 검증, 실행';

  @override
  String get settingsSystemSubtitle => '프로필, 공유 파일, 상태, 권한';

  @override
  String get settingsNeedConnect => '연결하면 LLM, 연결, 스킬, 시스템을 설정할 수 있습니다.';

  @override
  String get profilesIntro =>
      '사용자마다 프로필이 있습니다. 가정 Owner가 작업 공간 폴더를 설정하고 소유권을 이전할 수 있습니다.';

  @override
  String get profilesMemberHint => '이 기기는 가정 Owner가 아님 — 작업 공간은 여기서 읽기 전용입니다.';

  @override
  String get profilesRefresh => '새로고침';

  @override
  String get profilesAddTitle => '프로필 추가';

  @override
  String get profilesOwnerBadge => 'Owner';

  @override
  String get profilesActiveBadge => '활성';

  @override
  String get profilesWorkspaceTitle => '작업 공간 폴더';

  @override
  String get profilesWorkspaceHint =>
      '가정 PC의 호스트 폴더 추가(최대 16개). 에이전트는 workspace/<id>/… 경로로 접근합니다.';

  @override
  String get profilesWorkspacePath => '호스트 경로';

  @override
  String get profilesWorkspaceBrowse => '폴더 탐색';

  @override
  String get profilesWorkspaceBrowseHint => '탭하여 가정 PC 탐색';

  @override
  String get profilesWorkspaceUnset => '미설정(샌드박스만)';

  @override
  String get profilesWorkspaceSet => '구성됨';

  @override
  String get profilesWorkspaceWholeMachine => '전체 PC';

  @override
  String get profilesWorkspaceRo => '읽기 전용';

  @override
  String get profilesWorkspaceRw => '읽기 및 쓰기';

  @override
  String get profilesWorkspaceUseRoot => 'PC 루트 추가';

  @override
  String get profilesWorkspaceClear => '모두 지우기';

  @override
  String get profilesWorkspaceRemove => '제거';

  @override
  String get profilesWorkspaceApply => '추가';

  @override
  String get profilesWorkspaceEdit => '폴더 추가';

  @override
  String get profilesWorkspaceRootTitle => '전체 PC 접근을 허용할까요?';

  @override
  String get profilesWorkspaceRootBody =>
      '에이전트가 workspace/… 경로로 PC 루트 아래 파일을 읽고(선택 시 쓰기) 할 수 있습니다 — 이 휴대폰에서도.';

  @override
  String get profilesWorkspaceRootOk => '허용';

  @override
  String get profilesWorkspaceMemberNote => '작업 공간 폴더는 가정 Owner만 변경할 수 있습니다.';

  @override
  String get profilesWorkspaceCrossTitle => '다른 프로필의 작업 공간 폴더를 추가할까요?';

  @override
  String profilesWorkspaceCrossBody(String name) {
    return '$name의 호스트 폴더를 추가합니다. 해당 작업 공간을 구성하려는 경우에만 계속하세요.';
  }

  @override
  String get profilesWorkspaceDenied => '이 기기에서 보이지 않음';

  @override
  String get profilesWorkspaceInactive => '구성됨이나 비활성(파일시스템 루트는 Owner에게만 적용)';

  @override
  String get profilesRename => '이름 변경';

  @override
  String get profilesRenameTitle => '프로필 이름 변경';

  @override
  String get profilesRenameSave => '저장';

  @override
  String get profilesTimeZoneUnset => '시간대: 미설정(일정은 호스트 기본값 사용)';

  @override
  String profilesTimeZoneValue(String tz) {
    return '시간대: $tz';
  }

  @override
  String get profilesTimeZoneEdit => '시간대';

  @override
  String get profilesTimeZoneTitle => '계정 시간대';

  @override
  String get profilesTimeZoneHint => 'IANA 이름, 예: Asia/Seoul';

  @override
  String get profilesTimeZoneSave => '저장';

  @override
  String profilesTimeZoneDone(String tz) {
    return '시간대가 $tz(으)로 설정됨';
  }

  @override
  String get profilesShareLocationTitle => 'Home과 위치 공유';

  @override
  String get profilesShareLocationSubtitle =>
      '채팅 턴에 대략적인 GPS를 첨부합니다. 권한은 여기서 한 번만 요청하며 전송마다 묻지 않습니다. 일시 주입만 — 메모리에 저장하지 않습니다.';

  @override
  String get profilesShareLocationDenied => '위치 권한이 허용되지 않았습니다. 공유는 꺼진 상태입니다.';

  @override
  String get profilesShareLocationOn => '이 기기에서 위치 공유가 켜졌습니다';

  @override
  String get profilesDelete => '삭제';

  @override
  String get profilesDeleteTitle => '프로필을 삭제할까요?';

  @override
  String profilesDeleteBody(String name) {
    return '$name을(를) 삭제할까요? 샌드박스와 작업 공간 구성이 제거됩니다. 되돌릴 수 없습니다.';
  }

  @override
  String get profilesDeleteConfirm => '삭제';

  @override
  String profilesDeleteDone(String name) {
    return '$name 삭제됨';
  }

  @override
  String get profilesDeleteOwnerBlocked =>
      '가정 Owner는 삭제할 수 없습니다. 먼저 소유권을 이전하세요.';

  @override
  String get profilesTransferTitle => '가정 Owner를 이전할까요?';

  @override
  String profilesTransferBody(String name) {
    return '$name을(를) 가정 Owner로 지정합니다. 페어링, 바인딩, 가정 설정을 관리합니다.';
  }

  @override
  String get profilesTransferConfirm => '이전';

  @override
  String profilesTransferDone(String name) {
    return 'Owner가 이제 $name입니다';
  }

  @override
  String profilesTransferFailed(String error) {
    return '이전 실패: $error';
  }

  @override
  String profilesTransferTo(String name) {
    return '$name(으)로 이전';
  }

  @override
  String get profilesToolPolicy => '도구 정책';

  @override
  String get profilesToolPolicyStandard => '표준';

  @override
  String get profilesToolPolicyRestricted => '제한';

  @override
  String get connMintPairing => '페어링 코드 발급';

  @override
  String get connMintOk => '페어링 코드 발급됨';

  @override
  String get connMintUriHint => '새 기기에서 이 URI를 스캔하거나 붙여넣으세요.';

  @override
  String get connPairingOwnerOnly => '페어링 코드 발급/취소는 가정 Owner 기기가 필요합니다.';

  @override
  String get connRevokeDevice => '취소';

  @override
  String get connForgetDevice => '삭제';

  @override
  String connRevokeConfirm(String id) {
    return '기기 $id을(를) 취소할까요? 다시 페어링해야 합니다.';
  }

  @override
  String connForgetConfirm(String id) {
    return '기기 $id을(를) 잊을까요? 페어링 기록이 영구 삭제됩니다.';
  }

  @override
  String get connOwnerWriteOnly => '이 설정은 가정 Owner 기기만 변경할 수 있습니다.';

  @override
  String get connAccountsHint => '가정 프로필';

  @override
  String get homeChatSessionTitle => '휴대폰 홈 채팅';

  @override
  String get homeChatEmptyTitle => '집과 대화';

  @override
  String get homeChatEmptyHint => '스마트홈 도구는 여기서 사용 가능합니다. 실행은 여전히 승인이 필요합니다.';

  @override
  String get homeChatHint => '조명, 잠금, 온도 등에 대해 물어보세요…';

  @override
  String get schedulesChatSessionTitle => '일정';

  @override
  String get schedulesChatEmptyTitle => '알림';

  @override
  String get schedulesChatEmptyHint => '이 대화는 알림에 집중합니다. 켜기 전에 시간을 확인합니다.';

  @override
  String get schedulesChatHint => '알려 줘…';

  @override
  String get chatAttach => '첨부';

  @override
  String chatAttachTooMany(int n) {
    return '파일은 최대 $n개';
  }

  @override
  String chatAttachTooLarge(String name, String mb) {
    return '$name이(가) $mb MB를 초과함';
  }

  @override
  String chatAttachAdded(int n) {
    return '파일 $n개 첨부됨';
  }

  @override
  String get chatAttachedOnly => '(첨부)';

  @override
  String get chatVoiceStart => '받아쓰기';

  @override
  String get chatVoiceStop => '받아쓰기 중지';

  @override
  String get chatVoiceUnsupported => '이 기기에서는 음성 인식을 사용할 수 없습니다.';

  @override
  String get llmTabModels => '모델';

  @override
  String get llmTabLocal => '로컬';

  @override
  String get llmTabRouting => '라우팅';

  @override
  String get llmTabMemory => '메모리';

  @override
  String get llmLocalDownloadHint =>
      'Hugging Face에서 검색해 GGUF 파일을 가정 PC에 다운로드합니다.';

  @override
  String get llmHfSearchHint => '모델 검색…';

  @override
  String get llmSearch => '검색';

  @override
  String get llmCancelDownload => '취소';

  @override
  String get llmResumeDownload => '재개';

  @override
  String llmGgufFiles(String repo) {
    return '$repo의 GGUF';
  }

  @override
  String get llmRoutingHint => '이 프로필에서 턴이 실행될 수 있는 위치를 선택하세요.';

  @override
  String get llmFilterAny => '스마트 / 모두';

  @override
  String get llmFilterCloud => '클라우드만';

  @override
  String get llmFilterLocal => '로컬만';

  @override
  String get llmAutoSwitch => '자동 모델 전환';

  @override
  String get privacyModeTitle => '프라이버시 모드';

  @override
  String get privacyModeHint => '로컬 추론 강제, 클라우드 도구 차단. Owner 범위.';

  @override
  String get privacyModeEnabled => '프라이버시 모드 사용';

  @override
  String get privacyModeBlockEgress => '스마트홈 실행 및 이벤트 소스 알림도 차단';

  @override
  String get privacyModeOwnerOnly => '프라이버시 모드는 이 기기에서 Owner 전용입니다.';

  @override
  String get llmCompactNow => '지금 메모리 압축';

  @override
  String get llmFlushEnabled => '상시 노트 플러시';

  @override
  String get llmReviewEnabled => '학습 쓰기 전 검토';

  @override
  String get llmInjectMode => '주입 예산 모드';

  @override
  String get llmInjectAuto => '자동';

  @override
  String get llmInjectBaseline => '기준';

  @override
  String get llmInjectCustom => '사용자 지정';

  @override
  String get llmPendingLearns => '대기 중인 학습';

  @override
  String get llmNoPendingLearns => '대기 중인 학습 없음.';

  @override
  String get connTabPairing => '페어링';

  @override
  String get connTabHa => 'Home Assistant';

  @override
  String get connTabMqtt => 'MQTT';

  @override
  String get connTabChannels => '채널';

  @override
  String get connTabWebSearch => '웹 검색';

  @override
  String get connTabMcp => 'MCP';

  @override
  String get connTabBrowser => '브라우저';

  @override
  String get mcpLede =>
      '원하는 MCP 서버를 추가하세요. 사용하기 전에 연결을 테스트하세요. Stdio 명령은 데몬 호스트 사용자로 실행됩니다. 도구 호출은 여전히 승인이 필요합니다.';

  @override
  String get mcpTest => '테스트';

  @override
  String get mcpAddServer => '서버 추가';

  @override
  String get mcpSave => '저장';

  @override
  String get mcpReady => '준비됨';

  @override
  String get mcpNotTested => '미테스트';

  @override
  String mcpServerSubtitle(String transport, String status, int count) {
    return '$transport · $status · 도구 $count개';
  }

  @override
  String mcpTestOk(int count) {
    return '성공 — 도구 $count개. 준비되면 사용하세요.';
  }

  @override
  String mcpTestFailed(String error) {
    return '실패: $error';
  }

  @override
  String get mcpUnknownError => '알 수 없음';

  @override
  String get connDeviceRevoked => '철회됨';

  @override
  String connDeviceSubtitle(String id, String accounts, String revokedSuffix) {
    return '$id · $accounts$revokedSuffix';
  }

  @override
  String get mcpLabel => '레이블';

  @override
  String get mcpCommand => '명령';

  @override
  String get mcpArgs => '인수(공백 구분, 선택)';

  @override
  String get mcpUrl => 'URL';

  @override
  String get mcpAuthToken => '인증 토큰(선택)';

  @override
  String get mcpEnv => '환경 변수(줄마다 KEY=value, 선택)';

  @override
  String get browserControlLede =>
      '가정 PC의 관리 브라우저(Auto는 Obscura 우선, 없으면 Chromium)를 제어하거나 개인 Chrome / 원격 CDP를 연결합니다. 기본 꺼짐.';

  @override
  String get browserControlDaemonHostNote =>
      '브라우저 세션은 가정 PC에서 실행됩니다. 여기 설정은 데스크톱 연결 → 브라우저와 동기화됩니다.';

  @override
  String get browserControlEnabled => '브라우저 도구 사용';

  @override
  String get browserControlUnattended => '일정에 관리형 프로필 허용';

  @override
  String get browserControlReady => '준비됨';

  @override
  String get browserControlNotReady => '준비 안 됨';

  @override
  String get browserControlSave => '저장';

  @override
  String get browserControlSaved => '브라우저 설정이 저장됨.';

  @override
  String get browserControlSaveFailed => '브라우저 설정을 저장할 수 없습니다.';

  @override
  String get browserControlDefaultProfile => '기본 프로필';

  @override
  String get browserControlProfileManaged => '관리형(격리)';

  @override
  String get browserControlProfilePersonal => '개인 Chrome';

  @override
  String get browserControlProfileRemote => '원격 CDP';

  @override
  String get browserControlElevatedWarn =>
      '개인/원격은 로그인된 사이트에서 사용자처럼 동작할 수 있습니다. Owner만; 일정에 사용 안 함.';

  @override
  String get browserControlAcknowledge => '브라우저 위험을 이해했습니다';

  @override
  String get browserControlPersonalEnabled => '개인 Chrome 사용';

  @override
  String get browserControlPersonalCdp => '개인 CDP(루프백)';

  @override
  String get browserControlPersonalReady => '개인 CDP 연결됨';

  @override
  String get browserControlPersonalNotReady => '개인 CDP 끊김';

  @override
  String get browserControlRemoteEnabled => '원격 CDP 사용';

  @override
  String get browserControlRemoteCdp => '원격 CDP URL';

  @override
  String get browserControlRemoteToken => '원격 CDP 토큰';

  @override
  String get browserControlTokenSet => '설정됨';

  @override
  String get browserControlTokenPlaceholder => '비우면 기존 유지';

  @override
  String get browserControlRemoteReady => '원격 CDP 연결됨';

  @override
  String get browserControlRemoteNotReady => '원격 CDP 끊김';

  @override
  String get browserControlOwnerOnly => '브라우저 제어 설정은 가정 Owner 기기만 변경할 수 있습니다.';

  @override
  String get browserControlAcknowledged =>
      '고위험 사용을 확인했습니다. 개인/원격을 끄면 사용을 중단합니다.';

  @override
  String get webSearchLede =>
      '채팅에서 공개 웹 검색. 기본: DuckDuckGo, 필요 시 브라우저에서 Bing/Google/Baidu(API 키 없음). Brave와 Tavily는 Owner API 키 필요.';

  @override
  String get webSearchEnabled => 'web_search 사용';

  @override
  String get webSearchProvider => '제공자';

  @override
  String get webSearchProviderBrowser => '브라우저(Bing / Google / Baidu)';

  @override
  String get webSearchBrowserPrimaryHint =>
      '데몬 호스트 헤드리스 엔진에서 Bing/Google/Baidu 직접 검색(Obscura 준비 시 Obscura, 아니면 Chromium). 참석 채팅은 검색마다 한 번 확인합니다.';

  @override
  String get webSearchDaemonHostNote =>
      '엔진과 분석은 EnvoyHome을 호스팅하는 가정 PC에서 실행됩니다. 이 휴대폰은 보기 및(Owner) 공유 설정 편집만 합니다.';

  @override
  String get webSearchEffectiveUnresolved => '아직 준비 안 됨';

  @override
  String get webSearchApiKey => 'API 키';

  @override
  String get webSearchApiKeyHint => '비우면 현재 키 유지';

  @override
  String get webSearchReady => '준비됨';

  @override
  String get webSearchNotReady => '준비 안 됨';

  @override
  String get webSearchSave => '저장';

  @override
  String get webSearchSaved => '웹 검색 설정이 저장됨.';

  @override
  String get webSearchSaveFailed => '웹 검색 설정을 저장할 수 없습니다.';

  @override
  String get webSearchOwnerOnly => '웹 검색은 가정 Owner 기기만 변경할 수 있습니다.';

  @override
  String get webSearchBrowserFallback =>
      '브라우저 대체(API/DDG 실패 또는 미설정 시 Bing/Google/Baidu)';

  @override
  String get webSearchBrowserFallbackHint =>
      '기본 켜짐 — 설정 없이 검색. 참석 채팅은 브라우저 단계 전 확인. SERP 페이지는 CAPTCHA나 차단될 수 있음.';

  @override
  String get webSearchResearchEnabled => '웹 리서치(검색 후 상위 페이지 분석)';

  @override
  String get webSearchResearchHint =>
      '기본 꺼짐. web_research: 상위 결과 분석 후 요약과 링크 반환.';

  @override
  String get webSearchDigDepth => '분석 깊이(1–10페이지)';

  @override
  String get webSearchExtractBackend => '페이지 추출 백엔드';

  @override
  String get webSearchExtractBackendAuto =>
      '자동(Obscura 준비 시 Obscura, 아니면 HTTP fetch)';

  @override
  String get webSearchExtractBackendFetch => 'HTTP fetch';

  @override
  String get webSearchExtractBackendObscura => 'Obscura(JS 렌더링 Markdown)';

  @override
  String get webSearchExtractBackendHint =>
      '자동은 데몬 호스트에 Obscura가 있으면 우선, 없으면 일반 HTTP fetch.';

  @override
  String get webSearchEffectiveExtract => '현재 적용 분석 백엔드';

  @override
  String get webSearchObscuraReady => '데몬 호스트에서 Obscura 준비됨';

  @override
  String get webSearchObscuraMissing => '데몬 호스트에 Obscura 미설치';

  @override
  String get webSearchObscuraInstallHintNote =>
      '데스크톱 빌드는 Obscura 포함(또는 데몬이 첫 부팅에 자동 설치). EnvoyHome을 실행하는 가정 PC에서(이 휴대폰 아님) 필요 시 ENVOYHOME_OBSCURA / PATH로 지정 후 설정을 다시 여세요.';

  @override
  String get webSearchSerpBrowserEngine => '브라우저 SERP 엔진';

  @override
  String get webSearchSerpBrowserEngineAuto =>
      '자동(Obscura 준비 시 Obscura, 아니면 Chromium)';

  @override
  String get webSearchSerpBrowserEngineChromium => 'Chromium';

  @override
  String get webSearchSerpBrowserEngineObscura => 'Obscura';

  @override
  String get webSearchSerpBrowserEngineHint =>
      '자동은 Bing/Google/Baidu에 Obscura 우선, 이어 Playwright Chromium.';

  @override
  String get webSearchEffectiveSerp => '현재 적용 SERP 엔진';

  @override
  String get browserControlManagedEngine => '관리 브라우저 엔진';

  @override
  String get browserControlManagedEngineAuto =>
      '자동(Obscura 준비 시 Obscura, 아니면 Chromium)';

  @override
  String get browserControlManagedEngineChromium => 'Chromium';

  @override
  String get browserControlManagedEngineObscura => 'Obscura';

  @override
  String get browserControlManagedEngineHint =>
      '자동은 관리 브라우저에 Obscura 우선. 개인/원격은 항상 실제 Chrome CDP.';

  @override
  String get browserControlEffectiveManaged => '현재 적용 관리 엔진';

  @override
  String get webSearchEngines => '검색 엔진(순서: Bing → Google → Baidu)';

  @override
  String get webSearchEnginesHint =>
      '브라우저 대체 시 체크된 엔진을 이 순서로 시도해 결과가 나올 때까지 반복합니다.';

  @override
  String get webSearchEnginesRequired =>
      '브라우저 대체를 위해 Bing, Google, Baidu 중 하나 이상 선택하세요.';

  @override
  String get webSearchEngineBing => 'Bing';

  @override
  String get webSearchEngineGoogle => 'Google';

  @override
  String get webSearchEngineBaidu => 'Baidu';

  @override
  String get webSearchBrowserReady => '데몬 호스트에서 Playwright Chromium 준비됨';

  @override
  String get webSearchBrowserMissing => '데몬 호스트에 Playwright Chromium 미설치';

  @override
  String get webSearchInstallHintNote =>
      'Playwright는 데몬에 포함됩니다. EnvoyHome을 실행하는 가정 PC에서 Chromium을 다운로드한 뒤(이 휴대폰 아님) 설정을 다시 여세요. 상태가 계속 없으면 데몬을 재시작하세요.';

  @override
  String get webSearchCopyHint => '설치 명령 복사';

  @override
  String get webSearchUnattendedBrowser => '일정에서 브라우저 대체 허용';

  @override
  String get connPairingHint =>
      '가정 Owner 기기가 여기서 페어링 코드를 발급·취소할 수 있습니다. 구성원은 상태만 볼 수 있습니다.';

  @override
  String get connNoDevices => '페어링된 기기가 없습니다.';

  @override
  String get connEnabled => '사용';

  @override
  String get connDisabled => '사용 안 함';

  @override
  String get connReady => '준비됨';

  @override
  String get connHealthy => '정상';

  @override
  String get connUnhealthy => '비정상';

  @override
  String get connHaUrl => 'HA 기본 URL';

  @override
  String get connHaToken => '액세스 토큰';

  @override
  String get connMqttUrl => '브로커 URL';

  @override
  String get connMqttPassword => '비밀번호';

  @override
  String get connSaveEnable => '저장 및 사용';

  @override
  String get connBindTitle => '객체 바인딩';

  @override
  String connBoundTo(String id) {
    return '$id에 바인딩됨';
  }

  @override
  String get connUnbound => '바인딩 해제';

  @override
  String get connChannelsHint => '봇 토큰을 붙여넣고 사용. 첫 설정은 데스크톱을 권장합니다.';

  @override
  String get connBotToken => '봇 토큰';

  @override
  String get connDisable => '사용 안 함';

  @override
  String get connSenderBinds => '발신자 → 프로필';

  @override
  String get connSenderBindsHint => 'IM 발신자 id를 활성 프로필에 연결합니다.';

  @override
  String get connBindChannel => '채널';

  @override
  String get connChannelAccount => '채널 계정';

  @override
  String get connSenderId => '발신자 id';

  @override
  String get connBindSender => '발신자 바인딩';

  @override
  String get skillsTabSkills => '스킬';

  @override
  String get skillsVerify => '검증';

  @override
  String get skillsVerified => '스킬 검증됨';

  @override
  String get skillsTabWorkflows => '워크플로';

  @override
  String get skillsTabSchedules => '일정';

  @override
  String get skillsTabScenes => '장면';

  @override
  String get schedulesTabJobs => '작업';

  @override
  String get scenesHint => 'When → 실행 가정 자동화(가정 규칙). 재실 템플릿은 프라이버시 모드 필요.';

  @override
  String get scenesWhenPresence => '재실(cron 없음 — 센서 트리거)';

  @override
  String get scenesNone => '장면이 아직 없습니다.';

  @override
  String get scenesAddMorning => '좋은 아침 추가';

  @override
  String get scenesPrivacyRequired => '재실 장면 전에 프라이버시 모드 사용(LLM → 라우팅).';

  @override
  String get skillsInstallUrl => 'URL에서 설치';

  @override
  String get skillsInstall => '설치';

  @override
  String get skillsClawHubSearch => 'ClawHub 검색';

  @override
  String get schedWhenHint => '실행 시점(자연어)';

  @override
  String get schedMessageHint => '알림 메시지';

  @override
  String get schedPropose => '제안';

  @override
  String get schedConfirm => 'Confirm reminder';

  @override
  String get scheduleCardTitle => '이 알림을 설정할까요?';

  @override
  String get scheduleCardConfirm => '확인';

  @override
  String get scheduleCardCancel => '취소';

  @override
  String get scheduleCardConfirmedToast => '알림이 설정됨.';

  @override
  String get scheduleCardCanceledToast => '알림이 취소됨.';

  @override
  String get scheduleCardFailed => '해당 알림을 업데이트할 수 없습니다.';

  @override
  String get schedKindNotify => '알림';

  @override
  String get schedKindWorkflow => '워크플로';

  @override
  String get schedKindTool => '도구';

  @override
  String get schedWorkflowId => '워크플로 id';

  @override
  String get schedToolName => '도구 이름';

  @override
  String get schedKindAgent => '에이전트';

  @override
  String get schedAgentPrompt => '에이전트 프롬프트';

  @override
  String get schedTabRepeating => '반복';

  @override
  String get schedTabOnce => '한 번';

  @override
  String get schedTabHistory => '기록';

  @override
  String get schedNoneRepeating => '반복 일정이 아직 없습니다.';

  @override
  String get schedNoneOnce => '일회성 알림이 없습니다.';

  @override
  String get schedNoReceipts => '실행 기록이 없습니다.';

  @override
  String get schedHistoryNotSet => '미설정';

  @override
  String get schedHistoryRuns => '실행';

  @override
  String get schedNoDismissed => '취소된 제안 없음.';

  @override
  String get schedDismissedCanceled => '취소됨';

  @override
  String get schedDismissedExpired => '만료됨';

  @override
  String get schedNext => '다음';

  @override
  String get schedKindRepeating => '반복';

  @override
  String get schedKindOnce => '한 번';

  @override
  String get schedKindDaily => '매일';

  @override
  String get schedKindWeekdays => '평일';

  @override
  String get schedKindWeekly => '매주';

  @override
  String get schedKindMonthly => '매월';

  @override
  String get schedKindYearly => '매년';

  @override
  String get schedKindEvery => '매';

  @override
  String schedDayOfMonth(String d) {
    return '$d일';
  }

  @override
  String get wfEditorTitle => '워크플로';

  @override
  String get wfEnable => '사용';

  @override
  String get wfDisable => '사용 안 함';

  @override
  String get wfTools => '도구 삽입';

  @override
  String get wfId => '워크플로 id';

  @override
  String get wfAiPrompt => '워크플로 설명';

  @override
  String get wfAiPromptHint => '예: 아무도 없으면 23시에 조명 끄기';

  @override
  String get wfAiDraft => 'AI로 초안';

  @override
  String get wfDiagramNodes => '노드(휴대폰 다이어그램)';

  @override
  String get wfNoNodes => '노드 없음 — 초안 작성 또는 YAML 붙여넣기.';

  @override
  String get wfYaml => 'YAML';

  @override
  String get wfSave => '검증 및 저장';

  @override
  String get wfRun => '시험 실행';

  @override
  String get wfDrafted => '초안 적용됨';

  @override
  String get wfSaved => '저장됨';

  @override
  String get wfRan => '실행 시작됨';

  @override
  String get sysTabFiles => '파일';

  @override
  String get sysTabHealth => '상태';

  @override
  String get sysTabGrants => '권한';

  @override
  String get sysTabMachine => '이 PC';

  @override
  String get sysMachineHint =>
      '데몬 수신 상태는 home.health에서. OS 서비스 설치/재시작은 가정 데스크톱에서 루프백 전용 — mesh 경유 불가.';

  @override
  String get sysMachineDaemonOk => '데몬 연결됨';

  @override
  String get sysMachineDaemonBad => '데몬 상태 확인 실패';

  @override
  String get sysMachineWsPort => 'WebSocket 포트';

  @override
  String get sysMachineHttpPort => 'HTTP 해치 포트';

  @override
  String get sysMachinePublicUrl => '공개 기본 URL';

  @override
  String get sysMachinePublicUrlEmpty => '미설정';

  @override
  String get sysMachineUptime => '가동 시간';

  @override
  String get sysMachineConnections => '클라이언트 / 활성 턴';

  @override
  String get sysMachineMesh => 'Mesh';

  @override
  String get sysMachineOsServiceNote =>
      'OS 서비스는 데스크톱 설정 → 시스템 → 이 PC에서 설치 또는 재시작(루프백-Owner).';

  @override
  String get sysMachineRefresh => '새로고침';

  @override
  String get sysTestPush => '테스트 푸시 보내기';

  @override
  String get sysTestPushSent => '테스트 푸시 요청됨';

  @override
  String get wfModeYaml => 'YAML';

  @override
  String get wfModeDiagram => '다이어그램';

  @override
  String get wfDiagramEmpty => '단계 없음 — 초안 작성 또는 YAML 편집.';

  @override
  String get wfDiagramEdge => '↓';

  @override
  String get sysDoctorFix => '수정';

  @override
  String get sysDoctorFixAll => '모두 수정';

  @override
  String sysDoctorFixed(String ids) {
    return '수정됨: $ids';
  }

  @override
  String get sysNoIssues => 'doctor 이슈 없음.';

  @override
  String get sysNoGrants => '권한 없음.';

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
  String get chatThought => '생각';

  @override
  String get chatNew => '새 채팅';

  @override
  String get chatNewNamePrompt => '채팅 이름';

  @override
  String get chatNewNamePlaceholder => '예: 주말 계획';

  @override
  String get chatNewNameHint => '지금 이름을 지정하거나, 이름 없이 시작하세요. 제목은 첫 메시지로 정해집니다.';

  @override
  String get chatNewSkip => '이름 없이 시작';

  @override
  String get chatNewCreate => '만들기';

  @override
  String get chatNewNeedName => '이름을 입력하거나 ‘이름 없이 시작’을 선택하세요.';

  @override
  String get chatNewStart => '시작';

  @override
  String get chatOpenArtifact => '전체 답변 열기';

  @override
  String get chatPromoteKnowledge => '지식에 추가';

  @override
  String chatPromotedKnowledge(String path) {
    return '$path에 저장됨';
  }

  @override
  String get chatPromoteFailed => '지식에 추가할 수 없습니다.';

  @override
  String get chatRecents => '최근';

  @override
  String get chatRecentsEmpty => '이전 채팅이 없습니다.';

  @override
  String get chatSessionsEmpty => '채팅이 없습니다. 새 채팅을 시작하세요.';

  @override
  String get chatUntitled => '제목 없는 채팅';

  @override
  String get chatRenameAction => '이름 바꾸기';

  @override
  String get chatRenamePrompt => '채팅 이름';

  @override
  String get chatRenameDone => '이름이 변경되었습니다.';

  @override
  String get chatRenameEmpty => '이름은 비울 수 없습니다.';

  @override
  String get chatRenameNeedSession => '메시지를 보낸 다음 이름을 바꾸세요.';

  @override
  String get chatBusyTurn => '현재 응답이 끝날 때까지 기다리거나 취소하세요.';

  @override
  String get chatEmptyAction => '채팅 비우기';

  @override
  String get chatEmptyConfirmTitle => '이 채팅을 비울까요?';

  @override
  String get chatEmptyConfirmBody => '이 스레드의 모든 메시지가 삭제됩니다. 채팅 자체는 유지됩니다.';

  @override
  String get chatTrashMenu => '채팅 작업';

  @override
  String get chatArchiveAction => '채팅 보관';

  @override
  String get chatUnarchiveAction => '채팅 목록으로 복원';

  @override
  String get chatUnarchiveDone => '채팅을 복원했습니다.';

  @override
  String get chatArchivedOpen => '보관됨';

  @override
  String get chatTabActive => '채팅';

  @override
  String get chatTabArchived => '보관됨';

  @override
  String get homeFolderTitle => '폴더 선택';

  @override
  String get homeFolderSelect => '선택';

  @override
  String get homeFolderDrives => '드라이브';

  @override
  String get homeFolderComputer => 'PC';

  @override
  String get homeFolderHome => '홈';

  @override
  String get homeFolderParent => '상위 폴더';

  @override
  String get homeFolderNoSubfolders => '하위 폴더 없음';

  @override
  String get chatArchivedTitle => '보관된 채팅';

  @override
  String get chatArchivedBack => '채팅 목록으로';

  @override
  String get chatArchivedEmpty => '보관된 채팅이 없습니다.';

  @override
  String get chatRemoveAction => '채팅 삭제';

  @override
  String get chatArchiveConfirmTitle => '이 채팅을 보관할까요?';

  @override
  String get chatArchiveConfirmBody => '최근 목록에서 숨겨지지만 디스크에는 남습니다.';

  @override
  String get chatRemoveConfirmTitle => '이 채팅을 삭제할까요?';

  @override
  String get chatRemoveConfirmBody => '채팅과 모든 메시지를 영구 삭제합니다.';

  @override
  String get chatRemoveDone => '채팅을 삭제했습니다.';

  @override
  String get chatNoSession => '활성 채팅이 없습니다.';

  @override
  String get chatDeleteFailed => '서버에서 메시지를 삭제하지 못했습니다.';

  @override
  String get chatDeleteMessage => '메시지 삭제';

  @override
  String get chatCopyMessage => '메시지 복사';

  @override
  String get chatCopied => '복사됨';

  @override
  String get chatCancel => '취소';

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
  String get modelsTest => '테스트';

  @override
  String get modelsSetDefault => '기본으로 설정';

  @override
  String modelsTestOk(String id) {
    return '$id 테스트됨';
  }

  @override
  String modelsDefaultSet(String id) {
    return '기본 → $id';
  }

  @override
  String get artifactsTitle => '산출물';

  @override
  String get artifactsHint => '홈 연결로 앱 안에서 엽니다(공개 URL 불필요).';

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
  String get artifactsTooLarge =>
      '이 파일은 앱 내 8 MB 열기 제한을 초과합니다. 더 작은 내보내기를 에이전트에 요청하거나 가정 PC에서 여세요.';

  @override
  String get artifactsRefresh => '새로고침';

  @override
  String get artifactsRetry => '다시 시도';

  @override
  String get artifactsBinaryHint =>
      '이 파일 형식은 여기서 미리볼 수 없습니다. 공유/저장으로 다른 앱에서 열거나, 텍스트 또는 Markdown 내보내기를 요청하세요.';

  @override
  String get artifactsShare => '공유 / 저장';

  @override
  String artifactsShareFailed(String error) {
    return '공유 실패: $error';
  }

  @override
  String get artifactsCopyLink => '서명된 링크 복사';

  @override
  String get artifactsLinkCopied => '서명된 링크 복사됨';

  @override
  String get artifactsCopyLinkFailed => '링크를 복사할 수 없습니다';

  @override
  String get artifactsOpenInBrowser => '브라우저에서 열기';

  @override
  String get artifactsOpenInBrowserFailed => '브라우저에서 열 수 없습니다';

  @override
  String get filesParent => '상위';

  @override
  String get filesRoots => '루트';

  @override
  String get filesEmptyFolder => '이 폴더는 비어 있습니다';

  @override
  String get artifactsLoTitle => 'LibreOffice(가정 PC)';

  @override
  String get artifactsLoWhy =>
      '인쇄 품질 Word·Excel·PowerPoint·PDF 내보내기는 가정 PC에서 실행(~1 GB, 로컬). 없어도 단순 레이아웃으로 내보내기는 됩니다. 문서는 클라우드로 변환하지 않습니다.';

  @override
  String get artifactsLoReady => '준비됨';

  @override
  String get artifactsLoMissing => '미설치';

  @override
  String get artifactsLoDownloading => '다운로드 중…';

  @override
  String get artifactsLoFailed => '설치 실패';

  @override
  String get artifactsLoInstall => '가정 PC에 설치';

  @override
  String get artifactsLoCancel => '다운로드 취소';

  @override
  String get artifactsLoNotNow => '나중에';

  @override
  String get artifactsLoRefresh => '상태 새로고침';

  @override
  String artifactsLoProgress(String received, String total) {
    return '$received / $total';
  }

  @override
  String get artifactsLoHintCopied => '설치 안내 복사됨';

  @override
  String get artifactsLoCopyHint => '수동 설치 안내 복사';

  @override
  String get artifactsLoInstallNote => '관리 설치는 가정 데몬 호스트에서 실행 — 이 휴대폰 아님.';

  @override
  String get artifactsDataPreferTitle => '데이터 경로(우선순위)';

  @override
  String get artifactsDataPreferStrip =>
      '1) 코어 표 도구 항상 · 2) 오프라인 조인/SQL은 DuckDB · 3) 클라우드 시트/SaaS BI는 Owner MCP.';

  @override
  String get artifactsDataPreferJoinNeed => '채팅에서 오프라인 조인에 필요합니다.';

  @override
  String get artifactsDataBrowseTables => 'output/tables 탐색';

  @override
  String get artifactsDataBrowseCharts => 'output/charts 탐색';

  @override
  String get artifactsSqlTitle => '오프라인 SQL(DuckDB)';

  @override
  String get artifactsSqlWhy =>
      'jail 파일 오프라인 SQL 조인을 위해 가정 PC에 DuckDB 설치. 자동 아님 — 설치를 선택합니다.';

  @override
  String get artifactsSqlReady => '준비됨';

  @override
  String get artifactsSqlMissing => '미설치(선택)';

  @override
  String get artifactsSqlDownloading => '다운로드 중…';

  @override
  String get artifactsSqlFailed => '설치 실패';

  @override
  String get artifactsSqlCancelled => '다운로드 취소됨';

  @override
  String get artifactsSqlInstall => '가정 PC에 DuckDB 설치';

  @override
  String get artifactsSqlCancel => '다운로드 취소';

  @override
  String get artifactsSqlRefresh => '상태 새로고침';

  @override
  String artifactsSqlProgress(String received, String total) {
    return '$received / $total';
  }

  @override
  String get artifactsSqlToolsReady =>
      'sql_load / sql_query를 에이전트가 사용할 수 있습니다.';

  @override
  String get artifactsSqlToolsAbsent =>
      'DuckDB가 준비될 때까지 sql_load / sql_query는 에이전트 카탈로그에서 제외됩니다.';

  @override
  String get artifactsSqlInstallNote => '관리 설치는 가정 데몬 호스트에서 실행 — 이 휴대폰 아님.';

  @override
  String get chatDataAssistHint =>
      '스프레드시트 첨부됨 — 다음 단계 선택(작성란 시드; 쓰기는 Allow 필요):';

  @override
  String get chatDataAssistClean => '정리 및 차트';

  @override
  String get chatDataAssistAsk => '이 표에 대해 질문';

  @override
  String get chatDataAssistJoin => '조인 / SQL';

  @override
  String get chatDataAssistInstallDuckdb => 'DuckDB 설치…';

  @override
  String get chatDataAssistCleanSeed =>
      '첨부한 스프레드시트를 table_transform으로 정리(필요 시 normalize / filter / pipeline), 이어 chart_table로 차트하고 CSV와 차트용 Open 칩을 보여 주세요.';

  @override
  String get chatDataAssistAskSeed =>
      '첨부한 스프레드시트에 무엇이 있나요? 열, 행 수, 샘플 행 몇 개를 요약해 주세요.';

  @override
  String get chatDataAssistJoinSeed =>
      '첨부한 스프레드시트를 sql_load로 불러온 뒤 sql_query로 답하세요(표를 더 첨부하면 조인). 결과 CSV마다 Open 칩을 보여 주세요.';

  @override
  String get chatDataAssistNeedDuckdb =>
      'DuckDB가 준비되지 않음 — 가정 PC에서 시스템 → 파일에서 설치하세요.';

  @override
  String chatOpenFile(String name) {
    return '$name 열기';
  }

  @override
  String chatPendingApprovals(int count) {
    return '승인 대기 $count건';
  }

  @override
  String get choiceCardConfirm => '확인';

  @override
  String get choiceCardOpen => '열기';

  @override
  String get choiceCardChooseFile => '파일 선택';

  @override
  String get choiceCardBrowseJail => '파일 탐색';

  @override
  String get choiceCardBrowseUp => 'Up';

  @override
  String choiceCardFilesChosen(int n) {
    return '파일 $n개 선택됨';
  }

  @override
  String get choiceCardNoFile => '선택한 파일 없음';

  @override
  String get choiceCardFileEmpty => '해당 파일이 비어 있습니다.';

  @override
  String choiceCardFileTypeRefused(String name) {
    return '$name은(는) 허용되지 않는 양식 업로드 형식입니다.';
  }

  @override
  String get choiceCardHandoffHint =>
      '브라우저나 앱에서 열려 결제 등을 완료합니다. Home은 카드 정보를 입력하지 않습니다.';

  @override
  String get choiceCardPickOne => '하나 이상 선택하세요.';

  @override
  String get choiceCardAnswered => '확인했습니다.';

  @override
  String choiceCardFailed(String error) {
    return '선택을 보낼 수 없습니다: $error';
  }

  @override
  String chatPendingChoices(int count) {
    return '선택 대기 $count건';
  }

  @override
  String get choiceCardCancel => '취소';

  @override
  String get choiceCardCanceled => '선택을 취소했습니다.';

  @override
  String get choiceCardExpired => '만료됨';

  @override
  String get choiceCardExpiredHint => '이 선택은 만료되었습니다. 필요하면 다시 물어보세요.';

  @override
  String choiceCardExpiresIn(int mins) {
    return '$mins분 후 만료';
  }

  @override
  String get choiceCardTextPlaceholder => '답변 입력';

  @override
  String get schedulesChatTabChat => '채팅';

  @override
  String get schedulesChatTabHistories => '기록';

  @override
  String get schedulesChatHistoriesHint => '취소·만료된 제안과 최근 실행 기록.';

  @override
  String get jobsHistoriesMovedHint => '미설정 및 실행 기록은 Histories에 있습니다';

  @override
  String schedulesChatClosedAt(String when) {
    return '종료 $when';
  }

  @override
  String schedulesChatRanAt(String when) {
    return '실행 $when';
  }

  @override
  String get welcomeSkip => '건너뛰기';

  @override
  String get welcomeNext => '다음';

  @override
  String get commonContinue => '계속';

  @override
  String get welcomeSlide1Title => 'EnvoyHome에 오신 것을 환영합니다';

  @override
  String get welcomeSlide1Body =>
      '휴대폰은 셀프호스팅 홈 에이전트로 가는 창입니다. 채팅·승인·스마트홈은 데스크톱에 남습니다.';

  @override
  String get welcomeSlide2Title => '작업은 컴퓨터에서 진행됩니다';

  @override
  String get welcomeSlide2Body =>
      '집의 Mac 또는 PC에 EnvoyHome을 설치하세요. 데몬·모델·가구 메모리는 그 기기에 있고, 휴대폰은 원격 창입니다.';

  @override
  String get welcomeSlide3Title => 'QR로 페어링';

  @override
  String get welcomeSlide3Body =>
      '컴퓨터에서 EnvoyHome을 열고 페어링 QR을 표시하세요. 이 휴대폰에서 지금 페어링을 누르고 스캔하세요. 링크를 붙여넣을 수도 있습니다.';

  @override
  String get welcomeSlideRequiredTitle => '시작하려면 페어링';

  @override
  String get welcomeSlideRequiredBody =>
      'EnvoyHome에는 데스크톱 앱이 실행 중인 컴퓨터가 필요합니다. 에이전트와 홈 제어는 그곳에서 실행됩니다. 이 휴대폰을 그 컴퓨터와 페어링하세요.';

  @override
  String get setupGuideTitle => 'EnvoyHome 사용 방법';

  @override
  String get setupGuideIntro =>
      '휴대폰의 EnvoyHome은 집 컴퓨터의 EnvoyHome과 통신합니다. 데스크톱을 설치하고 한 번 페어링하면 어디서든 채팅과 승인이 가능합니다.';

  @override
  String get setupGuidePairRequiredTitle => '계속하려면 페어링';

  @override
  String get setupGuidePairRequiredBody =>
      'EnvoyHome은 집 데스크톱의 휴대폰 동반 앱입니다. 페어링된 컴퓨터가 없으면 여기에 표시할 내용이 아직 없습니다.';

  @override
  String get setupGuideStep1Title => '컴퓨터 준비';

  @override
  String get setupGuideStep1Body =>
      '집의 Mac 또는 Windows/Linux PC가 필요합니다. 그 기기가 EnvoyHome 호스트가 되어 데몬과 에이전트가 실행됩니다.';

  @override
  String get setupGuideStep2Title => 'EnvoyHome 다운로드 및 설치';

  @override
  String get setupGuideStep2Body =>
      'QuickStart를 열고 그 컴퓨터에 데몬과 데스크톱 앱을 설치하세요. 실행한 뒤 계속 켜 두세요.';

  @override
  String get setupGuideDownloadCta => 'EnvoyHome QuickStart 열기';

  @override
  String get setupGuideStep3Title => '페어링 QR 표시';

  @override
  String get setupGuideStep3Body =>
      '데스크톱 EnvoyHome에서 설정 → 기기 페어링. QR을 화면에 유지하세요(LAN만이 아니라 mesh/릴레이 포함).';

  @override
  String get setupGuideStep4Title => '이 휴대폰으로 스캔';

  @override
  String get setupGuideStep4Body =>
      '아래 지금 페어링을 누르세요. 카메라를 허용한 뒤 QR을 스캔하세요. envoy:// 링크나 host:port / SSH도 가능합니다.';

  @override
  String get setupGuideStep5Title => '연결되었습니다';

  @override
  String get setupGuideStep5Body =>
      '페어링이 끝나면 이 휴대폰에 해당 홈의 채팅·승인·설정이 표시됩니다. 휴대폰이 없어도 데스크톱은 계속 실행됩니다.';

  @override
  String get setupGuideNoHomeTitle => '나중에 페어링해도 됩니다';

  @override
  String get setupGuideNoHomeBody =>
      '지금은 계속 둘러보고 연결에서 언제든 페어링할 수 있습니다. 컴퓨터가 없으면 여기에 표시할 내용이 아직 없습니다.';

  @override
  String get setupGuidePairCta => '지금 페어링';

  @override
  String get setupGuidePairLaterCta => '나중에 페어링';

  @override
  String get setupGuideSkipCta => '먼저 둘러보기';

  @override
  String get setupGuideDoneCta => '알겠습니다';

  @override
  String get settingsSetupGuideSubtitle => '데스크톱 설치와 이 휴대폰 페어링 방법.';
}
