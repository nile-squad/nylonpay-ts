import { Err, Ok } from "slang-ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPaymentInstance } from "./payment";
import type { PaymentEventHandler, Transaction } from "./types";

const mockTransaction: Transaction = {
  id: "txn-123",
  reference: "test-ref",
  amount: 1000,
  currency: "UGX",
  status: "successful",
  type: "collection",
  method: "mobileMoney",
  description: "Test payment",
  phone: "+256700000000",
  email: null,
  failureReason: null,
  metadata: {},
  mode: "test",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:01Z",
};

function createMockDeps() {
  return {
    fetchStatus: vi.fn(),
    fetchTransaction: vi.fn(),
    pollIntervalMs: 10,
    maxPollAttempts: 10,
    maxPollDuration: 1000,
  };
}

describe("createPaymentInstance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Pin poll jitter to 0 so the deterministic timing tests advance by exactly
    // pollIntervalMs. The dedicated "poll jitter" test overrides this.
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("event emission", () => {
    it("emits processing event when status changes to processing", async () => {
      const handler = vi.fn();
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "processing",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );
      instance.on("processing", handler);

      await vi.advanceTimersByTimeAsync(10);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("emits success event when status changes to successful", async () => {
      const handler = vi.fn();
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "successful",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );
      deps.fetchTransaction.mockResolvedValue(Ok(mockTransaction));

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );
      instance.on("success", handler);

      await vi.advanceTimersByTimeAsync(10);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("emits failed event when status changes to failed", async () => {
      const handler = vi.fn();
      const deps = createMockDeps();
      const failedTx = { ...mockTransaction, status: "failed" as const };
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "failed",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );
      deps.fetchTransaction.mockResolvedValue(Ok(failedTx));

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );
      instance.on("failed", handler);

      await vi.advanceTimersByTimeAsync(10);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("emits cancelled event when status changes to cancelled", async () => {
      const handler = vi.fn();
      const deps = createMockDeps();
      const cancelledTx = { ...mockTransaction, status: "cancelled" as const };
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "cancelled",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );
      deps.fetchTransaction.mockResolvedValue(Ok(cancelledTx));

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );
      instance.on("cancelled", handler);

      await vi.advanceTimersByTimeAsync(10);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("emits processing for the initial pending status without a status change", async () => {
      const handler = vi.fn();
      const deps = createMockDeps();
      // Backend keeps reporting "pending" — previously no event ever fired.
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "pending",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );
      instance.on("processing", handler);

      await vi.advanceTimersByTimeAsync(0);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ event: "processing", reference: "test-ref" }),
      );

      // Subsequent pending polls must not re-fire it.
      await vi.advanceTimersByTimeAsync(30);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("fires processing then success when the payment resolves between polls", async () => {
      const events: string[] = [];
      const deps = createMockDeps();
      // First poll already terminal — the pending → successful jump that
      // previously swallowed the "processing" lifecycle event.
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "successful",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );
      deps.fetchTransaction.mockResolvedValue(Ok(mockTransaction));

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );
      instance.on("processing", () => events.push("processing"));
      instance.on("success", () => events.push("success"));

      await vi.advanceTimersByTimeAsync(10);

      expect(events).toEqual(["processing", "success"]);
    });

    it("does not re-fire processing when status moves pending to processing", async () => {
      const handler = vi.fn();
      const deps = createMockDeps();
      deps.fetchStatus
        .mockResolvedValueOnce(
          Ok({
            reference: "test-ref",
            status: "pending",
            amount: 1000,
            currency: "UGX",
            updatedAt: "2024-01-01T00:00:01Z",
          }),
        )
        .mockResolvedValue(
          Ok({
            reference: "test-ref",
            status: "processing",
            amount: 1000,
            currency: "UGX",
            updatedAt: "2024-01-01T00:00:02Z",
          }),
        );

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );
      instance.on("processing", handler);

      await vi.advanceTimersByTimeAsync(30);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("includes the reference on every event payload", async () => {
      const handler = vi.fn();
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "successful",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );
      deps.fetchTransaction.mockResolvedValue(Ok(mockTransaction));

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );
      instance.on("success", handler);

      await vi.advanceTimersByTimeAsync(10);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ event: "success", reference: "test-ref" }),
      );
    });

    it("emits error event on polling error", async () => {
      const handler = vi.fn();
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(Err("Network failure"));

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );
      instance.on("error", handler);

      await vi.advanceTimersByTimeAsync(10);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("polling behavior", () => {
    it("starts polling after creation", async () => {
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "processing",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );

      createPaymentInstance({ reference: "test-ref", status: "pending" }, deps);

      expect(deps.fetchStatus).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(10);
      expect(deps.fetchStatus).toHaveBeenCalledTimes(1);
    });

    it("stops polling on terminal state", async () => {
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "successful",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );
      deps.fetchTransaction.mockResolvedValue(Ok(mockTransaction));

      createPaymentInstance({ reference: "test-ref", status: "pending" }, deps);

      await vi.advanceTimersByTimeAsync(10);
      expect(deps.fetchStatus).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(deps.fetchStatus).toHaveBeenCalledTimes(1);
    });

    it("stops polling on max attempts exceeded", async () => {
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "processing",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );

      createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        { ...deps, maxPollAttempts: 1 },
      );

      await vi.advanceTimersByTimeAsync(10);
      expect(deps.fetchStatus).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(deps.fetchStatus).toHaveBeenCalledTimes(1);
    });

    it("stops polling on max duration exceeded", async () => {
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "processing",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );

      const handler = vi.fn();
      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        { ...deps, maxPollDuration: 5 },
      );
      instance.on("error", handler);

      // Advance past the maxPollDuration (5ms) before the first poll fires (10ms interval)
      await vi.advanceTimersByTimeAsync(10);

      // Duration exceeded before first poll, so fetchStatus should not be called
      expect(deps.fetchStatus).toHaveBeenCalledTimes(0);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].error).toContain(
        "exceeded maximum duration",
      );

      // No further polling
      await vi.advanceTimersByTimeAsync(100);
      expect(deps.fetchStatus).toHaveBeenCalledTimes(0);
    });

    it("emits error and stops polling on reference mismatch", async () => {
      const handler = vi.fn();
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "wrong-ref",
          status: "successful",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );
      instance.on("error", handler);

      await vi.advanceTimersByTimeAsync(10);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].error).toContain("Reference mismatch");
    });

    it("tolerates not found errors during early polling", async () => {
      const handler = vi.fn();
      const deps = createMockDeps();
      deps.fetchStatus
        .mockResolvedValueOnce(
          Err('{"category":"not_found","message":"Transaction not found"}'),
        )
        .mockResolvedValueOnce(
          Ok({
            reference: "test-ref",
            status: "successful",
            amount: 1000,
            currency: "UGX",
            updatedAt: "2024-01-01T00:00:01Z",
          }),
        );
      deps.fetchTransaction.mockResolvedValue(Ok(mockTransaction));

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );
      instance.on("error", handler);

      await vi.advanceTimersByTimeAsync(10);
      expect(deps.fetchStatus).toHaveBeenCalledTimes(1);
      expect(handler).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(10);
      expect(deps.fetchStatus).toHaveBeenCalledTimes(2);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("wait()", () => {
    it("resolves with Transaction on success", async () => {
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "successful",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );
      deps.fetchTransaction.mockResolvedValue(Ok(mockTransaction));

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );

      const waitPromise = instance.wait();
      await vi.advanceTimersByTimeAsync(10);

      const result = await waitPromise;
      expect(result.status).toBe("successful");
    });

    it("resolves null on failure", async () => {
      const deps = createMockDeps();
      const failedTx = { ...mockTransaction, status: "failed" as const };
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "failed",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );
      deps.fetchTransaction.mockResolvedValue(Ok(failedTx));

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );

      const waitPromise = instance.wait();
      await vi.advanceTimersByTimeAsync(10);
      expect(await waitPromise).toBeNull();
    });

    it("resolves null on cancellation", async () => {
      const deps = createMockDeps();
      const cancelledTx = {
        ...mockTransaction,
        status: "cancelled" as const,
      };
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "cancelled",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );
      deps.fetchTransaction.mockResolvedValue(Ok(cancelledTx));

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );

      const waitPromise = instance.wait();
      await vi.advanceTimersByTimeAsync(10);
      expect(await waitPromise).toBeNull();
    });

    it("resolves null on error", async () => {
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(Err("Network failure"));

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );

      const waitPromise = instance.wait();
      await vi.advanceTimersByTimeAsync(10);
      expect(await waitPromise).toBeNull();
    });

    it("works when called after terminal state already reached", async () => {
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "successful",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );
      deps.fetchTransaction.mockResolvedValue(Ok(mockTransaction));

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );

      await vi.advanceTimersByTimeAsync(10);
      expect(instance.status).toBe("successful");

      const result = await instance.wait();
      expect(result.status).toBe("successful");
    });
  });

  describe("on/once/off", () => {
    it("on registers handler that fires on every status change", async () => {
      const deps = createMockDeps();
      // First poll: pending → processing (fires "processing" event)
      // Second poll: processing → successful (fires "success" event, not "processing")
      deps.fetchStatus
        .mockResolvedValueOnce(
          Ok({
            reference: "test-ref",
            status: "processing",
            amount: 1000,
            currency: "UGX",
            updatedAt: "2024-01-01T00:00:01Z",
          }),
        )
        .mockResolvedValueOnce(
          Ok({
            reference: "test-ref",
            status: "successful",
            amount: 1000,
            currency: "UGX",
            updatedAt: "2024-01-01T00:00:02Z",
          }),
        );
      deps.fetchTransaction.mockResolvedValue(Ok(mockTransaction));

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );

      const processingHandler = vi.fn();
      const successHandler = vi.fn();
      instance.on("processing", processingHandler);
      instance.on("success", successHandler);

      await vi.advanceTimersByTimeAsync(10);
      expect(processingHandler).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(10);
      expect(successHandler).toHaveBeenCalledTimes(1);
    });

    it("once registers handler that fires at most once", async () => {
      const handler = vi.fn();
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "processing",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );
      instance.once("processing", handler);

      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(10);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("off removes handler", async () => {
      const handler = vi.fn();
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "processing",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );
      instance.on("processing", handler);
      instance.off("processing", handler);

      await vi.advanceTimersByTimeAsync(10);

      expect(handler).not.toHaveBeenCalled();
    });

    it("calling off for non-existent handler does not throw", () => {
      const handler = vi.fn() as PaymentEventHandler;
      const deps = createMockDeps();

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );

      expect(() => instance.off("success", handler)).not.toThrow();
    });
  });

  describe("resolved guard", () => {
    const status = (s: string) => ({
      reference: "test-ref",
      status: s,
      amount: 1000,
      currency: "UGX",
      updatedAt: "2024-01-01T00:00:01Z",
    });

    it("stops polling and emits no further events after a terminal status", async () => {
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(Ok(status("successful")));
      deps.fetchTransaction.mockResolvedValue(Ok(mockTransaction));
      const success = vi.fn();
      const processing = vi.fn();

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );
      instance.on("success", success);
      instance.on("processing", processing);

      await vi.advanceTimersByTimeAsync(10);
      // The initial in-flight emission fires once before the poll resolves.
      expect(processing).toHaveBeenCalledTimes(1);
      expect(success).toHaveBeenCalledTimes(1);

      // Once resolved, the poll timer is cleared. Advancing well past several
      // poll intervals must not fire another fetch or a duplicate/spurious event.
      deps.fetchStatus.mockResolvedValue(Ok(status("processing")));
      await vi.advanceTimersByTimeAsync(1000);

      expect(success).toHaveBeenCalledTimes(1);
      expect(processing).toHaveBeenCalledTimes(1);
      expect(deps.fetchTransaction).toHaveBeenCalledTimes(1);
      expect(deps.fetchStatus).toHaveBeenCalledTimes(1);
    });

    it("does not re-fire a terminal event when the same status repeats", async () => {
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(Ok(status("successful")));
      deps.fetchTransaction.mockResolvedValue(Ok(mockTransaction));
      const success = vi.fn();

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );
      instance.on("success", success);

      await vi.advanceTimersByTimeAsync(1000);

      expect(success).toHaveBeenCalledTimes(1);
    });
  });

  describe("poll jitter", () => {
    it("spreads consecutive polls by adding random jitter to the interval", async () => {
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "processing",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
        }),
      );
      vi.spyOn(Math, "random").mockReturnValue(0.5);

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );
      instance.on("processing", vi.fn());

      // pollIntervalMs (10) + 0.5 * POLL_JITTER_MS (250) = 135ms before the first
      // poll fires. Advancing only the base interval must not be enough.
      await vi.advanceTimersByTimeAsync(10);
      expect(deps.fetchStatus).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(125);
      expect(deps.fetchStatus).toHaveBeenCalledTimes(1);
    });
  });
});
