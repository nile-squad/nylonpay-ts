import { beforeAll, describe, expect, it } from "vitest";
import type { NylonPaySdk } from "../../dist/index.js";
import { createTestSdk, TEST_PHONE } from "./setup.js";

const RUN_AMOUNT = 1000 + (Date.now() % 8000);

describe("makePayout", () => {
  let sdk: NylonPaySdk;
  let initiatedReference: string;

  beforeAll(() => {
    sdk = createTestSdk();
  });

  it("I4: initiates a payout and the backend creates the transaction", async () => {
    const payout = await sdk.makePayout({
      amount: RUN_AMOUNT,
      currency: "UGX",
      customer: { name: "Integration Test", phoneNumber: TEST_PHONE },
      destination: {
        accountHolderName: "Integration Test",
        accountNumber: TEST_PHONE,
      },
      description: "Integration test payout",
    });

    expect(payout.reference).toBeTruthy();
    initiatedReference = payout.reference;

    // makePayout throws on backend rejection, so a returned instance means the
    // payout was accepted.
    const tx = await sdk.getTransaction({ reference: initiatedReference });
    if (tx.isErr) throw new Error(`makePayout failed: ${tx.error}`);
    expect(tx.value.reference).toBe(initiatedReference);
    expect(tx.value.currency).toBe("UGX");
  });

  it("I5: getTransaction returns the payout record", async () => {
    if (!initiatedReference) return;

    const result = await sdk.getTransaction({ reference: initiatedReference });
    if (result.isErr) throw new Error(result.error);
    expect(result.value.reference).toBe(initiatedReference);
    expect(result.value.type).toBe("payout");
  });

  it("I7: makePayoutAndResolve resolves to a terminal state and full shape", async () => {
    const result = await sdk.makePayoutAndResolve({
      amount: RUN_AMOUNT + 7,
      currency: "UGX",
      customer: { name: "Integration Test", phoneNumber: TEST_PHONE },
      destination: {
        accountHolderName: "Integration Test",
        accountNumber: TEST_PHONE,
      },
      description: "Payout resolve shape test",
    });
    if (result.isErr) throw new Error(result.error);

    const tx = result.value;
    expect(tx.id).toBeTruthy();
    expect(typeof tx.amount).toBe("number");
    expect(tx.reference).toBeTruthy();
    expect(tx.type).toBe("payout");
    // The resolve variant must return a terminal status, not pending/processing.
    // A successful payout stuck at "pending" is the reported bug.
    expect(["successful", "failed", "cancelled"]).toContain(tx.status);
  }, 30_000);

  it("I6: reuses the same transaction for a repeated reference (idempotency)", async () => {
    const ref = `payout-idem-${Date.now()}`;
    const amount = RUN_AMOUNT + 2;

    const first = await sdk.makePayout({
      amount,
      currency: "UGX",
      customer: { name: "Integration Test", phoneNumber: TEST_PHONE },
      destination: {
        accountHolderName: "Integration Test",
        accountNumber: TEST_PHONE,
      },
      description: "Idempotency test payout",
      reference: ref,
    });

    const second = await sdk.makePayout({
      amount,
      currency: "UGX",
      customer: { name: "Integration Test", phoneNumber: TEST_PHONE },
      destination: {
        accountHolderName: "Integration Test",
        accountNumber: TEST_PHONE,
      },
      description: "Idempotency test payout",
      reference: ref,
    });

    expect(first.reference).toBe(ref);
    expect(second.reference).toBe(ref);

    const tx = await sdk.getTransaction({ reference: ref });
    if (tx.isErr)
      throw new Error(`payout idempotency failed silently: ${tx.error}`);
    expect(tx.value.reference).toBe(ref);
  });
});
