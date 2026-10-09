// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Japanese (`ja`).
class AppLocalizationsJa extends AppLocalizations {
  AppLocalizationsJa([String locale = 'ja']) : super(locale);

  @override
  String get appName => 'EnvoyHome';

  @override
  String get appLanguage => '言語';

  @override
  String get pairLede =>
      'EnvoyMesh でホームデスクトップに参加 — QR をスキャン、host:port を入力、または SSH 経由。';

  @override
  String get pairTabLink => 'リンク';

  @override
  String get pairTabHost => 'ホスト:ポート';

  @override
  String get pairTabSsh => 'SSH';

  @override
  String get pairFooter => 'com.envoymesh.envoyhome · ペア後にプッシュ';

  @override
  String get pairCloseScanner => 'スキャナーを閉じる';

  @override
  String get pairScanQr => 'ペアリング QR をスキャン';

  @override
  String get pairUriLabel => 'ペアリング URI';

  @override
  String get pairUriHint => 'envoy://pair?…&app=EnvoyHome';

  @override
  String get pairConnect => '接続';

  @override
  String get pairDirectHint =>
      'このネットワーク（LAN / Tailscale）でデスクトップに接続します。トークンが必要です。';

  @override
  String get pairHostPort => 'ホスト:ポート';

  @override
  String get pairHostPortHint => '192.168.1.10:4780';

  @override
  String get pairToken => 'ペアリングトークン';

  @override
  String get pairTokenHelper => 'デスクトップ設定 → デバイスのペア';

  @override
  String get pairSshHint => 'SSH 経由でトンネルします。デーモンはループバックを見ます — トークンは任意。';

  @override
  String get pairSshHost => 'SSH ホスト';

  @override
  String get pairSshUser => 'ユーザー';

  @override
  String get pairSshUserHint => 'root';

  @override
  String get pairSshPort => 'ポート';

  @override
  String get pairSshPassword => 'SSH パスワード';

  @override
  String get pairDaemon => '向こう側のデーモン';

  @override
  String get pairDaemonHint => '127.0.0.1:4780';

  @override
  String get pairTokenOptional => 'トークン（任意）';

  @override
  String get shellOnline => 'オンライン';

  @override
  String get shellDegraded => '低下';

  @override
  String get shellDisconnect => '切断';

  @override
  String get shellProfilePending => 'プロファイルはこのデバイスのペアリングから選ばれます。';

  @override
  String shellProfileOne(String id) {
    return 'プロファイル · $id';
  }

  @override
  String get shellProfile => 'プロファイル';

  @override
  String shellMeshHint(String mesh) {
    return 'mesh $mesh · タブを引いて更新';
  }

  @override
  String get navChat => 'チャット';

  @override
  String get navApprovals => '承認';

  @override
  String get navModels => 'モデル';

  @override
  String get navArtifacts => '成果物';

  @override
  String get chatNeedAccount => 'チャットの前に上でアカウントを選んでください。';

  @override
  String get chatEmptyMessage => '空のメッセージです。';

  @override
  String get chatSessionTitle => 'スマホチャット';

  @override
  String get chatEmptyTitle => 'ホームエージェントにメッセージ';

  @override
  String get chatEmptyHint => 'ターンはホームデーモンで実行されます。許可が必要なときは、ここで許可/拒否できます。';

  @override
  String get chatHint => 'メッセージ…';

  @override
  String chatSubscribeFailed(String error) {
    return '購読失敗: $error';
  }

  @override
  String chatStatus(String status) {
    return '状態: $status';
  }

  @override
  String chatError(String error) {
    return 'エラー: $error';
  }

  @override
  String get approvalsTitle => '承認';

  @override
  String get approvalsHint => '決定待ちのツールと作動リクエスト。';

  @override
  String get approvalsNeedAccount => '承認を読み込むにはアカウントを選んでください。';

  @override
  String get approvalsEmptyTitle => '受信トレイは空';

  @override
  String get approvalsEmptyHint => 'いま保留はありません。';

  @override
  String get approvalsActuation => '作動';

  @override
  String get approvalsAllow => '許可';

  @override
  String get approvalsDeny => '拒否';

  @override
  String get approvalsAllowed => '許可しました';

  @override
  String get approvalsDenied => '拒否しました';

  @override
  String approvalsFailed(String error) {
    return '失敗: $error';
  }

  @override
  String get modelsTitle => 'モデル';

  @override
  String get modelsOwnerHint => 'ホームマシンで Local または Ollama を有効にします。初回はデスクトップ推奨。';

  @override
  String get modelsReadonlyHint =>
      'このデバイスは読み取り専用です。デスクトップ設定 → モデル（または所有者信頼の端末）で Local を有効にしてください。';

  @override
  String get modelsLocal => 'ローカルモデル';

  @override
  String get modelsOwnerTrusted => 'ローカルエンジン状態には所有者信頼デバイスが必要です。';

  @override
  String get modelsResponding => '応答中';

  @override
  String get modelsNotResponding => '無応答';

  @override
  String get modelsDisabled => '無効';

  @override
  String get modelsGguf => 'ディスク上の GGUF';

  @override
  String get modelsEnableLocal => 'Local を有効化';

  @override
  String get modelsUseOllama => 'Ollama を使う';

  @override
  String get modelsDisable => '無効化';

  @override
  String get modelsLocalOnly => 'アカウントをローカルのみに';

  @override
  String get modelsThisAccount => 'このアカウント';

  @override
  String get modelsNeedAccount => '上で accountId を設定してください。';

  @override
  String modelsDefault(String id) {
    return '既定: $id';
  }

  @override
  String modelsPool(String filter) {
    return 'プール: $filter';
  }

  @override
  String get modelsModeMesh => 'Mesh ローカル';

  @override
  String get modelsModeSpawn => 'Home llama-server';

  @override
  String get modelsModeOllama => 'Ollama';

  @override
  String get modelsModeOff => 'オフ';

  @override
  String get modelsNotConnected => '未接続';

  @override
  String get modelsSetAccount => '既定モデルとプールを見るには accountId を設定。';

  @override
  String get modelsUpdated => '更新しました';

  @override
  String get modelsLocalEnabled => 'Local を有効化しました';

  @override
  String get modelsOllamaEnabled => 'Ollama を有効化しました';

  @override
  String get modelsLocalDisabled => 'Local を無効化しました';

  @override
  String get modelsLocalOnlySet => 'ローカルのみルーティングを設定';

  @override
  String get modelsDefaultLabel => '既定';

  @override
  String get modelsOffLabel => 'オフ';

  @override
  String get artifactsTitle => '成果物';

  @override
  String get artifactsHint => 'ホームデーモンの署名付きリンク。タップで開きます。';

  @override
  String get artifactsNeedAccount => '成果物を一覧するにはアカウントを選んでください。';

  @override
  String get artifactsEmptyTitle => '成果物はまだありません';

  @override
  String get artifactsEmptyHint => 'エージェントがファイルを出したあと引っ張って更新。';

  @override
  String get artifactsUrlCopied => '開けません — URL をコピーしました';

  @override
  String artifactsOpenFailed(String error) {
    return 'オープン失敗: $error';
  }

  @override
  String chatPendingApprovals(int count) {
    return '承認待ち $count 件';
  }
}
