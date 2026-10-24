// @envoyhome/memory — StandingStore + MemoryFacade (L1–L3) + B8 depth.

export {
  MemoryFacade,
  MemoryError,
  FILES_BACKEND,
  INJECT_BUDGET,
  RAW_SOFT_CAP,
  STANDING_DUTY_LINE,
  PRODUCT_IDENTITY_PROLOGUE,
  PRODUCT_IDENTITY_FLOOR,
  PRODUCT_IDENTITY_MARKER,
  IDENTITY_STANDING_RESERVE,
  IDENTITY_INJECT_BUDGET,
  DEFAULT_IDENTITY_MD,
  proposeAfterTurnEnrichment,
  __resetMemoryForTests,
  type RememberTarget,
  type MemoryFacadeOptions,
  type DeepBackendHandle,
} from "./memory-facade.js";

export { StandingStore, standingPaths, type StandingPaths, type LoadedStanding } from "./standing-store.js";

export {
  buildStandingInject,
  rawSoftCapIssues,
  type StandingInjectResult,
  type AssetBudgetReport,
  type InjectInputs,
} from "./bootstrap-inject.js";

export {
  CHARS_PER_TOKEN,
  MAX_FRACTION,
  CEILING_TOTAL,
  HARD_MIN_TOTAL,
  BASELINE_TOTAL,
  baselineInjectPackage,
  deriveInjectPackage,
  splitInjectTotal,
  packageForMode,
  resolveInjectProfiles,
  capsInputFromPackage,
  parseInjectBudgetMode,
  parseCapsOverride,
  type InjectBudgetMode,
  type InjectProfileId,
  type InjectAssetBudgets,
  type InjectProfileReport,
  type InjectProfilesWire,
  type CapsOverride,
  type StandingCapsInput,
  type ResolveInjectProfilesInput,
  type ResolveInjectProfilesResult,
} from "./inject-profiles.js";

export {
  withAccountLock,
  lockFilePath,
  WriterLockError,
  __resetWriterLocksForTests,
} from "./writer-lock.js";

export {
  recallOverCorpus,
  needsShortCjkScan,
  filterRecallPaths,
  isDailyNoteFilename,
  type RecallHit,
  type RecallEngine,
  type CorpusDoc,
} from "./recall-fts.js";

export {
  parseProfile,
  applyProfileUpdate,
  serializeProfileForInject,
  toWireProfile,
  emptyProfile,
  stringifyProfile,
  IDENTITY_KEY_ORDER,
  type ProfileDocument,
  type ProfileFact,
  type ProfileFactValue,
  type ProfileFactSource,
  type ProfileTrust,
} from "./profile.js";

export {
  parseSections,
  buildL2Inject,
  buildL3Inject,
  appendToMemoryMd,
  appendDailyLine,
  forgetMatchingLines,
  todayIsoDate,
  yesterdayIsoDate,
  omitMarker,
  type MdSection,
} from "./notes.js";

export {
  hashContent,
  snapshotFile,
  snapshotsEqual,
  standingChanged,
  emptyStandingSnapshots,
  ExternalEditWarning,
  type FileSnapshot,
  type StandingSnapshots,
} from "./external-reload.js";

export {
  LearnQueue,
  PENDING_LEARN_CAP,
  PENDING_LEARN_TTL_MS,
  type PendingLearn,
  type PendingLearnKind,
  type ProposeResult,
} from "./learn-queue.js";

export { SessionIndex, DEFAULT_SESSION_RETENTION_DAYS } from "./session-index.js";
export { CompactDiary, compactPaths, COMPACT_MAX_ENTRIES, COMPACT_MAX_CHARS } from "./compact-diary.js";
export { applyFlush, type FlushItem, type FlushResult } from "./flush.js";
export { compactMemory, makeCompactDiary } from "./consolidate.js";
export {
  DEFAULT_RESERVE_TOKENS,
  DEFAULT_SOFT_MARGIN_TOKENS,
  FORCE_FLUSH_TRANSCRIPT_BYTES,
  estimateTextTokens,
  estimateTranscriptBytes,
  estimateTranscriptTokens,
  lineText,
  planSessionPressure,
  pressureThresholds,
  type SessionPressurePlan,
  type TranscriptLineLike,
} from "./session-pressure.js";
export {
  MIN_KEEP_LINES,
  UNKNOWN_CONTEXT_HISTORY_BUDGET_TOKENS,
  compactTranscriptLines,
  flushItemsFromDropped,
  flushItemsFromOldestHalf,
  historyBudgetForPressure,
  isDurableFlushCandidate,
  type CompactTranscriptResult,
} from "./session-compact.js";
export { deriveTrust, mayDirectStandingWrite, type TrustContext } from "./taint.js";
export {
  stampProvenance,
  provenanceLine,
  type Provenance,
  type ProvenanceSource,
  type ProvenanceTrust,
} from "./provenance.js";
export { baseDigest, computeDiffKey, canonicalJson, sha256Digest } from "./digest.js";
export { SkillsStore, type SkillL7Backend } from "./skills-store.js";
