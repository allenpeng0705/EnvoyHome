import 'package:flutter/widgets.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:geolocator/geolocator.dart';

import 'device_privacy.dart';

/// Ephemeral turn / propose context (Design §7.4 / 2026-10-19m).
/// Location only when Profiles “Share location with Home” is on and OS already granted.
Future<Map<String, dynamic>> buildClientContext(
  BuildContext context, {
  bool includeLocation = true,
}) async {
  final out = <String, dynamic>{
    'clientNow': DateTime.now().toUtc().toIso8601String(),
    'locale': Localizations.localeOf(context).languageCode,
  };
  try {
    final tz = await FlutterTimezone.getLocalTimezone();
    if (tz.identifier.isNotEmpty) out['timeZone'] = tz.identifier;
  } catch (_) {
    /* account TZ / host fallback */
  }
  if (!includeLocation) return out;
  try {
    if (!await getShareLocationWithHome()) return out;
    if (!await hasLocationPermissionGranted()) return out;
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) return out;
    final pos = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.low,
        timeLimit: Duration(seconds: 3),
      ),
    );
    out['location'] = {
      'lat': pos.latitude,
      'lon': pos.longitude,
      'accuracyM': pos.accuracy,
      'at': pos.timestamp.toUtc().toIso8601String(),
    };
  } catch (_) {
    /* location is optional */
  }
  return out;
}
