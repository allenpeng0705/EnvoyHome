// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for German (`de`).
class AppLocalizationsDe extends AppLocalizations {
  AppLocalizationsDe([String locale = 'de']) : super(locale);

  @override
  String get appName => 'EnvoyHome';

  @override
  String get appLanguage => 'Sprache';

  @override
  String get pairLede =>
      'Mit dem Home-Desktop über EnvoyMesh verbinden — QR scannen, host:port eingeben oder per SSH.';

  @override
  String get pairTabLink => 'Link';

  @override
  String get pairTabHost => 'Host:Port';

  @override
  String get pairTabSsh => 'SSH';

  @override
  String get pairFooter => 'com.envoymesh.envoyhome · Push nach Pairing';

  @override
  String get pairCloseScanner => 'Scanner schließen';

  @override
  String get pairScanQr => 'Pairing-QR scannen';

  @override
  String get pairUriLabel => 'Pairing-URI';

  @override
  String get pairUriHint => 'envoy://pair?…&app=EnvoyHome';

  @override
  String get pairConnect => 'Verbinden';

  @override
  String get pairDirectHint =>
      'Erreichen Sie den Desktop in diesem Netz (LAN / Tailscale). Token erforderlich.';

  @override
  String get pairHostPort => 'Host:Port';

  @override
  String get pairHostPortHint => '192.168.1.10:4780';

  @override
  String get pairToken => 'Pairing-Token';

  @override
  String get pairTokenHelper => 'Aus Desktop-Einstellungen → Geräte koppeln';

  @override
  String get pairSshHint =>
      'Tunnel über einen SSH-Hop. Der Daemon sieht Loopback — Token optional.';

  @override
  String get pairSshHost => 'SSH-Host';

  @override
  String get pairSshUser => 'Benutzer';

  @override
  String get pairSshUserHint => 'root';

  @override
  String get pairSshPort => 'Port';

  @override
  String get pairSshPassword => 'SSH-Passwort';

  @override
  String get pairDaemon => 'Daemon auf der Gegenseite';

  @override
  String get pairDaemonHint => '127.0.0.1:4780';

  @override
  String get pairTokenOptional => 'Token (optional)';

  @override
  String get shellOnline => 'online';

  @override
  String get shellDegraded => 'eingeschränkt';

  @override
  String get shellDisconnect => 'Trennen';

  @override
  String get shellProfilePending =>
      'Das Profil wird aus dem Pairing dieses Geräts gewählt.';

  @override
  String shellProfileOne(String id) {
    return 'Profil · $id';
  }

  @override
  String get shellProfile => 'Profil';

  @override
  String shellMeshHint(String mesh) {
    return 'mesh $mesh · Tabs zum Aktualisieren ziehen';
  }

  @override
  String get navChat => 'Chat';

  @override
  String get navApprovals => 'Freigaben';

  @override
  String get navModels => 'Modelle';

  @override
  String get navArtifacts => 'Artefakte';

  @override
  String get chatNeedAccount => 'Wählen Sie oben ein Konto, bevor Sie chatten.';

  @override
  String get chatEmptyMessage => 'Leere Nachricht.';

  @override
  String get chatSessionTitle => 'Telefon-Chat';

  @override
  String get chatEmptyTitle => 'Nachricht an Ihren Home-Agenten';

  @override
  String get chatEmptyHint =>
      'Turns laufen auf dem Home-Daemon. Wenn der Agent eine Freigabe braucht, erscheinen Erlauben/Ablehnen hier.';

  @override
  String get chatHint => 'Nachricht…';

  @override
  String chatSubscribeFailed(String error) {
    return 'Abo fehlgeschlagen: $error';
  }

  @override
  String chatStatus(String status) {
    return 'Status: $status';
  }

  @override
  String chatError(String error) {
    return 'Fehler: $error';
  }

  @override
  String get approvalsTitle => 'Freigaben';

  @override
  String get approvalsHint =>
      'Tool- und Aktuationsanfragen warten auf eine Entscheidung.';

  @override
  String get approvalsNeedAccount =>
      'Wählen Sie ein Konto, um Freigaben zu laden.';

  @override
  String get approvalsEmptyTitle => 'Posteingang leer';

  @override
  String get approvalsEmptyHint => 'Derzeit nichts ausstehend.';

  @override
  String get approvalsActuation => 'Aktuation';

  @override
  String get approvalsAllow => 'Erlauben';

  @override
  String get approvalsDeny => 'Ablehnen';

  @override
  String get approvalsAllowed => 'Erlaubt';

  @override
  String get approvalsDenied => 'Abgelehnt';

  @override
  String approvalsFailed(String error) {
    return 'Fehlgeschlagen: $error';
  }

  @override
  String get modelsTitle => 'Modelle';

  @override
  String get modelsOwnerHint =>
      'Aktivieren Sie Local oder Ollama auf dem Home-Rechner. Fürs Erste Desktop bevorzugen.';

  @override
  String get modelsReadonlyHint =>
      'Nur Lesen auf diesem Gerät. Desktop-Einstellungen → Modelle (oder vertrauenswürdiges Owner-Telefon) nutzen.';

  @override
  String get modelsLocal => 'Lokales Modell';

  @override
  String get modelsOwnerTrusted =>
      'Lokaler Engine-Status braucht ein vertrauenswürdiges Owner-Gerät.';

  @override
  String get modelsResponding => 'antwortet';

  @override
  String get modelsNotResponding => 'antwortet nicht';

  @override
  String get modelsDisabled => 'deaktiviert';

  @override
  String get modelsGguf => 'GGUF auf Disk';

  @override
  String get modelsEnableLocal => 'Local aktivieren';

  @override
  String get modelsUseOllama => 'Ollama nutzen';

  @override
  String get modelsDisable => 'Deaktivieren';

  @override
  String get modelsLocalOnly => 'Nur lokal für Konto';

  @override
  String get modelsThisAccount => 'Dieses Konto';

  @override
  String get modelsNeedAccount => 'accountId oben setzen.';

  @override
  String modelsDefault(String id) {
    return 'Standard: $id';
  }

  @override
  String modelsPool(String filter) {
    return 'Pool: $filter';
  }

  @override
  String get modelsModeMesh => 'Mesh lokal';

  @override
  String get modelsModeSpawn => 'Home llama-server';

  @override
  String get modelsModeOllama => 'Ollama';

  @override
  String get modelsModeOff => 'Aus';

  @override
  String get modelsNotConnected => 'Nicht verbunden';

  @override
  String get modelsSetAccount =>
      'accountId setzen, um Standardmodell und Pool zu sehen.';

  @override
  String get modelsUpdated => 'Aktualisiert';

  @override
  String get modelsLocalEnabled => 'Local aktiviert';

  @override
  String get modelsOllamaEnabled => 'Ollama aktiviert';

  @override
  String get modelsLocalDisabled => 'Local deaktiviert';

  @override
  String get modelsLocalOnlySet => 'Nur-lokal-Routing gesetzt';

  @override
  String get modelsDefaultLabel => 'Standard';

  @override
  String get modelsOffLabel => 'aus';

  @override
  String get artifactsTitle => 'Artefakte';

  @override
  String get artifactsHint =>
      'Signierte Links vom Home-Daemon. Tippen zum Öffnen.';

  @override
  String get artifactsNeedAccount => 'Konto wählen, um Artefakte anzuzeigen.';

  @override
  String get artifactsEmptyTitle => 'Noch keine Artefakte';

  @override
  String get artifactsEmptyHint =>
      'Zum Aktualisieren ziehen, nachdem eine Datei erzeugt wurde.';

  @override
  String get artifactsUrlCopied => 'Öffnen fehlgeschlagen — URL kopiert';

  @override
  String artifactsOpenFailed(String error) {
    return 'Öffnen fehlgeschlagen: $error';
  }

  @override
  String chatPendingApprovals(int count) {
    return '$count warten auf Ihre Freigabe';
  }
}
