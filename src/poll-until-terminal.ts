/**
 * Polls check-payment-status until terminal or merchant caps / onDelayed return.
 * Used by wait() continuation and *AndResolve when the server returns pending.
 */

import { Err, Ok, type Result } from "slang-ts";
import { POLL_JITTER_MS } from "./sdk.config";
import {
  isTerminalTransactionStatus,
  resolvePollIntervalMs,
} from "./poll-interval";
import { parseError } from "./transport";
import type {
  GetStatusInput,
  GetTransactionInput,
  OnDelayedBehavior,
  StatusResponse,
  Transaction,
} from "./types";

export type PollUntilTerminalDeps = {
  fetchStatus: (
    input: GetStatusInput,
  ) => Promise<Result<StatusResponse, string>>;
  fetchTransaction: (
    input: GetTransactionInput,
  ) => Promise<Result<Transaction, string>>;
  maxPollAttempts?: number;
  maxPollDurationMs?: number;
  onDelayed?: OnDelayedBehavior;
  pollIntervalMs: number;
  reference: string;
};

const TIMEOUT_MESSAGE =
  "Timed out waiting for the transaction status to update";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Blocks until the payment reaches a terminal status, a merchant cap fires,
 * or onDelayed returns the still-pending payment.
 */
export async function pollUntilTerminal(
  deps: PollUntilTerminalDeps,
): Promise<Result<Transaction, string>> {
  const pollStartTime = Date.now();
  let attempts = 0;

  while (true) {
    if (
      deps.maxPollAttempts !== undefined &&
      attempts >= deps.maxPollAttempts
    ) {
      return Err(TIMEOUT_MESSAGE);
    }
    if (
      deps.maxPollDurationMs !== undefined &&
      Date.now() - pollStartTime >= deps.maxPollDurationMs
    ) {
      return Err(TIMEOUT_MESSAGE);
    }

    attempts += 1;
    const statusResult = await deps.fetchStatus({ reference: deps.reference });
    if (statusResult.isErr) {
      const parsed = parseError(statusResult.error);
      if (parsed.category === "not_found") {
        await sleep(deps.pollIntervalMs);
        continue;
      }
      return Err(parsed.message);
    }

    const status = statusResult.value;
    if (isTerminalTransactionStatus(status.status)) {
      const tx = await deps.fetchTransaction({ reference: deps.reference });
      if (tx.isOk) {
        return Ok(tx.value);
      }
      return Err(tx.error);
    }

    if (status.delayed && deps.onDelayed === "return") {
      const tx = await deps.fetchTransaction({ reference: deps.reference });
      if (tx.isOk) {
        return Ok(tx.value);
      }
      return Err(tx.error);
    }

    const interval = resolvePollIntervalMs({
      baseIntervalMs: deps.pollIntervalMs,
      pollStartTimeMs: pollStartTime,
    });
    await sleep(interval + Math.random() * POLL_JITTER_MS);
  }
}
