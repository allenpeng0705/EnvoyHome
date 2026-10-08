// @envoyhome/memory — StandingStore + MemoryFacade (L1–L3) + B8 depth.

export {
  MemoryFacade,
  MemoryError,
  FILES_BACKEND,
  INJECT_BUDGET,
  RAW_SOFT_CAP,
  STANDING_DUTY_LINE,
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
export { deriveTrust, mayDirectStandingWrite, type TrustContext } from "./taint.js";
export {
  stampProvenance,
  provenanceLine,
  type Provenance,
  type ProvenanceSource,
  type ProvenanceTrust,
} from "./provenance.js";
export { baseDigest, computeDiffKey, canonicalJson, sha256Digest } from "./digest.js";
export { SkillsStore } from "./skills-store.js";
