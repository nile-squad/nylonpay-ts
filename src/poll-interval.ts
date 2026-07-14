/** Terminal transaction statuses that stop client-side resolve polling. */
const TERMINAL_STATUSES = new Set(["successful", "failed", "cancelled", "completed"]);

/** Whether a status is terminal for resolve/wait continuation. */
export function isTerminalTransactionStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Poll spacing: base interval for the first 2 minutes, then doubles every 2
 * minutes capped at 15s so long waits stay cheap for the status cache.
 */
export function resolvePollIntervalMs(input: {
  baseIntervalMs: number;
  pollStartTimeMs: number;
  nowMs?: number;
}): number {
  const now = input.nowMs ?? Date.now();
  const elapsed = now - input.pollStartTimeMs;
  const twoMinutes = 2 * 60 * 1000;
  if (elapsed < twoMinutes) {
    return input.baseIntervalMs;
  }
  const periods =
    Math.floor((elapsed - twoMinutes) / twoMinutes) + 1;
  return Math.min(input.baseIntervalMs * 2 ** periods, 15_000);
}
