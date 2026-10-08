// @envoyhome/smarthome — B14 core surface.

export {
  SAFETY_CLASSES,
  SERVICE_DENY,
  INDIRECTION_DOMAINS,
  classifySafety,
  grantRefusedForSafety,
  isKnownObjectClass,
  type SafetyDecision,
  type SafetyInput,
} from "./safety-class.js";

export {
  REQUIRED_DENY_CORPUS,
  APPENDIX_C4_REQUIRED_IDS,
  type RequiredDenyCase,
} from "./required-deny-corpus.js";

export { createHaClient, type HaClient, type HaClientConfig } from "./ha-client.js";
export { createMqttClient, type MqttClient, type MqttClientConfig } from "./mqtt-client.js";

export {
  ObjectRegistry,
  resolveObject,
  type ObjectRecord,
  type ResolvedObjectHandle,
} from "./object-resolver.js";

export {
  ActuationJournal,
  type ActuationOutcome,
  type ActuationRecord,
} from "./actuation-journal.js";

export {
  HA_TOOLS,
  MQTT_TOOLS,
  assertActuationAllowed,
  assertGrantCreatable,
  tierForGetState,
  type ToolDecl,
  type ToolTier,
} from "./tools.js";
