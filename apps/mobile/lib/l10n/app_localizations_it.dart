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
  String get appThemePicker => 'Aspetto';

  @override
  String get appThemeSystem => 'Sistema';

  @override
  String get appThemeLight => 'Chiaro';

  @override
  String get appThemeDark => 'Scuro';

  @override
  String get pairLede =>
      'Unisciti al desktop di casa via EnvoyMesh — scansiona un QR, inserisci host:port o passa via SSH.';

  @override
  String get pairTabLink => 'Collegamento';

  @override
  String get pairTabHost => 'Host:porta';

  @override
  String get pairTabSsh => 'SSH';

  @override
  String get pairPasteInstead => 'Oppure incolla un link di associazione';

  @override
  String get pairAdvanced => 'Avanzate';

  @override
  String get pairAdvancedSubtitle => 'Host:porta e hop SSH (utenti avanzati)';

  @override
  String get pairConnectHost => 'Connetti con host';

  @override
  String get pairConnectSsh => 'Connetti via SSH';

  @override
  String get pairProgressTitle => 'Connessione a casa';

  @override
  String get pairProgressSubtitle => 'Raggiungimento del desktop EnvoyHome…';

  @override
  String pairElapsed(String time) {
    return 'Trascorsi $time';
  }

  @override
  String get pairStageInitial => 'Avvio';

  @override
  String get pairStageInitialHint =>
      'Preparazione di una connessione sicura al computer di casa.';

  @override
  String get pairStageConnecting => 'Connessione';

  @override
  String get pairStageConnectingHint =>
      'Prima la rete locale, poi i percorsi mesh.';

  @override
  String get pairStageHandshaking => 'Handshake';

  @override
  String get pairStageHandshakingHint =>
      'Verifica del token di associazione con il daemon di casa.';

  @override
  String get pairStageVerifying => 'Quasi fatto';

  @override
  String get pairStageSlowHint =>
      'Ancora in corso — la prima connessione può richiedere un minuto.';

  @override
  String get pairStageVerySlowHint =>
      'Verifica che telefono e desktop condividano una rete, oppure prova Avanzate host:porta.';

  @override
  String get pairStillWorking =>
      'Ancora in corso — tieni aperta questa schermata. La prima associazione può richiedere uno o due minuti.';

  @override
  String get pairTroubleHint =>
      'Suggerimenti: EnvoyHome desktop attivo · stesso Wi‑Fi / Tailscale · scansiona un QR nuovo da Impostazioni → Associa dispositivi.';

  @override
  String get pairDontClose => 'Non chiudere l’app durante la connessione.';

  @override
  String get pairCancel => 'Annulla';

  @override
  String get pairKeepWaiting => 'Continua ad attendere';

  @override
  String get pairCancelConfirmTitle => 'Annullare la connessione?';

  @override
  String get pairCancelConfirmBody =>
      'Potrai riconnetterti in qualsiasi momento dal banner di connessione.';

  @override
  String get pairErrorWrongApp =>
      'Questo QR è per un’altra app Envoy. Scansiona un codice di associazione EnvoyHome.';

  @override
  String get pairErrorTimeout =>
      'Connessione scaduta. Verifica che il desktop sia online e riprova.';

  @override
  String get pairErrorUnreachable =>
      'Il desktop di casa non è raggiungibile su questa rete.';

  @override
  String get pairErrorExpired =>
      'Codice di associazione non valido o scaduto — genera un nuovo QR sul desktop.';

  @override
  String get pairErrorGeneric =>
      'Connessione non riuscita. Prova a scansionare di nuovo.';

  @override
  String get pairFooter => 'com.envoymesh.envoyhome · push dopo l’abbinamento';

  @override
  String get shellPairNewDevice => 'Associa nuovo dispositivo';

  @override
  String get bannerOfflineSaved => 'Non connesso a casa';

  @override
  String get bannerOfflineUnpaired =>
      'Associa questo telefono al desktop di casa';

  @override
  String get navReminders => 'Promemoria';

  @override
  String get navMore => 'Altro';

  @override
  String get moreHubHint =>
      'Prima i controlli quotidiani. La configurazione avanzata resta sotto Avanzate.';

  @override
  String get moreSectionDaily => 'Quotidiano';

  @override
  String get moreSectionAdvanced => 'Avanzate';

  @override
  String get moreFilesSubtitle => 'File sandbox, esportazioni e conoscenza';

  @override
  String get moreHomeChatSubtitle =>
      'Parla con i dispositivi smart home (Home Assistant)';

  @override
  String get moreAdvancedOwnerOnly =>
      'LLM, Connessioni, Skill e Workflow richiedono il dispositivo Owner della casa.';

  @override
  String get remindersAskCta => 'Pianifica con chat';

  @override
  String get remindersAskTitle => 'Pianifica con la chat';

  @override
  String get remindersNeedConnect =>
      'Connettiti a casa per gestire lavori, scene e cronologia delle pianificazioni.';

  @override
  String needsYouTitle(int count) {
    return 'Serve la tua azione · $count';
  }

  @override
  String get needsYouOpenChat => 'Rivedi';

  @override
  String get pairCloseScanner => 'Chiudi scanner';

  @override
  String get pairScanQr => 'Scansiona QR di abbinamento';

  @override
  String get pairCameraDenied =>
      'Serve l’accesso alla fotocamera per scansionare il QR di abbinamento.';

  @override
  String get pairCameraDeniedForever =>
      'L’accesso alla fotocamera è bloccato. Abilitalo nelle Impostazioni di sistema e riprova.';

  @override
  String get pairOpenSettings => 'Apri Impostazioni';

  @override
  String get pairScannerHint => 'Inquadra il QR di abbinamento del desktop';

  @override
  String get pairScannerError =>
      'Impossibile avviare la fotocamera. Puoi anche incollare il link di abbinamento.';

  @override
  String get pairRetryCamera => 'Riprova';

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
  String get pairTokenOptional => 'Token (facoltativo)';

  @override
  String get shellOnline => 'online';

  @override
  String get shellDegraded => 'degradato';

  @override
  String get shellOffline => 'offline';

  @override
  String get shellConnect => 'Connetti';

  @override
  String get shellReconnect => 'Riconnetti';

  @override
  String get shellDisconnect => 'Disconnetti';

  @override
  String get shellForgetPairing => 'Dimentica associazione';

  @override
  String get connectGuideTitle => 'Collegati a casa';

  @override
  String get connectGuideHint =>
      'Sul desktop apri Impostazioni → Associa dispositivi e scansiona il QR — oppure incolla il link / host.';

  @override
  String get connectGuideReconnectHint =>
      'Questo telefono è già associato. Riconnettiti al desktop, oppure associa di nuovo se hai cambiato casa.';

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
  String get shellCreateProfile => 'Crea';

  @override
  String get shellProfileDisplayName => 'Nome visualizzato';

  @override
  String get shellProfileIdOptional => 'Id account (opzionale)';

  @override
  String get shellCancel => 'Annulla';

  @override
  String get shellCreate => 'Crea';

  @override
  String get shellProfileCreated => 'Profilo creato';

  @override
  String shellProfileCreateFailed(String error) {
    return 'Creazione non riuscita: $error';
  }

  @override
  String get navChat => 'Chat';

  @override
  String get navHomeChat => 'Home';

  @override
  String get navSchedulesChat => 'Promemoria';

  @override
  String get navSettings => 'Impostazioni';

  @override
  String get navLlm => 'LLM';

  @override
  String get navConnections => 'Connessioni';

  @override
  String get navSkills => 'Skills';

  @override
  String get navSystem => 'Sistema';

  @override
  String get navProfiles => 'Profili';

  @override
  String get navApprovals => 'Approvazioni';

  @override
  String get navModels => 'Modelli';

  @override
  String get navArtifacts => 'Artefatti';

  @override
  String get settingsHubHint =>
      'Configure the home daemon from your phone. Some owner-only actions need a trusted device.';

  @override
  String get settingsProfilesSubtitle =>
      'Owner, cartelle workspace, policy strumenti';

  @override
  String get settingsLlmSubtitle => 'Modelli, Locale, Routing, Memoria';

  @override
  String get settingsConnectionsSubtitle =>
      'Pairing, Home Assistant, MQTT, Channels';

  @override
  String get settingsSkillsSubtitle => 'Installa e gestisci pacchetti skill';

  @override
  String get settingsWorkflowsSubtitle =>
      'Workflow DAG — bozza, valida, esegui';

  @override
  String get settingsSystemSubtitle =>
      'Profili, File condivisi, Salute, Autorizzazioni';

  @override
  String get settingsNeedConnect =>
      'Collegati per configurare LLM, Connessioni, Skill e Sistema.';

  @override
  String get profilesIntro =>
      'Ogni persona ha un profilo. L’Owner della famiglia configura le cartelle workspace e può trasferire la proprietà.';

  @override
  String get profilesMemberHint =>
      'Questo dispositivo non è l’Owner della famiglia — il workspace qui è in sola lettura.';

  @override
  String get profilesRefresh => 'Aggiorna';

  @override
  String get profilesAddTitle => 'Aggiungi profilo';

  @override
  String get profilesOwnerBadge => 'Owner';

  @override
  String get profilesActiveBadge => 'Attivo';

  @override
  String get profilesWorkspaceTitle => 'Cartelle workspace';

  @override
  String get profilesWorkspaceHint =>
      'Aggiunga cartelle host sul computer domestico (fino a 16). L’agente vi accede tramite percorsi workspace/<id>/…';

  @override
  String get profilesWorkspacePath => 'Percorso host';

  @override
  String get profilesWorkspaceBrowse => 'Sfoglia cartelle';

  @override
  String get profilesWorkspaceBrowseHint =>
      'Tocchi per sfogliare il computer domestico';

  @override
  String get profilesWorkspaceUnset => 'Non impostato (solo sandbox)';

  @override
  String get profilesWorkspaceSet => 'Configurato';

  @override
  String get profilesWorkspaceWholeMachine => 'Intero computer';

  @override
  String get profilesWorkspaceRo => 'Sola lettura';

  @override
  String get profilesWorkspaceRw => 'Lettura e scrittura';

  @override
  String get profilesWorkspaceUseRoot => 'Aggiungi radice del computer';

  @override
  String get profilesWorkspaceClear => 'Cancella tutto';

  @override
  String get profilesWorkspaceRemove => 'Rimuovi';

  @override
  String get profilesWorkspaceApply => 'Aggiungi';

  @override
  String get profilesWorkspaceEdit => 'Aggiungi cartella';

  @override
  String get profilesWorkspaceRootTitle =>
      'Consentire accesso all’intero computer?';

  @override
  String get profilesWorkspaceRootBody =>
      'Consente all’agente di leggere (e scrivere, se selezionato) file sotto la radice del computer tramite workspace/… — anche da questo telefono.';

  @override
  String get profilesWorkspaceRootOk => 'Consenti';

  @override
  String get profilesWorkspaceMemberNote =>
      'Solo l’Owner della famiglia può modificare le cartelle workspace.';

  @override
  String get profilesWorkspaceCrossTitle =>
      'Aggiungere cartella workspace per un altro profilo?';

  @override
  String profilesWorkspaceCrossBody(String name) {
    return 'Aggiunge una cartella host per $name. Prosegua solo se intende configurare il suo workspace.';
  }

  @override
  String get profilesWorkspaceDenied => 'Non visibile su questo dispositivo';

  @override
  String get profilesWorkspaceInactive =>
      'Configurato ma inattivo (filesystem-root si applica solo all’Owner)';

  @override
  String get profilesRename => 'Rinomina';

  @override
  String get profilesRenameTitle => 'Rinomina profilo';

  @override
  String get profilesRenameSave => 'Salva';

  @override
  String get profilesTimeZoneUnset =>
      'Fuso orario: non impostato (le programmazioni usano il default dell’host)';

  @override
  String profilesTimeZoneValue(String tz) {
    return 'Fuso orario: $tz';
  }

  @override
  String get profilesTimeZoneEdit => 'Fuso orario';

  @override
  String get profilesTimeZoneTitle => 'Fuso orario account';

  @override
  String get profilesTimeZoneHint => 'Nome IANA, es. Europe/Rome';

  @override
  String get profilesTimeZoneSave => 'Salva';

  @override
  String profilesTimeZoneDone(String tz) {
    return 'Fuso orario impostato su $tz';
  }

  @override
  String get profilesShareLocationTitle => 'Condividi posizione con Home';

  @override
  String get profilesShareLocationSubtitle =>
      'Allega GPS approssimativo ai turni di chat. Permesso richiesto una sola volta qui; mai a ogni invio. Solo effimero — non in memoria.';

  @override
  String get profilesShareLocationDenied =>
      'Permesso di localizzazione non concesso. Condivisione resta disattivata.';

  @override
  String get profilesShareLocationOn =>
      'Condivisione posizione attiva su questo dispositivo';

  @override
  String get profilesDelete => 'Elimina';

  @override
  String get profilesDeleteTitle => 'Eliminare il profilo?';

  @override
  String profilesDeleteBody(String name) {
    return 'Eliminare $name? Sandbox e configurazione workspace vengono rimossi. Operazione irreversibile.';
  }

  @override
  String get profilesDeleteConfirm => 'Elimina';

  @override
  String profilesDeleteDone(String name) {
    return 'Eliminato $name';
  }

  @override
  String get profilesDeleteOwnerBlocked =>
      'Impossibile eliminare l’Owner della famiglia. Trasferisca prima la proprietà.';

  @override
  String get profilesTransferTitle => 'Trasferire Owner della famiglia?';

  @override
  String profilesTransferBody(String name) {
    return 'Rende $name Owner della famiglia. Controllerà associazione, binding e Impostazioni domestiche.';
  }

  @override
  String get profilesTransferConfirm => 'Trasferisci';

  @override
  String profilesTransferDone(String name) {
    return 'Owner ora è $name';
  }

  @override
  String profilesTransferFailed(String error) {
    return 'Trasferimento non riuscito: $error';
  }

  @override
  String profilesTransferTo(String name) {
    return 'Trasferisci a $name';
  }

  @override
  String get profilesToolPolicy => 'Policy strumenti';

  @override
  String get profilesToolPolicyStandard => 'Standard';

  @override
  String get profilesToolPolicyRestricted => 'Limitata';

  @override
  String get connMintPairing => 'Genera codice di associazione';

  @override
  String get connMintOk => 'Codice di associazione generato';

  @override
  String get connMintUriHint =>
      'Scannerizzi o incolli questo URI sul nuovo dispositivo.';

  @override
  String get connPairingOwnerOnly =>
      'Generare / revocare l’associazione richiede il dispositivo Owner della famiglia.';

  @override
  String get connRevokeDevice => 'Revoca';

  @override
  String get connForgetDevice => 'Dimentica';

  @override
  String connRevokeConfirm(String id) {
    return 'Revocare il dispositivo $id? Dovrà associarsi di nuovo.';
  }

  @override
  String connForgetConfirm(String id) {
    return 'Dimenticare il dispositivo $id? Il record di associazione viene rimosso in modo permanente.';
  }

  @override
  String get connOwnerWriteOnly =>
      'Solo il dispositivo Owner della famiglia può modificare questa impostazione.';

  @override
  String get connAccountsHint => 'Profili della famiglia';

  @override
  String get homeChatSessionTitle => 'Chat domestica dal telefono';

  @override
  String get homeChatEmptyTitle => 'Parli con la Sua casa';

  @override
  String get homeChatEmptyHint =>
      'Gli strumenti smart-home restano disponibili qui. Le Approvazioni controllano ancora le attuazioni.';

  @override
  String get homeChatHint => 'Chieda di luci, serrature, clima…';

  @override
  String get schedulesChatSessionTitle => 'Promemoria';

  @override
  String get schedulesChatEmptyTitle => 'Promemoria';

  @override
  String get schedulesChatEmptyHint =>
      'Questa chat resta sui promemoria. Conferma l’orario prima di attivarlo.';

  @override
  String get schedulesChatHint => 'Ricordami…';

  @override
  String get chatAttach => 'Allega';

  @override
  String chatAttachTooMany(int n) {
    return 'Al massimo $n file';
  }

  @override
  String chatAttachTooLarge(String name, String mb) {
    return '$name supera $mb MB';
  }

  @override
  String chatAttachAdded(int n) {
    return 'Allegati $n file';
  }

  @override
  String get chatAttachedOnly => '(allegato)';

  @override
  String get chatVoiceStart => 'Detta';

  @override
  String get chatVoiceStop => 'Interrompi dettatura';

  @override
  String get chatVoiceUnsupported =>
      'Il riconoscimento vocale non è disponibile su questo dispositivo.';

  @override
  String get llmTabModels => 'Modelli';

  @override
  String get llmTabLocal => 'Locale';

  @override
  String get llmTabRouting => 'Routing';

  @override
  String get llmTabMemory => 'Memoria';

  @override
  String get llmLocalDownloadHint =>
      'Cerchi su Hugging Face e scarichi file GGUF sul computer domestico.';

  @override
  String get llmHfSearchHint => 'Cerca modelli…';

  @override
  String get llmSearch => 'Cerca';

  @override
  String get llmCancelDownload => 'Annulla';

  @override
  String get llmResumeDownload => 'Riprendi';

  @override
  String llmGgufFiles(String repo) {
    return 'GGUF in $repo';
  }

  @override
  String get llmRoutingHint =>
      'Scelga dove possono essere eseguiti i turni per questo profilo.';

  @override
  String get llmFilterAny => 'Intelligente / qualsiasi';

  @override
  String get llmFilterCloud => 'Solo cloud';

  @override
  String get llmFilterLocal => 'Solo locale';

  @override
  String get llmAutoSwitch => 'Cambio modello automatico';

  @override
  String get privacyModeTitle => 'Modalità privacy';

  @override
  String get privacyModeHint =>
      'Forza inferenza locale e blocca strumenti cloud. Ambito Owner.';

  @override
  String get privacyModeEnabled => 'Abilita Modalità privacy';

  @override
  String get privacyModeBlockEgress =>
      'Blocca anche attuazione smart-home e notifiche event-source';

  @override
  String get privacyModeOwnerOnly =>
      'Modalità privacy solo Owner su questo dispositivo.';

  @override
  String get llmCompactNow => 'Compatta memoria ora';

  @override
  String get llmFlushEnabled => 'Svuota note permanenti';

  @override
  String get llmReviewEnabled => 'Revisione prima di scrittura learn';

  @override
  String get llmInjectMode => 'Modalità budget iniezione';

  @override
  String get llmInjectAuto => 'Auto';

  @override
  String get llmInjectBaseline => 'Baseline';

  @override
  String get llmInjectCustom => 'Personalizzato';

  @override
  String get llmPendingLearns => 'Learn in sospeso';

  @override
  String get llmNoPendingLearns => 'Nessun learn in sospeso.';

  @override
  String get connTabPairing => 'Associazione';

  @override
  String get connTabHa => 'Home Assistant';

  @override
  String get connTabMqtt => 'MQTT';

  @override
  String get connTabChannels => 'Canali';

  @override
  String get connTabWebSearch => 'Ricerca web';

  @override
  String get connTabMcp => 'MCP';

  @override
  String get connTabBrowser => 'Browser';

  @override
  String get mcpLede =>
      'Aggiungi qualsiasi server MCP. Testa la connessione prima di abilitarlo. I comandi stdio vengono eseguiti come utente host del demone. Le chiamate agli strumenti restano soggette ad approvazione.';

  @override
  String get mcpTest => 'Test';

  @override
  String get mcpAddServer => 'Aggiungi server';

  @override
  String get mcpSave => 'Salva';

  @override
  String get mcpReady => 'Pronto';

  @override
  String get mcpNotTested => 'Non testato';

  @override
  String mcpServerSubtitle(String transport, String status, int count) {
    return '$transport · $status · $count strumenti';
  }

  @override
  String mcpTestOk(int count) {
    return 'OK — $count strumento/i. Abilita quando sei pronto.';
  }

  @override
  String mcpTestFailed(String error) {
    return 'Non riuscito: $error';
  }

  @override
  String get mcpUnknownError => 'sconosciuto';

  @override
  String get connDeviceRevoked => 'revocato';

  @override
  String connDeviceSubtitle(String id, String accounts, String revokedSuffix) {
    return '$id · $accounts$revokedSuffix';
  }

  @override
  String get mcpLabel => 'Etichetta';

  @override
  String get mcpCommand => 'Comando';

  @override
  String get mcpArgs => 'Argomenti (separati da spazi, facoltativo)';

  @override
  String get mcpUrl => 'URL';

  @override
  String get mcpAuthToken => 'Token di autenticazione (facoltativo)';

  @override
  String get mcpEnv => 'Env (KEY=value per riga, facoltativo)';

  @override
  String get browserControlLede =>
      'Controlli un browser gestito sul computer domestico (Auto preferisce Obscura, altrimenti Chromium), oppure collega Chrome personale / CDP remoto. Disattivato di default.';

  @override
  String get browserControlDaemonHostNote =>
      'Le sessioni browser girano sul computer domestico. Le impostazioni qui si sincronizzano con desktop Connessioni → Browser.';

  @override
  String get browserControlEnabled => 'Abilita strumento browser';

  @override
  String get browserControlUnattended =>
      'Consenti profilo gestito per le pianificazioni';

  @override
  String get browserControlReady => 'Pronto';

  @override
  String get browserControlNotReady => 'Non pronto';

  @override
  String get browserControlSave => 'Salva';

  @override
  String get browserControlSaved => 'Impostazioni browser salvate.';

  @override
  String get browserControlSaveFailed =>
      'Impossibile salvare le impostazioni browser.';

  @override
  String get browserControlDefaultProfile => 'Profilo predefinito';

  @override
  String get browserControlProfileManaged => 'Gestito (isolato)';

  @override
  String get browserControlProfilePersonal => 'Chrome personale';

  @override
  String get browserControlProfileRemote => 'CDP remoto';

  @override
  String get browserControlElevatedWarn =>
      'Personale/remoto possono agire come Lei sui siti con accesso. Solo Owner; mai nelle programmazioni.';

  @override
  String get browserControlAcknowledge =>
      'Ho compreso il rischio elevato del browser';

  @override
  String get browserControlPersonalEnabled => 'Abilita Chrome personale';

  @override
  String get browserControlPersonalCdp => 'CDP personale (loopback)';

  @override
  String get browserControlPersonalReady => 'CDP personale attivo';

  @override
  String get browserControlPersonalNotReady => 'CDP personale non attivo';

  @override
  String get browserControlRemoteEnabled => 'Abilita CDP remoto';

  @override
  String get browserControlRemoteCdp => 'URL CDP remoto';

  @override
  String get browserControlRemoteToken => 'Token CDP remoto';

  @override
  String get browserControlTokenSet => 'impostato';

  @override
  String get browserControlTokenPlaceholder => 'Lasci vuoto per mantenere';

  @override
  String get browserControlRemoteReady => 'CDP remoto attivo';

  @override
  String get browserControlRemoteNotReady => 'CDP remoto non attivo';

  @override
  String get browserControlOwnerOnly =>
      'Solo il dispositivo Owner della famiglia può modificare le impostazioni browser.';

  @override
  String get browserControlAcknowledged =>
      'Rischio elevato confermato. Disattivi personale/remoto per smettere di usarli.';

  @override
  String get webSearchLede =>
      'Cerca sul web pubblico dalla chat. Default: DuckDuckGo, poi Bing/Google/Baidu nel browser se serve (nessuna API key). Brave e Tavily richiedono API key Owner.';

  @override
  String get webSearchEnabled => 'Abilita web_search';

  @override
  String get webSearchProvider => 'Provider';

  @override
  String get webSearchProviderBrowser => 'Browser (Bing / Google / Baidu)';

  @override
  String get webSearchBrowserPrimaryHint =>
      'Cerca direttamente su Bing/Google/Baidu nel motore headless dell’host daemon (Obscura se pronto, altrimenti Chromium). Le chat con sorveglianza chiedono conferma prima di ogni ricerca.';

  @override
  String get webSearchDaemonHostNote =>
      'Motori e approfondimento girano sul computer domestico che ospita EnvoyHome. Questo telefono solo visualizza e (Owner) modifica le impostazioni condivise.';

  @override
  String get webSearchEffectiveUnresolved => 'non ancora pronto';

  @override
  String get webSearchApiKey => 'API key';

  @override
  String get webSearchApiKeyHint =>
      'Lasci vuoto per mantenere la chiave attuale';

  @override
  String get webSearchReady => 'Pronto';

  @override
  String get webSearchNotReady => 'Non pronto';

  @override
  String get webSearchSave => 'Salva';

  @override
  String get webSearchSaved => 'Impostazioni ricerca web salvate.';

  @override
  String get webSearchSaveFailed =>
      'Impossibile salvare le impostazioni ricerca web.';

  @override
  String get webSearchOwnerOnly =>
      'Solo il dispositivo Owner della famiglia può modificare la ricerca web.';

  @override
  String get webSearchBrowserFallback =>
      'Fallback browser (Bing/Google/Baidu se API/DDG fallisce o non è impostato)';

  @override
  String get webSearchBrowserFallbackHint =>
      'Attivo di default per ricerca senza configurazione. Le chat con sorveglianza chiedono prima il passaggio browser. Le SERP possono mostrare CAPTCHA o blocchi.';

  @override
  String get webSearchResearchEnabled =>
      'Ricerca web (cerca poi approfondisci le prime pagine)';

  @override
  String get webSearchResearchHint =>
      'Disattivato di default. Abilita web_research: approfondisce i primi risultati e restituisce un riepilogo ordinato con link.';

  @override
  String get webSearchDigDepth => 'Profondità di approfondimento (1–10 pagine)';

  @override
  String get webSearchExtractBackend => 'Backend estrazione pagine';

  @override
  String get webSearchExtractBackendAuto =>
      'Auto (Obscura se pronto, altrimenti HTTP fetch)';

  @override
  String get webSearchExtractBackendFetch => 'HTTP fetch';

  @override
  String get webSearchExtractBackendObscura => 'Obscura (Markdown con JS)';

  @override
  String get webSearchExtractBackendHint =>
      'Auto preferisce Obscura se installato sull’host daemon, altrimenti HTTP semplice.';

  @override
  String get webSearchEffectiveExtract =>
      'Backend di approfondimento effettivo ora';

  @override
  String get webSearchObscuraReady => 'Obscura pronto sull’host daemon';

  @override
  String get webSearchObscuraMissing =>
      'Obscura non installato sull’host daemon';

  @override
  String get webSearchObscuraInstallHintNote =>
      'Le build desktop includono Obscura (o il daemon auto-installa al primo avvio). Sul computer domestico con EnvoyHome (non questo telefono), usi ENVOYHOME_OBSCURA / PATH se serve, poi riapra Impostazioni.';

  @override
  String get webSearchSerpBrowserEngine => 'Motore browser SERP';

  @override
  String get webSearchSerpBrowserEngineAuto =>
      'Auto (Obscura se pronto, altrimenti Chromium)';

  @override
  String get webSearchSerpBrowserEngineChromium => 'Chromium';

  @override
  String get webSearchSerpBrowserEngineObscura => 'Obscura';

  @override
  String get webSearchSerpBrowserEngineHint =>
      'Auto preferisce Obscura per Bing/Google/Baidu, poi Playwright Chromium.';

  @override
  String get webSearchEffectiveSerp => 'Motore SERP effettivo ora';

  @override
  String get browserControlManagedEngine => 'Motore browser gestito';

  @override
  String get browserControlManagedEngineAuto =>
      'Auto (Obscura se pronto, altrimenti Chromium)';

  @override
  String get browserControlManagedEngineChromium => 'Chromium';

  @override
  String get browserControlManagedEngineObscura => 'Obscura';

  @override
  String get browserControlManagedEngineHint =>
      'Auto preferisce Obscura per il browser gestito. Personale/remoto usano sempre CDP Chrome reale.';

  @override
  String get browserControlEffectiveManaged => 'Motore gestito effettivo ora';

  @override
  String get webSearchEngines =>
      'Motori di ricerca (ordine: Bing → Google → Baidu)';

  @override
  String get webSearchEnginesHint =>
      'Quando il fallback browser è attivo, prova i motori selezionati in questo ordine finché uno restituisce risultati.';

  @override
  String get webSearchEnginesRequired =>
      'Selezioni almeno uno tra Bing, Google o Baidu per il fallback browser.';

  @override
  String get webSearchEngineBing => 'Bing';

  @override
  String get webSearchEngineGoogle => 'Google';

  @override
  String get webSearchEngineBaidu => 'Baidu';

  @override
  String get webSearchBrowserReady =>
      'Playwright Chromium pronto sull’host daemon';

  @override
  String get webSearchBrowserMissing =>
      'Playwright Chromium non installato sull’host daemon';

  @override
  String get webSearchInstallHintNote =>
      'Playwright fa già parte del daemon. Scarichi Chromium sul computer domestico con EnvoyHome (non questo telefono), poi riapra Impostazioni; riavvii il daemon se lo stato resta assente.';

  @override
  String get webSearchCopyHint => 'Copia comando di installazione';

  @override
  String get webSearchUnattendedBrowser =>
      'Consenti fallback browser per le programmazioni';

  @override
  String get connPairingHint =>
      'I dispositivi Owner della famiglia possono generare e revocare l’associazione qui. I membri vedono solo lo stato.';

  @override
  String get connNoDevices => 'Nessun dispositivo associato elencato.';

  @override
  String get connEnabled => 'Abilitato';

  @override
  String get connDisabled => 'Disabilitato';

  @override
  String get connReady => 'Pronto';

  @override
  String get connHealthy => 'Sano';

  @override
  String get connUnhealthy => 'Non sano';

  @override
  String get connHaUrl => 'URL base HA';

  @override
  String get connHaToken => 'Token di accesso';

  @override
  String get connMqttUrl => 'URL broker';

  @override
  String get connMqttPassword => 'Password';

  @override
  String get connSaveEnable => 'Salva e abilita';

  @override
  String get connBindTitle => 'Binding oggetti';

  @override
  String connBoundTo(String id) {
    return 'Associato a $id';
  }

  @override
  String get connUnbound => 'Non associato';

  @override
  String get connChannelsHint =>
      'Incolli un token bot e abiliti. Preferisca il desktop per la prima configurazione.';

  @override
  String get connBotToken => 'Token bot';

  @override
  String get connDisable => 'Disabilita';

  @override
  String get connSenderBinds => 'Mittente → profilo';

  @override
  String get connSenderBindsHint =>
      'Collega un id mittente IM al profilo attivo.';

  @override
  String get connBindChannel => 'Canale';

  @override
  String get connChannelAccount => 'Account canale';

  @override
  String get connSenderId => 'Id mittente';

  @override
  String get connBindSender => 'Associa mittente';

  @override
  String get skillsTabSkills => 'Skills';

  @override
  String get skillsVerify => 'Verifica';

  @override
  String get skillsVerified => 'Skill verificata';

  @override
  String get skillsTabWorkflows => 'Workflow';

  @override
  String get skillsTabSchedules => 'Programmazioni';

  @override
  String get skillsTabScenes => 'Scene';

  @override
  String get schedulesTabJobs => 'Job';

  @override
  String get scenesHint =>
      'Automazioni domestiche Quando → azione (regole domestiche). I modelli presenza richiedono Modalità privacy.';

  @override
  String get scenesWhenPresence => 'Presenza (nessun cron — trigger sensore)';

  @override
  String get scenesNone => 'Nessuna scena.';

  @override
  String get scenesAddMorning => 'Aggiungi Buongiorno';

  @override
  String get scenesPrivacyRequired =>
      'Abiliti Modalità privacy (LLM → Routing) prima delle scene di presenza.';

  @override
  String get skillsInstallUrl => 'Installa da URL';

  @override
  String get skillsInstall => 'Installa';

  @override
  String get skillsClawHubSearch => 'Ricerca ClawHub';

  @override
  String get schedWhenHint => 'Quando (linguaggio naturale)';

  @override
  String get schedMessageHint => 'Messaggio promemoria';

  @override
  String get schedPropose => 'Proponi';

  @override
  String get schedConfirm => 'Confirm reminder';

  @override
  String get scheduleCardTitle => 'Impostare questo promemoria?';

  @override
  String get scheduleCardConfirm => 'Conferma';

  @override
  String get scheduleCardCancel => 'Annulla';

  @override
  String get scheduleCardConfirmedToast => 'Promemoria impostato.';

  @override
  String get scheduleCardCanceledToast => 'Promemoria annullato.';

  @override
  String get scheduleCardFailed => 'Impossibile aggiornare quel promemoria.';

  @override
  String get schedKindNotify => 'Notifica';

  @override
  String get schedKindWorkflow => 'Workflow';

  @override
  String get schedKindTool => 'Strumento';

  @override
  String get schedWorkflowId => 'Id workflow';

  @override
  String get schedToolName => 'Nome strumento';

  @override
  String get schedKindAgent => 'Agente';

  @override
  String get schedAgentPrompt => 'Prompt agente';

  @override
  String get schedTabRepeating => 'Ricorrenti';

  @override
  String get schedTabOnce => 'Una volta';

  @override
  String get schedTabHistory => 'Cronologia';

  @override
  String get schedNoneRepeating => 'Nessuna pianificazione ricorrente.';

  @override
  String get schedNoneOnce => 'Nessun promemoria una tantum.';

  @override
  String get schedNoReceipts => 'Nessuna esecuzione.';

  @override
  String get schedHistoryNotSet => 'Non impostato';

  @override
  String get schedHistoryRuns => 'Esecuzioni';

  @override
  String get schedNoDismissed => 'Nessuna proposta annullata.';

  @override
  String get schedDismissedCanceled => 'Annullato';

  @override
  String get schedDismissedExpired => 'Scaduto';

  @override
  String get schedNext => 'Prossima';

  @override
  String get schedKindRepeating => 'Si ripete';

  @override
  String get schedKindOnce => 'Una volta';

  @override
  String get schedKindDaily => 'Giornaliero';

  @override
  String get schedKindWeekdays => 'Giorni feriali';

  @override
  String get schedKindWeekly => 'Settimanale';

  @override
  String get schedKindMonthly => 'Mensile';

  @override
  String get schedKindYearly => 'Annuale';

  @override
  String get schedKindEvery => 'Ogni';

  @override
  String schedDayOfMonth(String d) {
    return 'giorno $d';
  }

  @override
  String get wfEditorTitle => 'Workflow';

  @override
  String get wfEnable => 'Abilita';

  @override
  String get wfDisable => 'Disabilita';

  @override
  String get wfTools => 'Inserisci strumento';

  @override
  String get wfId => 'Id workflow';

  @override
  String get wfAiPrompt => 'Descriva il workflow';

  @override
  String get wfAiPromptHint => 'es. spegni luci alle 23 se nessuno in casa';

  @override
  String get wfAiDraft => 'Bozza con AI';

  @override
  String get wfDiagramNodes => 'Nodi (diagramma telefono)';

  @override
  String get wfNoNodes => 'Nessun nodo — bozza o incolli YAML.';

  @override
  String get wfYaml => 'YAML';

  @override
  String get wfSave => 'Valida e salva';

  @override
  String get wfRun => 'Esecuzione di prova';

  @override
  String get wfDrafted => 'Bozza applicata';

  @override
  String get wfSaved => 'Salvato';

  @override
  String get wfRan => 'Esecuzione avviata';

  @override
  String get sysTabFiles => 'File';

  @override
  String get sysTabHealth => 'Salute';

  @override
  String get sysTabGrants => 'Autorizzazioni';

  @override
  String get sysTabMachine => 'Questo computer';

  @override
  String get sysMachineHint =>
      'Stato ascolto daemon da home.health. Installazione/riavvio servizio OS è solo loopback sul desktop domestico — non disponibile via mesh.';

  @override
  String get sysMachineDaemonOk => 'Daemon raggiungibile';

  @override
  String get sysMachineDaemonBad => 'Salute daemon non riuscita';

  @override
  String get sysMachineWsPort => 'Porta WebSocket';

  @override
  String get sysMachineHttpPort => 'Porta HTTP hatch';

  @override
  String get sysMachinePublicUrl => 'URL base pubblico';

  @override
  String get sysMachinePublicUrlEmpty => 'Non impostato';

  @override
  String get sysMachineUptime => 'Tempo di attività';

  @override
  String get sysMachineConnections => 'Client / turni attivi';

  @override
  String get sysMachineMesh => 'Mesh';

  @override
  String get sysMachineOsServiceNote =>
      'Installi o riavvii il servizio OS da desktop Impostazioni → Sistema → Questo computer (loopback-owner).';

  @override
  String get sysMachineRefresh => 'Aggiorna';

  @override
  String get sysTestPush => 'Invia push di prova';

  @override
  String get sysTestPushSent => 'Push di prova richiesta';

  @override
  String get wfModeYaml => 'YAML';

  @override
  String get wfModeDiagram => 'Diagramma';

  @override
  String get wfDiagramEmpty => 'Nessun passo — bozza o modifichi YAML.';

  @override
  String get wfDiagramEdge => '↓';

  @override
  String get sysDoctorFix => 'Correggi';

  @override
  String get sysDoctorFixAll => 'Correggi tutto';

  @override
  String sysDoctorFixed(String ids) {
    return 'Corretto: $ids';
  }

  @override
  String get sysNoIssues => 'Nessun problema doctor.';

  @override
  String get sysNoGrants => 'Nessuna autorizzazione.';

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
  String get chatThought => 'Ragionamento';

  @override
  String get chatNew => 'Nuova chat';

  @override
  String get chatNewNamePrompt => 'Nome chat';

  @override
  String get chatNewNamePlaceholder => 'es. Piani del weekend';

  @override
  String get chatNewNameHint =>
      'Assegna un nome ora, oppure avvia senza — il titolo userà il primo messaggio.';

  @override
  String get chatNewSkip => 'Avvia senza nome';

  @override
  String get chatNewCreate => 'Crea';

  @override
  String get chatNewNeedName =>
      'Inserisci un nome, oppure scegli Avvia senza nome.';

  @override
  String get chatNewStart => 'Avvia chat';

  @override
  String get chatOpenArtifact => 'Apri risposta completa';

  @override
  String get chatPromoteKnowledge => 'Aggiungi a Knowledge';

  @override
  String chatPromotedKnowledge(String path) {
    return 'Salvato in $path';
  }

  @override
  String get chatPromoteFailed => 'Impossibile aggiungere a Knowledge.';

  @override
  String get chatRecents => 'Recenti';

  @override
  String get chatRecentsEmpty => 'Nessuna chat precedente.';

  @override
  String get chatSessionsEmpty => 'Nessuna chat. Iniziane una nuova.';

  @override
  String get chatUntitled => 'Chat senza titolo';

  @override
  String get chatRenameAction => 'Rinomina';

  @override
  String get chatRenamePrompt => 'Nome chat';

  @override
  String get chatRenameDone => 'Chat rinominata.';

  @override
  String get chatRenameEmpty => 'Il nome non può essere vuoto.';

  @override
  String get chatRenameNeedSession => 'Invia prima un messaggio, poi rinomina.';

  @override
  String get chatBusyTurn =>
      'Attendi che la risposta corrente finisca (o annulla).';

  @override
  String get chatEmptyAction => 'Svuota chat';

  @override
  String get chatEmptyConfirmTitle => 'Svuotare questa chat?';

  @override
  String get chatEmptyConfirmBody =>
      'Tutti i messaggi di questo thread verranno rimossi. La chat resta.';

  @override
  String get chatTrashMenu => 'Azioni chat';

  @override
  String get chatArchiveAction => 'Archivia chat';

  @override
  String get chatUnarchiveAction => 'Ripristina in Chat';

  @override
  String get chatUnarchiveDone => 'Chat ripristinata.';

  @override
  String get chatArchivedOpen => 'Archiviate';

  @override
  String get chatTabActive => 'Chat';

  @override
  String get chatTabArchived => 'Archiviate';

  @override
  String get homeFolderTitle => 'Scegli cartella';

  @override
  String get homeFolderSelect => 'Seleziona';

  @override
  String get homeFolderDrives => 'Unità';

  @override
  String get homeFolderComputer => 'Computer';

  @override
  String get homeFolderHome => 'Home';

  @override
  String get homeFolderParent => 'Cartella superiore';

  @override
  String get homeFolderNoSubfolders => 'Nessuna sottocartella';

  @override
  String get chatArchivedTitle => 'Chat archiviate';

  @override
  String get chatArchivedBack => 'Torna alle chat';

  @override
  String get chatArchivedEmpty => 'Nessuna chat archiviata.';

  @override
  String get chatRemoveAction => 'Elimina chat';

  @override
  String get chatArchiveConfirmTitle => 'Archiviare questa chat?';

  @override
  String get chatArchiveConfirmBody =>
      'Sparirà da Recenti ma resterà su disco.';

  @override
  String get chatRemoveConfirmTitle => 'Eliminare questa chat?';

  @override
  String get chatRemoveConfirmBody =>
      'Elimina definitivamente questa chat e tutti i messaggi.';

  @override
  String get chatRemoveDone => 'Chat eliminata.';

  @override
  String get chatNoSession => 'Nessuna chat attiva.';

  @override
  String get chatDeleteFailed =>
      'Impossibile eliminare il messaggio sul server.';

  @override
  String get chatDeleteMessage => 'Elimina messaggio';

  @override
  String get chatCopyMessage => 'Copia messaggio';

  @override
  String get chatCopied => 'Copiato';

  @override
  String get chatCancel => 'Annulla';

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
  String get modelsTest => 'Prova';

  @override
  String get modelsSetDefault => 'Imposta predefinito';

  @override
  String modelsTestOk(String id) {
    return 'Provato $id';
  }

  @override
  String modelsDefaultSet(String id) {
    return 'Predefinito → $id';
  }

  @override
  String get artifactsTitle => 'Artefatti';

  @override
  String get artifactsHint =>
      'Si apre nell’app via connessione home (nessun URL pubblico).';

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
  String get artifactsTooLarge =>
      'Questo file supera il limite in-app di 8 MB. Chieda all’agente un’esportazione più piccola, oppure lo apra sul computer domestico.';

  @override
  String get artifactsRefresh => 'Aggiorna';

  @override
  String get artifactsRetry => 'Riprova';

  @override
  String get artifactsBinaryHint =>
      'Questo tipo di file non è anteprimabile qui. Usa Condividi/Salva per aprirlo in un’altra app, o chiedi un export testo o Markdown.';

  @override
  String get artifactsShare => 'Condividi / Salva';

  @override
  String artifactsShareFailed(String error) {
    return 'Condivisione non riuscita: $error';
  }

  @override
  String get artifactsCopyLink => 'Copia link firmato';

  @override
  String get artifactsLinkCopied => 'Link firmato copiato';

  @override
  String get artifactsCopyLinkFailed => 'Impossibile copiare il link';

  @override
  String get artifactsOpenInBrowser => 'Apri nel browser';

  @override
  String get artifactsOpenInBrowserFailed => 'Impossibile aprire nel browser';

  @override
  String get filesParent => 'Superiore';

  @override
  String get filesRoots => 'Radici';

  @override
  String get filesEmptyFolder => 'Questa cartella è vuota';

  @override
  String get artifactsLoTitle => 'LibreOffice (computer domestico)';

  @override
  String get artifactsLoWhy =>
      'Esportazioni Word, Excel, PowerPoint e PDF di qualità stampa girano sul Suo computer domestico (~1 GB, resta in locale). Senza LibreOffice le esportazioni funzionano con un layout più semplice. I documenti non vengono mai inviati al cloud per la conversione.';

  @override
  String get artifactsLoReady => 'Pronto';

  @override
  String get artifactsLoMissing => 'Non installato';

  @override
  String get artifactsLoDownloading => 'Download…';

  @override
  String get artifactsLoFailed => 'Installazione non riuscita';

  @override
  String get artifactsLoInstall => 'Installa sul computer domestico';

  @override
  String get artifactsLoCancel => 'Annulla download';

  @override
  String get artifactsLoNotNow => 'Non ora';

  @override
  String get artifactsLoRefresh => 'Aggiorna stato';

  @override
  String artifactsLoProgress(String received, String total) {
    return '$received / $total';
  }

  @override
  String get artifactsLoHintCopied => 'Suggerimento installazione copiato';

  @override
  String get artifactsLoCopyHint => 'Copia suggerimento installazione manuale';

  @override
  String get artifactsLoInstallNote =>
      'L’installazione gestita gira sull’host daemon domestico — non su questo telefono.';

  @override
  String get artifactsDataPreferTitle => 'Percorsi dati (ordine preferito)';

  @override
  String get artifactsDataPreferStrip =>
      '1) Strumenti tabella core sempre attivi · 2) DuckDB per join / SQL offline · 3) MCP Owner per fogli cloud / SaaS BI.';

  @override
  String get artifactsDataPreferJoinNeed =>
      'Necessario per join offline in chat.';

  @override
  String get artifactsDataBrowseTables => 'Sfoglia output/tables';

  @override
  String get artifactsDataBrowseCharts => 'Sfoglia output/charts';

  @override
  String get artifactsSqlTitle => 'SQL offline (DuckDB)';

  @override
  String get artifactsSqlWhy =>
      'Installi DuckDB sul computer domestico per join SQL offline su file nel jail. Mai automatico — sceglie Lei Installa.';

  @override
  String get artifactsSqlReady => 'Pronto';

  @override
  String get artifactsSqlMissing => 'Non installato (opzionale)';

  @override
  String get artifactsSqlDownloading => 'Download…';

  @override
  String get artifactsSqlFailed => 'Installazione non riuscita';

  @override
  String get artifactsSqlCancelled => 'Download annullato';

  @override
  String get artifactsSqlInstall => 'Installa DuckDB sul computer domestico';

  @override
  String get artifactsSqlCancel => 'Annulla download';

  @override
  String get artifactsSqlRefresh => 'Aggiorna stato';

  @override
  String artifactsSqlProgress(String received, String total) {
    return '$received / $total';
  }

  @override
  String get artifactsSqlToolsReady =>
      'sql_load / sql_query sono disponibili per l’agente.';

  @override
  String get artifactsSqlToolsAbsent =>
      'sql_load / sql_query restano fuori dal catalogo dell’agente finché DuckDB non è pronto.';

  @override
  String get artifactsSqlInstallNote =>
      'L’installazione gestita gira sull’host daemon domestico — non su questo telefono.';

  @override
  String get chatDataAssistHint =>
      'Foglio allegato — scelga un passo successivo (precompila il compositore; le scritture richiedono ancora Allow):';

  @override
  String get chatDataAssistClean => 'Pulisci e grafico';

  @override
  String get chatDataAssistAsk => 'Chiedi su questa tabella';

  @override
  String get chatDataAssistJoin => 'Join / SQL';

  @override
  String get chatDataAssistInstallDuckdb => 'Installa DuckDB…';

  @override
  String get chatDataAssistCleanSeed =>
      'Pulisca il foglio allegato con table_transform (normalizza / filtra / pipeline se serve), poi chart_table, e mi mostri i chip Apri per CSV e grafico.';

  @override
  String get chatDataAssistAskSeed =>
      'Cosa c’è nel foglio allegato? Riassuma colonne, numero di righe e qualche riga di esempio.';

  @override
  String get chatDataAssistJoinSeed =>
      'Carichi il foglio allegato con sql_load, poi usi sql_query per rispondere (join se allego altre tabelle). Mostri i chip Apri per ogni CSV risultato.';

  @override
  String get chatDataAssistNeedDuckdb =>
      'DuckDB non è pronto — installi in Sistema → File sul computer domestico.';

  @override
  String chatOpenFile(String name) {
    return 'Apri $name';
  }

  @override
  String chatPendingApprovals(int count) {
    return '$count in attesa della tua approvazione';
  }

  @override
  String get choiceCardConfirm => 'Conferma';

  @override
  String get choiceCardOpen => 'Apri';

  @override
  String get choiceCardChooseFile => 'Scegli file';

  @override
  String get choiceCardBrowseJail => 'Sfoglia file';

  @override
  String get choiceCardBrowseUp => 'Up';

  @override
  String choiceCardFilesChosen(int n) {
    return '$n file scelti';
  }

  @override
  String get choiceCardNoFile => 'Nessun file scelto';

  @override
  String get choiceCardFileEmpty => 'Quel file è vuoto.';

  @override
  String choiceCardFileTypeRefused(String name) {
    return '$name non è un tipo di upload modulo consentito.';
  }

  @override
  String get choiceCardHandoffHint =>
      'Si apre nel Suo browser o app per completare e pagare lì. Home non inserirà i dati della carta.';

  @override
  String get choiceCardPickOne => 'Seleziona almeno un\'opzione.';

  @override
  String get choiceCardAnswered => 'Ricevuto.';

  @override
  String choiceCardFailed(String error) {
    return 'Impossibile inviare la scelta: $error';
  }

  @override
  String chatPendingChoices(int count) {
    return '$count in attesa della tua scelta';
  }

  @override
  String get choiceCardCancel => 'Annulla';

  @override
  String get choiceCardCanceled => 'Scelta annullata.';

  @override
  String get choiceCardExpired => 'Scaduto';

  @override
  String get choiceCardExpiredHint =>
      'Questa scelta è scaduta — chiedi di nuovo se serve.';

  @override
  String choiceCardExpiresIn(int mins) {
    return 'Scade tra $mins min';
  }

  @override
  String get choiceCardTextPlaceholder => 'Scrivi la risposta';

  @override
  String get schedulesChatTabChat => 'Chat';

  @override
  String get schedulesChatTabHistories => 'Cronologie';

  @override
  String get schedulesChatHistoriesHint =>
      'Proposte annullate o scadute ed esecuzioni recenti.';

  @override
  String get jobsHistoriesMovedHint =>
      'Non impostato e le esecuzioni sono in Cronologie';

  @override
  String schedulesChatClosedAt(String when) {
    return 'Chiuso $when';
  }

  @override
  String schedulesChatRanAt(String when) {
    return 'Eseguito $when';
  }

  @override
  String get welcomeSkip => 'Salta';

  @override
  String get welcomeNext => 'Avanti';

  @override
  String get commonContinue => 'Continua';

  @override
  String get welcomeSlide1Title => 'Benvenuto in EnvoyHome';

  @override
  String get welcomeSlide1Body =>
      'Il telefono è una finestra sull’agente di casa self-hosted — chat, approvazioni e smart home restano sul desktop.';

  @override
  String get welcomeSlide2Title => 'Il lavoro avviene sul computer';

  @override
  String get welcomeSlide2Body =>
      'Installa EnvoyHome su un Mac o PC a casa. Daemon, modelli e memoria familiare restano lì — il telefono è una finestra remota.';

  @override
  String get welcomeSlide3Title => 'Associa con un QR';

  @override
  String get welcomeSlide3Body =>
      'Sul computer apri EnvoyHome e mostra il QR di associazione. Su questo telefono tocca Associa ora e scansiona. Puoi anche incollare un link.';

  @override
  String get welcomeSlideRequiredTitle => 'Associa per iniziare';

  @override
  String get welcomeSlideRequiredBody =>
      'EnvoyHome richiede un computer con l’app desktop. Agenti e controllo casa girano lì — associa questo telefono per continuare.';

  @override
  String get setupGuideTitle => 'Come funziona EnvoyHome';

  @override
  String get setupGuideIntro =>
      'EnvoyHome sul telefono parla con EnvoyHome sul computer di casa. Installa il desktop, associa una volta, poi chatta e approva da ovunque.';

  @override
  String get setupGuidePairRequiredTitle => 'Associa per continuare';

  @override
  String get setupGuidePairRequiredBody =>
      'EnvoyHome è il companion del desktop di casa. Senza un computer associato non c’è ancora nulla da mostrare qui.';

  @override
  String get setupGuideStep1Title => 'Prepara un computer';

  @override
  String get setupGuideStep1Body =>
      'Serve un Mac o PC Windows/Linux a casa. Quella macchina è l’host EnvoyHome — daemon e agenti girano lì.';

  @override
  String get setupGuideStep2Title => 'Scarica e installa EnvoyHome';

  @override
  String get setupGuideStep2Body =>
      'Apri il QuickStart e installa daemon e app desktop. Avviali e lasciali in esecuzione.';

  @override
  String get setupGuideDownloadCta => 'Apri QuickStart EnvoyHome';

  @override
  String get setupGuideStep3Title => 'Mostra il QR di associazione';

  @override
  String get setupGuideStep3Body =>
      'Nel desktop EnvoyHome: Impostazioni → Associa dispositivi. Tieni il QR a schermo (con mesh/relay, non solo LAN).';

  @override
  String get setupGuideStep4Title => 'Scansiona con questo telefono';

  @override
  String get setupGuideStep4Body =>
      'Tocca Associa ora. Consenti la fotocamera, scansiona il QR. Oppure incolla un link envoy:// / host:porta / SSH.';

  @override
  String get setupGuideStep5Title => 'Sei connesso';

  @override
  String get setupGuideStep5Body =>
      'Dopo l’associazione questo telefono mostra chat, approvazioni e Impostazioni. Il desktop continua anche senza telefono.';

  @override
  String get setupGuideNoHomeTitle => 'Associare dopo va bene';

  @override
  String get setupGuideNoHomeBody =>
      'Puoi continuare e associare in qualsiasi momento da Connetti. Senza computer non c’è ancora nulla da mostrare.';

  @override
  String get setupGuidePairCta => 'Associa ora';

  @override
  String get setupGuidePairLaterCta => 'Più tardi';

  @override
  String get setupGuideSkipCta => 'Esplora prima';

  @override
  String get setupGuideDoneCta => 'Capito';

  @override
  String get settingsSetupGuideSubtitle =>
      'Come installare il desktop e associare questo telefono.';
}
