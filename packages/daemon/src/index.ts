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
  defaultStateDir,
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

export {
  HouseholdStore,
  HouseholdError,
  isHouseholdOwner,
  memoryTrustForTurn,
  mayActForSeat,
  assertOwnerExclusiveBind,
} from "./household.js";

export { SubscriptionRegistry } from "./events.js";

export {
  ProductEventBus,
  homeEventDispositions,
  type ProductEmit,
} from "./product-events.js";

export {
  PolicyStore,
  PrivacyModeStore,
  type AccountPolicy,
  type PrivacyModeState,
} from "./policy-store.js";

export { createDispatcher, dispatchForTest, type RouterDeps } from "./router.js";

export {
  PushTokenStore,
  type PushPlatform,
  type PushTokenRecord,
  type PushTokenType,
} from "./push-tokens.js";

export {
  PushDispatcher,
  buildApnsBody,
  buildFcmMessage,
  type PushPayload,
  type PushConfigFile,
  type PushWakePolicy,
  type PushSendFn,
} from "./push-dispatch.js";

export { LiveDevicePresence, PUSH_LIVE_IDLE_MS } from "./push-live.js";

export { startWsHost, type HostHandle } from "./host.js";

export { resolveHatchAccount, startHttpHatch, type HatchDeps } from "./http.js";

export { startDaemon, type RunningDaemon, type StartDaemonOptions } from "./daemon.js";

export { homePaths, type HomePaths } from "./home-paths.js";

export {
  LocalEngineService,
  buildHomeLlamaServerArgs,
  probeOpenAiModels,
  HOME_LOCAL_ENGINE_PORT,
  OLLAMA_DEFAULT_PORT,
  HOME_LOCAL_PROVIDER_ID,
  OLLAMA_PROVIDER_ID,
  assertLocalEngineBaseUrl,
  assertHuggingFaceGgufUrl,
  hfResolveUrl,
  searchHuggingFaceGgufRepos,
  listHuggingFaceGgufFiles,
  downloadHuggingFaceGgufUrl,
  resolveLocalModelPath,
  resolveLocalBinaryPath,
  assertSafeArchiveEntry,
  detectLocalPlatform,
  HOME_LOCAL_MODEL_TIER_IDS,
  detectHomeLocalHardware,
  recommendHomeLocalModel,
  buildHomeLocalRecommendation,
  getHomeLocalCatalogModel,
  type LocalEngineStatus,
  type LocalEngineMode,
  type LocalEngineEnableResult,
  type LocalEngineDisableResult,
  type LocalEngineRecommendationWire,
} from "./local-engine/index.js";

export {
  ProviderStore,
  type ProviderRecord,
  type AccountRouting,
  type PlacementPreference,
} from "./providers-store.js";

export {
  PathJailError,
  safeJoin,
  resolveSandboxPath,
  isFilesystemRoot,
  type WorkspaceMode,
} from "./fs-jail.js";

export {
  draftWorkflowFromText,
  draftWorkflowNodePrompt,
  extractPromptCandidate,
  extractYamlCandidate,
  type DraftChatMessage,
  type DraftComplete,
} from "./workflow-draft.js";

export {
  WorkflowStepTemplateStore,
  type WorkflowStepTemplate,
  type LlmStepNodeType,
} from "./workflow-step-templates.js";

export {
  AccountStore,
  AccountError,
  assertIanaTimeZone,
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
  compressedPairingToken,
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
  createHomeMeshPeer,
  homeMeshOptions,
  meshMintFields,
  resolveMeshStatus,
  DEFAULT_MESH_HOST_CONFIG,
  HOME_MESH_RELAY_HINTS,
  type MeshKind,
  type MeshStatus,
  type MeshHostConfig,
  type MeshHostHandle,
  type HomeMeshPeer,
  type HomeMeshPeerNode,
  type HomeMeshNodeFactory,
  type HomeMeshPeerOptions,
} from "./mesh-host.js";

export {
  loadOrCreateMeshIdentity,
  meshIdentityPath,
  type HomeMeshPrivateKey,
} from "./mesh-identity.js";

export {
  hasCircuitRelayDebug,
  probeCircuitRelayDebug,
  doctorMeshRelayDebugIssue,
  doctorMeshHostingIssue,
  collectMeshDoctorIssues,
  DOCTOR_MESH_RELAY_DEBUG_ID,
  DOCTOR_MESH_HOSTING_FAILED_ID,
  type DoctorIssue,
  type DoctorSeverity,
} from "./doctor-mesh.js";

export {
  collectDoctorIssues,
  applyDoctorFixes,
  planHomeClawMigrate,
  DOCTOR_MIGRATE_HOMECLAW_PLAN_ID,
} from "./doctor/index.js";

export {
  ScheduleService,
  resolveScheduleFromText,
  parseCron,
  nextCronExprAfter,
  HEARTBEAT_OK,
  MIN_HEARTBEAT_INTERVAL_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  isHeartbeatSilentOk,
  clampHeartbeatIntervalMs,
  type ScheduleJob,
  type ScheduleProposal,
} from "./schedule/index.js";

export {
  StandingOrderStore,
  standingJobId,
  standingOrderToScheduleParts,
  validateStandingOrder,
  type StandingOrder,
  type StandingWhen,
  type StandingAction,
} from "./standing-orders.js";

export {
  runMessageTool,
  runSessionsListTool,
  runSessionsHistoryTool,
  runSessionsStatusTool,
  runSessionsSendTool,
  runViewImageTool,
  runImageGenerateTool,
  runSpawnHelperTool,
  runTaskTool,
  sliceExtractByPageRange,
  __resetPhase2ToolsForTests,
  SESSIONS_LIST_CAP,
  SESSIONS_HISTORY_CAP,
  SESSIONS_SEND_TEXT_CAP,
  SPAWN_HELPER_MAX_CONCURRENT,
  TASK_MAX_SUBAGENTS,
  TASK_MAX_PARALLEL,
  TASK_ACCOUNT_CONCURRENCY,
  MESSAGE_ACTIONS_SUPPORTED,
} from "./phase2-tools.js";

export {
  HomeModelAdapter,
  createHomeMeshSubmitter,
  buildHomeChildToolRegistry,
  buildParentToolRegistry,
  homeTaskArgsToHarness,
  homeSubagentInput,
  textFromSubagentResult,
  HOME_PARENT_MAX_ITERATIONS,
} from "./home-harness-bridge.js";

export {
  HomeAgentSession,
  isHarnessAgentSystemPromptLeak,
} from "./home-agent-session.js";

export {
  runAgentTurn,
  parentAgentEnabled,
  parentToolNamesForSurface,
} from "./home-agent-turn.js";

export {
  MediaGenerateStore,
  type MediaGenerateState,
  type MediaGenerateJob,
  type MediaGenerateJobStatus,
} from "./media-generate-store.js";

export { SessionStore, type SessionMeta } from "./sessions.js";

export { ChannelService } from "./channels/service.js";

export {
  CHAT_MEDIA_MAX_BYTES,
  CHAT_MEDIA_MAX_FILES,
  CHAT_MEDIA_UPLOAD_DIR,
  CHAT_MEDIA_EXTRACT_INLINE_CHARS,
  ChatMediaError,
  kindFromMime,
  storeChatMedia,
  normalizeMediaList,
  enrichMediaExtracts,
  appendMediaToUserText,
  type ChatMediaKind,
  type ChatMediaItem,
} from "./chat-media.js";
export {
  DOCUMENT_TEXT_EXTRACTOR_ID,
  extractDocumentText,
  extractSidecarUri,
  isExtractableExtension,
  isAnydocExtension,
  isNativeTextExtension,
  normalizeExtension,
  normalizeGfmMarkdown,
} from "./document-extract.js";
