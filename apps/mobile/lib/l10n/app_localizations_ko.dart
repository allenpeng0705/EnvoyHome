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
  String get shellDisconnect => '연결 해제';

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
  String get navChat => '채팅';

  @override
  String get navApprovals => '승인';

  @override
  String get navModels => '모델';

  @override
  String get navArtifacts => '산출물';

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
