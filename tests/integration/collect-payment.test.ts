import { beforeAll, describe, expect, it } from "vitest";
import type { NylonPaySdk } from "../../dist/index.js";
import { createTestSdk, TEST_PHONE } from "./setup.js";

// Unique amount per run avoids the backend's in-memory duplicate-payment
// cache (keyed on phone+amount+currency, 30-minute TTL).
const RUN_AMOUNT = 1000 + (Date.now() % 8000);

describe("collectPayment", () => {
  let sdk: NylonPaySdk;
  let initiatedReference: string;

  beforeAll(() => {
    sdk = createTestSdk();
  });

  it("I1: initiates a payment and the backend creates the transaction", async () => {
    // collectPayment throws if the backend rejects initiation, so a returned
    // instance means the transaction was accepted.
    const payment = await sdk.collectPayment({
      amount: RUN_AMOUNT,
      currency: "UGX",
      customer: { name: "Integration Test", phoneNumber: TEST_PHONE },
      description: "Integration test payment",
    });

    expect(payment.reference).toBeTruthy();
    initiatedReference = payment.reference;

    const tx = await sdk.getTransaction({ reference: initiatedReference });
    if (tx.isErr) throw new Error(`getTransaction failed: ${tx.error}`);
    expect(tx.value.reference).toBe(initiatedReference);
  });

  it("I2: getTransaction returns the full transaction record", async () => {
    if (!initiatedReference) return;

    const result = await sdk.getTransaction({ reference: initiatedReference });
    if (result.isErr) throw new Error(result.error);
    expect(result.value.reference).toBe(initiatedReference);
    expect(result.value.currency).toBe("UGX");
  });

  it("I3: reuses the same transaction for a repeated reference (idempotency)", async () => {
    const ref = `idem-${Date.now()}`;
    // Use a different amount to avoid the dup cache on the first call.
    const amount = RUN_AMOUNT + 1;

    const first = await sdk.collectPayment({
      amount,
      currency: "UGX",
      customer: { name: "Integration Test", phoneNumber: TEST_PHONE },
      description: "Idempotency test",
      reference: ref,
    });

    const second = await sdk.collectPayment({
      amount,
      currency: "UGX",
      customer: { name: "Integration Test", phoneNumber: TEST_PHONE },
      description: "Idempotency test",
      reference: ref,
    });

    expect(first.reference).toBe(ref);
    expect(second.reference).toBe(ref);

    // Both calls should point to the same backend transaction.
    const tx = await sdk.getTransaction({ reference: ref });
    if (tx.isErr)
      throw new Error(`idempotency: first call failed silently: ${tx.error}`);
    expect(tx.value.reference).toBe(ref);
  });
});
