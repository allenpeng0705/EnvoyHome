// @envoyhome/daemon — EnvoyHome control plane (B2+).

export {
  RPC_TIMEOUT_MS,
  RPC_TIMEOUT_LONG_MS,
  RUNTIME_MAX_ATTEMPTS,
  RUNTIME_RETRY_DELAY_MS,
  RUNTIME_PER_ATTEMPT_TIMEOUT_MS,
  rpcTimeoutExceedsRetryBudget,
} from "./timeouts.js";

export {
  defaultConfig,
  loadDaemonConfig,
  DEFAULT_WS_PORT,
  DEFAULT_HTTP_PORT,
  DEFAULT_STATE_SCHEMA_VERSION,
  type DaemonConfig,
} from "./config.js";

export {
  claimPath,
  clearClaim,
  isProcessAlive,
  makeClaim,
  readClaim,
  writeClaim,
  type DaemonClaim,
} from "./claim.js";

export { DaemonLogger, type LogLevel, type LogLine } from "./logger.js";

export {
  DeviceCredentialStore,
  LOOPBACK_SCOPE,
  createSessionIdentity,
  hashDeviceToken,
  loopbackCaller,
  loopbackSession,
  type CallerKind,
  type DeviceRecord,
  type HomeCaller,
  type HomeSession,
} from "./auth.js";

export { SubscriptionRegistry } from "./events.js";

export { createDispatcher, dispatchForTest, type RouterDeps } from "./router.js";

export { startWsHost, type HostHandle } from "./host.js";

export { resolveHatchAccount, startHttpHatch, type HatchDeps } from "./http.js";

export { startDaemon, type RunningDaemon, type StartDaemonOptions } from "./daemon.js";

export { homePaths, type HomePaths } from "./home-paths.js";

export {
  PathJailError,
  safeJoin,
  resolveSandboxPath,
} from "./fs-jail.js";

export {
  AccountStore,
  AccountError,
  type AccountRecord,
  type AccountProfileFile,
  type ToolPolicyPreset,
} from "./accounts.js";

export {
  BindingStore,
  BindingError,
  freshSenderId,
  type BindingRecord,
  type SenderBinding,
  type DeviceBinding,
} from "./bindings.js";

export {
  PATH_TRAVERSAL_CORPUS,
  APPENDIX_C3_REQUIRED_IDS,
  type PathCorpusCase,
  type CorpusExpect,
} from "./security-corpus.js";

export {
  PairingStore,
  PairingError,
  checkPairingCode,
  hostnameOfReach,
  assertDeviceAccountBound,
  ZERO_BINDING_ALLOW_LIST,
  MINT_MIN_INTERVAL_MS,
  MINT_WINDOW_MS,
  MINT_WINDOW_MAX,
  type PairingIdentity,
  type PublicPairedDevice,
  type MintPairingInput,
  type MintPairingResult,
  type CheckPairingCodeResult,
} from "./pairing.js";

export {
  canonicalJson,
  signArtifactToken,
  verifyArtifactToken,
  clampArtifactTtl,
  ARTIFACT_DEFAULT_TTL_SEC,
  ARTIFACT_MAX_TTL_SEC,
  type ArtifactTokenPayload,
  type VerifyArtifactTokenResult,
} from "./artifact-signer.js";

export {
  createMeshHost,
  resolveMeshStatus,
  DEFAULT_MESH_HOST_CONFIG,
  type MeshKind,
  type MeshStatus,
  type MeshHostConfig,
  type MeshHostHandle,
} from "./mesh-host.js";

export {
  hasCircuitRelayDebug,
  probeCircuitRelayDebug,
  doctorMeshRelayDebugIssue,
  collectMeshDoctorIssues,
  DOCTOR_MESH_RELAY_DEBUG_ID,
  type DoctorIssue,
  type DoctorSeverity,
} from "./doctor-mesh.js";
