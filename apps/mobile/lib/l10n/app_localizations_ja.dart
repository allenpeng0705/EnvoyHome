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
  String get appThemePicker => '外観';

  @override
  String get appThemeSystem => 'システム';

  @override
  String get appThemeLight => 'ライト';

  @override
  String get appThemeDark => 'ダーク';

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
  String get shellOffline => 'オフライン';

  @override
  String get shellConnect => '接続';

  @override
  String get shellReconnect => '再接続';

  @override
  String get shellDisconnect => '切断';

  @override
  String get shellForgetPairing => 'ペアリングを忘れる';

  @override
  String get connectGuideTitle => 'ホームに接続';

  @override
  String get connectGuideHint =>
      'デスクトップの設定 → デバイスのペアリングでQRをスキャンするか、ペアリングリンク／ホストを入力してください。';

  @override
  String get connectGuideReconnectHint =>
      'この端末はすでにペアリング済みです。再接続するか、別のホームなら再度ペアリングしてください。';

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
  String get shellCreateProfile => '作成';

  @override
  String get shellProfileDisplayName => '表示名';

  @override
  String get shellProfileIdOptional => 'アカウント ID（任意）';

  @override
  String get shellCancel => 'キャンセル';

  @override
  String get shellCreate => '作成';

  @override
  String get shellProfileCreated => 'プロファイルを作成しました';

  @override
  String shellProfileCreateFailed(String error) {
    return '作成に失敗：$error';
  }

  @override
  String get navChat => 'チャット';

  @override
  String get navHomeChat => 'ホーム';

  @override
  String get navSchedulesChat => 'スケジュール';

  @override
  String get navSettings => '設定';

  @override
  String get navLlm => 'LLM';

  @override
  String get navConnections => '接続';

  @override
  String get navSkills => 'スキル';

  @override
  String get navSystem => 'システム';

  @override
  String get navProfiles => 'プロファイル';

  @override
  String get navApprovals => '承認';

  @override
  String get navModels => 'モデル';

  @override
  String get navArtifacts => '成果物';

  @override
  String get settingsHubHint =>
      'Configure the home daemon from your phone. Some owner-only actions need a trusted device.';

  @override
  String get settingsProfilesSubtitle => 'オーナー、ワークスペースフォルダ、ツールポリシー';

  @override
  String get settingsLlmSubtitle => 'モデル、ローカル、ルーティング、メモリ';

  @override
  String get settingsConnectionsSubtitle =>
      'Pairing, Home Assistant, MQTT, Channels';

  @override
  String get settingsSkillsSubtitle => 'スキルパックのインストールと管理';

  @override
  String get settingsWorkflowsSubtitle => 'DAG ワークフロー — 下書き、検証、実行';

  @override
  String get settingsSystemSubtitle => 'プロファイル、共有ファイル、ヘルス、許可';

  @override
  String get settingsNeedConnect => '接続すると LLM・接続・スキル・システムを設定できます。';

  @override
  String get profilesIntro =>
      '各人にプロファイルがあります。世帯オーナーがワークスペースフォルダを設定し、所有権を移譲できます。';

  @override
  String get profilesMemberHint => 'このデバイスは世帯オーナーではありません—ワークスペースはここでは読み取り専用です。';

  @override
  String get profilesRefresh => '更新';

  @override
  String get profilesAddTitle => 'プロファイルを追加';

  @override
  String get profilesOwnerBadge => 'オーナー';

  @override
  String get profilesActiveBadge => 'アクティブ';

  @override
  String get profilesWorkspaceTitle => 'ワークスペースフォルダ';

  @override
  String get profilesWorkspaceHint =>
      'ホームマシン上のホストフォルダを追加（最大 16）。エージェントは workspace/<id>/… パスでアクセス。';

  @override
  String get profilesWorkspacePath => 'ホストパス';

  @override
  String get profilesWorkspaceBrowse => 'フォルダを参照';

  @override
  String get profilesWorkspaceBrowseHint => 'タップしてホームマシンを参照';

  @override
  String get profilesWorkspaceUnset => '未設定（サンドボックスのみ）';

  @override
  String get profilesWorkspaceSet => '設定済み';

  @override
  String get profilesWorkspaceWholeMachine => 'マシン全体';

  @override
  String get profilesWorkspaceRo => '読み取り専用';

  @override
  String get profilesWorkspaceRw => '読み書き';

  @override
  String get profilesWorkspaceUseRoot => 'コンピュータルートを追加';

  @override
  String get profilesWorkspaceClear => 'すべてクリア';

  @override
  String get profilesWorkspaceRemove => '削除';

  @override
  String get profilesWorkspaceApply => '追加';

  @override
  String get profilesWorkspaceEdit => 'フォルダを追加';

  @override
  String get profilesWorkspaceRootTitle => 'マシン全体へのアクセスを許可しますか？';

  @override
  String get profilesWorkspaceRootBody =>
      'エージェントが workspace/… 経由でコンピュータルート配下のファイルを読み取り（選択時は書き込み）できます—このスマホからも。';

  @override
  String get profilesWorkspaceRootOk => '許可';

  @override
  String get profilesWorkspaceMemberNote => 'ワークスペースフォルダを変更できるのは世帯オーナーのみです。';

  @override
  String get profilesWorkspaceCrossTitle => '別プロファイルのワークスペースフォルダを追加しますか？';

  @override
  String profilesWorkspaceCrossBody(String name) {
    return '$name 用のホストフォルダを追加します。意図して設定する場合のみ続行してください。';
  }

  @override
  String get profilesWorkspaceDenied => 'このデバイスでは非表示';

  @override
  String get profilesWorkspaceInactive => '設定済みだが非アクティブ（ファイルシステムルートはオーナーのみ有効）';

  @override
  String get profilesRename => '名前変更';

  @override
  String get profilesRenameTitle => 'プロファイルの名前変更';

  @override
  String get profilesRenameSave => '保存';

  @override
  String get profilesTimeZoneUnset => 'タイムゾーン：未設定（スケジュールはホスト既定を使用）';

  @override
  String profilesTimeZoneValue(String tz) {
    return 'タイムゾーン：$tz';
  }

  @override
  String get profilesTimeZoneEdit => 'タイムゾーン';

  @override
  String get profilesTimeZoneTitle => 'アカウントのタイムゾーン';

  @override
  String get profilesTimeZoneHint => 'IANA 名、例：Asia/Tokyo';

  @override
  String get profilesTimeZoneSave => '保存';

  @override
  String profilesTimeZoneDone(String tz) {
    return 'タイムゾーンを $tz に設定しました';
  }

  @override
  String get profilesShareLocationTitle => 'Home と位置情報を共有';

  @override
  String get profilesShareLocationSubtitle =>
      'チャットターンに概算 GPS を付与します。権限はこの画面で一度だけ要求し、送信のたびに問いません。一時注入のみ — メモリには保存しません。';

  @override
  String get profilesShareLocationDenied => '位置情報の許可がありません。共有はオフのままです。';

  @override
  String get profilesShareLocationOn => 'この端末で位置情報の共有をオンにしました';

  @override
  String get profilesDelete => '削除';

  @override
  String get profilesDeleteTitle => 'プロファイルを削除しますか？';

  @override
  String profilesDeleteBody(String name) {
    return '$name を削除しますか？サンドボックスとワークスペース設定が削除されます。元に戻せません。';
  }

  @override
  String get profilesDeleteConfirm => '削除';

  @override
  String profilesDeleteDone(String name) {
    return '$name を削除しました';
  }

  @override
  String get profilesDeleteOwnerBlocked => '世帯オーナーは削除できません。先に所有権を移譲してください。';

  @override
  String get profilesTransferTitle => '世帯オーナーを移譲しますか？';

  @override
  String profilesTransferBody(String name) {
    return '$name を世帯オーナーにします。ペアリング、バインド、世帯設定を管理します。';
  }

  @override
  String get profilesTransferConfirm => '移譲';

  @override
  String profilesTransferDone(String name) {
    return 'オーナーは現在 $name です';
  }

  @override
  String profilesTransferFailed(String error) {
    return '移譲に失敗：$error';
  }

  @override
  String profilesTransferTo(String name) {
    return '$name に移譲';
  }

  @override
  String get profilesToolPolicy => 'ツールポリシー';

  @override
  String get profilesToolPolicyStandard => '標準';

  @override
  String get profilesToolPolicyRestricted => '制限';

  @override
  String get connMintPairing => 'ペアリングコードを発行';

  @override
  String get connMintOk => 'ペアリングコードを発行しました';

  @override
  String get connMintUriHint => '新しいデバイスでこの URI をスキャンまたは貼り付け。';

  @override
  String get connPairingOwnerOnly => 'ペアリングコードの発行/失効には世帯オーナーデバイスが必要です。';

  @override
  String get connRevokeDevice => '失効';

  @override
  String get connForgetDevice => '忘れる';

  @override
  String connRevokeConfirm(String id) {
    return 'デバイス $id を失効しますか？再ペアリングが必要になります。';
  }

  @override
  String connForgetConfirm(String id) {
    return 'デバイス $id を忘れますか？ペアリング記録は完全に削除されます。';
  }

  @override
  String get connOwnerWriteOnly => 'この設定を変更できるのは世帯オーナーデバイスのみです。';

  @override
  String get connAccountsHint => '世帯プロファイル';

  @override
  String get homeChatSessionTitle => 'スマホホームチャット';

  @override
  String get homeChatEmptyTitle => 'ホームに話しかける';

  @override
  String get homeChatEmptyHint => 'スマートホームツールはここでも利用可能。実行は引き続き承認が必要です。';

  @override
  String get homeChatHint => '照明、鍵、空調などについて質問…';

  @override
  String get schedulesChatSessionTitle => 'スケジュール';

  @override
  String get schedulesChatEmptyTitle => 'リマインダー';

  @override
  String get schedulesChatEmptyHint => 'この会話はリマインダー向けです。有効化の前に時刻を確認します。';

  @override
  String get schedulesChatHint => 'リマインドして…';

  @override
  String get chatAttach => '添付';

  @override
  String chatAttachTooMany(int n) {
    return 'ファイルは最大 $n 個';
  }

  @override
  String chatAttachTooLarge(String name, String mb) {
    return '$name が $mb MB を超えています';
  }

  @override
  String chatAttachAdded(int n) {
    return '$n 個のファイルを添付しました';
  }

  @override
  String get chatAttachedOnly => '（添付のみ）';

  @override
  String get chatVoiceStart => '音声入力';

  @override
  String get chatVoiceStop => '音声入力を停止';

  @override
  String get chatVoiceUnsupported => 'このデバイスでは音声認識を利用できません。';

  @override
  String get llmTabModels => 'モデル';

  @override
  String get llmTabLocal => 'ローカル';

  @override
  String get llmTabRouting => 'ルーティング';

  @override
  String get llmTabMemory => 'メモリ';

  @override
  String get llmLocalDownloadHint =>
      'Hugging Face を検索し、GGUF ファイルをホームマシンにダウンロード。';

  @override
  String get llmHfSearchHint => 'モデルを検索…';

  @override
  String get llmSearch => '検索';

  @override
  String get llmCancelDownload => 'キャンセル';

  @override
  String get llmResumeDownload => '再開';

  @override
  String llmGgufFiles(String repo) {
    return '$repo 内の GGUF';
  }

  @override
  String get llmRoutingHint => 'このプロファイルでターンを実行できる場所を選択。';

  @override
  String get llmFilterAny => 'スマート / 任意';

  @override
  String get llmFilterCloud => 'クラウドのみ';

  @override
  String get llmFilterLocal => 'ローカルのみ';

  @override
  String get llmAutoSwitch => '自動モデル切替';

  @override
  String get privacyModeTitle => 'プライバシーモード';

  @override
  String get privacyModeHint => 'ローカル推論を強制しクラウドツールをブロック。オーナースコープ。';

  @override
  String get privacyModeEnabled => 'プライバシーモードを有効化';

  @override
  String get privacyModeBlockEgress => 'スマートホーム実行とイベントソース通知もブロック';

  @override
  String get privacyModeOwnerOnly => 'プライバシーモードはこのデバイスではオーナーのみ。';

  @override
  String get llmCompactNow => '今すぐメモリを圧縮';

  @override
  String get llmFlushEnabled => '常設メモをフラッシュ';

  @override
  String get llmReviewEnabled => '学習書き込み前に確認';

  @override
  String get llmInjectMode => '注入予算モード';

  @override
  String get llmInjectAuto => '自動';

  @override
  String get llmInjectBaseline => 'ベースライン';

  @override
  String get llmInjectCustom => 'カスタム';

  @override
  String get llmPendingLearns => '保留中の学習';

  @override
  String get llmNoPendingLearns => '保留中の学習はありません。';

  @override
  String get connTabPairing => 'ペアリング';

  @override
  String get connTabHa => 'Home Assistant';

  @override
  String get connTabMqtt => 'MQTT';

  @override
  String get connTabChannels => 'チャネル';

  @override
  String get connTabWebSearch => 'Web 検索';

  @override
  String get connTabMcp => 'MCP';

  @override
  String get connTabBrowser => 'ブラウザ';

  @override
  String get mcpLede =>
      '任意の MCP サーバーを追加できます。有効化する前に接続をテストしてください。Stdio コマンドはデーモンホストユーザーとして実行されます。ツール呼び出しは引き続き承認が必要です。';

  @override
  String get mcpTest => 'テスト';

  @override
  String get mcpAddServer => 'サーバーを追加';

  @override
  String get mcpSave => '保存';

  @override
  String get mcpReady => '準備完了';

  @override
  String get mcpNotTested => '未テスト';

  @override
  String mcpServerSubtitle(String transport, String status, int count) {
    return '$transport · $status · ツール $count 個';
  }

  @override
  String mcpTestOk(int count) {
    return '成功 — ツール $count 個。準備できたら有効化してください。';
  }

  @override
  String mcpTestFailed(String error) {
    return '失敗: $error';
  }

  @override
  String get mcpUnknownError => '不明';

  @override
  String get connDeviceRevoked => '取り消し済み';

  @override
  String connDeviceSubtitle(String id, String accounts, String revokedSuffix) {
    return '$id · $accounts$revokedSuffix';
  }

  @override
  String get mcpLabel => 'ラベル';

  @override
  String get mcpCommand => 'コマンド';

  @override
  String get mcpArgs => '引数（スペース区切り、任意）';

  @override
  String get mcpUrl => 'URL';

  @override
  String get mcpAuthToken => '認証トークン（任意）';

  @override
  String get mcpEnv => '環境変数（1行に KEY=value、任意）';

  @override
  String get browserControlLede =>
      'ホーム PC の管理ブラウザ（Auto は Obscura 優先、なければ Chromium）、または個人 Chrome / リモート CDP を接続。既定はオフ。';

  @override
  String get browserControlDaemonHostNote =>
      'ブラウザセッションはホーム PC で実行。ここの設定はデスクトップの接続 → ブラウザと同期。';

  @override
  String get browserControlEnabled => 'ブラウザツールを有効化';

  @override
  String get browserControlUnattended => 'スケジュールに管理プロファイルを許可';

  @override
  String get browserControlReady => '準備完了';

  @override
  String get browserControlNotReady => '未準備';

  @override
  String get browserControlSave => '保存';

  @override
  String get browserControlSaved => 'ブラウザ設定を保存しました。';

  @override
  String get browserControlSaveFailed => 'ブラウザ設定を保存できませんでした。';

  @override
  String get browserControlDefaultProfile => 'デフォルトプロファイル';

  @override
  String get browserControlProfileManaged => '管理（分離）';

  @override
  String get browserControlProfilePersonal => '個人 Chrome';

  @override
  String get browserControlProfileRemote => 'リモート CDP';

  @override
  String get browserControlElevatedWarn =>
      '個人/リモートはログイン済みサイトであなたとして操作可能。オーナーのみ。スケジュール不可。';

  @override
  String get browserControlAcknowledge => 'ブラウザの高度なリスクを理解しました';

  @override
  String get browserControlPersonalEnabled => '個人 Chrome を有効化';

  @override
  String get browserControlPersonalCdp => '個人 CDP（ループバック）';

  @override
  String get browserControlPersonalReady => '個人 CDP 接続中';

  @override
  String get browserControlPersonalNotReady => '個人 CDP 未接続';

  @override
  String get browserControlRemoteEnabled => 'リモート CDP を有効化';

  @override
  String get browserControlRemoteCdp => 'リモート CDP URL';

  @override
  String get browserControlRemoteToken => 'リモート CDP トークン';

  @override
  String get browserControlTokenSet => '設定済み';

  @override
  String get browserControlTokenPlaceholder => '空欄のまま維持';

  @override
  String get browserControlRemoteReady => 'リモート CDP 接続中';

  @override
  String get browserControlRemoteNotReady => 'リモート CDP 未接続';

  @override
  String get browserControlOwnerOnly => 'ブラウザ制御を変更できるのは世帯オーナーデバイスのみです。';

  @override
  String get browserControlAcknowledged =>
      '高度なリスクを確認済み。個人/リモートを無効にすると使用を止められます。';

  @override
  String get webSearchLede =>
      'チャットから公開 Web を検索。既定：DuckDuckGo、必要ならブラウザで Bing/Google/Baidu（API キー不要）。Brave と Tavily はオーナーの API キーが必要。';

  @override
  String get webSearchEnabled => 'web_search を有効化';

  @override
  String get webSearchProvider => 'プロバイダー';

  @override
  String get webSearchProviderBrowser => 'ブラウザ（Bing / Google / Baidu）';

  @override
  String get webSearchBrowserPrimaryHint =>
      'デーモンホストのヘッドレスエンジンで Bing/Google/Baidu を直接検索（Obscura 準備済みなら Obscura、そうでなければ Chromium）。有人チャットは検索前に毎回確認。';

  @override
  String get webSearchDaemonHostNote =>
      'エンジンと深掘りは EnvoyHome をホストするホーム PC で実行。このスマホは表示と（オーナーによる）共有設定の編集のみ。';

  @override
  String get webSearchEffectiveUnresolved => 'まだ準備できていません';

  @override
  String get webSearchApiKey => 'API キー';

  @override
  String get webSearchApiKeyHint => '空欄のまま現在のキーを維持';

  @override
  String get webSearchReady => '準備完了';

  @override
  String get webSearchNotReady => '未準備';

  @override
  String get webSearchSave => '保存';

  @override
  String get webSearchSaved => 'Web 検索設定を保存しました。';

  @override
  String get webSearchSaveFailed => 'Web 検索設定を保存できませんでした。';

  @override
  String get webSearchOwnerOnly => 'Web 検索を変更できるのは世帯オーナーデバイスのみです。';

  @override
  String get webSearchBrowserFallback =>
      'ブラウザフォールバック（API/DDG 失敗または未設定時に Bing/Google/Baidu）';

  @override
  String get webSearchBrowserFallbackHint =>
      '既定でオン（ゼロ設定検索）。有人チャットはブラウザ段階の前に確認。SERP は CAPTCHA やブロックの可能性あり。';

  @override
  String get webSearchResearchEnabled => 'Web リサーチ（検索後に上位ページを深掘り）';

  @override
  String get webSearchResearchHint =>
      '既定はオフ。web_research を有効化：上位結果を深掘りし、整理された要約とリンクを返す。';

  @override
  String get webSearchDigDepth => '深掘り深度（1〜10 ページ）';

  @override
  String get webSearchExtractBackend => 'ページ抽出バックエンド';

  @override
  String get webSearchExtractBackendAuto =>
      '自動（Obscura 準備済みなら Obscura、そうでなければ HTTP 取得）';

  @override
  String get webSearchExtractBackendFetch => 'HTTP 取得';

  @override
  String get webSearchExtractBackendObscura => 'Obscura（JS レンダリング Markdown）';

  @override
  String get webSearchExtractBackendHint =>
      '自動はデーモンホストに Obscura があれば優先、そうでなければはプレーン HTTP 取得。';

  @override
  String get webSearchEffectiveExtract => '現在有効な深掘りバックエンド';

  @override
  String get webSearchObscuraReady => 'デーモンホストで Obscura 準備完了';

  @override
  String get webSearchObscuraMissing => 'デーモンホストに Obscura 未インストール';

  @override
  String get webSearchObscuraInstallHintNote =>
      'デスクトップ版は Obscura を同梱（または初回起動でデーモンが自動インストール）。EnvoyHome を動かすホーム PC（このスマホではない）で ENVOYHOME_OBSCURA / PATH を上書き後、設定を開き直してください。';

  @override
  String get webSearchSerpBrowserEngine => 'ブラウザ SERP エンジン';

  @override
  String get webSearchSerpBrowserEngineAuto =>
      '自動（Obscura 準備済みなら Obscura、そうでなければ Chromium）';

  @override
  String get webSearchSerpBrowserEngineChromium => 'Chromium';

  @override
  String get webSearchSerpBrowserEngineObscura => 'Obscura';

  @override
  String get webSearchSerpBrowserEngineHint =>
      '自動は Bing/Google/Baidu に Obscura を優先、次に Playwright Chromium。';

  @override
  String get webSearchEffectiveSerp => '現在有効な SERP エンジン';

  @override
  String get browserControlManagedEngine => '管理ブラウザエンジン';

  @override
  String get browserControlManagedEngineAuto =>
      '自動（Obscura 準備済みなら Obscura、そうでなければ Chromium）';

  @override
  String get browserControlManagedEngineChromium => 'Chromium';

  @override
  String get browserControlManagedEngineObscura => 'Obscura';

  @override
  String get browserControlManagedEngineHint =>
      '自動は管理ブラウザに Obscura を優先。個人/リモートは常に実 Chrome CDP。';

  @override
  String get browserControlEffectiveManaged => '現在有効な管理エンジン';

  @override
  String get webSearchEngines => '検索エンジン（順：Bing → Google → Baidu）';

  @override
  String get webSearchEnginesHint =>
      'ブラウザフォールバック時、この順でチェック済みエンジンを試行し、結果が得られるまで続行。';

  @override
  String get webSearchEnginesRequired =>
      'ブラウザフォールバックには Bing、Google、Baidu のいずれかを最低 1 つ選択。';

  @override
  String get webSearchEngineBing => 'Bing';

  @override
  String get webSearchEngineGoogle => 'Google';

  @override
  String get webSearchEngineBaidu => 'Baidu';

  @override
  String get webSearchBrowserReady => 'デーモンホストで Playwright Chromium 準備完了';

  @override
  String get webSearchBrowserMissing => 'デーモンホストに Playwright Chromium 未インストール';

  @override
  String get webSearchInstallHintNote =>
      'Playwright はデーモンに含まれます。EnvoyHome を動かすホーム PC（このスマホではない）で Chromium をダウンロードし、設定を開き直し；状態が未準備のままならデーモンを再起動。';

  @override
  String get webSearchCopyHint => 'インストールコマンドをコピー';

  @override
  String get webSearchUnattendedBrowser => 'スケジュールでブラウザフォールバックを許可';

  @override
  String get connPairingHint => '世帯オーナーデバイスはここでペアリングを発行・失効できます。メンバーは状態のみ表示。';

  @override
  String get connNoDevices => 'ペア済みデバイスはありません。';

  @override
  String get connEnabled => '有効';

  @override
  String get connDisabled => '無効';

  @override
  String get connReady => '準備完了';

  @override
  String get connHealthy => '正常';

  @override
  String get connUnhealthy => '異常';

  @override
  String get connHaUrl => 'HA ベース URL';

  @override
  String get connHaToken => 'アクセストークン';

  @override
  String get connMqttUrl => 'ブローカー URL';

  @override
  String get connMqttPassword => 'パスワード';

  @override
  String get connSaveEnable => '保存して有効化';

  @override
  String get connBindTitle => 'オブジェクトバインド';

  @override
  String connBoundTo(String id) {
    return '$id にバインド';
  }

  @override
  String get connUnbound => '未バインド';

  @override
  String get connChannelsHint => 'ボットトークンを貼り付けて有効化。初回設定はデスクトップを推奨。';

  @override
  String get connBotToken => 'ボットトークン';

  @override
  String get connDisable => '無効化';

  @override
  String get connSenderBinds => '送信者 → プロファイル';

  @override
  String get connSenderBindsHint => 'IM 送信者 ID をアクティブプロファイルにリンク。';

  @override
  String get connBindChannel => 'チャネル';

  @override
  String get connChannelAccount => 'チャネルアカウント';

  @override
  String get connSenderId => '送信者 ID';

  @override
  String get connBindSender => '送信者をバインド';

  @override
  String get skillsTabSkills => 'スキル';

  @override
  String get skillsVerify => '検証';

  @override
  String get skillsVerified => 'スキルを検証しました';

  @override
  String get skillsTabWorkflows => 'ワークフロー';

  @override
  String get skillsTabSchedules => 'スケジュール';

  @override
  String get skillsTabScenes => 'シーン';

  @override
  String get schedulesTabJobs => 'ジョブ';

  @override
  String get scenesHint => '条件→実行の世帯自動化（世帯ルール）。在宅テンプレートにはプライバシーモードが必要。';

  @override
  String get scenesWhenPresence => '在宅（cron なし — センサートリガー）';

  @override
  String get scenesNone => 'シーンはまだありません。';

  @override
  String get scenesAddMorning => 'おはようを追加';

  @override
  String get scenesPrivacyRequired => '在宅シーンの前にプライバシーモードを有効化（LLM → ルーティング）。';

  @override
  String get skillsInstallUrl => 'URL からインストール';

  @override
  String get skillsInstall => 'インストール';

  @override
  String get skillsClawHubSearch => 'ClawHub 検索';

  @override
  String get schedWhenHint => '条件（自然言語）';

  @override
  String get schedMessageHint => 'リマインダーメッセージ';

  @override
  String get schedPropose => '提案';

  @override
  String get schedConfirm => 'Confirm reminder';

  @override
  String get scheduleCardTitle => 'このリマインダーを設定しますか？';

  @override
  String get scheduleCardConfirm => '確認';

  @override
  String get scheduleCardCancel => 'キャンセル';

  @override
  String get scheduleCardConfirmedToast => 'リマインダーを設定しました。';

  @override
  String get scheduleCardCanceledToast => 'リマインダーをキャンセルしました。';

  @override
  String get scheduleCardFailed => 'そのリマインダーを更新できませんでした。';

  @override
  String get schedKindNotify => '通知';

  @override
  String get schedKindWorkflow => 'ワークフロー';

  @override
  String get schedKindTool => 'ツール';

  @override
  String get schedWorkflowId => 'ワークフロー ID';

  @override
  String get schedToolName => 'ツール名';

  @override
  String get schedKindAgent => 'エージェント';

  @override
  String get schedAgentPrompt => 'エージェントプロンプト';

  @override
  String get schedTabRepeating => '繰り返し';

  @override
  String get schedTabOnce => '一度だけ';

  @override
  String get schedTabHistory => '履歴';

  @override
  String get schedNoneRepeating => '繰り返しスケジュールはまだありません。';

  @override
  String get schedNoneOnce => '一度きりのリマインダーはありません。';

  @override
  String get schedNoReceipts => '実行履歴はまだありません。';

  @override
  String get schedHistoryNotSet => '未設定';

  @override
  String get schedHistoryRuns => '実行回数';

  @override
  String get schedNoDismissed => 'キャンセルした提案はありません。';

  @override
  String get schedDismissedCanceled => 'キャンセル';

  @override
  String get schedDismissedExpired => '期限切れ';

  @override
  String get schedNext => '次回';

  @override
  String get schedKindRepeating => '繰り返し';

  @override
  String get schedKindOnce => '一度';

  @override
  String get schedKindDaily => '毎日';

  @override
  String get schedKindWeekdays => '平日';

  @override
  String get schedKindWeekly => '毎週';

  @override
  String get schedKindMonthly => '毎月';

  @override
  String get schedKindYearly => '毎年';

  @override
  String get schedKindEvery => '毎';

  @override
  String schedDayOfMonth(String d) {
    return '$d日';
  }

  @override
  String get wfEditorTitle => 'ワークフロー';

  @override
  String get wfEnable => '有効化';

  @override
  String get wfDisable => '無効化';

  @override
  String get wfTools => 'ツールを挿入';

  @override
  String get wfId => 'ワークフロー ID';

  @override
  String get wfAiPrompt => 'ワークフローを記述';

  @override
  String get wfAiPromptHint => '例：誰もいなければ 23 時に照明を消す';

  @override
  String get wfAiDraft => 'AI で下書き';

  @override
  String get wfDiagramNodes => 'ノード（スマホ図）';

  @override
  String get wfNoNodes => 'ノードはまだありません—下書きまたは YAML を貼り付け。';

  @override
  String get wfYaml => 'YAML';

  @override
  String get wfSave => '検証して保存';

  @override
  String get wfRun => 'テスト実行';

  @override
  String get wfDrafted => '下書きを適用しました';

  @override
  String get wfSaved => '保存しました';

  @override
  String get wfRan => '実行を開始しました';

  @override
  String get sysTabFiles => 'ファイル';

  @override
  String get sysTabHealth => 'ヘルス';

  @override
  String get sysTabGrants => '許可';

  @override
  String get sysTabMachine => 'このマシン';

  @override
  String get sysMachineHint =>
      'home.health からのデーモン待受状態。OS サービスのインストール/再起動はホームデスクトップのループバックのみ—メッシュ経由は不可。';

  @override
  String get sysMachineDaemonOk => 'デーモンに到達可能';

  @override
  String get sysMachineDaemonBad => 'デーモンヘルス失敗';

  @override
  String get sysMachineWsPort => 'WebSocket ポート';

  @override
  String get sysMachineHttpPort => 'HTTP ハッチポート';

  @override
  String get sysMachinePublicUrl => '公開ベース URL';

  @override
  String get sysMachinePublicUrlEmpty => '未設定';

  @override
  String get sysMachineUptime => '稼働時間';

  @override
  String get sysMachineConnections => 'クライアント / アクティブターン';

  @override
  String get sysMachineMesh => 'Mesh';

  @override
  String get sysMachineOsServiceNote =>
      'OS サービスのインストールまたは再起動はデスクトップの設定 → システム → このマシン（ループバックオーナー）から。';

  @override
  String get sysMachineRefresh => '更新';

  @override
  String get sysTestPush => 'テストプッシュを送信';

  @override
  String get sysTestPushSent => 'テストプッシュを要求しました';

  @override
  String get wfModeYaml => 'YAML';

  @override
  String get wfModeDiagram => '図';

  @override
  String get wfDiagramEmpty => 'ステップはまだありません—下書きまたは YAML を編集。';

  @override
  String get wfDiagramEdge => '↓';

  @override
  String get sysDoctorFix => '修正';

  @override
  String get sysDoctorFixAll => 'すべて修正';

  @override
  String sysDoctorFixed(String ids) {
    return '修正済み：$ids';
  }

  @override
  String get sysNoIssues => 'ドクター問題はありません。';

  @override
  String get sysNoGrants => '許可はありません。';

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
  String get chatThought => '思考';

  @override
  String get chatNew => '新しいチャット';

  @override
  String get chatNewNamePrompt => 'チャット名';

  @override
  String get chatNewNamePlaceholder => '例：週末の予定';

  @override
  String get chatNewNameHint => '今すぐ名前を付けるか、名前なしで開始（最初のメッセージがタイトルになります）。';

  @override
  String get chatNewSkip => '名前なしで開始';

  @override
  String get chatNewCreate => '作成';

  @override
  String get chatNewNeedName => '名前を入力するか、「名前なしで開始」を選んでください。';

  @override
  String get chatNewStart => '開始';

  @override
  String get chatOpenArtifact => '全文を開く';

  @override
  String get chatPromoteKnowledge => 'ナレッジに追加';

  @override
  String chatPromotedKnowledge(String path) {
    return '$path に保存しました';
  }

  @override
  String get chatPromoteFailed => 'ナレッジに追加できませんでした。';

  @override
  String get chatRecents => '履歴';

  @override
  String get chatRecentsEmpty => '以前のチャットはありません。';

  @override
  String get chatSessionsEmpty => 'チャットはまだありません。新規作成してください。';

  @override
  String get chatUntitled => '無題のチャット';

  @override
  String get chatRenameAction => '名前を変更';

  @override
  String get chatRenamePrompt => 'チャット名';

  @override
  String get chatRenameDone => '名前を変更しました。';

  @override
  String get chatRenameEmpty => '名前を空にはできません。';

  @override
  String get chatRenameNeedSession => '先にメッセージを送ってから名前を変更してください。';

  @override
  String get chatBusyTurn => '現在の返信が終わるまで待つか、キャンセルしてください。';

  @override
  String get chatEmptyAction => 'チャットを空に';

  @override
  String get chatEmptyConfirmTitle => 'このチャットを空にしますか？';

  @override
  String get chatEmptyConfirmBody => 'このスレッドのメッセージはすべて削除されます。チャット自体は残ります。';

  @override
  String get chatTrashMenu => 'チャット操作';

  @override
  String get chatArchiveAction => 'チャットをアーカイブ';

  @override
  String get chatUnarchiveAction => 'チャット一覧に戻す';

  @override
  String get chatUnarchiveDone => 'チャットを復元しました。';

  @override
  String get chatArchivedOpen => 'アーカイブ';

  @override
  String get chatTabActive => 'チャット';

  @override
  String get chatTabArchived => 'アーカイブ';

  @override
  String get homeFolderTitle => 'フォルダを選択';

  @override
  String get homeFolderSelect => '選択';

  @override
  String get homeFolderDrives => 'ドライブ';

  @override
  String get homeFolderComputer => 'コンピュータ';

  @override
  String get homeFolderHome => 'ホーム';

  @override
  String get homeFolderParent => '親フォルダ';

  @override
  String get homeFolderNoSubfolders => 'サブフォルダなし';

  @override
  String get chatArchivedTitle => 'アーカイブ済みチャット';

  @override
  String get chatArchivedBack => 'チャット一覧に戻る';

  @override
  String get chatArchivedEmpty => 'アーカイブ済みチャットはありません。';

  @override
  String get chatRemoveAction => 'チャットを削除';

  @override
  String get chatArchiveConfirmTitle => 'このチャットをアーカイブしますか？';

  @override
  String get chatArchiveConfirmBody => '履歴から隠れますがディスク上に残ります。';

  @override
  String get chatRemoveConfirmTitle => 'このチャットを削除しますか？';

  @override
  String get chatRemoveConfirmBody => 'チャットとすべてのメッセージを完全に削除します。';

  @override
  String get chatRemoveDone => 'チャットを削除しました。';

  @override
  String get chatNoSession => 'アクティブなチャットがありません。';

  @override
  String get chatDeleteFailed => 'サーバーでメッセージを削除できませんでした。';

  @override
  String get chatDeleteMessage => 'メッセージを削除';

  @override
  String get chatCopyMessage => 'メッセージをコピー';

  @override
  String get chatCopied => 'コピーしました';

  @override
  String get chatCancel => 'キャンセル';

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
  String get modelsModeSpawn => 'ホーム llama-server';

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
  String get modelsTest => 'テスト';

  @override
  String get modelsSetDefault => '既定に設定';

  @override
  String modelsTestOk(String id) {
    return '$id をテストしました';
  }

  @override
  String modelsDefaultSet(String id) {
    return '既定 → $id';
  }

  @override
  String get artifactsTitle => '成果物';

  @override
  String get artifactsHint => 'ホーム接続経由でアプリ内表示（公開 URL 不要）。';

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
  String get artifactsTooLarge =>
      'このファイルはアプリ内 8 MB の開封制限を超えています。エージェントに小さな書き出しを依頼するか、ホームマシンで開いてください。';

  @override
  String get artifactsRefresh => '更新';

  @override
  String get artifactsRetry => '再試行';

  @override
  String get artifactsBinaryHint =>
      'このファイル形式はここではプレビューできません。共有/保存で他のアプリを開くか、テキストまたは Markdown の書き出しを依頼してください。';

  @override
  String get artifactsShare => '共有 / 保存';

  @override
  String artifactsShareFailed(String error) {
    return '共有できませんでした: $error';
  }

  @override
  String get artifactsCopyLink => '署名付きリンクをコピー';

  @override
  String get artifactsLinkCopied => '署名付きリンクをコピーしました';

  @override
  String get artifactsCopyLinkFailed => 'リンクをコピーできませんでした';

  @override
  String get artifactsOpenInBrowser => 'ブラウザで開く';

  @override
  String get artifactsOpenInBrowserFailed => 'ブラウザで開けませんでした';

  @override
  String get filesParent => '親';

  @override
  String get filesRoots => 'ルート';

  @override
  String get filesEmptyFolder => 'このフォルダは空です';

  @override
  String get artifactsLoTitle => 'LibreOffice（ホーム PC）';

  @override
  String get artifactsLoWhy =>
      '印刷品質の Word・Excel・PowerPoint・PDF 書き出しはホーム PC で実行（約 1 GB、ローカル）。未インストールでも簡易レイアウトで動作。変換のためにドキュメントをクラウドへ送ることはありません。';

  @override
  String get artifactsLoReady => '準備完了';

  @override
  String get artifactsLoMissing => '未インストール';

  @override
  String get artifactsLoDownloading => 'ダウンロード中…';

  @override
  String get artifactsLoFailed => 'インストール失敗';

  @override
  String get artifactsLoInstall => 'ホーム PC にインストール';

  @override
  String get artifactsLoCancel => 'ダウンロードをキャンセル';

  @override
  String get artifactsLoNotNow => 'あとで';

  @override
  String get artifactsLoRefresh => '状態を更新';

  @override
  String artifactsLoProgress(String received, String total) {
    return '$received / $total';
  }

  @override
  String get artifactsLoHintCopied => 'インストールヒントをコピーしました';

  @override
  String get artifactsLoCopyHint => '手動インストールヒントをコピー';

  @override
  String get artifactsLoInstallNote => '管理インストールはホームデーモンホストで実行—このスマホではありません。';

  @override
  String get artifactsDataPreferTitle => 'データ経路（優先順）';

  @override
  String get artifactsDataPreferStrip =>
      '1) コア表ツールは常時 · 2) DuckDB でオフライン結合/SQL · 3) オーナー MCP でクラウド表/SaaS BI。';

  @override
  String get artifactsDataPreferJoinNeed => 'チャット内のオフライン結合に必要。';

  @override
  String get artifactsDataBrowseTables => 'output/tables を閲覧';

  @override
  String get artifactsDataBrowseCharts => 'output/charts を閲覧';

  @override
  String get artifactsSqlTitle => 'オフライン SQL（DuckDB）';

  @override
  String get artifactsSqlWhy =>
      'jail ファイルのオフライン SQL 結合にホーム PC へ DuckDB をインストール。自動ではありません—インストールは自分で選択。';

  @override
  String get artifactsSqlReady => '準備完了';

  @override
  String get artifactsSqlMissing => '未インストール（任意）';

  @override
  String get artifactsSqlDownloading => 'ダウンロード中…';

  @override
  String get artifactsSqlFailed => 'インストール失敗';

  @override
  String get artifactsSqlCancelled => 'ダウンロードをキャンセルしました';

  @override
  String get artifactsSqlInstall => 'ホーム PC に DuckDB をインストール';

  @override
  String get artifactsSqlCancel => 'ダウンロードをキャンセル';

  @override
  String get artifactsSqlRefresh => '状態を更新';

  @override
  String artifactsSqlProgress(String received, String total) {
    return '$received / $total';
  }

  @override
  String get artifactsSqlToolsReady => 'sql_load / sql_query がエージェントで利用可能。';

  @override
  String get artifactsSqlToolsAbsent =>
      'DuckDB 準備まで sql_load / sql_query はエージェントカタログに出ません。';

  @override
  String get artifactsSqlInstallNote => '管理インストールはホームデーモンホストで実行—このスマホではありません。';

  @override
  String get chatDataAssistHint =>
      'スプレッドシートを添付—次のステップを選択（入力欄にシード、書き込みは依然 Allow が必要）：';

  @override
  String get chatDataAssistClean => '整理とチャート';

  @override
  String get chatDataAssistAsk => 'この表について質問';

  @override
  String get chatDataAssistJoin => '結合 / SQL';

  @override
  String get chatDataAssistInstallDuckdb => 'DuckDB をインストール…';

  @override
  String get chatDataAssistCleanSeed =>
      '添付スプレッドシートを table_transform で整理（正規化/フィルター/パイプラインなど）、続けて chart_table、CSV とチャートの Open チップを表示してください。';

  @override
  String get chatDataAssistAskSeed => '添付スプレッドシートの内容は？列、行数、サンプル行を要約してください。';

  @override
  String get chatDataAssistJoinSeed =>
      '添付を sql_load で読み込み、sql_query で回答（他の表を添付すれば結合可）。結果 CSV の Open チップを表示。';

  @override
  String get chatDataAssistNeedDuckdb =>
      'DuckDB の準備ができていません—ホーム PC のシステム → ファイルでインストール。';

  @override
  String chatOpenFile(String name) {
    return '$name を開く';
  }

  @override
  String chatPendingApprovals(int count) {
    return '承認待ち $count 件';
  }

  @override
  String get choiceCardConfirm => '確認';

  @override
  String get choiceCardOpen => '開く';

  @override
  String get choiceCardChooseFile => 'ファイルを選択';

  @override
  String get choiceCardBrowseJail => 'ファイルを参照';

  @override
  String get choiceCardBrowseUp => 'Up';

  @override
  String choiceCardFilesChosen(int n) {
    return '$n 個のファイルを選択';
  }

  @override
  String get choiceCardNoFile => 'ファイル未選択';

  @override
  String get choiceCardFileEmpty => 'そのファイルは空です。';

  @override
  String choiceCardFileTypeRefused(String name) {
    return '$name は許可されていないフォームアップロード形式です。';
  }

  @override
  String get choiceCardHandoffHint =>
      'ブラウザまたはアプリで開き、そこで完了・支払い。カード情報はホームが入力しません。';

  @override
  String get choiceCardPickOne => '少なくとも1つ選んでください。';

  @override
  String get choiceCardAnswered => '受け取りました。';

  @override
  String choiceCardFailed(String error) {
    return '選択を送信できませんでした: $error';
  }

  @override
  String chatPendingChoices(int count) {
    return '選択待ち $count 件';
  }

  @override
  String get choiceCardCancel => 'キャンセル';

  @override
  String get choiceCardCanceled => '選択を取り消しました。';

  @override
  String get choiceCardExpired => '期限切れ';

  @override
  String get choiceCardExpiredHint => 'この選択は期限切れです。必要ならもう一度聞いてください。';

  @override
  String choiceCardExpiresIn(int mins) {
    return '$mins 分で期限切れ';
  }

  @override
  String get choiceCardTextPlaceholder => '回答を入力';

  @override
  String get schedulesChatTabChat => 'チャット';

  @override
  String get schedulesChatTabHistories => '履歴';

  @override
  String get schedulesChatHistoriesHint => 'キャンセルまたは期限切れの提案と最近の実行。';

  @override
  String get jobsHistoriesMovedHint => '未設定と実行履歴は Histories にあります';

  @override
  String schedulesChatClosedAt(String when) {
    return '終了 $when';
  }

  @override
  String schedulesChatRanAt(String when) {
    return '実行 $when';
  }

  @override
  String get welcomeSkip => 'スキップ';

  @override
  String get welcomeNext => '次へ';

  @override
  String get commonContinue => '続ける';

  @override
  String get welcomeSlide1Title => 'EnvoyHome へようこそ';

  @override
  String get welcomeSlide1Body =>
      'スマホはセルフホストのホームエージェントへの窓です。チャット・承認・スマートホームはデスクトップ側に残ります。';

  @override
  String get welcomeSlide2Title => '処理はパソコンで行います';

  @override
  String get welcomeSlide2Body =>
      '自宅の Mac または PC に EnvoyHome をインストールします。デーモン・モデル・世帯メモリはそのマシンにあり、スマホは遠隔ウィンドウです。';

  @override
  String get welcomeSlide3Title => 'QR でペアリング';

  @override
  String get welcomeSlide3Body =>
      'パソコンで EnvoyHome を開き、ペアリング QR を表示します。このスマホで「今すぐペア」をタップしてスキャン。リンクの貼り付けもできます。';

  @override
  String get welcomeSlideRequiredTitle => 'まずはペアリング';

  @override
  String get welcomeSlideRequiredBody =>
      'EnvoyHome にはデスクトップアプリが動くパソコンが必要です。エージェントとホーム制御はそこで動きます。このスマホをそのパソコンとペアしてください。';

  @override
  String get setupGuideTitle => 'EnvoyHome の使い方';

  @override
  String get setupGuideIntro =>
      'スマホの EnvoyHome は自宅パソコンの EnvoyHome と通信します。デスクトップを入れ、一度ペアすれば、どこからでもチャットと承認ができます。';

  @override
  String get setupGuidePairRequiredTitle => 'ペアして続行';

  @override
  String get setupGuidePairRequiredBody =>
      'EnvoyHome は自宅デスクトップのスマホ伴侶です。ペアしたパソコンがないと、ここにはまだ表示するものがありません。';

  @override
  String get setupGuideStep1Title => 'パソコンを用意';

  @override
  String get setupGuideStep1Body =>
      '自宅の Mac または Windows/Linux PC が必要です。それが EnvoyHome ホストになり、デーモンとエージェントが動きます。';

  @override
  String get setupGuideStep2Title => 'EnvoyHome をダウンロードしてインストール';

  @override
  String get setupGuideStep2Body =>
      'QuickStart を開き、そのパソコンにデーモンとデスクトップアプリを入れます。起動して動かしたままにします。';

  @override
  String get setupGuideDownloadCta => 'EnvoyHome QuickStart を開く';

  @override
  String get setupGuideStep3Title => 'ペアリング QR を表示';

  @override
  String get setupGuideStep3Body =>
      'デスクトップの EnvoyHome で「設定 → デバイスをペア」。QR を画面に出したままにします（LAN のみではなく mesh/リレー付き）。';

  @override
  String get setupGuideStep4Title => 'このスマホでスキャン';

  @override
  String get setupGuideStep4Body =>
      '下の「今すぐペア」をタップ。カメラを許可して QR をスキャン。envoy:// リンクや host:port / SSH も使えます。';

  @override
  String get setupGuideStep5Title => '接続完了';

  @override
  String get setupGuideStep5Body =>
      'ペアが終わると、このスマホにそのホームのチャット・承認・設定が表示されます。スマホがオフラインでもデスクトップは動き続けます。';

  @override
  String get setupGuideNoHomeTitle => 'あとでペアしても大丈夫';

  @override
  String get setupGuideNoHomeBody =>
      '今は先に進み、「接続」からいつでもペアできます。パソコンがないと、ここにはまだ表示するものがありません。';

  @override
  String get setupGuidePairCta => '今すぐペア';

  @override
  String get setupGuidePairLaterCta => 'あとでペア';

  @override
  String get setupGuideSkipCta => '先に見る';

  @override
  String get setupGuideDoneCta => '了解';

  @override
  String get settingsSetupGuideSubtitle => 'デスクトップのインストールとこのスマホのペア方法。';
}
