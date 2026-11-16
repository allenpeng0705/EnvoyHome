// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appName => 'EnvoyHome';

  @override
  String get appLanguage => 'Langue';

  @override
  String get appThemePicker => 'Apparence';

  @override
  String get appThemeSystem => 'Système';

  @override
  String get appThemeLight => 'Clair';

  @override
  String get appThemeDark => 'Sombre';

  @override
  String get pairLede =>
      'Rejoignez le bureau domestique via EnvoyMesh — scannez un QR, saisissez host:port, ou passez par SSH.';

  @override
  String get pairTabLink => 'Lien';

  @override
  String get pairTabHost => 'Hôte:port';

  @override
  String get pairTabSsh => 'SSH';

  @override
  String get pairFooter => 'com.envoymesh.envoyhome · push après appairage';

  @override
  String get pairCloseScanner => 'Fermer le scanneur';

  @override
  String get pairScanQr => 'Scanner le QR d’appairage';

  @override
  String get pairUriLabel => 'URI d’appairage';

  @override
  String get pairUriHint => 'envoy://pair?…&app=EnvoyHome';

  @override
  String get pairConnect => 'Connecter';

  @override
  String get pairDirectHint =>
      'Atteignez le bureau sur ce réseau (LAN / Tailscale). Un jeton est requis.';

  @override
  String get pairHostPort => 'Hôte:port';

  @override
  String get pairHostPortHint => '192.168.1.10:4780';

  @override
  String get pairToken => 'Jeton d’appairage';

  @override
  String get pairTokenHelper =>
      'Depuis Réglages bureau → Appairer des appareils';

  @override
  String get pairSshHint =>
      'Tunnel via un saut SSH. Le démon voit la boucle locale — jeton facultatif.';

  @override
  String get pairSshHost => 'Hôte SSH';

  @override
  String get pairSshUser => 'Utilisateur';

  @override
  String get pairSshUserHint => 'root';

  @override
  String get pairSshPort => 'Port';

  @override
  String get pairSshPassword => 'Mot de passe SSH';

  @override
  String get pairDaemon => 'Démon côté distant';

  @override
  String get pairDaemonHint => '127.0.0.1:4780';

  @override
  String get pairTokenOptional => 'Jeton (facultatif)';

  @override
  String get shellOnline => 'en ligne';

  @override
  String get shellDegraded => 'dégradé';

  @override
  String get shellOffline => 'hors ligne';

  @override
  String get shellConnect => 'Connecter';

  @override
  String get shellReconnect => 'Reconnecter';

  @override
  String get shellDisconnect => 'Déconnecter';

  @override
  String get shellForgetPairing => 'Oublier l’appairage';

  @override
  String get connectGuideTitle => 'Connectez-vous à la maison';

  @override
  String get connectGuideHint =>
      'Sur le bureau, ouvrez Réglages → Appairer les appareils et scannez le QR — ou collez le lien / l’hôte.';

  @override
  String get connectGuideReconnectHint =>
      'Ce téléphone est déjà appairé. Reconnectez-vous au bureau, ou appairer à nouveau si vous avez changé de maison.';

  @override
  String get shellProfilePending =>
      'Le profil sera choisi d’après l’appairage de cet appareil.';

  @override
  String shellProfileOne(String id) {
    return 'Profil · $id';
  }

  @override
  String get shellProfile => 'Profil';

  @override
  String shellMeshHint(String mesh) {
    return 'mesh $mesh · tirez les onglets pour actualiser';
  }

  @override
  String get shellCreateProfile => 'Créer';

  @override
  String get shellProfileDisplayName => 'Nom affiché';

  @override
  String get shellProfileIdOptional => 'Identifiant du compte (facultatif)';

  @override
  String get shellCancel => 'Annuler';

  @override
  String get shellCreate => 'Créer';

  @override
  String get shellProfileCreated => 'Profil créé';

  @override
  String shellProfileCreateFailed(String error) {
    return 'Échec de la création : $error';
  }

  @override
  String get navChat => 'Discussions';

  @override
  String get navHomeChat => 'Accueil';

  @override
  String get navSchedulesChat => 'Horaires';

  @override
  String get navSettings => 'Paramètres';

  @override
  String get navLlm => 'LLM';

  @override
  String get navConnections => 'Connexions';

  @override
  String get navSkills => 'Compétences';

  @override
  String get navSystem => 'Système';

  @override
  String get navProfiles => 'Profils';

  @override
  String get navApprovals => 'Approbations';

  @override
  String get navModels => 'Modèles';

  @override
  String get navArtifacts => 'Artefacts';

  @override
  String get settingsHubHint =>
      'Configure the home daemon from your phone. Some owner-only actions need a trusted device.';

  @override
  String get settingsProfilesSubtitle =>
      'Propriétaire, dossiers d’espace de travail, politique d’outils';

  @override
  String get settingsLlmSubtitle => 'Modèles, Local, Routage, Mémoire';

  @override
  String get settingsConnectionsSubtitle =>
      'Pairing, Home Assistant, MQTT, Channels';

  @override
  String get settingsSkillsSubtitle =>
      'Installer et gérer les packs de compétences';

  @override
  String get settingsWorkflowsSubtitle =>
      'Workflows DAG — brouillon, validation, exécution';

  @override
  String get settingsSystemSubtitle =>
      'Profils, Fichiers partagés, Santé, Autorisations';

  @override
  String get settingsNeedConnect =>
      'Connectez-vous pour configurer LLM, Connexions, Compétences et Système.';

  @override
  String get profilesIntro =>
      'Chaque personne a un profil. Le Propriétaire du foyer configure les dossiers d’espace de travail et peut transférer la propriété.';

  @override
  String get profilesMemberHint =>
      'Cet appareil n’est pas le Propriétaire du foyer — l’espace de travail est en lecture seule ici.';

  @override
  String get profilesRefresh => 'Actualiser';

  @override
  String get profilesAddTitle => 'Ajouter un profil';

  @override
  String get profilesOwnerBadge => 'Propriétaire';

  @override
  String get profilesActiveBadge => 'Actif';

  @override
  String get profilesWorkspaceTitle => 'Dossiers d’espace de travail';

  @override
  String get profilesWorkspaceHint =>
      'Ajoutez des dossiers hôte sur la machine domestique (jusqu’à 16). L’agent y accède via workspace/<id>/…';

  @override
  String get profilesWorkspacePath => 'Chemin hôte';

  @override
  String get profilesWorkspaceBrowse => 'Parcourir les dossiers';

  @override
  String get profilesWorkspaceBrowseHint =>
      'Appuyez pour parcourir la machine domestique';

  @override
  String get profilesWorkspaceUnset => 'Non défini (bac à sable uniquement)';

  @override
  String get profilesWorkspaceSet => 'Configuré';

  @override
  String get profilesWorkspaceWholeMachine => 'Machine entière';

  @override
  String get profilesWorkspaceRo => 'Lecture seule';

  @override
  String get profilesWorkspaceRw => 'Lecture et écriture';

  @override
  String get profilesWorkspaceUseRoot => 'Ajouter la racine de l’ordinateur';

  @override
  String get profilesWorkspaceClear => 'Tout effacer';

  @override
  String get profilesWorkspaceRemove => 'Retirer';

  @override
  String get profilesWorkspaceApply => 'Ajouter';

  @override
  String get profilesWorkspaceEdit => 'Ajouter un dossier';

  @override
  String get profilesWorkspaceRootTitle =>
      'Autoriser l’accès à toute la machine ?';

  @override
  String get profilesWorkspaceRootBody =>
      'Cela permet à l’agent de lire (et écrire, si sélectionné) les fichiers sous la racine via workspace/… — y compris depuis ce téléphone.';

  @override
  String get profilesWorkspaceRootOk => 'Autoriser';

  @override
  String get profilesWorkspaceMemberNote =>
      'Seul le Propriétaire du foyer peut modifier les dossiers d’espace de travail.';

  @override
  String get profilesWorkspaceCrossTitle =>
      'Ajouter un dossier d’espace de travail pour un autre profil ?';

  @override
  String profilesWorkspaceCrossBody(String name) {
    return 'Cela ajoute un dossier hôte pour $name. Continuez seulement si vous voulez configurer son espace de travail.';
  }

  @override
  String get profilesWorkspaceDenied => 'Non visible sur cet appareil';

  @override
  String get profilesWorkspaceInactive =>
      'Configuré mais inactif (la racine système de fichiers ne s’applique qu’au Propriétaire)';

  @override
  String get profilesRename => 'Renommer';

  @override
  String get profilesRenameTitle => 'Renommer le profil';

  @override
  String get profilesRenameSave => 'Enregistrer';

  @override
  String get profilesTimeZoneUnset =>
      'Fuseau horaire : non défini (les planifications utilisent la valeur par défaut de l’hôte)';

  @override
  String profilesTimeZoneValue(String tz) {
    return 'Fuseau horaire : $tz';
  }

  @override
  String get profilesTimeZoneEdit => 'Fuseau horaire';

  @override
  String get profilesTimeZoneTitle => 'Fuseau horaire du compte';

  @override
  String get profilesTimeZoneHint => 'Nom IANA, ex. Europe/Paris';

  @override
  String get profilesTimeZoneSave => 'Enregistrer';

  @override
  String profilesTimeZoneDone(String tz) {
    return 'Fuseau horaire défini sur $tz';
  }

  @override
  String get profilesShareLocationTitle => 'Partager la position avec Home';

  @override
  String get profilesShareLocationSubtitle =>
      'Joindre un GPS approximatif aux tours de chat. Permission demandée une fois ici ; jamais à chaque envoi. Éphémère seulement — pas en mémoire.';

  @override
  String get profilesShareLocationDenied =>
      'Permission de localisation refusée. Le partage reste désactivé.';

  @override
  String get profilesShareLocationOn =>
      'Partage de position activé sur cet appareil';

  @override
  String get profilesDelete => 'Supprimer';

  @override
  String get profilesDeleteTitle => 'Supprimer le profil ?';

  @override
  String profilesDeleteBody(String name) {
    return 'Supprimer $name ? Son bac à sable et sa config d’espace de travail seront retirés. Action irréversible.';
  }

  @override
  String get profilesDeleteConfirm => 'Supprimer';

  @override
  String profilesDeleteDone(String name) {
    return '$name supprimé';
  }

  @override
  String get profilesDeleteOwnerBlocked =>
      'Impossible de supprimer le Propriétaire du foyer. Transférez d’abord la propriété.';

  @override
  String get profilesTransferTitle => 'Transférer le Propriétaire du foyer ?';

  @override
  String profilesTransferBody(String name) {
    return 'Faire de $name le Propriétaire du foyer. Il contrôlera l’appairage, les liaisons et les Paramètres du foyer.';
  }

  @override
  String get profilesTransferConfirm => 'Transférer';

  @override
  String profilesTransferDone(String name) {
    return 'Le Propriétaire est maintenant $name';
  }

  @override
  String profilesTransferFailed(String error) {
    return 'Échec du transfert : $error';
  }

  @override
  String profilesTransferTo(String name) {
    return 'Transférer à $name';
  }

  @override
  String get profilesToolPolicy => 'Politique d’outils';

  @override
  String get profilesToolPolicyStandard => 'Standard';

  @override
  String get profilesToolPolicyRestricted => 'Restreinte';

  @override
  String get connMintPairing => 'Générer un code d’appairage';

  @override
  String get connMintOk => 'Code d’appairage généré';

  @override
  String get connMintUriHint =>
      'Scannez ou collez cette URI sur le nouvel appareil.';

  @override
  String get connPairingOwnerOnly =>
      'Générer / révoquer l’appairage nécessite l’appareil Propriétaire du foyer.';

  @override
  String get connRevokeDevice => 'Révoquer';

  @override
  String get connForgetDevice => 'Oublier';

  @override
  String connRevokeConfirm(String id) {
    return 'Révoquer l’appareil $id ? Il devra s’appairer à nouveau.';
  }

  @override
  String connForgetConfirm(String id) {
    return 'Oublier l’appareil $id ? L’enregistrement d’appairage est supprimé définitivement.';
  }

  @override
  String get connOwnerWriteOnly =>
      'Seul l’appareil Propriétaire du foyer peut modifier ce paramètre.';

  @override
  String get connAccountsHint => 'Profils du foyer';

  @override
  String get homeChatSessionTitle => 'Discussion domicile (téléphone)';

  @override
  String get homeChatEmptyTitle => 'Parlez à votre domicile';

  @override
  String get homeChatEmptyHint =>
      'Les outils domotique restent disponibles ici. Les approbations filtrent toujours les actions.';

  @override
  String get homeChatHint =>
      'Posez des questions sur lumières, serrures, climat…';

  @override
  String get schedulesChatSessionTitle => 'Horaires';

  @override
  String get schedulesChatEmptyTitle => 'Rappels';

  @override
  String get schedulesChatEmptyHint =>
      'Ce fil reste sur les rappels. Confirmez l’heure avant activation.';

  @override
  String get schedulesChatHint => 'Rappelle-moi…';

  @override
  String get chatAttach => 'Joindre';

  @override
  String chatAttachTooMany(int n) {
    return 'Au plus $n fichiers';
  }

  @override
  String chatAttachTooLarge(String name, String mb) {
    return '$name dépasse $mb Mo';
  }

  @override
  String chatAttachAdded(int n) {
    return '$n fichier(s) joint(s)';
  }

  @override
  String get chatAttachedOnly => '(pièce jointe)';

  @override
  String get chatVoiceStart => 'Dicter';

  @override
  String get chatVoiceStop => 'Arrêter la dictée';

  @override
  String get chatVoiceUnsupported =>
      'La reconnaissance vocale n’est pas disponible sur cet appareil.';

  @override
  String get llmTabModels => 'Modèles';

  @override
  String get llmTabLocal => 'Local';

  @override
  String get llmTabRouting => 'Routage';

  @override
  String get llmTabMemory => 'Mémoire';

  @override
  String get llmLocalDownloadHint =>
      'Recherchez sur Hugging Face et téléchargez des fichiers GGUF sur la machine domestique.';

  @override
  String get llmHfSearchHint => 'Rechercher des modèles…';

  @override
  String get llmSearch => 'Rechercher';

  @override
  String get llmCancelDownload => 'Annuler';

  @override
  String get llmResumeDownload => 'Reprendre';

  @override
  String llmGgufFiles(String repo) {
    return 'GGUF dans $repo';
  }

  @override
  String get llmRoutingHint =>
      'Choisissez où les tours peuvent s’exécuter pour ce profil.';

  @override
  String get llmFilterAny => 'Intelligent / tous';

  @override
  String get llmFilterCloud => 'Cloud uniquement';

  @override
  String get llmFilterLocal => 'Local uniquement';

  @override
  String get llmAutoSwitch => 'Changement auto de modèle';

  @override
  String get privacyModeTitle => 'Mode confidentialité';

  @override
  String get privacyModeHint =>
      'Force l’inférence locale et bloque les outils cloud. Périmètre Propriétaire.';

  @override
  String get privacyModeEnabled => 'Activer le mode confidentialité';

  @override
  String get privacyModeBlockEgress =>
      'Bloquer aussi l’action domotique et les notifications event-source';

  @override
  String get privacyModeOwnerOnly =>
      'Le mode confidentialité est réservé au Propriétaire sur cet appareil.';

  @override
  String get llmCompactNow => 'Compacter la mémoire maintenant';

  @override
  String get llmFlushEnabled => 'Vider les notes persistantes';

  @override
  String get llmReviewEnabled => 'Vérifier avant écriture d’apprentissage';

  @override
  String get llmInjectMode => 'Mode de budget d’injection';

  @override
  String get llmInjectAuto => 'Auto';

  @override
  String get llmInjectBaseline => 'Base';

  @override
  String get llmInjectCustom => 'Personnalisé';

  @override
  String get llmPendingLearns => 'Apprentissages en attente';

  @override
  String get llmNoPendingLearns => 'Aucun apprentissage en attente.';

  @override
  String get connTabPairing => 'Appairage';

  @override
  String get connTabHa => 'Home Assistant';

  @override
  String get connTabMqtt => 'MQTT';

  @override
  String get connTabChannels => 'Canaux';

  @override
  String get connTabWebSearch => 'Recherche web';

  @override
  String get connTabMcp => 'MCP';

  @override
  String get connTabBrowser => 'Navigateur';

  @override
  String get mcpLede =>
      'Ajoutez le serveur MCP de votre choix. Testez la connexion avant de l’activer. Les commandes stdio s’exécutent sous l’utilisateur hôte du démon. Les appels d’outils restent soumis aux approbations.';

  @override
  String get mcpTest => 'Tester';

  @override
  String get mcpAddServer => 'Ajouter un serveur';

  @override
  String get mcpSave => 'Enregistrer';

  @override
  String get mcpReady => 'Prêt';

  @override
  String get mcpNotTested => 'Non testé';

  @override
  String mcpServerSubtitle(String transport, String status, int count) {
    return '$transport · $status · $count outils';
  }

  @override
  String mcpTestOk(int count) {
    return 'OK — $count outil(s). Activez-le quand vous êtes prêt.';
  }

  @override
  String mcpTestFailed(String error) {
    return 'Échec : $error';
  }

  @override
  String get mcpLabel => 'Libellé';

  @override
  String get mcpCommand => 'Commande';

  @override
  String get mcpArgs => 'Arguments (séparés par des espaces, facultatif)';

  @override
  String get mcpUrl => 'URL';

  @override
  String get mcpAuthToken => 'Jeton d’auth (facultatif)';

  @override
  String get mcpEnv => 'Env (KEY=value par ligne, facultatif)';

  @override
  String get browserControlLede =>
      'Contrôlez un navigateur géré sur l’ordinateur domestique (Auto préfère Obscura, sinon Chromium), ou connectez Chrome personnel / CDP distant. Désactivé par défaut.';

  @override
  String get browserControlDaemonHostNote =>
      'Les sessions navigateur s’exécutent sur l’ordinateur domestique. Les paramètres ici se synchronisent avec Connexions → Navigateur sur le bureau.';

  @override
  String get browserControlEnabled => 'Activer l’outil navigateur';

  @override
  String get browserControlUnattended => 'Allow for schedules';

  @override
  String get browserControlReady => 'Prêt';

  @override
  String get browserControlNotReady => 'Pas prêt';

  @override
  String get browserControlSave => 'Enregistrer';

  @override
  String get browserControlSaved => 'Paramètres du navigateur enregistrés.';

  @override
  String get browserControlSaveFailed =>
      'Impossible d’enregistrer les paramètres du navigateur.';

  @override
  String get browserControlDefaultProfile => 'Profil par défaut';

  @override
  String get browserControlProfileManaged => 'Géré (isolé)';

  @override
  String get browserControlProfilePersonal => 'Chrome personnel';

  @override
  String get browserControlProfileRemote => 'CDP distant';

  @override
  String get browserControlElevatedWarn =>
      'Personnel/distant peut agir pour vous sur les sites connectés. Propriétaire uniquement ; jamais en planification.';

  @override
  String get browserControlAcknowledge =>
      'Je comprends le risque du navigateur élevé';

  @override
  String get browserControlPersonalEnabled => 'Activer Chrome personnel';

  @override
  String get browserControlPersonalCdp => 'CDP personnel (boucle locale)';

  @override
  String get browserControlPersonalReady => 'CDP personnel actif';

  @override
  String get browserControlPersonalNotReady => 'CDP personnel inactif';

  @override
  String get browserControlRemoteEnabled => 'Activer le CDP distant';

  @override
  String get browserControlRemoteCdp => 'URL CDP distant';

  @override
  String get browserControlRemoteToken => 'Jeton CDP distant';

  @override
  String get browserControlTokenSet => 'défini';

  @override
  String get browserControlTokenPlaceholder => 'Laisser vide pour conserver';

  @override
  String get browserControlRemoteReady => 'CDP distant actif';

  @override
  String get browserControlRemoteNotReady => 'CDP distant inactif';

  @override
  String get browserControlOwnerOnly =>
      'Seul l’appareil Propriétaire du foyer peut modifier les paramètres du navigateur.';

  @override
  String get browserControlAcknowledged =>
      'Risque élevé confirmé. Désactivez personnel/distant pour ne plus les utiliser.';

  @override
  String get webSearchLede =>
      'Recherchez le web public depuis le chat. Par défaut : DuckDuckGo, puis Bing/Google/Baidu dans le navigateur si besoin (sans clé API). Brave et Tavily nécessitent une clé API Propriétaire.';

  @override
  String get webSearchEnabled => 'Activer web_search';

  @override
  String get webSearchProvider => 'Fournisseur';

  @override
  String get webSearchProviderBrowser => 'Navigateur (Bing / Google / Baidu)';

  @override
  String get webSearchBrowserPrimaryHint =>
      'Recherche Bing/Google/Baidu directement dans le moteur headless de l’hôte daemon (Obscura si prêt, sinon Chromium). Les discussions surveillées demandent une fois avant chaque recherche.';

  @override
  String get webSearchDaemonHostNote =>
      'Les moteurs et l’exploration s’exécutent sur l’ordinateur domestique qui héberge EnvoyHome. Ce téléphone affiche et (Propriétaire) modifie les paramètres partagés.';

  @override
  String get webSearchEffectiveUnresolved => 'pas encore prêt';

  @override
  String get webSearchApiKey => 'Clé API';

  @override
  String get webSearchApiKeyHint =>
      'Laisser vide pour conserver la clé actuelle';

  @override
  String get webSearchReady => 'Prêt';

  @override
  String get webSearchNotReady => 'Pas prêt';

  @override
  String get webSearchSave => 'Enregistrer';

  @override
  String get webSearchSaved => 'Paramètres de recherche web enregistrés.';

  @override
  String get webSearchSaveFailed =>
      'Impossible d’enregistrer les paramètres de recherche web.';

  @override
  String get webSearchOwnerOnly =>
      'Seul l’appareil Propriétaire du foyer peut modifier la recherche web.';

  @override
  String get webSearchBrowserFallback =>
      'Repli navigateur (Bing/Google/Baidu si API/DDG échoue ou non défini)';

  @override
  String get webSearchBrowserFallbackHint =>
      'Activé par défaut pour une recherche sans config. Les discussions surveillées demandent avant l’étape navigateur. Les pages SERP peuvent afficher un CAPTCHA ou bloquer.';

  @override
  String get webSearchResearchEnabled =>
      'Recherche web (recherche puis lecture des meilleures pages)';

  @override
  String get webSearchResearchHint =>
      'Désactivé par défaut. Active web_research : explore les premiers résultats et renvoie un résumé structuré avec liens.';

  @override
  String get webSearchDigDepth => 'Profondeur d’exploration (1–10 pages)';

  @override
  String get webSearchExtractBackend => 'Backend d’extraction de page';

  @override
  String get webSearchExtractBackendAuto =>
      'Auto (Obscura si prêt, sinon HTTP fetch)';

  @override
  String get webSearchExtractBackendFetch => 'HTTP fetch';

  @override
  String get webSearchExtractBackendObscura => 'Obscura (Markdown rendu JS)';

  @override
  String get webSearchExtractBackendHint =>
      'Auto préfère Obscura lorsqu’il est installé sur l’hôte daemon, sinon requête HTTP simple.';

  @override
  String get webSearchEffectiveExtract =>
      'Backend d’exploration effectif maintenant';

  @override
  String get webSearchObscuraReady => 'Obscura prêt sur l’hôte daemon';

  @override
  String get webSearchObscuraMissing =>
      'Obscura non installé sur l’hôte daemon';

  @override
  String get webSearchObscuraInstallHintNote =>
      'Les builds bureau incluent Obscura (ou le daemon l’installe au premier démarrage). Sur l’ordinateur qui exécute EnvoyHome (pas ce téléphone), surchargez avec ENVOYHOME_OBSCURA / PATH si besoin, puis rouvrez Paramètres.';

  @override
  String get webSearchSerpBrowserEngine => 'Moteur navigateur SERP';

  @override
  String get webSearchSerpBrowserEngineAuto =>
      'Auto (Obscura si prêt, sinon Chromium)';

  @override
  String get webSearchSerpBrowserEngineChromium => 'Chromium';

  @override
  String get webSearchSerpBrowserEngineObscura => 'Obscura';

  @override
  String get webSearchSerpBrowserEngineHint =>
      'Auto préfère Obscura pour Bing/Google/Baidu, puis Playwright Chromium.';

  @override
  String get webSearchEffectiveSerp => 'Moteur SERP effectif maintenant';

  @override
  String get browserControlManagedEngine => 'Moteur navigateur géré';

  @override
  String get browserControlManagedEngineAuto =>
      'Auto (Obscura si prêt, sinon Chromium)';

  @override
  String get browserControlManagedEngineChromium => 'Chromium';

  @override
  String get browserControlManagedEngineObscura => 'Obscura';

  @override
  String get browserControlManagedEngineHint =>
      'Auto préfère Obscura pour le navigateur géré. Personnel/distant utilisent toujours le vrai CDP Chrome.';

  @override
  String get browserControlEffectiveManaged =>
      'Moteur géré effectif maintenant';

  @override
  String get webSearchEngines =>
      'Moteurs de recherche (ordre : Bing → Google → Baidu)';

  @override
  String get webSearchEnginesHint =>
      'Lors du repli navigateur, essayez les moteurs cochés dans cet ordre jusqu’à obtenir des résultats.';

  @override
  String get webSearchEnginesRequired =>
      'Choisissez au moins Bing, Google ou Baidu pour le repli navigateur.';

  @override
  String get webSearchEngineBing => 'Bing';

  @override
  String get webSearchEngineGoogle => 'Google';

  @override
  String get webSearchEngineBaidu => 'Baidu';

  @override
  String get webSearchBrowserReady =>
      'Playwright Chromium prêt sur l’hôte daemon';

  @override
  String get webSearchBrowserMissing =>
      'Playwright Chromium non installé sur l’hôte daemon';

  @override
  String get webSearchInstallHintNote =>
      'Playwright fait déjà partie du daemon. Téléchargez Chromium sur l’ordinateur qui exécute EnvoyHome (pas ce téléphone), puis rouvrez Paramètres ; redémarrez le daemon si l’état reste manquant.';

  @override
  String get webSearchCopyHint => 'Copier la commande d’installation';

  @override
  String get webSearchUnattendedBrowser =>
      'Autoriser le repli navigateur pour les planifications';

  @override
  String get connPairingHint =>
      'Les appareils Propriétaire du foyer peuvent générer et révoquer l’appairage ici. Les membres voient seulement l’état.';

  @override
  String get connNoDevices => 'Aucun appareil appairé listé.';

  @override
  String get connEnabled => 'Activé';

  @override
  String get connDisabled => 'Désactivé';

  @override
  String get connReady => 'Prêt';

  @override
  String get connHealthy => 'Sain';

  @override
  String get connUnhealthy => 'Défaillant';

  @override
  String get connHaUrl => 'URL de base HA';

  @override
  String get connHaToken => 'Jeton d’accès';

  @override
  String get connMqttUrl => 'URL du broker';

  @override
  String get connMqttPassword => 'Mot de passe';

  @override
  String get connSaveEnable => 'Enregistrer et activer';

  @override
  String get connBindTitle => 'Liaisons d’objets';

  @override
  String connBoundTo(String id) {
    return 'Lié à $id';
  }

  @override
  String get connUnbound => 'Non lié';

  @override
  String get connChannelsHint =>
      'Collez un jeton de bot et activez. Préférez le bureau pour la première configuration.';

  @override
  String get connBotToken => 'Jeton du bot';

  @override
  String get connDisable => 'Désactiver';

  @override
  String get connSenderBinds => 'Expéditeur → profil';

  @override
  String get connSenderBindsHint =>
      'Lie un identifiant d’expéditeur IM au profil actif.';

  @override
  String get connBindChannel => 'Canal';

  @override
  String get connChannelAccount => 'Compte de canal';

  @override
  String get connSenderId => 'Identifiant expéditeur';

  @override
  String get connBindSender => 'Lier l’expéditeur';

  @override
  String get skillsTabSkills => 'Compétences';

  @override
  String get skillsVerify => 'Vérifier';

  @override
  String get skillsVerified => 'Compétence vérifiée';

  @override
  String get skillsTabWorkflows => 'Workflows';

  @override
  String get skillsTabSchedules => 'Planifications';

  @override
  String get skillsTabScenes => 'Scènes';

  @override
  String get schedulesTabJobs => 'Tâches';

  @override
  String get scenesHint =>
      'Automatisations Quand → faire du foyer (règles du foyer). Les modèles présence nécessitent le mode confidentialité.';

  @override
  String get scenesWhenPresence =>
      'Présence (pas de cron — déclencheur capteur)';

  @override
  String get scenesNone => 'Aucune scène pour l’instant.';

  @override
  String get scenesAddMorning => 'Ajouter Bonjour';

  @override
  String get scenesPrivacyRequired =>
      'Activez le mode confidentialité (LLM → Routage) avant les scènes de présence.';

  @override
  String get skillsInstallUrl => 'Installer depuis une URL';

  @override
  String get skillsInstall => 'Installer';

  @override
  String get skillsClawHubSearch => 'Recherche ClawHub';

  @override
  String get schedWhenHint => 'Quand (langage naturel)';

  @override
  String get schedMessageHint => 'Message de rappel';

  @override
  String get schedPropose => 'Proposer';

  @override
  String get schedConfirm => 'Confirm reminder';

  @override
  String get scheduleCardTitle => 'Définir ce rappel ?';

  @override
  String get scheduleCardConfirm => 'Confirmer';

  @override
  String get scheduleCardCancel => 'Annuler';

  @override
  String get scheduleCardConfirmedToast => 'Rappel défini.';

  @override
  String get scheduleCardCanceledToast => 'Rappel annulé.';

  @override
  String get scheduleCardFailed => 'Impossible de mettre à jour ce rappel.';

  @override
  String get schedKindNotify => 'Notifier';

  @override
  String get schedKindWorkflow => 'Workflow';

  @override
  String get schedKindTool => 'Outil';

  @override
  String get schedWorkflowId => 'Identifiant de workflow';

  @override
  String get schedToolName => 'Nom de l’outil';

  @override
  String get schedKindAgent => 'Agent';

  @override
  String get schedAgentPrompt => 'Invite agent';

  @override
  String get schedTabRepeating => 'Récurrents';

  @override
  String get schedTabOnce => 'Une fois';

  @override
  String get schedTabHistory => 'Historique';

  @override
  String get schedNoneRepeating => 'Aucun planning récurrent.';

  @override
  String get schedNoneOnce => 'Aucun rappel unique.';

  @override
  String get schedNoReceipts => 'Aucune exécution.';

  @override
  String get schedHistoryNotSet => 'Non défini';

  @override
  String get schedHistoryRuns => 'Exécutions';

  @override
  String get schedNoDismissed => 'Aucune proposition annulée.';

  @override
  String get schedDismissedCanceled => 'Annulé';

  @override
  String get schedDismissedExpired => 'Expiré';

  @override
  String get schedNext => 'Prochain';

  @override
  String get schedKindRepeating => 'Récurrent';

  @override
  String get schedKindOnce => 'Une fois';

  @override
  String get schedKindDaily => 'Quotidien';

  @override
  String get schedKindWeekdays => 'Jours ouvrés';

  @override
  String get schedKindWeekly => 'Hebdomadaire';

  @override
  String get schedKindMonthly => 'Mensuel';

  @override
  String get schedKindYearly => 'Annuel';

  @override
  String get schedKindEvery => 'Toutes les';

  @override
  String schedDayOfMonth(String d) {
    return 'jour $d';
  }

  @override
  String get wfEditorTitle => 'Workflow';

  @override
  String get wfEnable => 'Activer';

  @override
  String get wfDisable => 'Désactiver';

  @override
  String get wfTools => 'Insérer un outil';

  @override
  String get wfId => 'Identifiant de workflow';

  @override
  String get wfAiPrompt => 'Décrivez le workflow';

  @override
  String get wfAiPromptHint =>
      'ex. éteindre les lumières à 23 h si personne à la maison';

  @override
  String get wfAiDraft => 'Brouillon avec l’IA';

  @override
  String get wfDiagramNodes => 'Nœuds (schéma téléphone)';

  @override
  String get wfNoNodes => 'Aucun nœud — brouillon ou collez du YAML.';

  @override
  String get wfYaml => 'YAML';

  @override
  String get wfSave => 'Valider et enregistrer';

  @override
  String get wfRun => 'Test d’exécution';

  @override
  String get wfDrafted => 'Brouillon appliqué';

  @override
  String get wfSaved => 'Enregistré';

  @override
  String get wfRan => 'Exécution lancée';

  @override
  String get sysTabFiles => 'Fichiers';

  @override
  String get sysTabHealth => 'Santé';

  @override
  String get sysTabGrants => 'Autorisations';

  @override
  String get sysTabMachine => 'Cette machine';

  @override
  String get sysMachineHint =>
      'État d’écoute du daemon via home.health. Installation/redémarrage du service OS en boucle locale uniquement sur le bureau domestique — indisponible via mesh.';

  @override
  String get sysMachineDaemonOk => 'Daemon joignable';

  @override
  String get sysMachineDaemonBad => 'Échec de santé du daemon';

  @override
  String get sysMachineWsPort => 'Port WebSocket';

  @override
  String get sysMachineHttpPort => 'Port HTTP hatch';

  @override
  String get sysMachinePublicUrl => 'URL de base publique';

  @override
  String get sysMachinePublicUrlEmpty => 'Non définie';

  @override
  String get sysMachineUptime => 'Durée de fonctionnement';

  @override
  String get sysMachineConnections => 'Clients / tours actifs';

  @override
  String get sysMachineMesh => 'Mesh';

  @override
  String get sysMachineOsServiceNote =>
      'Installez ou redémarrez le service OS depuis Paramètres bureau → Système → Cette machine (propriétaire boucle locale).';

  @override
  String get sysMachineRefresh => 'Actualiser';

  @override
  String get sysTestPush => 'Envoyer une notification test';

  @override
  String get sysTestPushSent => 'Notification test demandée';

  @override
  String get wfModeYaml => 'YAML';

  @override
  String get wfModeDiagram => 'Schéma';

  @override
  String get wfDiagramEmpty => 'Aucune étape — brouillon ou modifiez le YAML.';

  @override
  String get wfDiagramEdge => '↓';

  @override
  String get sysDoctorFix => 'Corriger';

  @override
  String get sysDoctorFixAll => 'Tout corriger';

  @override
  String sysDoctorFixed(String ids) {
    return 'Corrigé : $ids';
  }

  @override
  String get sysNoIssues => 'Aucun problème doctor.';

  @override
  String get sysNoGrants => 'Aucune autorisation.';

  @override
  String get chatNeedAccount =>
      'Choisissez un compte ci-dessus avant de discuter.';

  @override
  String get chatEmptyMessage => 'Message vide.';

  @override
  String get chatSessionTitle => 'Chat téléphone';

  @override
  String get chatEmptyTitle => 'Écrivez à votre agent domestique';

  @override
  String get chatEmptyHint =>
      'Les tours s’exécutent sur le démon domestique. Quand l’agent a besoin d’une permission, Autoriser/Refuser apparaît ici.';

  @override
  String get chatHint => 'Message…';

  @override
  String get chatThought => 'Réflexion';

  @override
  String get chatNew => 'Nouveau chat';

  @override
  String get chatNewNamePrompt => 'Nom du chat';

  @override
  String get chatNewNamePlaceholder => 'ex. Plans du week-end';

  @override
  String get chatNewNameHint =>
      'Nommez-le maintenant, ou démarrez sans nom — le titre viendra du premier message.';

  @override
  String get chatNewSkip => 'Démarrer sans nom';

  @override
  String get chatNewCreate => 'Créer';

  @override
  String get chatNewNeedName =>
      'Saisissez un nom, ou choisissez Démarrer sans nom.';

  @override
  String get chatNewStart => 'Démarrer';

  @override
  String get chatOpenArtifact => 'Ouvrir la réponse complète';

  @override
  String get chatPromoteKnowledge => 'Ajouter aux connaissances';

  @override
  String chatPromotedKnowledge(String path) {
    return 'Enregistré dans $path';
  }

  @override
  String get chatPromoteFailed => 'Impossible d’ajouter aux connaissances.';

  @override
  String get chatRecents => 'Récents';

  @override
  String get chatRecentsEmpty => 'Aucun chat antérieur.';

  @override
  String get chatSessionsEmpty => 'Aucun chat. Commencez-en un nouveau.';

  @override
  String get chatUntitled => 'Chat sans titre';

  @override
  String get chatRenameAction => 'Renommer';

  @override
  String get chatRenamePrompt => 'Nom de la chat';

  @override
  String get chatRenameDone => 'Chat renommée.';

  @override
  String get chatRenameEmpty => 'Le nom ne peut pas être vide.';

  @override
  String get chatRenameNeedSession =>
      'Envoyez d’abord un message, puis renommez.';

  @override
  String get chatBusyTurn =>
      'Attendez la fin de la réponse en cours (ou annulez).';

  @override
  String get chatEmptyAction => 'Vider le chat';

  @override
  String get chatEmptyConfirmTitle => 'Vider ce chat ?';

  @override
  String get chatEmptyConfirmBody =>
      'Tous les messages de ce fil seront supprimés. Le chat lui-même reste.';

  @override
  String get chatTrashMenu => 'Actions du chat';

  @override
  String get chatArchiveAction => 'Archiver le chat';

  @override
  String get chatUnarchiveAction => 'Restaurer dans Chats';

  @override
  String get chatUnarchiveDone => 'Chat restauré.';

  @override
  String get chatArchivedOpen => 'Archivés';

  @override
  String get chatTabActive => 'Discussions';

  @override
  String get chatTabArchived => 'Archivées';

  @override
  String get homeFolderTitle => 'Choisir un dossier';

  @override
  String get homeFolderSelect => 'Sélectionner';

  @override
  String get homeFolderDrives => 'Lecteurs';

  @override
  String get homeFolderComputer => 'Ordinateur';

  @override
  String get homeFolderHome => 'Accueil';

  @override
  String get homeFolderParent => 'Dossier parent';

  @override
  String get homeFolderNoSubfolders => 'Aucun sous-dossier';

  @override
  String get chatArchivedTitle => 'Chats archivés';

  @override
  String get chatArchivedBack => 'Retour aux chats';

  @override
  String get chatArchivedEmpty => 'Aucun chat archivé.';

  @override
  String get chatRemoveAction => 'Supprimer le chat';

  @override
  String get chatArchiveConfirmTitle => 'Archiver ce chat ?';

  @override
  String get chatArchiveConfirmBody =>
      'Il quittera Récents mais restera sur le disque.';

  @override
  String get chatRemoveConfirmTitle => 'Supprimer ce chat ?';

  @override
  String get chatRemoveConfirmBody =>
      'Supprimer définitivement ce chat et tous ses messages.';

  @override
  String get chatRemoveDone => 'Chat supprimé.';

  @override
  String get chatNoSession => 'Aucune session de chat active.';

  @override
  String get chatDeleteFailed =>
      'Impossible de supprimer ce message sur le serveur.';

  @override
  String get chatDeleteMessage => 'Supprimer le message';

  @override
  String get chatCopyMessage => 'Copier le message';

  @override
  String get chatCopied => 'Copié';

  @override
  String get chatCancel => 'Annuler';

  @override
  String chatSubscribeFailed(String error) {
    return 'échec d’abonnement : $error';
  }

  @override
  String chatStatus(String status) {
    return 'état : $status';
  }

  @override
  String chatError(String error) {
    return 'erreur : $error';
  }

  @override
  String get approvalsTitle => 'Approbations';

  @override
  String get approvalsHint =>
      'Demandes d’outils et d’actuation en attente de décision.';

  @override
  String get approvalsNeedAccount =>
      'Choisissez un compte pour charger les approbations.';

  @override
  String get approvalsEmptyTitle => 'Boîte vide';

  @override
  String get approvalsEmptyHint => 'Rien en attente pour le moment.';

  @override
  String get approvalsActuation => 'Action';

  @override
  String get approvalsAllow => 'Autoriser';

  @override
  String get approvalsDeny => 'Refuser';

  @override
  String get approvalsAllowed => 'Autorisé';

  @override
  String get approvalsDenied => 'Refusé';

  @override
  String approvalsFailed(String error) {
    return 'Échec : $error';
  }

  @override
  String get modelsTitle => 'Modèles';

  @override
  String get modelsOwnerHint =>
      'Activez Local ou Ollama sur la machine domestique. Préférez le bureau pour la première config.';

  @override
  String get modelsReadonlyHint =>
      'Lecture seule sur cet appareil. Utilisez Réglages bureau → Modèles (ou un téléphone propriétaire de confiance) pour activer Local.';

  @override
  String get modelsLocal => 'Modèle local';

  @override
  String get modelsOwnerTrusted =>
      'L’état du moteur local nécessite un appareil propriétaire de confiance.';

  @override
  String get modelsResponding => 'répond';

  @override
  String get modelsNotResponding => 'ne répond pas';

  @override
  String get modelsDisabled => 'désactivé';

  @override
  String get modelsGguf => 'GGUF sur disque';

  @override
  String get modelsEnableLocal => 'Activer Local';

  @override
  String get modelsUseOllama => 'Utiliser Ollama';

  @override
  String get modelsDisable => 'Désactiver';

  @override
  String get modelsLocalOnly => 'Local uniquement pour le compte';

  @override
  String get modelsThisAccount => 'Ce compte';

  @override
  String get modelsNeedAccount => 'Définissez accountId ci-dessus.';

  @override
  String modelsDefault(String id) {
    return 'Par défaut : $id';
  }

  @override
  String modelsPool(String filter) {
    return 'Pool : $filter';
  }

  @override
  String get modelsModeMesh => 'Mesh local';

  @override
  String get modelsModeSpawn => 'Home llama-server';

  @override
  String get modelsModeOllama => 'Ollama';

  @override
  String get modelsModeOff => 'Arrêt';

  @override
  String get modelsNotConnected => 'Non connecté';

  @override
  String get modelsSetAccount =>
      'Définissez accountId pour voir le modèle et le pool par défaut.';

  @override
  String get modelsUpdated => 'Mis à jour';

  @override
  String get modelsLocalEnabled => 'Local activé';

  @override
  String get modelsOllamaEnabled => 'Ollama activé';

  @override
  String get modelsLocalDisabled => 'Local désactivé';

  @override
  String get modelsLocalOnlySet => 'Routage local uniquement défini';

  @override
  String get modelsDefaultLabel => 'défaut';

  @override
  String get modelsOffLabel => 'off';

  @override
  String get modelsTest => 'Tester';

  @override
  String get modelsSetDefault => 'Définir par défaut';

  @override
  String modelsTestOk(String id) {
    return '$id testé';
  }

  @override
  String modelsDefaultSet(String id) {
    return 'Par défaut → $id';
  }

  @override
  String get artifactsTitle => 'Artefacts';

  @override
  String get artifactsHint =>
      'S’ouvre dans l’app via la connexion domestique (pas d’URL publique requise).';

  @override
  String get artifactsNeedAccount =>
      'Choisissez un compte pour lister les artefacts.';

  @override
  String get artifactsEmptyTitle => 'Aucun artefact';

  @override
  String get artifactsEmptyHint =>
      'Tirez pour actualiser après qu’un fichier soit produit.';

  @override
  String get artifactsUrlCopied => 'Impossible d’ouvrir — URL copiée';

  @override
  String artifactsOpenFailed(String error) {
    return 'Échec d’ouverture : $error';
  }

  @override
  String get artifactsTooLarge =>
      'Ce fichier dépasse la limite d’ouverture in-app de 8 Mo. Demandez à l’agent un export plus petit, ou ouvrez-le sur la machine domestique.';

  @override
  String get artifactsRefresh => 'Actualiser';

  @override
  String get artifactsRetry => 'Réessayer';

  @override
  String get artifactsBinaryHint =>
      'Ce type de fichier n’est pas prévisualisable ici. Utilisez Partager/Enregistrer pour l’ouvrir ailleurs, ou demandez un export texte ou Markdown.';

  @override
  String get artifactsShare => 'Partager / Enregistrer';

  @override
  String artifactsShareFailed(String error) {
    return 'Partage impossible : $error';
  }

  @override
  String get artifactsCopyLink => 'Copier le lien signé';

  @override
  String get artifactsLinkCopied => 'Lien signé copié';

  @override
  String get artifactsCopyLinkFailed => 'Impossible de copier le lien';

  @override
  String get artifactsOpenInBrowser => 'Ouvrir dans le navigateur';

  @override
  String get artifactsOpenInBrowserFailed =>
      'Impossible d’ouvrir dans le navigateur';

  @override
  String get filesParent => 'Parent';

  @override
  String get filesRoots => 'Racines';

  @override
  String get filesEmptyFolder => 'Ce dossier est vide';

  @override
  String get artifactsLoTitle => 'LibreOffice (ordinateur domestique)';

  @override
  String get artifactsLoWhy =>
      'Les exports Word, Excel, PowerPoint et PDF qualité impression s’exécutent sur votre ordinateur domestique (~1 Go, reste local). Sans cela, les exports fonctionnent avec une mise en page plus simple. Les documents ne sont jamais envoyés au cloud pour conversion.';

  @override
  String get artifactsLoReady => 'Prêt';

  @override
  String get artifactsLoMissing => 'Non installé';

  @override
  String get artifactsLoDownloading => 'Téléchargement…';

  @override
  String get artifactsLoFailed => 'Échec de l’installation';

  @override
  String get artifactsLoInstall => 'Installer sur l’ordinateur domestique';

  @override
  String get artifactsLoCancel => 'Annuler le téléchargement';

  @override
  String get artifactsLoNotNow => 'Pas maintenant';

  @override
  String get artifactsLoRefresh => 'Actualiser l’état';

  @override
  String artifactsLoProgress(String received, String total) {
    return '$received / $total';
  }

  @override
  String get artifactsLoHintCopied => 'Indication d’installation copiée';

  @override
  String get artifactsLoCopyHint =>
      'Copier l’indication d’installation manuelle';

  @override
  String get artifactsLoInstallNote =>
      'L’installation gérée s’exécute sur l’hôte daemon domestique — pas sur ce téléphone.';

  @override
  String get artifactsDataPreferTitle => 'Chemins de données (ordre préféré)';

  @override
  String get artifactsDataPreferStrip =>
      '1) Outils table natifs toujours actifs · 2) DuckDB pour jointures / SQL hors ligne · 3) MCP Propriétaire pour feuilles cloud / BI SaaS.';

  @override
  String get artifactsDataPreferJoinNeed =>
      'Nécessaire pour les jointures hors ligne dans le chat.';

  @override
  String get artifactsDataBrowseTables => 'Parcourir output/tables';

  @override
  String get artifactsDataBrowseCharts => 'Parcourir output/charts';

  @override
  String get artifactsSqlTitle => 'SQL hors ligne (DuckDB)';

  @override
  String get artifactsSqlWhy =>
      'Installez DuckDB sur l’ordinateur domestique pour des jointures SQL hors ligne sur les fichiers jail. Jamais automatique — vous choisissez Installer.';

  @override
  String get artifactsSqlReady => 'Prêt';

  @override
  String get artifactsSqlMissing => 'Non installé (optionnel)';

  @override
  String get artifactsSqlDownloading => 'Téléchargement…';

  @override
  String get artifactsSqlFailed => 'Échec de l’installation';

  @override
  String get artifactsSqlCancelled => 'Téléchargement annulé';

  @override
  String get artifactsSqlInstall =>
      'Installer DuckDB sur l’ordinateur domestique';

  @override
  String get artifactsSqlCancel => 'Annuler le téléchargement';

  @override
  String get artifactsSqlRefresh => 'Actualiser l’état';

  @override
  String artifactsSqlProgress(String received, String total) {
    return '$received / $total';
  }

  @override
  String get artifactsSqlToolsReady =>
      'sql_load / sql_query sont disponibles pour l’agent.';

  @override
  String get artifactsSqlToolsAbsent =>
      'sql_load / sql_query restent hors du catalogue agent tant que DuckDB n’est pas prêt.';

  @override
  String get artifactsSqlInstallNote =>
      'L’installation gérée s’exécute sur l’hôte daemon domestique — pas sur ce téléphone.';

  @override
  String get chatDataAssistHint =>
      'Feuille jointe — choisissez l’étape suivante (préremplit le compositeur ; les écritures exigent toujours Autoriser) :';

  @override
  String get chatDataAssistClean => 'Nettoyer et graphique';

  @override
  String get chatDataAssistAsk => 'Question sur ce tableau';

  @override
  String get chatDataAssistJoin => 'Jointure / SQL';

  @override
  String get chatDataAssistInstallDuckdb => 'Installer DuckDB…';

  @override
  String get chatDataAssistCleanSeed =>
      'Nettoyez la feuille jointe avec table_transform (normaliser / filtrer / pipeline selon besoin), puis chart_table, et montrez-moi les puces Ouvrir pour le CSV et le graphique.';

  @override
  String get chatDataAssistAskSeed =>
      'Que contient la feuille jointe ? Résumez les colonnes, le nombre de lignes et quelques exemples.';

  @override
  String get chatDataAssistJoinSeed =>
      'Chargez la feuille jointe avec sql_load, puis utilisez sql_query pour répondre (jointure si j’ajoute d’autres tableaux). Affichez les puces Ouvrir pour tout CSV résultat.';

  @override
  String get chatDataAssistNeedDuckdb =>
      'DuckDB n’est pas prêt — installez sous Système → Fichiers sur l’ordinateur domestique.';

  @override
  String chatOpenFile(String name) {
    return 'Ouvrir $name';
  }

  @override
  String chatPendingApprovals(int count) {
    return '$count en attente de votre approbation';
  }

  @override
  String get choiceCardConfirm => 'Confirmer';

  @override
  String get choiceCardOpen => 'Ouvrir';

  @override
  String get choiceCardChooseFile => 'Choisir un fichier';

  @override
  String get choiceCardBrowseJail => 'Parcourir les fichiers';

  @override
  String get choiceCardBrowseUp => 'Up';

  @override
  String choiceCardFilesChosen(int n) {
    return '$n fichiers choisis';
  }

  @override
  String get choiceCardNoFile => 'Aucun fichier choisi';

  @override
  String get choiceCardFileEmpty => 'Ce fichier est vide.';

  @override
  String choiceCardFileTypeRefused(String name) {
    return '$name n’est pas un type de téléversement de formulaire autorisé.';
  }

  @override
  String get choiceCardHandoffHint =>
      'S’ouvre dans votre navigateur ou appli pour terminer et payer là-bas. Home ne saisira pas les données de carte.';

  @override
  String get choiceCardPickOne => 'Choisissez au moins une option.';

  @override
  String get choiceCardAnswered => 'Reçu.';

  @override
  String choiceCardFailed(String error) {
    return 'Impossible d\'envoyer ce choix : $error';
  }

  @override
  String chatPendingChoices(int count) {
    return '$count en attente de votre choix';
  }

  @override
  String get choiceCardCancel => 'Annuler';

  @override
  String get choiceCardCanceled => 'Choix annulé.';

  @override
  String get choiceCardExpired => 'Expiré';

  @override
  String get choiceCardExpiredHint =>
      'Ce choix a expiré — reposez la question si besoin.';

  @override
  String choiceCardExpiresIn(int mins) {
    return 'Expire dans $mins min';
  }

  @override
  String get choiceCardTextPlaceholder => 'Saisissez votre réponse';

  @override
  String get schedulesChatTabChat => 'Discussion';

  @override
  String get schedulesChatTabHistories => 'Historiques';

  @override
  String get schedulesChatHistoriesHint =>
      'Propositions annulées ou expirées, et exécutions récentes.';

  @override
  String get jobsHistoriesMovedHint =>
      'Non défini et exécutions sont sous Historiques';

  @override
  String schedulesChatClosedAt(String when) {
    return 'Fermé $when';
  }

  @override
  String schedulesChatRanAt(String when) {
    return 'Exécuté $when';
  }

  @override
  String get welcomeSkip => 'Passer';

  @override
  String get welcomeNext => 'Suivant';

  @override
  String get commonContinue => 'Continuer';

  @override
  String get welcomeSlide1Title => 'Bienvenue sur EnvoyHome';

  @override
  String get welcomeSlide1Body =>
      'Votre téléphone est une fenêtre vers un agent maison auto-hébergé — chat, validations et maison connectée restent sur le bureau.';

  @override
  String get welcomeSlide2Title => 'Le travail se fait sur l’ordinateur';

  @override
  String get welcomeSlide2Body =>
      'Installez EnvoyHome sur un Mac ou PC à la maison. Le démon, les modèles et la mémoire du foyer restent là — le téléphone est une fenêtre à distance.';

  @override
  String get welcomeSlide3Title => 'Apparier avec un QR';

  @override
  String get welcomeSlide3Body =>
      'Sur l’ordinateur, ouvrez EnvoyHome et affichez le QR d’appariement. Sur ce téléphone, touchez Apparier maintenant et scannez. Vous pouvez aussi coller un lien.';

  @override
  String get welcomeSlideRequiredTitle => 'Apparier pour commencer';

  @override
  String get welcomeSlideRequiredBody =>
      'EnvoyHome a besoin d’un ordinateur avec l’app bureau. Agents et contrôle maison y tournent — appariez ce téléphone pour continuer.';

  @override
  String get setupGuideTitle => 'Comment fonctionne EnvoyHome';

  @override
  String get setupGuideIntro =>
      'EnvoyHome sur le téléphone parle à EnvoyHome sur l’ordinateur de maison. Installez le bureau, appariez une fois, puis discutez et validez de partout.';

  @override
  String get setupGuidePairRequiredTitle => 'Apparier pour continuer';

  @override
  String get setupGuidePairRequiredBody =>
      'EnvoyHome est le compagnon téléphone de votre bureau maison. Sans ordinateur apparié, il n’y a encore rien à afficher ici.';

  @override
  String get setupGuideStep1Title => 'Préparer un ordinateur';

  @override
  String get setupGuideStep1Body =>
      'Il vous faut un Mac ou un PC Windows/Linux à la maison. C’est l’hôte EnvoyHome — démon et agents y tournent.';

  @override
  String get setupGuideStep2Title => 'Télécharger et installer EnvoyHome';

  @override
  String get setupGuideStep2Body =>
      'Ouvrez le QuickStart et installez le démon ainsi que l’app bureau. Lancez-les et laissez-les tourner.';

  @override
  String get setupGuideDownloadCta => 'Ouvrir le QuickStart EnvoyHome';

  @override
  String get setupGuideStep3Title => 'Afficher le QR d’appariement';

  @override
  String get setupGuideStep3Body =>
      'Dans EnvoyHome bureau : Réglages → Apparier des appareils. Gardez le QR à l’écran (avec mesh/relais, pas LAN seul).';

  @override
  String get setupGuideStep4Title => 'Scanner avec ce téléphone';

  @override
  String get setupGuideStep4Body =>
      'Touchez Apparier maintenant. Autorisez la caméra, scannez le QR. Ou collez un lien envoy:// / hôte:port / SSH.';

  @override
  String get setupGuideStep5Title => 'Vous êtes connecté';

  @override
  String get setupGuideStep5Body =>
      'Après l’appariement, ce téléphone montre chats, validations et Réglages. Le bureau continue même sans téléphone.';

  @override
  String get setupGuideNoHomeTitle => 'Apparier plus tard convient';

  @override
  String get setupGuideNoHomeBody =>
      'Vous pouvez continuer et apparier à tout moment depuis Connexion. Sans ordinateur, il n’y a encore rien à afficher.';

  @override
  String get setupGuidePairCta => 'Apparier maintenant';

  @override
  String get setupGuidePairLaterCta => 'Plus tard';

  @override
  String get setupGuideSkipCta => 'Explorer d’abord';

  @override
  String get setupGuideDoneCta => 'Compris';

  @override
  String get settingsSetupGuideSubtitle =>
      'Installer l’app bureau et apparier ce téléphone.';
}
