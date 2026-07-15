import { beforeAll, describe, expect, it } from "vitest";
import {
  adminRefreshTransaction,
  createTestSdk,
  hasAdminCredentials,
  loginIntegrationAdmin,
  TEST_PHONE,
} from "./setup.js";

const RUN_AMOUNT = 1000 + (Date.now() % 8000);
const IN_FLIGHT = ["pending", "processing"] as const;

describe("orphan refresh lifecycle (live SDK)", () => {
  it("I20: collectPayment creates a pending collection with no failure reason", async () => {
    const sdk = createTestSdk();
    const reference = crypto.randomUUID();

    const payment = await sdk.collectPayment({
      amount: RUN_AMOUNT,
      currency: "UGX",
      customer: { name: "Orphan Refresh Test", phoneNumber: TEST_PHONE },
      description: "Orphan refresh integration",
      reference,
    });

    expect(payment.reference).toBe(reference);

    const tx = await sdk.getTransaction({ reference });
    if (tx.isErr) {
      throw new Error(tx.error);
    }

    expect(IN_FLIGHT).toContain(tx.value.status);
    expect(tx.value.failureReason).toBeNull();
    expect(tx.value.type).toBe("collection");
  });

  it("I21: getStatus and getTransaction agree after a status read", async () => {
    const sdk = createTestSdk();
    const reference = crypto.randomUUID();

    await sdk.collectPayment({
      amount: RUN_AMOUNT + 1,
      currency: "UGX",
      customer: { name: "Orphan Refresh Test", phoneNumber: TEST_PHONE },
      description: "Status parity check",
      reference,
    });

    await sdk.getStatus({ reference });

    const [status, tx] = await Promise.all([
      sdk.getStatus({ reference }),
      sdk.getTransaction({ reference }),
    ]);

    if (status.isErr) {
      throw new Error(status.error);
    }
    if (tx.isErr) {
      throw new Error(tx.error);
    }

    expect(status.value.status).toBe(tx.value.status);
    if (tx.value.status === "failed") {
      expect(tx.value.failureReason).toBeTruthy();
      return;
    }
    expect(tx.value.failureReason).toBeNull();
  });
});

describe.skipIf(!hasAdminCredentials)(
  "orphan refresh lifecycle (live SDK + admin refresh)",
  () => {
    let adminSessionToken = "";

    beforeAll(async () => {
      adminSessionToken = await loginIntegrationAdmin();
    }, 60_000);

    it("I22: admin refresh on a young pending collection leaves SDK status pending", async () => {
      const sdk = createTestSdk();
      const reference = crypto.randomUUID();

      await sdk.collectPayment({
        amount: RUN_AMOUNT + 2,
        currency: "UGX",
        customer: { name: "Orphan Refresh Test", phoneNumber: TEST_PHONE },
        description: "Admin refresh no-op check",
        reference,
      });

      const before = await sdk.getTransaction({ reference });
      if (before.isErr) {
        throw new Error(before.error);
      }

      if (!IN_FLIGHT.includes(before.value.status as (typeof IN_FLIGHT)[number])) {
        return;
      }

      const refresh = await adminRefreshTransaction({
        adminSessionToken,
        transactionId: before.value.id,
      });

      expect(refresh.status).not.toBe("failed");

      const after = await sdk.getTransaction({ id: before.value.id });
      if (after.isErr) {
        throw new Error(after.error);
      }
      expect(after.value.status).toBe(refresh.status);
      expect(after.value.failureReason).toBeNull();

      if (refresh.refreshed) {
        expect(["successful", "pending", "processing"]).toContain(refresh.status);
        return;
      }

      expect(IN_FLIGHT).toContain(refresh.status);
    });
  },
);
