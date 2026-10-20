import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Device-local privacy prefs (not daemon standing memory). Design §7.4 / 2026-10-19m.
const kShareLocationWithHomeKey = 'envoyhome.shareLocationWithHome';

Future<bool> getShareLocationWithHome() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getBool(kShareLocationWithHomeKey) == true;
}

Future<void> setShareLocationWithHome(bool enabled) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setBool(kShareLocationWithHomeKey, enabled);
}

/// Request OS location permission once (user-initiated from Settings).
/// Returns whether while-in-use/always was granted.
Future<bool> requestLocationPermissionForHome() async {
  final enabled = await Geolocator.isLocationServiceEnabled();
  if (!enabled) return false;
  var perm = await Geolocator.checkPermission();
  if (perm == LocationPermission.denied) {
    perm = await Geolocator.requestPermission();
  }
  return perm == LocationPermission.whileInUse || perm == LocationPermission.always;
}

Future<bool> hasLocationPermissionGranted() async {
  final perm = await Geolocator.checkPermission();
  return perm == LocationPermission.whileInUse || perm == LocationPermission.always;
}
