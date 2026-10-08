// @envoyhome/channel-api — Channel SDK (B7).

export {
  assertManifestCompatible,
  type ChannelKind,
  type ChannelManifest,
} from "./manifest.js";

export type {
  ChannelContext,
  ChannelContextSurface,
  ChannelLogger,
  InboundEvent,
  OutboundMessage,
  SecretHandle,
  SourceDescriptor,
} from "./context.js";

export {
  ChannelLoader,
  type ChannelPlugin,
  type InboundHandler,
  type LoadedChannel,
  type OutboundHandler,
} from "./loader.js";

export {
  buildInboundEvent,
  gateInbound,
  rawRefKey,
  type InboundAck,
  type EmitInboundGate,
} from "./emit-inbound.js";

export {
  assertNotificationOnly,
  assertRawRefOwner,
  normalizeOutbound,
  type RawRefOwner,
} from "./outbound.js";

export {
  createSidecarSupervisor,
  postSidecarInbound,
  type SidecarClientOptions,
  type SidecarInboundRequest,
  type SidecarInboundResponse,
  type SidecarSupervisor,
} from "./sidecar.js";

export {
  createFakeChannel,
  createFakeEventSource,
  getFakeChatContextForTests,
  getFakeEventContextForTests,
} from "./fake.js";
