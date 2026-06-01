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
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
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
        .mockResolvedValueOnce(Err("Transaction not found"))
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

    it("rejects on failure", async () => {
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
      // Attach rejection handler before advancing timers to avoid unhandled rejection
      const rejection = expect(waitPromise).rejects.toThrow("Payment failed");
      await vi.advanceTimersByTimeAsync(10);
      await rejection;
    });

    it("rejects on cancellation", async () => {
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
      const rejection =
        expect(waitPromise).rejects.toThrow("Payment cancelled");
      await vi.advanceTimersByTimeAsync(10);
      await rejection;
    });

    it("rejects on error", async () => {
      const deps = createMockDeps();
      deps.fetchStatus.mockResolvedValue(Err("Network failure"));

      const instance = createPaymentInstance(
        { reference: "test-ref", status: "pending" },
        deps,
      );

      const waitPromise = instance.wait();
      const rejection = expect(waitPromise).rejects.toThrow("Network failure");
      await vi.advanceTimersByTimeAsync(10);
      await rejection;
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
});
