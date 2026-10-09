# envoyhome_mobile_client

Dart thin-client skin for EnvoyHome (Design §11.3 / §19.2).

- **Depends on** sibling `../EnvoyMesh/packages/envoy-thin-client-dart` (path) — do not fork.
- Speaks `home.*` over WS from an `envoy://pair?…&app=EnvoyHome` code.
- Dial target = **hosting / LAN WS** from the pairing URI (V-P2-MOB-1, V-P2-MESH-1).
- Refuses attach-as-phone-route (V-P2-MESH-2) and foreign `app=` codes.

No full Flutter UI here — this is the shared library; a phone shell comes later.

## Scripts

```bash
cd packages/mobile-client
dart pub get
dart test
# live (optional):
ENVOYHOME_PAIR_URI='envoy://pair?…' dart test test/home_session_live_test.dart
```

From repo root: `pnpm mobile:test` (skips if `dart` missing).

## Operator live HA note

Live Appendix C.4 registry diff is separate: set `ENVOYHOME_HA_URL` + `ENVOYHOME_HA_TOKEN` and run `pnpm ha:c4-diff`.
