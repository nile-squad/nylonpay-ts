import { beforeAll, describe, expect, it } from "vitest";
import type { NylonPaySdk } from "../../dist/index.js";
import { createTestSdk, TEST_PHONE } from "./setup.js";

describe("collectPayment", () => {
  let sdk: NylonPaySdk;
  let initiatedReference: string;

  beforeAll(() => {
    sdk = createTestSdk();
  });

  it("returns a PaymentInstance with a reference", async () => {
    const payment = await sdk.collectPayment({
      amount: 1000,
      currency: "UGX",
      customer: { name: "Integration Test", phoneNumber: TEST_PHONE },
      description: "Integration test payment",
    });

    expect(payment.reference).toBeTruthy();
    expect(payment.status).not.toBeNull();
    initiatedReference = payment.reference;
  });

  it("getStatus returns a result for the initiated payment", async () => {
    if (!initiatedReference) return;

    const result = await sdk.getStatus({ reference: initiatedReference });
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.reference).toBe(initiatedReference);
      expect(result.value.status).toBeTruthy();
    }
  });

  it("getTransaction returns the full transaction record", async () => {
    if (!initiatedReference) return;

    const result = await sdk.getTransaction({ reference: initiatedReference });
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.reference).toBe(initiatedReference);
      expect(result.value.amount).toBe(1000);
      expect(result.value.currency).toBe("UGX");
    }
  });

  it("reuses the same transaction for a repeated reference (idempotency)", async () => {
    const ref = `idem-${Date.now()}`;

    const first = await sdk.collectPayment({
      amount: 1000,
      currency: "UGX",
      customer: { name: "Integration Test", phoneNumber: TEST_PHONE },
      description: "Idempotency test",
      reference: ref,
    });

    const second = await sdk.collectPayment({
      amount: 1000,
      currency: "UGX",
      customer: { name: "Integration Test", phoneNumber: TEST_PHONE },
      description: "Idempotency test",
      reference: ref,
    });

    expect(first.reference).toBe(ref);
    expect(second.reference).toBe(ref);
  });
});
