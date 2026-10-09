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
  String get shellDisconnect => 'Déconnecter';

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
  String get navChat => 'Chat';

  @override
  String get navApprovals => 'Approbations';

  @override
  String get navModels => 'Modèles';

  @override
  String get navArtifacts => 'Artefacts';

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
  String get approvalsActuation => 'Actuation';

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
  String get artifactsTitle => 'Artefacts';

  @override
  String get artifactsHint =>
      'Liens signés du démon domestique. Appuyez pour ouvrir.';

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
  String chatPendingApprovals(int count) {
    return '$count en attente de votre approbation';
  }
}
