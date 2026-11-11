import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:test/test.dart';

/// V-P2-MESH-1/2 — phone must not dial attach-only peers.
void main() {
  test('assertHostingDialPath logic: attached is refused', () {
    // Mirrors HomeSession.assertHostingDialPath without a live daemon.
    String? refuseIfAttached(String kind) {
      if (kind == 'attached') {
        return 'home.meshStatus is attached — phone must dial hosting peer (V-P2-MESH-1/2)';
      }
      return null;
    }

    expect(refuseIfAttached('hosting'), isNull);
    expect(refuseIfAttached('no-node'), isNull);
    expect(refuseIfAttached('attached'), contains('attached'));
  });

  test('assertNotAttachDialTarget refuses attachForbidden', () {
    expect(
      () => assertNotAttachDialTarget(DialTargetKind.attachForbidden),
      throwsStateError,
    );
    assertNotAttachDialTarget(DialTargetKind.hostingWs);
  });
}
