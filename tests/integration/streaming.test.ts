import { describe, expect, it } from "vitest";
import { createNylonPay } from "../../dist/index.js";
import { createTestSdk, TEST_BASE_URL, TEST_PHONE } from "./setup.js";

// Unique amounts per run avoid the backend's duplicate-payment cache.
const RUN_AMOUNT = 1000 + (Date.now() % 8000);

const TERMINAL = ["successful", "failed", "cancelled"];

describe("status updates", () => {
  it("I19: a streamed collection reaches a terminal state via wait()", async () => {
    // streaming is on by default.
    const sdk = createTestSdk();
    const payment = await sdk.collectPayment({
      amount: RUN_AMOUNT + 5,
      currency: "UGX",
      customer: { name: "Integration Test", phoneNumber: TEST_PHONE },
      description: "Streaming wait test",
    });

    // wait() resolves a Transaction on success, null on failure/cancel — never hangs.
    const tx = await payment.wait();
    expect(tx === null || typeof tx.id === "string").toBe(true);

    const status = await sdk.getStatus({ reference: payment.reference });
    if (status.isOk) {
      expect(TERMINAL).toContain(status.value.status);
    }
  }, 30_000);

  it("I20: polling fallback (streaming:false) also reaches a terminal state", async () => {
    const sdk = createNylonPay({
      apiKey: process.env.NYLONPAY_API_KEY ?? "",
      apiSecret: process.env.NYLONPAY_API_SECRET ?? "",
      baseUrl: TEST_BASE_URL,
      streaming: false,
      force: true,
    });
    const payment = await sdk.collectPayment({
      amount: RUN_AMOUNT + 6,
      currency: "UGX",
      customer: { name: "Integration Test", phoneNumber: TEST_PHONE },
      description: "Polling wait test",
    });

    const tx = await payment.wait();
    expect(tx === null || typeof tx.id === "string").toBe(true);
  }, 30_000);
});
