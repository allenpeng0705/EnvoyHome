// WS RPC timeouts must exceed the runtime retry budget (Plan §5.1 / conventions R5).
// Default 30s; long-running (compact, migrate, long turns) 120s.

export const RPC_TIMEOUT_MS = 30_000;
export const RPC_TIMEOUT_LONG_MS = 120_000;

/** Runtime retry budget used by memory flush / long jobs. */
export const RUNTIME_MAX_ATTEMPTS = 3;
export const RUNTIME_RETRY_DELAY_MS = 1_000;
export const RUNTIME_PER_ATTEMPT_TIMEOUT_MS = 8_000;

/** Asserted by host.test.ts so a future change cannot shrink the timeout below budget. */
export function rpcTimeoutExceedsRetryBudget(
  timeoutMs: number = RPC_TIMEOUT_MS,
  maxAttempts: number = RUNTIME_MAX_ATTEMPTS,
  retryDelayMs: number = RUNTIME_RETRY_DELAY_MS,
  perAttemptTimeoutMs: number = RUNTIME_PER_ATTEMPT_TIMEOUT_MS,
): boolean {
  return timeoutMs > maxAttempts * (retryDelayMs + perAttemptTimeoutMs);
}
