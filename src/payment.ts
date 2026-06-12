/**
 * Payment instance with event emission for transaction lifecycle.
 * Handles polling, event emission, and wait-for-completion.
 *
 * @see Spec 2 section 2 - ".collectPayment() returns a payment instance that they have to listen for events on"
 * @see Spec 2 section 9 - "sdk on merchant side internally calls another action to our backend to get transaction status updates by polling"
 */

import type { Result } from "slang-ts";
import { createEmitter, type Emitter } from "./pubsub";
import { POLL_JITTER_MS } from "./sdk.config";
import { parseError } from "./transport";
import type {
  EventData,
  GetStatusInput,
  GetTransactionInput,
  PaymentEvent,
  PaymentEventHandler,
  PaymentInstance,
  SdkError,
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
  status: TransactionStatus;
  transaction: Transaction | null;
  pollingTimer: ReturnType<typeof setTimeout> | null;
  /** Last lifecycle event emitted from a status (dedupes repeat emissions). */
  lastStatusEvent: PaymentEvent | null;
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

/**
 * Map transaction status to payment event. Both "pending" and "processing"
 * map to the "processing" event — to the merchant they are the same lifecycle
 * moment (payment accepted, in flight, awaiting the customer/provider).
 * Emission is deduped by event, so pending → processing never double-fires.
 */
const STATUS_TO_EVENT: Partial<Record<TransactionStatus, PaymentEvent>> = {
  pending: "processing",
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
 * Normalise raw backend status strings to TransactionStatus.
 * The backend may return "completed" for successful payments — map it to
 * "successful" so SDK events fire correctly.
 */
function normalizeStatus(raw: string): TransactionStatus {
  if (raw === "completed") return "successful";
  return raw as TransactionStatus;
}

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
    /**
     * When set, the operation never started (the backend rejected initiation).
     * The instance emits this as an `"error"` event on the next tick instead of
     * polling — so a server-side rejection surfaces as an event, not a throw.
     */
    initialError?: SdkError;
  },
): PaymentInstance {
  const state: PaymentState = {
    reference: initialResponse.reference,
    status: normalizeStatus(initialResponse.status),
    transaction: null,
    pollingTimer: null,
    lastStatusEvent: null,
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
    stopUpdates();
    emitEvent("error", parseError(error).message);
  }

  /**
   * Emit an event with current transaction data.
   * @internal
   */
  function emitEvent(
    event: PaymentEvent,
    error?: string,
    category?: SdkError["category"],
    retryable?: boolean,
  ): void {
    const data: EventData = {
      event,
      reference: state.reference,
      transaction: state.transaction ?? undefined,
      error,
      category,
      retryable,
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
        const error =
          status === "failed"
            ? (state.transaction.failureReason ?? undefined)
            : undefined;
        emitEvent(event, error);
      }
    } else {
      emitEvent("error", `Failed to fetch transaction: ${txResult.error}`);
    }
    state.resolved = true;
    stopUpdates();
  }

  /**
   * Handle a status response from polling.
   * @internal
   */
  async function handleStatusUpdate(response: StatusResponse): Promise<void> {
    // Once the instance has resolved (terminal state, error, or timeout), no
    // further events may fire. A late status — e.g. an SSE chunk buffered before
    // the stream closed on fallback, or an in-flight poll — must be ignored so
    // it cannot emit a duplicate terminal event or a spurious out-of-order one.
    // The guard runs before any await, so the first caller to resolve wins.
    if (state.resolved) {
      return;
    }

    if (response.reference !== state.reference) {
      resolveWithError(
        `Reference mismatch: expected ${state.reference} but got ${response.reference}`,
      );
      return;
    }

    const newStatus = normalizeStatus(response.status);
    state.status = newStatus;

    // Dedupe by *event*, not raw status — "pending" and "processing" both map
    // to the "processing" event, and a status flap (processing → pending) must
    // not re-fire it. Each lifecycle event fires at most once per instance.
    const event = statusToEvent(newStatus);
    if (!event || event === state.lastStatusEvent) {
      return;
    }
    state.lastStatusEvent = event;

    if (TERMINAL_STATES.has(newStatus)) {
      await handleTerminalState(newStatus);
      return;
    }
    emitEvent(event);
  }

  /**
   * Handle polling error.
   * A `not_found` category during early polling is expected (the transaction
   * may not have propagated yet) — keep polling. Any other category is a real
   * failure that stops polling.
   * @internal
   */
  function handlePollError(error: string): void {
    const parsed = parseError(error);
    if (parsed.category === "not_found") {
      return;
    }
    emitEvent("error", parsed.message);
    state.resolved = true;
    stopUpdates();
  }

  /**
   * Schedule the next poll tick.
   * Uses a single timeout so the next request only starts after the current one
   * finishes (no overlap). A random jitter is added to the interval so many
   * concurrent payments don't synchronise into a thundering herd on the status
   * endpoint.
   * @internal
   */
  function scheduleNextPoll(): void {
    if (state.resolved || state.pollingTimer) {
      return;
    }

    const delay = state.pollIntervalMs + Math.random() * POLL_JITTER_MS;
    state.pollingTimer = setTimeout(() => {
      state.pollingTimer = null;
      void pollStatus();
    }, delay);
  }

  /**
   * Execute one polling cycle and queue the next one when appropriate.
   * @internal
   */
  async function pollStatus(): Promise<void> {
    if (state.resolved) {
      stopUpdates();
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
      stopUpdates();
      return;
    }

    scheduleNextPoll();
  }

  /**
   * Start status updates. If the initial status is already terminal (e.g. sandbox
   * resolves synchronously), emit the terminal event after a tick so handlers
   * registered after instance creation still fire. Otherwise emit the initial
   * in-flight event ("processing") on the next tick — the initiation response
   * is typically "pending", and a fast payment can jump straight to a terminal
   * status between polls, which previously meant "processing" never fired —
   * then begin polling.
   * @internal
   */
  function startUpdates(): void {
    if (TERMINAL_STATES.has(state.status)) {
      setTimeout(() => {
        void handleTerminalState(state.status);
      }, 0);
      return;
    }

    const initialEvent = statusToEvent(state.status);
    if (initialEvent) {
      // Mark as emitted synchronously so a poll result mapping to the same
      // event cannot race a duplicate in before the timeout fires.
      state.lastStatusEvent = initialEvent;
      setTimeout(() => {
        if (!state.resolved) {
          emitEvent(initialEvent);
        }
      }, 0);
    }
    scheduleNextPoll();
  }

  /**
   * Stop all status updates (the poll timer).
   * @internal
   */
  function stopUpdates(): void {
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
   * Resolves with the full Transaction on success, null on failure/cancel/error.
   * Never rejects — check the return value to determine outcome.
   */
  function wait(): Promise<Transaction | null> {
    return new Promise((resolve) => {
      if (state.resolved) {
        resolve(
          state.status === "successful" && state.transaction
            ? state.transaction
            : null,
        );
        return;
      }

      function onSuccess(): void {
        cleanup();
        resolve(state.transaction ?? null);
      }

      function onFailed(): void {
        cleanup();
        resolve(null);
      }

      function onCancelled(): void {
        cleanup();
        resolve(null);
      }

      function onError(): void {
        cleanup();
        resolve(null);
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

  // When the backend rejected initiation, there is nothing to poll.
  // Emit an "error" event on the next tick so handlers registered after
  // creation still fire, and mark resolved so wait() returns null.
  if (deps.initialError) {
    state.resolved = true;
    const err = deps.initialError;
    setTimeout(() => {
      emitEvent("error", err.message, err.category, err.retryable);
    }, 0);
  } else {
    startUpdates();
  }

  return paymentInstance;
}
