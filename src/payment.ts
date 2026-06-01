/**
 * Payment instance with event emission for transaction lifecycle.
 * Handles polling, event emission, and wait-for-completion.
 *
 * @see Spec 2 section 2 - ".collectPayment() returns a payment instance that they have to listen for events on"
 * @see Spec 2 section 9 - "sdk on merchant side internally calls another action to our backend to get transaction status updates by polling"
 */

import type { Result } from "slang-ts";
import { createEmitter, type Emitter } from "./pubsub";
import { parseError } from "./transport";
import type {
  EventData,
  GetStatusInput,
  GetTransactionInput,
  PaymentEvent,
  PaymentEventHandler,
  PaymentInstance,
  StatusResponse,
  Transaction,
  TransactionStatus,
} from "./types";

/**
 * Internal state for a payment instance.
 * @internal
 */
type PaymentState = {
  reference: string;
  status: TransactionStatus | null;
  transaction: Transaction | null;
  pollingTimer: ReturnType<typeof setTimeout> | null;
  resolved: boolean;
  pollAttempts: number;
  pollStartTime: number;
  emitter: Emitter<PaymentEvent>;
  fetchStatus: (
    input: GetStatusInput,
  ) => Promise<Result<StatusResponse, string>>;
  fetchTransaction: (
    input: GetTransactionInput,
  ) => Promise<Result<Transaction, string>>;
  pollIntervalMs: number;
  maxPollDuration: number;
  maxPollAttempts: number;
};

/** Map transaction status to payment event. */
const STATUS_TO_EVENT: Partial<Record<TransactionStatus, PaymentEvent>> = {
  successful: "success",
  failed: "failed",
  processing: "processing",
  cancelled: "cancelled",
};

function statusToEvent(status: TransactionStatus): PaymentEvent | null {
  return STATUS_TO_EVENT[status] ?? null;
}

/** Terminal states that stop polling. */
const TERMINAL_STATES = new Set<TransactionStatus>([
  "successful",
  "failed",
  "cancelled",
]);

/**
 * Create a new payment instance.
 *
 * @param initialResponse - Response with reference and initial status
 * @param deps - Dependencies injected by the SDK
 * @returns Payment instance with event subscription
 *
 * @internal
 */
export function createPaymentInstance(
  initialResponse: { reference: string; status: TransactionStatus },
  deps: {
    fetchStatus: (
      input: GetStatusInput,
    ) => Promise<Result<StatusResponse, string>>;
    fetchTransaction: (
      input: GetTransactionInput,
    ) => Promise<Result<Transaction, string>>;
    pollIntervalMs?: number;
    maxPollDuration?: number;
    maxPollAttempts?: number;
  },
): PaymentInstance {
  const state: PaymentState = {
    reference: initialResponse.reference,
    status: initialResponse.status,
    transaction: null,
    pollingTimer: null,
    resolved: false,
    pollAttempts: 0,
    pollStartTime: Date.now(),
    emitter: createEmitter<PaymentEvent>(),
    fetchStatus: deps.fetchStatus,
    fetchTransaction: deps.fetchTransaction,
    pollIntervalMs: deps.pollIntervalMs ?? 2000,
    maxPollDuration: deps.maxPollDuration ?? 300000,
    maxPollAttempts: deps.maxPollAttempts ?? 150,
  };

  function resolveWithError(error: string): void {
    state.resolved = true;
    stopPolling();
    emitEvent("error", parseError(error).message);
  }

  /**
   * Emit an event with current transaction data.
   * @internal
   */
  function emitEvent(event: PaymentEvent, error?: string): void {
    const data: EventData = {
      event,
      transaction: state.transaction ?? undefined,
      error,
      timestamp: new Date().toISOString(),
    };
    state.emitter.emit(event, data);
  }

  /**
   * Handle terminal state by fetching full transaction record.
   * @internal
   */
  async function handleTerminalState(status: TransactionStatus): Promise<void> {
    const txResult = await state.fetchTransaction({
      reference: state.reference,
    });
    if (txResult.isOk) {
      state.transaction = txResult.value;
      const event = statusToEvent(status);
      if (event) {
        emitEvent(event);
      }
    } else {
      emitEvent("error", `Failed to fetch transaction: ${txResult.error}`);
    }
    state.resolved = true;
    stopPolling();
  }

  /**
   * Handle a status response from polling.
   * @internal
   */
  async function handleStatusUpdate(response: StatusResponse): Promise<void> {
    if (response.reference !== state.reference) {
      resolveWithError(
        `Reference mismatch: expected ${state.reference} but got ${response.reference}`,
      );
      return;
    }

    const newStatus = response.status;
    const oldStatus = state.status;

    state.status = newStatus;

    if (newStatus !== oldStatus) {
      const event = statusToEvent(newStatus);
      if (event) {
        if (TERMINAL_STATES.has(newStatus)) {
          await handleTerminalState(newStatus);
          return;
        }
        emitEvent(event);
      }
    }
  }

  /**
   * Handle polling error.
   * "Not found" during early polling is expected; other errors stop polling.
   * @internal
   */
  function handlePollError(error: string): void {
    const isNotFound =
      error.includes("not found") || error.includes("NOT_FOUND");
    if (isNotFound) {
      return;
    }
    emitEvent("error", parseError(error).message);
    state.resolved = true;
    stopPolling();
  }

  /**
   * Schedule the next poll tick.
   * Uses a single timeout so the next request only starts after the current one finishes.
   * @internal
   */
  function scheduleNextPoll(): void {
    if (state.resolved || state.pollingTimer) {
      return;
    }

    state.pollingTimer = setTimeout(() => {
      state.pollingTimer = null;
      void pollStatus();
    }, state.pollIntervalMs);
  }

  /**
   * Execute one polling cycle and queue the next one when appropriate.
   * @internal
   */
  async function pollStatus(): Promise<void> {
    if (state.resolved) {
      stopPolling();
      return;
    }

    if (state.pollAttempts >= state.maxPollAttempts) {
      resolveWithError("Polling timeout: exceeded maximum attempts");
      return;
    }

    if (Date.now() - state.pollStartTime >= state.maxPollDuration) {
      resolveWithError("Polling timeout: exceeded maximum duration");
      return;
    }

    state.pollAttempts += 1;

    const result = await state.fetchStatus({ reference: state.reference });

    if (result.isOk) {
      await handleStatusUpdate(result.value);
    } else {
      handlePollError(result.error);
    }

    if (state.resolved) {
      stopPolling();
      return;
    }

    scheduleNextPoll();
  }

  /**
   * Start polling for status updates.
   * @internal
   */
  function startPolling(): void {
    scheduleNextPoll();
  }

  /**
   * Stop polling.
   * @internal
   */
  function stopPolling(): void {
    if (state.pollingTimer) {
      clearTimeout(state.pollingTimer);
      state.pollingTimer = null;
    }
  }

  /**
   * Subscribe to payment events.
   */
  function on(
    event: PaymentEvent,
    handler: PaymentEventHandler,
  ): PaymentInstance {
    state.emitter.on(event, handler as (data: unknown) => void);
    return paymentInstance;
  }

  /**
   * Unsubscribe from payment events.
   */
  function off(
    event: PaymentEvent,
    handler: PaymentEventHandler,
  ): PaymentInstance {
    state.emitter.off(event, handler as (data: unknown) => void);
    return paymentInstance;
  }

  /**
   * Subscribe to a payment event for a single invocation, then auto-unsubscribe.
   * Useful for one-shot handlers on terminal events like "success" or "failed".
   */
  function once(
    event: PaymentEvent,
    handler: PaymentEventHandler,
  ): PaymentInstance {
    state.emitter.once(event, handler as (data: unknown) => void);
    return paymentInstance;
  }

  /**
   * Wait for payment to reach a terminal state.
   * Resolves on success, rejects on failure/cancel/error.
   */
  function wait(): Promise<Transaction> {
    return new Promise((resolve, reject) => {
      if (state.resolved) {
        if (state.status === "successful" && state.transaction) {
          resolve(state.transaction);
        } else {
          reject(new Error(`Payment ${state.status ?? "error"}`));
        }
        return;
      }

      function onSuccess(): void {
        cleanup();
        if (state.transaction) {
          resolve(state.transaction);
        } else {
          reject(
            new Error("Payment successful but transaction data unavailable"),
          );
        }
      }

      function onFailed(): void {
        cleanup();
        reject(new Error("Payment failed"));
      }

      function onCancelled(): void {
        cleanup();
        reject(new Error("Payment cancelled"));
      }

      function onError(data: unknown): void {
        cleanup();
        const eventData = data as EventData;
        reject(new Error(eventData.error ?? "Payment error"));
      }

      function cleanup(): void {
        state.emitter.off("success", onSuccess);
        state.emitter.off("failed", onFailed);
        state.emitter.off("cancelled", onCancelled);
        state.emitter.off("error", onError);
      }

      state.emitter.on("success", onSuccess);
      state.emitter.on("failed", onFailed);
      state.emitter.on("cancelled", onCancelled);
      state.emitter.on("error", onError);
    });
  }

  const paymentInstance: PaymentInstance = {
    get reference() {
      return state.reference;
    },
    get status() {
      return state.status;
    },
    on,
    once,
    off,
    wait,
  };

  startPolling();

  return paymentInstance;
}
