/// True when [error] means the active socket was retired under an in-flight RPC
/// (transport upgrade / reconnect) — not that the daemon refused the work.
///
/// Peer: EnvoyDev `isTransientHomeRemoteDrop` in `host_client.dart`.
bool isTransientHomeRemoteDrop(Object error) {
  final text = error.toString();
  return text.contains('homeRemote.disconnected') ||
      text.contains('homeRemote.notConnected');
}
