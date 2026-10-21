// @envoyhome/harness-host — harness plugin loader + TurnContext + approvals (B6).

export { ApprovalStore, canonicalDigest, type Grant, type PendingApproval, type RiskTier } from "./approvals.js";
export { ALLOWED_INTENTS, validateIntent, type AllowedIntent } from "./validator.js";
export { type TurnContext, type TurnOrigin } from "./context.js";
export {
  BUILTIN_TOOLS,
  clearExtraToolSpecsForTests,
  execPolicyAllows,
  registerToolSpec,
  requiresAttendedApproval,
  unattendedRequiresGrant,
  toolSpec,
  type PolicySnapshot,
  type ToolPolicyPreset,
  type ToolSpec,
} from "./policy.js";
export {
  applyEditFile,
  applyUnifiedPatch,
  MAX_EDIT_FILE_CHARS,
  MAX_PATCH_CHARS,
  type ApplyPatchArgs,
  type ApplyPatchResult,
  type EditFileArgs,
  type EditFileResult,
} from "./file-edit.js";
export { ApprovalSink, type ApprovalDecision, type ToolDispatchRequest } from "./approval-sink.js";
export { ProviderHandle, type ProviderHandleOptions } from "./provider-handle.js";
export {
  HARNESS_CATALOG,
  DEFAULT_HARNESS_ID,
  canEnableHarness,
  catalogEntry,
  harnessKey,
  resolveHarnessId,
  type HarnessManifest,
  type HarnessSelectionState,
} from "./loader.js";
export {
  appendTranscriptLine,
  coalesceAssistantByTurnId,
  countTranscriptLines,
  dispatchTool,
  newTurnId,
  claimsActuationWithoutTools,
  claimsReminderWithoutPropose,
  honestyDisclaimerLocale,
  applyReminderHonestyGuard,
  isHomeOfferQuestion,
  parseAssistantToolCalls,
  formatSandboxToolResultLines,
  formatScheduleToolOutput,
  normalizeSandboxEchoPath,
  peekTurnFailure,
  readTranscript,
  readTranscriptEnsuringMessageIds,
  runTurn,
  updateTranscript,
  withTranscriptLock,
  withTranscriptMessageIds,
  transcriptNeedsMessageIdPersist,
  writeTranscript,
  type HistoryMessage,
  type PlannedToolStep,
  type RunTurnInput,
  type SandboxFs,
  type TurnEvent,
  type TurnDeps,
} from "./turn.js";
