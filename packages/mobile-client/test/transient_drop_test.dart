import 'package:envoyhome_mobile_client/envoyhome_mobile_client.dart';
import 'package:test/test.dart';

void main() {
  test('isTransientHomeRemoteDrop matches family disconnect signals', () {
    expect(isTransientHomeRemoteDrop(Exception('homeRemote.disconnected')), isTrue);
    expect(isTransientHomeRemoteDrop(Exception('homeRemote.notConnected')), isTrue);
    expect(isTransientHomeRemoteDrop(Exception('homeRemote.listProjectsTimeout')), isFalse);
    expect(isTransientHomeRemoteDrop(Exception('something else')), isFalse);
  });
}
