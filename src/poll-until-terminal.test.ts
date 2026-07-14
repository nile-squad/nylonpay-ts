import { Ok } from "slang-ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pollUntilTerminal } from "./poll-until-terminal";
import type { Transaction } from "./types";

const pendingTx: Transaction = {
  id: "txn-123",
  reference: "test-ref",
  amount: 1000,
  currency: "UGX",
  status: "pending",
  type: "collection",
  method: "mobileMoney",
  description: "Test",
  phone: "+256700000000",
  email: null,
  failureReason: null,
  metadata: {},
  mode: "test",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:01Z",
  delayed: true,
};

const successfulTx: Transaction = {
  ...pendingTx,
  status: "successful",
  delayed: undefined,
};

describe("pollUntilTerminal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("polls until terminal when no caps are set", async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce(
        Ok({
          reference: "test-ref",
          status: "pending",
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
    const fetchTransaction = vi.fn().mockResolvedValue(Ok(successfulTx));

    const resultPromise = pollUntilTerminal({
      fetchStatus,
      fetchTransaction,
      pollIntervalMs: 10,
      reference: "test-ref",
    });

    await vi.advanceTimersByTimeAsync(10);
    const result = await resultPromise;

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.status).toBe("successful");
    }
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it("returns pending transaction when delayed and onDelayed is return", async () => {
    const fetchStatus = vi.fn().mockResolvedValue(
      Ok({
        reference: "test-ref",
        status: "pending",
        amount: 1000,
        currency: "UGX",
        updatedAt: "2024-01-01T00:00:01Z",
        delayed: true,
      }),
    );
    const fetchTransaction = vi.fn().mockResolvedValue(Ok(pendingTx));

    const result = await pollUntilTerminal({
      fetchStatus,
      fetchTransaction,
      onDelayed: "return",
      pollIntervalMs: 10,
      reference: "test-ref",
    });

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.status).toBe("pending");
      expect(result.value.delayed).toBe(true);
    }
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it("keeps polling when delayed and onDelayed is wait", async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce(
        Ok({
          reference: "test-ref",
          status: "pending",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:01Z",
          delayed: true,
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
    const fetchTransaction = vi.fn().mockResolvedValue(Ok(successfulTx));

    const resultPromise = pollUntilTerminal({
      fetchStatus,
      fetchTransaction,
      onDelayed: "wait",
      pollIntervalMs: 10,
      reference: "test-ref",
    });

    await vi.advanceTimersByTimeAsync(10);
    const result = await resultPromise;

    expect(result.isOk).toBe(true);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it("times out when merchant caps are set", async () => {
    const fetchStatus = vi.fn().mockResolvedValue(
      Ok({
        reference: "test-ref",
        status: "pending",
        amount: 1000,
        currency: "UGX",
        updatedAt: "2024-01-01T00:00:01Z",
      }),
    );
    const fetchTransaction = vi.fn();

    const result = await pollUntilTerminal({
      fetchStatus,
      fetchTransaction,
      maxPollAttempts: 0,
      pollIntervalMs: 10,
      reference: "test-ref",
    });

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("Timed out waiting");
    }
    expect(fetchStatus).not.toHaveBeenCalled();
    expect(fetchTransaction).not.toHaveBeenCalled();
  });
});
