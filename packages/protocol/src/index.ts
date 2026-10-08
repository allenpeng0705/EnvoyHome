// @envoyhome/protocol — `home.*` types, JSON schemas, validator, envelope helpers.
//
// Ground truth: design_doc/EnvoyHome-Design.md §3 (wire protocol), §3.7
// (compatibility), Appendix A (method + event schemas). Build Stage B1.
//
// The envelope SHAPES are adopted from `@envoymesh/protocol` (Design §3.1) and
// deliberately not re-declared here; this package adds the EnvoyHome method
// catalogue, its schemas, validation, and the product error namespace.

export {
  PROTOCOL_API_VERSION,
  PRODUCT_NAME,
  ERROR_NAMESPACE,
  PLUGIN_API_VERSION,
  checkPluginApiVersion,
  type PluginApiCompatibility,
} from "./version.js";

export {
  ENVOYHOME_ERRORS,
  type EnvoyHomeErrorName,
  type EnvoyHomeErrorExtra,
  type ParsedEnvoyHomeError,
  errorMessage,
  makeError,
  parseError,
  isError,
  TRANSPORT_CODE_BAD_PARAMS,
  TRANSPORT_CODE_UNAUTHORIZED,
} from "./errors.js";

export {
  type JsonSchema,
  type JsonSchemaType,
  type ValidationIssue,
  type ValidationResult,
  SUPPORTED_KEYWORDS,
  assertSupportedSchema,
  validate,
  // builder DSL
  str,
  num,
  int,
  bool,
  nul,
  iso,
  digest,
  enumOf,
  any,
  obj,
  arr,
  factValue,
  nullable,
} from "./schema.js";

export {
  METHODS,
  methodNames,
  isKnownMethod,
  PENDING_LEARN_KINDS,
  OBJECT_CLASSES,
  PRESENCE_REVEALING_CLASSES,
  isShareableClass,
  isClassDowngrade,
  CLASS_RANK,
  clampArtifactTtlSec,
  assertApprovalSummary,
  ARTIFACT_TTL_DEFAULT_SEC,
  ARTIFACT_TTL_MAX_SEC,
  type MethodSpec,
  type MethodScope,
  type MethodGroup,
  type ObjectClass,
  type ApprovalSummarySubject,
} from "./methods.js";

export { EVENTS, eventNames, isKnownEvent, validateSubscriptions, type EventSpec } from "./events.js";

export {
  type RpcId,
  type HomeRequest,
  type HomeResponse,
  type HomeEvent,
  type FamilyRequest,
  type FamilyResponse,
  type FamilyEvent,
  type FamilyError,
  type MethodValidation,
  makeRequest,
  makeResult,
  makeErrorResponse,
  badParams,
  unauthorized,
  makeEvent,
  validateRequestEnvelope,
  validateResponseEnvelope,
  validateEventEnvelope,
  validateMethodParams,
  validateMethodResult,
  validateEventData,
  validateInbound,
} from "./envelope.js";
