import { describe, expect, it } from "vitest";
import { createTestSdk, TEST_PHONE } from "./setup.js";

// Unique amounts per run avoid the backend's duplicate-payment cache.
const RUN_AMOUNT = 1000 + (Date.now() % 8000);

const TERMINAL = ["successful", "failed", "cancelled"];

describe("status updates", () => {
  it("I19: a polling collection reaches a terminal state via wait()", async () => {
    const sdk = createTestSdk();
    const payment = await sdk.collectPayment({
      amount: RUN_AMOUNT + 5,
      currency: "UGX",
      customer: { name: "Integration Test", phoneNumber: TEST_PHONE },
      description: "Polling wait test",
    });

    // wait() resolves a Transaction on success, null on failure/cancel — never hangs.
    const tx = await payment.wait();
    expect(tx === null || typeof tx.id === "string").toBe(true);

    const status = await sdk.getStatus({ reference: payment.reference });
    if (status.isOk) {
      expect(TERMINAL).toContain(status.value.status);
    }
  }, 30_000);
});
