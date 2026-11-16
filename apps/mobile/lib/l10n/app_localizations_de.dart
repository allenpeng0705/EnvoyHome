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
  String get appThemePicker => 'Darstellung';

  @override
  String get appThemeSystem => 'System';

  @override
  String get appThemeLight => 'Hell';

  @override
  String get appThemeDark => 'Dunkel';

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
  String get pairTokenOptional => 'Token (freiwillig)';

  @override
  String get shellOnline => 'online';

  @override
  String get shellDegraded => 'eingeschränkt';

  @override
  String get shellOffline => 'offline';

  @override
  String get shellConnect => 'Verbinden';

  @override
  String get shellReconnect => 'Erneut verbinden';

  @override
  String get shellDisconnect => 'Trennen';

  @override
  String get shellForgetPairing => 'Kopplung vergessen';

  @override
  String get connectGuideTitle => 'Mit dem Zuhause verbinden';

  @override
  String get connectGuideHint =>
      'Öffnen Sie am Desktop Einstellungen → Geräte koppeln und scannen Sie den QR-Code — oder fügen Sie den Pairing-Link / Host ein.';

  @override
  String get connectGuideReconnectHint =>
      'Dieses Telefon ist bereits gekoppelt. Stellen Sie die Verbindung wieder her, oder koppeln Sie erneut bei einem neuen Zuhause.';

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
  String get shellCreateProfile => 'Erstellen';

  @override
  String get shellProfileDisplayName => 'Anzeigename';

  @override
  String get shellProfileIdOptional => 'Konto-ID (optional)';

  @override
  String get shellCancel => 'Abbrechen';

  @override
  String get shellCreate => 'Erstellen';

  @override
  String get shellProfileCreated => 'Profil erstellt';

  @override
  String shellProfileCreateFailed(String error) {
    return 'Erstellen fehlgeschlagen: $error';
  }

  @override
  String get navChat => 'Chats';

  @override
  String get navHomeChat => 'Home';

  @override
  String get navSchedulesChat => 'Zeitpläne';

  @override
  String get navSettings => 'Einstellungen';

  @override
  String get navLlm => 'LLM';

  @override
  String get navConnections => 'Verbindungen';

  @override
  String get navSkills => 'Skills';

  @override
  String get navSystem => 'System';

  @override
  String get navProfiles => 'Profile';

  @override
  String get navApprovals => 'Freigaben';

  @override
  String get navModels => 'Modelle';

  @override
  String get navArtifacts => 'Artefakte';

  @override
  String get settingsHubHint =>
      'Configure the home daemon from your phone. Some owner-only actions need a trusted device.';

  @override
  String get settingsProfilesSubtitle =>
      'Owner, Arbeitsbereichsordner, Tool-Richtlinie';

  @override
  String get settingsLlmSubtitle => 'Modelle, Lokal, Routing, Speicher';

  @override
  String get settingsConnectionsSubtitle =>
      'Pairing, Home Assistant, MQTT, Channels';

  @override
  String get settingsSkillsSubtitle =>
      'Skill-Pakete installieren und verwalten';

  @override
  String get settingsWorkflowsSubtitle =>
      'DAG-Workflows — Entwurf, Validierung, Ausführung';

  @override
  String get settingsSystemSubtitle =>
      'Profile, Gemeinsame Dateien, Zustand, Berechtigungen';

  @override
  String get settingsNeedConnect =>
      'Verbinden Sie sich, um LLM, Verbindungen, Skills und System zu konfigurieren.';

  @override
  String get profilesIntro =>
      'Jede Person hat ein Profil. Der Haushalts-Owner konfiguriert Arbeitsbereichsordner und kann das Eigentum übertragen.';

  @override
  String get profilesMemberHint =>
      'Dieses Gerät ist nicht der Haushalts-Owner — der Arbeitsbereich ist hier schreibgeschützt.';

  @override
  String get profilesRefresh => 'Aktualisieren';

  @override
  String get profilesAddTitle => 'Profil hinzufügen';

  @override
  String get profilesOwnerBadge => 'Owner';

  @override
  String get profilesActiveBadge => 'Aktiv';

  @override
  String get profilesWorkspaceTitle => 'Arbeitsbereichsordner';

  @override
  String get profilesWorkspaceHint =>
      'Host-Ordner auf dem Heimcomputer hinzufügen (bis zu 16). Der Agent erreicht sie über workspace/<id>/…-Pfade.';

  @override
  String get profilesWorkspacePath => 'Host-Pfad';

  @override
  String get profilesWorkspaceBrowse => 'Ordner durchsuchen';

  @override
  String get profilesWorkspaceBrowseHint =>
      'Tippen, um den Heimcomputer zu durchsuchen';

  @override
  String get profilesWorkspaceUnset => 'Nicht gesetzt (nur Sandbox)';

  @override
  String get profilesWorkspaceSet => 'Konfiguriert';

  @override
  String get profilesWorkspaceWholeMachine => 'Gesamter Computer';

  @override
  String get profilesWorkspaceRo => 'Nur Lesen';

  @override
  String get profilesWorkspaceRw => 'Lesen & Schreiben';

  @override
  String get profilesWorkspaceUseRoot => 'Computerstamm hinzufügen';

  @override
  String get profilesWorkspaceClear => 'Alle entfernen';

  @override
  String get profilesWorkspaceRemove => 'Entfernen';

  @override
  String get profilesWorkspaceApply => 'Hinzufügen';

  @override
  String get profilesWorkspaceEdit => 'Ordner hinzufügen';

  @override
  String get profilesWorkspaceRootTitle =>
      'Zugriff auf den gesamten Computer erlauben?';

  @override
  String get profilesWorkspaceRootBody =>
      'Der Agent kann Dateien unter dem Computerstamm über workspace/… lesen (und bei Auswahl schreiben) — auch von diesem Telefon.';

  @override
  String get profilesWorkspaceRootOk => 'Erlauben';

  @override
  String get profilesWorkspaceMemberNote =>
      'Nur der Haushalts-Owner kann Arbeitsbereichsordner ändern.';

  @override
  String get profilesWorkspaceCrossTitle =>
      'Arbeitsbereichsordner für ein anderes Profil hinzufügen?';

  @override
  String profilesWorkspaceCrossBody(String name) {
    return 'Dies fügt einen Host-Ordner für $name hinzu. Nur fortfahren, wenn Sie dessen Arbeitsbereich konfigurieren möchten.';
  }

  @override
  String get profilesWorkspaceDenied => 'Auf diesem Gerät nicht sichtbar';

  @override
  String get profilesWorkspaceInactive =>
      'Konfiguriert, aber inaktiv (Dateisystemstamm gilt nur für Owner)';

  @override
  String get profilesRename => 'Umbenennen';

  @override
  String get profilesRenameTitle => 'Profil umbenennen';

  @override
  String get profilesRenameSave => 'Speichern';

  @override
  String get profilesTimeZoneUnset =>
      'Zeitzone: nicht gesetzt (Zeitpläne nutzen Host-Standard)';

  @override
  String profilesTimeZoneValue(String tz) {
    return 'Zeitzone: $tz';
  }

  @override
  String get profilesTimeZoneEdit => 'Zeitzone';

  @override
  String get profilesTimeZoneTitle => 'Konto-Zeitzone';

  @override
  String get profilesTimeZoneHint => 'IANA-Name, z. B. Europe/Berlin';

  @override
  String get profilesTimeZoneSave => 'Speichern';

  @override
  String profilesTimeZoneDone(String tz) {
    return 'Zeitzone auf $tz gesetzt';
  }

  @override
  String get profilesShareLocationTitle => 'Standort mit Home teilen';

  @override
  String get profilesShareLocationSubtitle =>
      'Ungefähre GPS-Koordinaten an Chat-Turns anhängen. Berechtigung nur einmal hier; nie bei jedem Senden. Nur ephemer — nicht in den Speicher.';

  @override
  String get profilesShareLocationDenied =>
      'Standortberechtigung nicht erteilt. Teilen bleibt aus.';

  @override
  String get profilesShareLocationOn =>
      'Standortfreigabe auf diesem Gerät aktiv';

  @override
  String get profilesDelete => 'Löschen';

  @override
  String get profilesDeleteTitle => 'Profil löschen?';

  @override
  String profilesDeleteBody(String name) {
    return '$name löschen? Sandbox und Arbeitsbereichskonfiguration werden entfernt. Das kann nicht rückgängig gemacht werden.';
  }

  @override
  String get profilesDeleteConfirm => 'Löschen';

  @override
  String profilesDeleteDone(String name) {
    return '$name gelöscht';
  }

  @override
  String get profilesDeleteOwnerBlocked =>
      'Haushalts-Owner kann nicht gelöscht werden. Zuerst Eigentum übertragen.';

  @override
  String get profilesTransferTitle => 'Haushalts-Owner übertragen?';

  @override
  String profilesTransferBody(String name) {
    return '$name wird Haushalts-Owner. Steuert Pairing, Bindungen und Haushaltseinstellungen.';
  }

  @override
  String get profilesTransferConfirm => 'Übertragen';

  @override
  String profilesTransferDone(String name) {
    return 'Owner ist jetzt $name';
  }

  @override
  String profilesTransferFailed(String error) {
    return 'Übertragung fehlgeschlagen: $error';
  }

  @override
  String profilesTransferTo(String name) {
    return 'Übertragen an $name';
  }

  @override
  String get profilesToolPolicy => 'Tool-Richtlinie';

  @override
  String get profilesToolPolicyStandard => 'Standard';

  @override
  String get profilesToolPolicyRestricted => 'Eingeschränkt';

  @override
  String get connMintPairing => 'Pairing-Code erzeugen';

  @override
  String get connMintOk => 'Pairing-Code erzeugt';

  @override
  String get connMintUriHint =>
      'URI auf dem neuen Gerät scannen oder einfügen.';

  @override
  String get connPairingOwnerOnly =>
      'Erzeugen/Widerrufen von Pairing erfordert das Haushalts-Owner-Gerät.';

  @override
  String get connRevokeDevice => 'Widerrufen';

  @override
  String get connForgetDevice => 'Vergessen';

  @override
  String connRevokeConfirm(String id) {
    return 'Gerät $id widerrufen? Es muss erneut gekoppelt werden.';
  }

  @override
  String connForgetConfirm(String id) {
    return 'Gerät $id vergessen? Der Pairing-Eintrag wird dauerhaft entfernt.';
  }

  @override
  String get connOwnerWriteOnly =>
      'Nur das Haushalts-Owner-Gerät kann diese Einstellung ändern.';

  @override
  String get connAccountsHint => 'Haushaltsprofile';

  @override
  String get homeChatSessionTitle => 'Home-Chat vom Telefon';

  @override
  String get homeChatEmptyTitle => 'Mit Ihrem Zuhause sprechen';

  @override
  String get homeChatEmptyHint =>
      'Smart-Home-Tools bleiben hier verfügbar. Genehmigungen steuern weiterhin Aktionen.';

  @override
  String get homeChatHint => 'Fragen Sie zu Licht, Schlössern, Klima…';

  @override
  String get schedulesChatSessionTitle => 'Zeitpläne';

  @override
  String get schedulesChatEmptyTitle => 'Erinnerungen';

  @override
  String get schedulesChatEmptyHint =>
      'Dieser Chat bleibt bei Erinnerungen. Zeit bestätigen, bevor sie aktiv wird.';

  @override
  String get schedulesChatHint => 'Erinnere mich…';

  @override
  String get chatAttach => 'Anhängen';

  @override
  String chatAttachTooMany(int n) {
    return 'Höchstens $n Dateien';
  }

  @override
  String chatAttachTooLarge(String name, String mb) {
    return '$name überschreitet $mb MB';
  }

  @override
  String chatAttachAdded(int n) {
    return '$n Datei(en) angehängt';
  }

  @override
  String get chatAttachedOnly => '(Anhang)';

  @override
  String get chatVoiceStart => 'Diktieren';

  @override
  String get chatVoiceStop => 'Diktat beenden';

  @override
  String get chatVoiceUnsupported =>
      'Spracherkennung ist auf diesem Gerät nicht verfügbar.';

  @override
  String get llmTabModels => 'Modelle';

  @override
  String get llmTabLocal => 'Lokal';

  @override
  String get llmTabRouting => 'Routing';

  @override
  String get llmTabMemory => 'Speicher';

  @override
  String get llmLocalDownloadHint =>
      'Auf Hugging Face suchen und GGUF-Dateien auf den Heimcomputer laden.';

  @override
  String get llmHfSearchHint => 'Modelle suchen…';

  @override
  String get llmSearch => 'Suchen';

  @override
  String get llmCancelDownload => 'Abbrechen';

  @override
  String get llmResumeDownload => 'Fortsetzen';

  @override
  String llmGgufFiles(String repo) {
    return 'GGUF in $repo';
  }

  @override
  String get llmRoutingHint =>
      'Wählen Sie, wo Turns für dieses Profil laufen dürfen.';

  @override
  String get llmFilterAny => 'Intelligent / beliebig';

  @override
  String get llmFilterCloud => 'Nur Cloud';

  @override
  String get llmFilterLocal => 'Nur lokal';

  @override
  String get llmAutoSwitch => 'Automatischer Modellwechsel';

  @override
  String get privacyModeTitle => 'Datenschutzmodus';

  @override
  String get privacyModeHint =>
      'Erzwingt lokale Inferenz und blockiert Cloud-Tools. Owner-Bereich.';

  @override
  String get privacyModeEnabled => 'Datenschutzmodus aktivieren';

  @override
  String get privacyModeBlockEgress =>
      'Auch Smart-Home-Aktionen & Event-Source-Benachrichtigungen blockieren';

  @override
  String get privacyModeOwnerOnly =>
      'Datenschutzmodus ist auf diesem Gerät nur für Owner.';

  @override
  String get llmCompactNow => 'Speicher jetzt komprimieren';

  @override
  String get llmFlushEnabled => 'Stehende Notizen flushen';

  @override
  String get llmReviewEnabled => 'Vor Learn-Schreiben prüfen';

  @override
  String get llmInjectMode => 'Inject-Budget-Modus';

  @override
  String get llmInjectAuto => 'Auto';

  @override
  String get llmInjectBaseline => 'Baseline';

  @override
  String get llmInjectCustom => 'Benutzerdefiniert';

  @override
  String get llmPendingLearns => 'Ausstehende Learns';

  @override
  String get llmNoPendingLearns => 'Keine ausstehenden Learns.';

  @override
  String get connTabPairing => 'Pairing';

  @override
  String get connTabHa => 'Home Assistant';

  @override
  String get connTabMqtt => 'MQTT';

  @override
  String get connTabChannels => 'Kanäle';

  @override
  String get connTabWebSearch => 'Websuche';

  @override
  String get connTabMcp => 'MCP';

  @override
  String get connTabBrowser => 'Browser';

  @override
  String get mcpLede =>
      'Fügen Sie einen beliebigen MCP-Server hinzu. Testen Sie die Verbindung, bevor Sie ihn aktivieren. Stdio-Befehle laufen als Daemon-Hostbenutzer. Tool-Aufrufe bleiben genehmigungspflichtig.';

  @override
  String get mcpTest => 'Testen';

  @override
  String get mcpAddServer => 'Server hinzufügen';

  @override
  String get mcpSave => 'Speichern';

  @override
  String get mcpReady => 'Bereit';

  @override
  String get mcpNotTested => 'Nicht getestet';

  @override
  String mcpServerSubtitle(String transport, String status, int count) {
    return '$transport · $status · $count Tools';
  }

  @override
  String mcpTestOk(int count) {
    return 'OK — $count Tool(s). Bei Bereitschaft aktivieren.';
  }

  @override
  String mcpTestFailed(String error) {
    return 'Fehlgeschlagen: $error';
  }

  @override
  String get mcpUnknownError => 'unbekannt';

  @override
  String get connDeviceRevoked => 'widerrufen';

  @override
  String connDeviceSubtitle(String id, String accounts, String revokedSuffix) {
    return '$id · $accounts$revokedSuffix';
  }

  @override
  String get mcpLabel => 'Bezeichnung';

  @override
  String get mcpCommand => 'Befehl';

  @override
  String get mcpArgs => 'Argumente (leerzeichengetrennt, optional)';

  @override
  String get mcpUrl => 'URL';

  @override
  String get mcpAuthToken => 'Auth-Token (optional)';

  @override
  String get mcpEnv => 'Env (KEY=value pro Zeile, optional)';

  @override
  String get browserControlLede =>
      'Verwalteten Browser auf dem Heimcomputer steuern (Auto bevorzugt Obscura, sonst Chromium) oder persönliches Chrome / Remote-CDP anbinden. Standardmäßig aus.';

  @override
  String get browserControlDaemonHostNote =>
      'Browser-Sitzungen laufen auf dem Heimcomputer. Einstellungen hier synchron mit Desktop Verbindungen → Browser.';

  @override
  String get browserControlEnabled => 'Browser-Tool aktivieren';

  @override
  String get browserControlUnattended =>
      'Verwaltetes Profil für Zeitpläne erlauben';

  @override
  String get browserControlReady => 'Bereit';

  @override
  String get browserControlNotReady => 'Nicht bereit';

  @override
  String get browserControlSave => 'Speichern';

  @override
  String get browserControlSaved => 'Browser-Einstellungen gespeichert.';

  @override
  String get browserControlSaveFailed =>
      'Browser-Einstellungen konnten nicht gespeichert werden.';

  @override
  String get browserControlDefaultProfile => 'Standardprofil';

  @override
  String get browserControlProfileManaged => 'Verwaltet (isoliert)';

  @override
  String get browserControlProfilePersonal => 'Persönliches Chrome';

  @override
  String get browserControlProfileRemote => 'Remote-CDP';

  @override
  String get browserControlElevatedWarn =>
      'Persönlich/remote kann auf angemeldeten Sites in Ihrem Namen handeln. Nur Owner; nie in Zeitplänen.';

  @override
  String get browserControlAcknowledge =>
      'Ich verstehe das erhöhte Browser-Risiko';

  @override
  String get browserControlPersonalEnabled => 'Persönliches Chrome aktivieren';

  @override
  String get browserControlPersonalCdp => 'Persönliches CDP (Loopback)';

  @override
  String get browserControlPersonalReady => 'Persönliches CDP aktiv';

  @override
  String get browserControlPersonalNotReady => 'Persönliches CDP inaktiv';

  @override
  String get browserControlRemoteEnabled => 'Remote-CDP aktivieren';

  @override
  String get browserControlRemoteCdp => 'Remote-CDP-URL';

  @override
  String get browserControlRemoteToken => 'Remote-CDP-Token';

  @override
  String get browserControlTokenSet => 'gesetzt';

  @override
  String get browserControlTokenPlaceholder => 'Leer lassen, um beizubehalten';

  @override
  String get browserControlRemoteReady => 'Remote-CDP aktiv';

  @override
  String get browserControlRemoteNotReady => 'Remote-CDP inaktiv';

  @override
  String get browserControlOwnerOnly =>
      'Nur das Haushalts-Owner-Gerät kann Browser-Einstellungen ändern.';

  @override
  String get browserControlAcknowledged =>
      'Erhöhtes Risiko bestätigt. Persönlich/remote deaktivieren, um die Nutzung zu beenden.';

  @override
  String get webSearchLede =>
      'Öffentliches Web aus dem Chat durchsuchen. Standard: DuckDuckGo, bei Bedarf Bing/Google/Baidu im Browser (kein API-Schlüssel). Brave und Tavily benötigen einen Owner-API-Schlüssel.';

  @override
  String get webSearchEnabled => 'web_search aktivieren';

  @override
  String get webSearchProvider => 'Anbieter';

  @override
  String get webSearchProviderBrowser => 'Browser (Bing / Google / Baidu)';

  @override
  String get webSearchBrowserPrimaryHint =>
      'Durchsucht Bing/Google/Baidu direkt im Headless-Engine des Daemon-Hosts (Obscura wenn bereit, sonst Chromium). Bei betreuter Nutzung einmal vor jeder Suche bestätigen.';

  @override
  String get webSearchDaemonHostNote =>
      'Suchmaschinen und Auswertung laufen auf dem Heimcomputer mit EnvoyHome. Dieses Telefon zeigt und (Owner) bearbeitet die gemeinsamen Einstellungen.';

  @override
  String get webSearchEffectiveUnresolved => 'noch nicht bereit';

  @override
  String get webSearchApiKey => 'API-Schlüssel';

  @override
  String get webSearchApiKeyHint =>
      'Leer lassen, um den aktuellen Schlüssel zu behalten';

  @override
  String get webSearchReady => 'Bereit';

  @override
  String get webSearchNotReady => 'Nicht bereit';

  @override
  String get webSearchSave => 'Speichern';

  @override
  String get webSearchSaved => 'Websuche-Einstellungen gespeichert.';

  @override
  String get webSearchSaveFailed =>
      'Websuche-Einstellungen konnten nicht gespeichert werden.';

  @override
  String get webSearchOwnerOnly =>
      'Nur das Haushalts-Owner-Gerät kann die Websuche ändern.';

  @override
  String get webSearchBrowserFallback =>
      'Browser-Fallback (Bing/Google/Baidu wenn API/DDG fehlschlägt oder nicht gesetzt)';

  @override
  String get webSearchBrowserFallbackHint =>
      'Standardmäßig an für Suche ohne Konfiguration. Betreute Chats fragen vor dem Browser-Schritt. SERP-Seiten können CAPTCHA oder Blockierung zeigen.';

  @override
  String get webSearchResearchEnabled =>
      'Web-Recherche (suchen, dann Top-Seiten auswerten)';

  @override
  String get webSearchResearchHint =>
      'Standardmäßig aus. Aktiviert web_research: Top-Ergebnisse auswerten und strukturierte Kurzfassung mit Links liefern.';

  @override
  String get webSearchDigDepth => 'Analysetiefe (1–10 Seiten)';

  @override
  String get webSearchExtractBackend => 'Backend für Seitenextraktion';

  @override
  String get webSearchExtractBackendAuto =>
      'Auto (Obscura wenn bereit, sonst HTTP fetch)';

  @override
  String get webSearchExtractBackendFetch => 'HTTP fetch';

  @override
  String get webSearchExtractBackendObscura =>
      'Obscura (JS-gerendertes Markdown)';

  @override
  String get webSearchExtractBackendHint =>
      'Auto bevorzugt Obscura auf dem Daemon-Host, sonst einfaches HTTP-Fetch.';

  @override
  String get webSearchEffectiveExtract => 'Aktuelles Auswerte-Backend';

  @override
  String get webSearchObscuraReady => 'Obscura bereit auf Daemon-Host';

  @override
  String get webSearchObscuraMissing =>
      'Obscura nicht auf Daemon-Host installiert';

  @override
  String get webSearchObscuraInstallHintNote =>
      'Desktop-Builds enthalten Obscura (oder der Daemon installiert beim ersten Start). Auf dem Heimcomputer mit EnvoyHome (nicht diesem Telefon) bei Bedarf ENVOYHOME_OBSCURA / PATH setzen, dann Einstellungen erneut öffnen.';

  @override
  String get webSearchSerpBrowserEngine => 'Browser-SERP-Engine';

  @override
  String get webSearchSerpBrowserEngineAuto =>
      'Auto (Obscura wenn bereit, sonst Chromium)';

  @override
  String get webSearchSerpBrowserEngineChromium => 'Chromium';

  @override
  String get webSearchSerpBrowserEngineObscura => 'Obscura';

  @override
  String get webSearchSerpBrowserEngineHint =>
      'Auto bevorzugt Obscura für Bing/Google/Baidu, dann Playwright Chromium.';

  @override
  String get webSearchEffectiveSerp => 'Aktuelle SERP-Engine';

  @override
  String get browserControlManagedEngine => 'Verwaltete Browser-Engine';

  @override
  String get browserControlManagedEngineAuto =>
      'Auto (Obscura wenn bereit, sonst Chromium)';

  @override
  String get browserControlManagedEngineChromium => 'Chromium';

  @override
  String get browserControlManagedEngineObscura => 'Obscura';

  @override
  String get browserControlManagedEngineHint =>
      'Auto bevorzugt Obscura für verwalteten Browser. Persönlich/remote nutzen immer echtes Chrome-CDP.';

  @override
  String get browserControlEffectiveManaged => 'Aktuelle verwaltete Engine';

  @override
  String get webSearchEngines =>
      'Suchmaschinen (Reihenfolge: Bing → Google → Baidu)';

  @override
  String get webSearchEnginesHint =>
      'Bei Browser-Fallback geprüfte Engines in dieser Reihenfolge versuchen, bis Ergebnisse kommen.';

  @override
  String get webSearchEnginesRequired =>
      'Mindestens eines von Bing, Google oder Baidu für Browser-Fallback wählen.';

  @override
  String get webSearchEngineBing => 'Bing';

  @override
  String get webSearchEngineGoogle => 'Google';

  @override
  String get webSearchEngineBaidu => 'Baidu';

  @override
  String get webSearchBrowserReady =>
      'Playwright Chromium bereit auf Daemon-Host';

  @override
  String get webSearchBrowserMissing =>
      'Playwright Chromium nicht auf Daemon-Host installiert';

  @override
  String get webSearchInstallHintNote =>
      'Playwright ist bereits Teil des Daemon. Chromium auf dem Heimcomputer mit EnvoyHome laden (nicht auf diesem Telefon), dann Einstellungen öffnen; Daemon neu starten, wenn der Status weiterhin fehlt.';

  @override
  String get webSearchCopyHint => 'Installationsbefehl kopieren';

  @override
  String get webSearchUnattendedBrowser =>
      'Browser-Fallback für Zeitpläne erlauben';

  @override
  String get connPairingHint =>
      'Haushalts-Owner-Geräte können hier Pairing erzeugen und widerrufen. Mitglieder sehen nur den Status.';

  @override
  String get connNoDevices => 'Keine gekoppelten Geräte gelistet.';

  @override
  String get connEnabled => 'Aktiviert';

  @override
  String get connDisabled => 'Deaktiviert';

  @override
  String get connReady => 'Bereit';

  @override
  String get connHealthy => 'Gesund';

  @override
  String get connUnhealthy => 'Ungesund';

  @override
  String get connHaUrl => 'HA-Basis-URL';

  @override
  String get connHaToken => 'Zugriffstoken';

  @override
  String get connMqttUrl => 'Broker-URL';

  @override
  String get connMqttPassword => 'Passwort';

  @override
  String get connSaveEnable => 'Speichern & aktivieren';

  @override
  String get connBindTitle => 'Objektbindungen';

  @override
  String connBoundTo(String id) {
    return 'Gebunden an $id';
  }

  @override
  String get connUnbound => 'Nicht gebunden';

  @override
  String get connChannelsHint =>
      'Bot-Token einfügen und aktivieren. Für die Ersteinrichtung Desktop bevorzugen.';

  @override
  String get connBotToken => 'Bot-Token';

  @override
  String get connDisable => 'Deaktivieren';

  @override
  String get connSenderBinds => 'Absender → Profil';

  @override
  String get connSenderBindsHint =>
      'IM-Absender-ID mit dem aktiven Profil verknüpfen.';

  @override
  String get connBindChannel => 'Kanal';

  @override
  String get connChannelAccount => 'Kanal-Konto';

  @override
  String get connSenderId => 'Absender-ID';

  @override
  String get connBindSender => 'Absender binden';

  @override
  String get skillsTabSkills => 'Skills';

  @override
  String get skillsVerify => 'Verifizieren';

  @override
  String get skillsVerified => 'Skill verifiziert';

  @override
  String get skillsTabWorkflows => 'Workflows';

  @override
  String get skillsTabSchedules => 'Zeitpläne';

  @override
  String get skillsTabScenes => 'Szenen';

  @override
  String get schedulesTabJobs => 'Jobs';

  @override
  String get scenesHint =>
      'Wenn → dann-Haushaltsautomationen (Haushaltsregeln). Anwesenheitsvorlagen benötigen Datenschutzmodus.';

  @override
  String get scenesWhenPresence => 'Anwesenheit (kein Cron — Sensorauslöser)';

  @override
  String get scenesNone => 'Noch keine Szenen.';

  @override
  String get scenesAddMorning => 'Guten Morgen hinzufügen';

  @override
  String get scenesPrivacyRequired =>
      'Datenschutzmodus aktivieren (LLM → Routing) vor Anwesenheitsszenen.';

  @override
  String get skillsInstallUrl => 'Von URL installieren';

  @override
  String get skillsInstall => 'Installieren';

  @override
  String get skillsClawHubSearch => 'ClawHub-Suche';

  @override
  String get schedWhenHint => 'Wann (natürliche Sprache)';

  @override
  String get schedMessageHint => 'Erinnerungstext';

  @override
  String get schedPropose => 'Vorschlagen';

  @override
  String get schedConfirm => 'Confirm reminder';

  @override
  String get scheduleCardTitle => 'Diese Erinnerung setzen?';

  @override
  String get scheduleCardConfirm => 'Bestätigen';

  @override
  String get scheduleCardCancel => 'Abbrechen';

  @override
  String get scheduleCardConfirmedToast => 'Erinnerung gesetzt.';

  @override
  String get scheduleCardCanceledToast => 'Erinnerung abgebrochen.';

  @override
  String get scheduleCardFailed =>
      'Erinnerung konnte nicht aktualisiert werden.';

  @override
  String get schedKindNotify => 'Benachrichtigen';

  @override
  String get schedKindWorkflow => 'Workflow';

  @override
  String get schedKindTool => 'Tool';

  @override
  String get schedWorkflowId => 'Workflow-ID';

  @override
  String get schedToolName => 'Tool-Name';

  @override
  String get schedKindAgent => 'Agent';

  @override
  String get schedAgentPrompt => 'Agent-Prompt';

  @override
  String get schedTabRepeating => 'Wiederkehrend';

  @override
  String get schedTabOnce => 'Einmalig';

  @override
  String get schedTabHistory => 'Verlauf';

  @override
  String get schedNoneRepeating => 'Noch keine wiederkehrenden Zeitpläne.';

  @override
  String get schedNoneOnce => 'Keine einmaligen Erinnerungen.';

  @override
  String get schedNoReceipts => 'Noch keine Läufe.';

  @override
  String get schedHistoryNotSet => 'Nicht gesetzt';

  @override
  String get schedHistoryRuns => 'Läufe';

  @override
  String get schedNoDismissed => 'Keine abgebrochenen Vorschläge.';

  @override
  String get schedDismissedCanceled => 'Abgebrochen';

  @override
  String get schedDismissedExpired => 'Abgelaufen';

  @override
  String get schedNext => 'Nächste';

  @override
  String get schedKindRepeating => 'Wiederholt';

  @override
  String get schedKindOnce => 'Einmal';

  @override
  String get schedKindDaily => 'Täglich';

  @override
  String get schedKindWeekdays => 'Werktags';

  @override
  String get schedKindWeekly => 'Wöchentlich';

  @override
  String get schedKindMonthly => 'Monatlich';

  @override
  String get schedKindYearly => 'Jährlich';

  @override
  String get schedKindEvery => 'Alle';

  @override
  String schedDayOfMonth(String d) {
    return 'Tag $d';
  }

  @override
  String get wfEditorTitle => 'Workflow';

  @override
  String get wfEnable => 'Aktivieren';

  @override
  String get wfDisable => 'Deaktivieren';

  @override
  String get wfTools => 'Tool einfügen';

  @override
  String get wfId => 'Workflow-ID';

  @override
  String get wfAiPrompt => 'Workflow beschreiben';

  @override
  String get wfAiPromptHint =>
      'z. B. Lichter um 23 Uhr ausschalten, wenn niemand zu Hause';

  @override
  String get wfAiDraft => 'Entwurf mit KI';

  @override
  String get wfDiagramNodes => 'Knoten (Telefon-Diagramm)';

  @override
  String get wfNoNodes => 'Noch keine Knoten — Entwurf oder YAML einfügen.';

  @override
  String get wfYaml => 'YAML';

  @override
  String get wfSave => 'Validieren & speichern';

  @override
  String get wfRun => 'Testlauf';

  @override
  String get wfDrafted => 'Entwurf übernommen';

  @override
  String get wfSaved => 'Gespeichert';

  @override
  String get wfRan => 'Lauf gestartet';

  @override
  String get sysTabFiles => 'Dateien';

  @override
  String get sysTabHealth => 'Zustand';

  @override
  String get sysTabGrants => 'Berechtigungen';

  @override
  String get sysTabMachine => 'Dieser Computer';

  @override
  String get sysMachineHint =>
      'Daemon-Listenstatus von home.health. OS-Dienst installieren/neu starten nur per Loopback auf dem Desktop — nicht über Mesh verfügbar.';

  @override
  String get sysMachineDaemonOk => 'Daemon erreichbar';

  @override
  String get sysMachineDaemonBad => 'Daemon-Zustand fehlgeschlagen';

  @override
  String get sysMachineWsPort => 'WebSocket-Port';

  @override
  String get sysMachineHttpPort => 'HTTP-Hatch-Port';

  @override
  String get sysMachinePublicUrl => 'Öffentliche Basis-URL';

  @override
  String get sysMachinePublicUrlEmpty => 'Nicht gesetzt';

  @override
  String get sysMachineUptime => 'Laufzeit';

  @override
  String get sysMachineConnections => 'Clients / aktive Turns';

  @override
  String get sysMachineMesh => 'Mesh';

  @override
  String get sysMachineOsServiceNote =>
      'OS-Dienst installieren oder neu starten unter Desktop Einstellungen → System → Dieser Computer (Loopback-Owner).';

  @override
  String get sysMachineRefresh => 'Aktualisieren';

  @override
  String get sysTestPush => 'Test-Push senden';

  @override
  String get sysTestPushSent => 'Test-Push angefordert';

  @override
  String get wfModeYaml => 'YAML';

  @override
  String get wfModeDiagram => 'Diagramm';

  @override
  String get wfDiagramEmpty =>
      'Noch keine Schritte — Entwurf oder YAML bearbeiten.';

  @override
  String get wfDiagramEdge => '↓';

  @override
  String get sysDoctorFix => 'Beheben';

  @override
  String get sysDoctorFixAll => 'Alles beheben';

  @override
  String sysDoctorFixed(String ids) {
    return 'Behoben: $ids';
  }

  @override
  String get sysNoIssues => 'Keine Doctor-Probleme.';

  @override
  String get sysNoGrants => 'Keine Berechtigungen.';

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
  String get chatThought => 'Überlegung';

  @override
  String get chatNew => 'Neuer Chat';

  @override
  String get chatNewNamePrompt => 'Chatname';

  @override
  String get chatNewNamePlaceholder => 'z. B. Wochenendpläne';

  @override
  String get chatNewNameHint =>
      'Jetzt benennen, oder ohne Namen starten — Titel kommt aus der ersten Nachricht.';

  @override
  String get chatNewSkip => 'Ohne Namen starten';

  @override
  String get chatNewCreate => 'Erstellen';

  @override
  String get chatNewNeedName =>
      'Namen eingeben oder „Ohne Namen starten“ wählen.';

  @override
  String get chatNewStart => 'Chat starten';

  @override
  String get chatOpenArtifact => 'Vollständige Antwort öffnen';

  @override
  String get chatPromoteKnowledge => 'Zu Wissen hinzufügen';

  @override
  String chatPromotedKnowledge(String path) {
    return 'Gespeichert unter $path';
  }

  @override
  String get chatPromoteFailed => 'Konnte nicht zu Wissen hinzufügen.';

  @override
  String get chatRecents => 'Zuletzt';

  @override
  String get chatRecentsEmpty => 'Keine früheren Chats.';

  @override
  String get chatSessionsEmpty => 'Noch keine Chats. Starten Sie einen neuen.';

  @override
  String get chatUntitled => 'Unbenannter Chat';

  @override
  String get chatRenameAction => 'Umbenennen';

  @override
  String get chatRenamePrompt => 'Chatname';

  @override
  String get chatRenameDone => 'Chat umbenannt.';

  @override
  String get chatRenameEmpty => 'Name darf nicht leer sein.';

  @override
  String get chatRenameNeedSession =>
      'Sende zuerst eine Nachricht, dann umbenennen.';

  @override
  String get chatBusyTurn =>
      'Warte, bis die aktuelle Antwort fertig ist (oder brich ab).';

  @override
  String get chatEmptyAction => 'Chat leeren';

  @override
  String get chatEmptyConfirmTitle => 'Diesen Chat leeren?';

  @override
  String get chatEmptyConfirmBody =>
      'Alle Nachrichten in diesem Thread werden entfernt. Der Chat bleibt bestehen.';

  @override
  String get chatTrashMenu => 'Chat-Aktionen';

  @override
  String get chatArchiveAction => 'Chat archivieren';

  @override
  String get chatUnarchiveAction => 'In Chats wiederherstellen';

  @override
  String get chatUnarchiveDone => 'Chat wiederhergestellt.';

  @override
  String get chatArchivedOpen => 'Archiviert';

  @override
  String get chatTabActive => 'Chats';

  @override
  String get chatTabArchived => 'Archiviert';

  @override
  String get homeFolderTitle => 'Ordner wählen';

  @override
  String get homeFolderSelect => 'Auswählen';

  @override
  String get homeFolderDrives => 'Laufwerke';

  @override
  String get homeFolderComputer => 'Computer';

  @override
  String get homeFolderHome => 'Home';

  @override
  String get homeFolderParent => 'Übergeordneter Ordner';

  @override
  String get homeFolderNoSubfolders => 'Keine Unterordner';

  @override
  String get chatArchivedTitle => 'Archivierte Chats';

  @override
  String get chatArchivedBack => 'Zurück zu Chats';

  @override
  String get chatArchivedEmpty => 'Keine archivierten Chats.';

  @override
  String get chatRemoveAction => 'Chat löschen';

  @override
  String get chatArchiveConfirmTitle => 'Diesen Chat archivieren?';

  @override
  String get chatArchiveConfirmBody =>
      'Er verschwindet aus Zuletzt, bleibt aber auf dem Datenträger.';

  @override
  String get chatRemoveConfirmTitle => 'Diesen Chat löschen?';

  @override
  String get chatRemoveConfirmBody =>
      'Chat und alle Nachrichten dauerhaft löschen.';

  @override
  String get chatRemoveDone => 'Chat gelöscht.';

  @override
  String get chatNoSession => 'Noch keine aktive Chat-Sitzung.';

  @override
  String get chatDeleteFailed =>
      'Nachricht konnte auf dem Server nicht gelöscht werden.';

  @override
  String get chatDeleteMessage => 'Nachricht löschen';

  @override
  String get chatCopyMessage => 'Nachricht kopieren';

  @override
  String get chatCopied => 'Kopiert';

  @override
  String get chatCancel => 'Abbrechen';

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
  String get modelsTest => 'Testen';

  @override
  String get modelsSetDefault => 'Als Standard setzen';

  @override
  String modelsTestOk(String id) {
    return '$id getestet';
  }

  @override
  String modelsDefaultSet(String id) {
    return 'Standard → $id';
  }

  @override
  String get artifactsTitle => 'Artefakte';

  @override
  String get artifactsHint =>
      'Öffnet in der App über die Home-Verbindung (keine öffentliche URL nötig).';

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
  String get artifactsTooLarge =>
      'Diese Datei ist größer als das 8-MB-In-App-Öffnungslimit. Bitten Sie den Agenten um einen kleineren Export oder öffnen Sie sie auf dem Heimcomputer.';

  @override
  String get artifactsRefresh => 'Aktualisieren';

  @override
  String get artifactsRetry => 'Erneut versuchen';

  @override
  String get artifactsBinaryHint =>
      'Dieser Dateityp kann hier nicht angezeigt werden. Nutze Teilen/Speichern für eine andere App, oder bitte um Text-/Markdown-Export.';

  @override
  String get artifactsShare => 'Teilen / Speichern';

  @override
  String artifactsShareFailed(String error) {
    return 'Teilen fehlgeschlagen: $error';
  }

  @override
  String get artifactsCopyLink => 'Signierten Link kopieren';

  @override
  String get artifactsLinkCopied => 'Signierter Link kopiert';

  @override
  String get artifactsCopyLinkFailed => 'Link konnte nicht kopiert werden';

  @override
  String get artifactsOpenInBrowser => 'Im Browser öffnen';

  @override
  String get artifactsOpenInBrowserFailed => 'Öffnen im Browser fehlgeschlagen';

  @override
  String get filesParent => 'Übergeordnet';

  @override
  String get filesRoots => 'Stammverzeichnisse';

  @override
  String get filesEmptyFolder => 'Dieser Ordner ist leer';

  @override
  String get artifactsLoTitle => 'LibreOffice (Heimcomputer)';

  @override
  String get artifactsLoWhy =>
      'Druckfertige Word-, Excel-, PowerPoint- und PDF-Exporte laufen auf Ihrem Heimcomputer (~1 GB, bleibt lokal). Ohne LibreOffice funktionieren Exporte mit einfacherem Layout. Dokumente werden nie zur Konvertierung in die Cloud gesendet.';

  @override
  String get artifactsLoReady => 'Bereit';

  @override
  String get artifactsLoMissing => 'Nicht installiert';

  @override
  String get artifactsLoDownloading => 'Wird heruntergeladen…';

  @override
  String get artifactsLoFailed => 'Installation fehlgeschlagen';

  @override
  String get artifactsLoInstall => 'Auf Heimcomputer installieren';

  @override
  String get artifactsLoCancel => 'Download abbrechen';

  @override
  String get artifactsLoNotNow => 'Nicht jetzt';

  @override
  String get artifactsLoRefresh => 'Status aktualisieren';

  @override
  String artifactsLoProgress(String received, String total) {
    return '$received / $total';
  }

  @override
  String get artifactsLoHintCopied => 'Installationshinweis kopiert';

  @override
  String get artifactsLoCopyHint => 'Manuellen Installationshinweis kopieren';

  @override
  String get artifactsLoInstallNote =>
      'Verwaltete Installation läuft auf dem Daemon-Host — nicht auf diesem Telefon.';

  @override
  String get artifactsDataPreferTitle => 'Datenpfade (Reihenfolge bevorzugen)';

  @override
  String get artifactsDataPreferStrip =>
      '1) Kerntabellen-Tools immer an · 2) DuckDB für Offline-Joins / SQL · 3) Owner MCP für Cloud-Sheets / SaaS-BI.';

  @override
  String get artifactsDataPreferJoinNeed =>
      'Erforderlich für Offline-Joins im Chat.';

  @override
  String get artifactsDataBrowseTables => 'output/tables durchsuchen';

  @override
  String get artifactsDataBrowseCharts => 'output/charts durchsuchen';

  @override
  String get artifactsSqlTitle => 'Offline-SQL (DuckDB)';

  @override
  String get artifactsSqlWhy =>
      'DuckDB auf dem Heimcomputer für Offline-SQL-Joins auf Jail-Dateien installieren. Niemals automatisch — Sie wählen Installieren.';

  @override
  String get artifactsSqlReady => 'Bereit';

  @override
  String get artifactsSqlMissing => 'Nicht installiert (optional)';

  @override
  String get artifactsSqlDownloading => 'Wird heruntergeladen…';

  @override
  String get artifactsSqlFailed => 'Installation fehlgeschlagen';

  @override
  String get artifactsSqlCancelled => 'Download abgebrochen';

  @override
  String get artifactsSqlInstall => 'DuckDB auf Heimcomputer installieren';

  @override
  String get artifactsSqlCancel => 'Download abbrechen';

  @override
  String get artifactsSqlRefresh => 'Status aktualisieren';

  @override
  String artifactsSqlProgress(String received, String total) {
    return '$received / $total';
  }

  @override
  String get artifactsSqlToolsReady =>
      'sql_load / sql_query stehen dem Agenten zur Verfügung.';

  @override
  String get artifactsSqlToolsAbsent =>
      'sql_load / sql_query bleiben bis DuckDB bereit ist aus dem Agenten-Katalog.';

  @override
  String get artifactsSqlInstallNote =>
      'Verwaltete Installation läuft auf dem Daemon-Host — nicht auf diesem Telefon.';

  @override
  String get chatDataAssistHint =>
      'Tabelle angehängt — nächsten Schritt wählen (füllt den Editor; Schreiben erfordert weiter Allow):';

  @override
  String get chatDataAssistClean => 'Bereinigen & Diagramm';

  @override
  String get chatDataAssistAsk => 'Zu dieser Tabelle fragen';

  @override
  String get chatDataAssistJoin => 'Join / SQL';

  @override
  String get chatDataAssistInstallDuckdb => 'DuckDB installieren…';

  @override
  String get chatDataAssistCleanSeed =>
      'Bereinige die angehängte Tabelle mit table_transform (normalisieren / filtern / Pipeline nach Bedarf), dann chart_table, und zeige mir die Open-Chips für CSV und Diagramm.';

  @override
  String get chatDataAssistAskSeed =>
      'Was steht in der angehängten Tabelle? Spalten, Zeilenanzahl und einige Beispielzeilen zusammenfassen.';

  @override
  String get chatDataAssistJoinSeed =>
      'Lade die angehängte Tabelle mit sql_load, beantworte dann mit sql_query (Join, wenn ich weitere Tabellen anhänge). Open-Chips für jede Ergebnis-CSV anzeigen.';

  @override
  String get chatDataAssistNeedDuckdb =>
      'DuckDB ist nicht bereit — unter System → Dateien auf dem Heimcomputer installieren.';

  @override
  String chatOpenFile(String name) {
    return 'Öffnen $name';
  }

  @override
  String chatPendingApprovals(int count) {
    return '$count warten auf Ihre Freigabe';
  }

  @override
  String get choiceCardConfirm => 'Bestätigen';

  @override
  String get choiceCardOpen => 'Öffnen';

  @override
  String get choiceCardChooseFile => 'Datei wählen';

  @override
  String get choiceCardBrowseJail => 'Dateien durchsuchen';

  @override
  String get choiceCardBrowseUp => 'Up';

  @override
  String choiceCardFilesChosen(int n) {
    return '$n Dateien gewählt';
  }

  @override
  String get choiceCardNoFile => 'Keine Datei gewählt';

  @override
  String get choiceCardFileEmpty => 'Diese Datei ist leer.';

  @override
  String choiceCardFileTypeRefused(String name) {
    return '$name ist kein zulässiger Formular-Upload-Typ.';
  }

  @override
  String get choiceCardHandoffHint =>
      'Öffnet in Browser oder App, damit Sie dort abschließen und bezahlen können. Home gibt keine Kartendaten ein.';

  @override
  String get choiceCardPickOne => 'Bitte mindestens eine Option wählen.';

  @override
  String get choiceCardAnswered => 'Erhalten.';

  @override
  String choiceCardFailed(String error) {
    return 'Auswahl konnte nicht gesendet werden: $error';
  }

  @override
  String chatPendingChoices(int count) {
    return '$count warten auf Ihre Auswahl';
  }

  @override
  String get choiceCardCancel => 'Abbrechen';

  @override
  String get choiceCardCanceled => 'Auswahl verworfen.';

  @override
  String get choiceCardExpired => 'Abgelaufen';

  @override
  String get choiceCardExpiredHint =>
      'Diese Auswahl ist abgelaufen — fragen Sie erneut, falls nötig.';

  @override
  String choiceCardExpiresIn(int mins) {
    return 'Läuft in $mins Min. ab';
  }

  @override
  String get choiceCardTextPlaceholder => 'Antwort eingeben';

  @override
  String get schedulesChatTabChat => 'Chat';

  @override
  String get schedulesChatTabHistories => 'Verläufe';

  @override
  String get schedulesChatHistoriesHint =>
      'Abgebrochene oder abgelaufene Vorschläge und letzte Läufe.';

  @override
  String get jobsHistoriesMovedHint =>
      'Nicht gesetzt; Läufe stehen unter Verläufe';

  @override
  String schedulesChatClosedAt(String when) {
    return 'Geschlossen $when';
  }

  @override
  String schedulesChatRanAt(String when) {
    return 'Gelaufen $when';
  }

  @override
  String get welcomeSkip => 'Überspringen';

  @override
  String get welcomeNext => 'Weiter';

  @override
  String get commonContinue => 'Fortfahren';

  @override
  String get welcomeSlide1Title => 'Willkommen bei EnvoyHome';

  @override
  String get welcomeSlide1Body =>
      'Dein Telefon ist ein Fenster zu einem selbst gehosteten Home-Agenten — Chat, Freigaben und Smart-Home bleiben auf dem Desktop.';

  @override
  String get welcomeSlide2Title => 'Die Arbeit läuft auf dem Computer';

  @override
  String get welcomeSlide2Body =>
      'Installiere EnvoyHome auf einem Mac oder PC zu Hause. Daemon, Modelle und Haushaltsspeicher bleiben dort — das Telefon ist ein Remote-Fenster.';

  @override
  String get welcomeSlide3Title => 'Mit QR-Code koppeln';

  @override
  String get welcomeSlide3Body =>
      'Öffne EnvoyHome auf dem Computer und zeige den Pairing-QR. Tippe hier auf Jetzt koppeln und scanne ihn. Du kannst auch einen Pairing-Link einfügen.';

  @override
  String get welcomeSlideRequiredTitle => 'Zum Start koppeln';

  @override
  String get welcomeSlideRequiredBody =>
      'EnvoyHome braucht einen Computer mit der Desktop-App. Agenten und Home-Steuerung laufen dort — koppeln Sie dieses Telefon damit.';

  @override
  String get setupGuideTitle => 'So funktioniert EnvoyHome';

  @override
  String get setupGuideIntro =>
      'EnvoyHome auf dem Telefon spricht mit EnvoyHome auf dem Heimcomputer. Desktop installieren, einmal koppeln, dann von überall chatten und freigeben.';

  @override
  String get setupGuidePairRequiredTitle => 'Zum Fortfahren koppeln';

  @override
  String get setupGuidePairRequiredBody =>
      'EnvoyHome ist die Telefon-Begleit-App für Ihren Heim-Desktop. Ohne gekoppelten Computer gibt es hier noch nichts zu zeigen.';

  @override
  String get setupGuideStep1Title => 'Computer bereithalten';

  @override
  String get setupGuideStep1Body =>
      'Sie brauchen einen Mac oder Windows/Linux-PC zu Hause. Dort laufen Daemon und Agenten.';

  @override
  String get setupGuideStep2Title => 'EnvoyHome herunterladen und installieren';

  @override
  String get setupGuideStep2Body =>
      'Öffnen Sie den QuickStart und installieren Sie Daemon sowie Desktop-App. Starten und laufen lassen.';

  @override
  String get setupGuideDownloadCta => 'EnvoyHome-QuickStart öffnen';

  @override
  String get setupGuideStep3Title => 'Pairing-QR anzeigen';

  @override
  String get setupGuideStep3Body =>
      'In der Desktop-App: Einstellungen → Geräte koppeln. QR auf dem Bildschirm lassen (mit Mesh/Relays, nicht nur LAN).';

  @override
  String get setupGuideStep4Title => 'Mit diesem Telefon scannen';

  @override
  String get setupGuideStep4Body =>
      'Tippen Sie unten auf Jetzt koppeln. Kamera erlauben, QR scannen. Oder envoy://-Link / Host:Port / SSH.';

  @override
  String get setupGuideStep5Title => 'Verbunden';

  @override
  String get setupGuideStep5Body =>
      'Nach dem Pairing zeigt dieses Telefon Chats, Freigaben und Einstellungen. Der Desktop läuft weiter, auch ohne Telefon.';

  @override
  String get setupGuideNoHomeTitle => 'Später koppeln ist in Ordnung';

  @override
  String get setupGuideNoHomeBody =>
      'Sie können jetzt weitergehen und jederzeit unter Verbinden koppeln. Ohne Computer gibt es hier noch nichts zu zeigen.';

  @override
  String get setupGuidePairCta => 'Jetzt koppeln';

  @override
  String get setupGuidePairLaterCta => 'Später koppeln';

  @override
  String get setupGuideSkipCta => 'Erst erkunden';

  @override
  String get setupGuideDoneCta => 'Verstanden';

  @override
  String get settingsSetupGuideSubtitle =>
      'Desktop-App installieren und dieses Telefon koppeln.';
}
