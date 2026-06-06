/**
 * Payment instance with event emission for transaction lifecycle.
 * Handles polling, event emission, and wait-for-completion.
 *
 * @see Spec 2 section 2 - ".collectPayment() returns a payment instance that they have to listen for events on"
 * @see Spec 2 section 9 - "sdk on merchant side internally calls another action to our backend to get transaction status updates by polling"
 */

import type { Result } from "slang-ts";
import { createEmitter, type Emitter } from "./pubsub";
import { MAX_STREAM_RECONNECTS } from "./sdk.config";
import {
  parseError,
  type StreamCallbacks,
  type StreamHandle,
} from "./transport";
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

/** Opens an SSE status stream; injected so tests can drive it without a network. */
type OpenStream = (
  input: { reference: string } & StreamCallbacks,
) => StreamHandle;

/**
 * Internal state for a payment instance.
 * @internal
 */
type PaymentState = {
  reference: string;
  status: TransactionStatus;
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
  streaming: boolean;
  openStream?: OpenStream;
  streamHandle: StreamHandle | null;
  streamReconnects: number;
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
    streaming?: boolean;
    openStream?: OpenStream;
  },
): PaymentInstance {
  const state: PaymentState = {
    reference: initialResponse.reference,
    status: normalizeStatus(initialResponse.status),
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
    streaming: deps.streaming ?? false,
    openStream: deps.openStream,
    streamHandle: null,
    streamReconnects: 0,
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
    if (response.reference !== state.reference) {
      resolveWithError(
        `Reference mismatch: expected ${state.reference} but got ${response.reference}`,
      );
      return;
    }

    const newStatus = normalizeStatus(response.status);
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
   * Close the status stream if one is open.
   * @internal
   */
  function closeStream(): void {
    if (state.streamHandle) {
      state.streamHandle.close();
      state.streamHandle = null;
    }
  }

  /**
   * Open the SSE status stream. Each streamed status drives the same handler a
   * poll result would; a stream failure reconnects with jittered backoff, then
   * falls back to polling.
   * @internal
   */
  function startStream(): void {
    if (state.resolved || !state.openStream) {
      return;
    }
    state.streamHandle = state.openStream({
      reference: state.reference,
      onStatus: (status) => {
        void handleStatusUpdate(status);
      },
      onError: () => handleStreamFailure(),
      onClose: () => handleStreamFailure(),
    });
  }

  /**
   * Handle a stream drop/failure: reconnect a bounded number of times with
   * jittered backoff, then fall back to polling for the rest of the lifecycle.
   * @internal
   */
  function handleStreamFailure(): void {
    closeStream();
    if (state.resolved) {
      return;
    }
    if (state.streamReconnects < MAX_STREAM_RECONNECTS) {
      state.streamReconnects += 1;
      const backoff =
        500 * 2 ** (state.streamReconnects - 1) + Math.random() * 250;
      setTimeout(() => {
        if (!state.resolved) {
          startStream();
        }
      }, backoff);
      return;
    }
    scheduleNextPoll();
  }

  /**
   * Start status updates. If the initial status is already terminal (e.g. sandbox
   * resolves synchronously), emit the terminal event after a tick so handlers
   * registered after instance creation still fire. Otherwise prefer the SSE
   * stream, falling back to polling when streaming is disabled.
   * @internal
   */
  function startUpdates(): void {
    if (TERMINAL_STATES.has(state.status)) {
      setTimeout(() => {
        void handleTerminalState(state.status);
      }, 0);
      return;
    }
    if (state.streaming && state.openStream) {
      startStream();
      return;
    }
    scheduleNextPoll();
  }

  /**
   * Stop all status updates (poll timer and stream).
   * @internal
   */
  function stopUpdates(): void {
    if (state.pollingTimer) {
      clearTimeout(state.pollingTimer);
      state.pollingTimer = null;
    }
    closeStream();
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

  startUpdates();

  return paymentInstance;
}
