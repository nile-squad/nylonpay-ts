/**
 * Reachability tracker: remember the last successful round-trip and only
 * run a down-check when that memory is empty, stale, or the last call failed.
 *
 * A recent success (5 minutes) means Nylon answered, so the next signed
 * operations go out with no extra check. That is what stops us hammering
 * the server on every getStatus poll. After an unreachable failure, the
 * next SDK operation is checked before it is attempted; polls inside the
 * short re-check pause are skipped without another request.
 *
 * @internal
 */

import { Err, type Result } from "slang-ts";
import {
  REACHABILITY_DOWN_RECHECK_MS,
  REACHABILITY_SUCCESS_FRESH_MS,
  UNREACHABLE_CODE,
  UNREACHABLE_HOST_OFFLINE,
  UNREACHABLE_NYLON_DOWN,
} from "./sdk.config";
import type { SdkError, UnreachableReason } from "./types";

const HOST_OFFLINE_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "EAI_NONAME",
  "EAI_NODATA",
  "ENETUNREACH",
  "ENETDOWN",
  "EHOSTUNREACH",
  "ENONET",
  "ERR_NAME_NOT_RESOLVED",
]);

const HOST_OFFLINE_TEXT =
  /enotfound|eai_again|eai_noname|enetunreach|enetdown|ehostunreach|enonet|getaddrinfo|could not resolve host|couldn't resolve host|failed to resolve|name or service not known|nodename nor servname|err_name_not_resolved|no such host|temporary failure in name resolution/i;

/** HTTP statuses that mean Nylon's edge answered "the service is down". */
export const GATEWAY_DOWN_STATUSES = new Set([502, 503, 504]);

/**
 * Walk a thrown value and its `cause` chain for codes and message text.
 * Node's fetch wraps DNS failures as `TypeError: fetch failed` with
 * `cause.code === "ENOTFOUND"` — looking only at the outer message
 * would classify those as Nylon-down.
 */
function collectErrorSignals(error: unknown): {
  codes: string[];
  text: string;
} {
  const codes: string[] = [];
  const parts: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const rec = current as {
      code?: unknown;
      errno?: unknown;
      name?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (typeof rec.code === "string") codes.push(rec.code);
    if (typeof rec.errno === "string") codes.push(rec.errno);
    if (typeof rec.name === "string") {
      codes.push(rec.name);
      parts.push(rec.name);
    }
    if (typeof rec.message === "string") parts.push(rec.message);
    current = rec.cause;
  }

  if (typeof error === "string") parts.push(error);
  parts.push(String(error));

  return { codes, text: parts.join(" ") };
}

function isAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name: string }).name === "AbortError")
  );
}

/**
 * Map a thrown transport error to one of the two merchant-facing reasons.
 * DNS / no-route → host offline. Everything else that prevented a
 * completed HTTP response (refused, reset, abort) → Nylon down.
 */
export function classifyUnreachable(error: unknown): UnreachableReason {
  if (isAbort(error)) return UNREACHABLE_NYLON_DOWN;
  const { codes, text } = collectErrorSignals(error);
  if (codes.some((code) => HOST_OFFLINE_CODES.has(code))) {
    return UNREACHABLE_HOST_OFFLINE;
  }
  if (HOST_OFFLINE_TEXT.test(text)) return UNREACHABLE_HOST_OFFLINE;
  return UNREACHABLE_NYLON_DOWN;
}

/**
 * 502/503/504 mean Nylon's edge said the service is down. Other HTTP
 * statuses (including 4xx auth and 500) mean Nylon answered, so it is up.
 */
export function classifyHttpStatus(
  statusCode: number,
): UnreachableReason | null {
  return GATEWAY_DOWN_STATUSES.has(statusCode) ? UNREACHABLE_NYLON_DOWN : null;
}

export function unreachableSdkError(reason: UnreachableReason): SdkError {
  return {
    category: "network",
    message: reason,
    retryable: true,
    code: UNREACHABLE_CODE,
  };
}

export function serializeUnreachable(reason: UnreachableReason): string {
  return JSON.stringify(unreachableSdkError(reason));
}

/** `null` means Nylon answered. A reason means the check failed. */
export type ReachabilityProbe = () => Promise<UnreachableReason | null>;

type TrackerMemory = {
  lastSuccessAt: number | null;
  lastFailed: boolean;
  lastReason: UnreachableReason | null;
  lastCheckAt: number | null;
};

/**
 * Create a per-transport reachability tracker.
 *
 * `beforeSend` returns an Err the caller MUST return instead of sending,
 * or `null` to proceed. A recent successful round-trip skips the check
 * for 5 minutes.
 */
export function createReachabilityTracker({
  probe,
  now = () => Date.now(),
  successFreshMs = REACHABILITY_SUCCESS_FRESH_MS,
  downRecheckMs = REACHABILITY_DOWN_RECHECK_MS,
}: {
  probe?: ReachabilityProbe;
  now?: () => number;
  successFreshMs?: number;
  downRecheckMs?: number;
} = {}) {
  const memory: TrackerMemory = {
    lastSuccessAt: null,
    lastFailed: false,
    lastReason: null,
    lastCheckAt: null,
  };

  async function runCheck(): Promise<Result<never, string> | null> {
    memory.lastCheckAt = now();
    if (!probe) return null;

    const reason = await probe();
    if (reason === null) {
      noteUp();
      return null;
    }
    memory.lastFailed = true;
    memory.lastReason = reason;
    return Err(serializeUnreachable(reason));
  }

  /**
   * Decide whether this operation needs a reachability check.
   * Last check older than 5 minutes → check again (never treat hours-old
   * memory as "still down"). Recent success → skip. Last failure → check
   * (or skip during the short re-check pause so polls do not hammer).
   * No memory yet → the signed request itself is the check.
   */
  async function beforeSend(): Promise<Result<never, string> | null> {
    const t = now();
    const lastCheck = memory.lastCheckAt;
    const lastSuccess = memory.lastSuccessAt;

    if (lastCheck !== null && t - lastCheck >= successFreshMs) {
      return runCheck();
    }

    if (
      !memory.lastFailed &&
      lastSuccess !== null &&
      t - lastSuccess < successFreshMs
    ) {
      return null;
    }

    if (memory.lastFailed) {
      if (lastCheck !== null && t - lastCheck < downRecheckMs) {
        return Err(
          serializeUnreachable(memory.lastReason ?? UNREACHABLE_NYLON_DOWN),
        );
      }
      return runCheck();
    }

    if (lastSuccess === null) {
      return null;
    }

    return runCheck();
  }

  function noteDown(reason: UnreachableReason): void {
    memory.lastFailed = true;
    memory.lastReason = reason;
    memory.lastCheckAt = now();
  }

  function noteUp(): void {
    const t = now();
    memory.lastSuccessAt = t;
    memory.lastCheckAt = t;
    memory.lastFailed = false;
    memory.lastReason = null;
  }

  return { beforeSend, noteDown, noteUp };
}

export type ReachabilityTracker = ReturnType<typeof createReachabilityTracker>;
