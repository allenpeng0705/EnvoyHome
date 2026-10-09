// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Italian (`it`).
class AppLocalizationsIt extends AppLocalizations {
  AppLocalizationsIt([String locale = 'it']) : super(locale);

  @override
  String get appName => 'EnvoyHome';

  @override
  String get appLanguage => 'Lingua';

  @override
  String get pairLede =>
      'Unisciti al desktop di casa via EnvoyMesh — scansiona un QR, inserisci host:port o passa via SSH.';

  @override
  String get pairTabLink => 'Link';

  @override
  String get pairTabHost => 'Host:porta';

  @override
  String get pairTabSsh => 'SSH';

  @override
  String get pairFooter => 'com.envoymesh.envoyhome · push dopo l’abbinamento';

  @override
  String get pairCloseScanner => 'Chiudi scanner';

  @override
  String get pairScanQr => 'Scansiona QR di abbinamento';

  @override
  String get pairUriLabel => 'URI di abbinamento';

  @override
  String get pairUriHint => 'envoy://pair?…&app=EnvoyHome';

  @override
  String get pairConnect => 'Connetti';

  @override
  String get pairDirectHint =>
      'Raggiungi il desktop su questa rete (LAN / Tailscale). Il token è obbligatorio.';

  @override
  String get pairHostPort => 'Host:porta';

  @override
  String get pairHostPortHint => '192.168.1.10:4780';

  @override
  String get pairToken => 'Token di abbinamento';

  @override
  String get pairTokenHelper => 'Da Impostazioni desktop → Abbina dispositivi';

  @override
  String get pairSshHint =>
      'Tunnel tramite hop SSH. Il demone vede il loopback — token opzionale.';

  @override
  String get pairSshHost => 'Host SSH';

  @override
  String get pairSshUser => 'Utente';

  @override
  String get pairSshUserHint => 'root';

  @override
  String get pairSshPort => 'Porta';

  @override
  String get pairSshPassword => 'Password SSH';

  @override
  String get pairDaemon => 'Demone sul lato remoto';

  @override
  String get pairDaemonHint => '127.0.0.1:4780';

  @override
  String get pairTokenOptional => 'Token (opzionale)';

  @override
  String get shellOnline => 'online';

  @override
  String get shellDegraded => 'degradato';

  @override
  String get shellDisconnect => 'Disconnetti';

  @override
  String get shellProfilePending =>
      'Il profilo sarà scelto dall’abbinamento di questo dispositivo.';

  @override
  String shellProfileOne(String id) {
    return 'Profilo · $id';
  }

  @override
  String get shellProfile => 'Profilo';

  @override
  String shellMeshHint(String mesh) {
    return 'mesh $mesh · tira le schede per aggiornare';
  }

  @override
  String get navChat => 'Chat';

  @override
  String get navApprovals => 'Approvazioni';

  @override
  String get navModels => 'Modelli';

  @override
  String get navArtifacts => 'Artefatti';

  @override
  String get chatNeedAccount => 'Scegli un account sopra prima di chattare.';

  @override
  String get chatEmptyMessage => 'Messaggio vuoto.';

  @override
  String get chatSessionTitle => 'Chat telefono';

  @override
  String get chatEmptyTitle => 'Messaggio all’agente di casa';

  @override
  String get chatEmptyHint =>
      'I turni girano sul demone di casa. Quando l’agente serve un permesso, Consenti/Nega compare qui.';

  @override
  String get chatHint => 'Messaggio…';

  @override
  String chatSubscribeFailed(String error) {
    return 'iscrizione non riuscita: $error';
  }

  @override
  String chatStatus(String status) {
    return 'stato: $status';
  }

  @override
  String chatError(String error) {
    return 'errore: $error';
  }

  @override
  String get approvalsTitle => 'Approvazioni';

  @override
  String get approvalsHint =>
      'Richieste di tool e attuazione in attesa di decisione.';

  @override
  String get approvalsNeedAccount =>
      'Scegli un account per caricare le approvazioni.';

  @override
  String get approvalsEmptyTitle => 'Posta vuota';

  @override
  String get approvalsEmptyHint => 'Niente in sospeso al momento.';

  @override
  String get approvalsActuation => 'Attuazione';

  @override
  String get approvalsAllow => 'Consenti';

  @override
  String get approvalsDeny => 'Nega';

  @override
  String get approvalsAllowed => 'Consentito';

  @override
  String get approvalsDenied => 'Negato';

  @override
  String approvalsFailed(String error) {
    return 'Non riuscito: $error';
  }

  @override
  String get modelsTitle => 'Modelli';

  @override
  String get modelsOwnerHint =>
      'Abilita Local o Ollama sulla macchina di casa. Preferisci Desktop per la prima configurazione.';

  @override
  String get modelsReadonlyHint =>
      'Solo lettura su questo dispositivo. Usa Impostazioni desktop → Modelli (o telefono owner fidato) per abilitare Local.';

  @override
  String get modelsLocal => 'Modello locale';

  @override
  String get modelsOwnerTrusted =>
      'Lo stato del motore locale richiede un dispositivo owner fidato.';

  @override
  String get modelsResponding => 'risponde';

  @override
  String get modelsNotResponding => 'non risponde';

  @override
  String get modelsDisabled => 'disabilitato';

  @override
  String get modelsGguf => 'GGUF su disco';

  @override
  String get modelsEnableLocal => 'Abilita Local';

  @override
  String get modelsUseOllama => 'Usa Ollama';

  @override
  String get modelsDisable => 'Disabilita';

  @override
  String get modelsLocalOnly => 'Solo locale per account';

  @override
  String get modelsThisAccount => 'Questo account';

  @override
  String get modelsNeedAccount => 'Imposta accountId sopra.';

  @override
  String modelsDefault(String id) {
    return 'Predefinito: $id';
  }

  @override
  String modelsPool(String filter) {
    return 'Pool: $filter';
  }

  @override
  String get modelsModeMesh => 'Mesh locale';

  @override
  String get modelsModeSpawn => 'Home llama-server';

  @override
  String get modelsModeOllama => 'Ollama';

  @override
  String get modelsModeOff => 'Spento';

  @override
  String get modelsNotConnected => 'Non connesso';

  @override
  String get modelsSetAccount =>
      'Imposta accountId per vedere modello e pool predefiniti.';

  @override
  String get modelsUpdated => 'Aggiornato';

  @override
  String get modelsLocalEnabled => 'Local abilitato';

  @override
  String get modelsOllamaEnabled => 'Ollama abilitato';

  @override
  String get modelsLocalDisabled => 'Local disabilitato';

  @override
  String get modelsLocalOnlySet => 'Routing solo locale impostato';

  @override
  String get modelsDefaultLabel => 'predefinito';

  @override
  String get modelsOffLabel => 'off';

  @override
  String get artifactsTitle => 'Artefatti';

  @override
  String get artifactsHint =>
      'Link firmati dal demone di casa. Tocca per aprire.';

  @override
  String get artifactsNeedAccount =>
      'Scegli un account per elencare gli artefatti.';

  @override
  String get artifactsEmptyTitle => 'Nessun artefatto';

  @override
  String get artifactsEmptyHint =>
      'Tira per aggiornare dopo che l’agente produce un file.';

  @override
  String get artifactsUrlCopied => 'Impossibile aprire — URL copiato';

  @override
  String artifactsOpenFailed(String error) {
    return 'Apertura non riuscita: $error';
  }

  @override
  String chatPendingApprovals(int count) {
    return '$count in attesa della tua approvazione';
  }
}
