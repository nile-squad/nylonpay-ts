import { describe, expect, it } from "vitest";
import {
  createTestSdk,
  TEST_BASE_URL,
  TEST_PHONE,
} from "./setup.js";

const RUN_AMOUNT = 1000 + (Date.now() % 8000);

const hasAdminCredentials = Boolean(
  process.env.NYLONPAY_ROOT_ADMIN_EMAIL &&
    process.env.NYLONPAY_ROOT_ADMIN_PASSWORD &&
    TEST_BASE_URL
);

async function loginRootAdmin(): Promise<string> {
  const origin = new URL(TEST_BASE_URL as string).origin;
  const response = await fetch(`${origin}/api/admin-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.NYLONPAY_ROOT_ADMIN_EMAIL,
      password: process.env.NYLONPAY_ROOT_ADMIN_PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error(`Admin login failed: HTTP ${response.status}`);
  }

  const cookie = response.headers.get("set-cookie") ?? "";
  const match = /np_admin_session=([^;]+)/.exec(cookie);
  if (!match?.[1]) {
    throw new Error("Admin login succeeded but no session cookie was returned");
  }
  return match[1];
}

async function adminRefreshTransaction(input: {
  adminSessionToken: string;
  transactionId: string;
}): Promise<{ refreshed: boolean; status: string }> {
  const response = await fetch(TEST_BASE_URL as string, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `np_admin_session=${input.adminSessionToken}`,
    },
    body: JSON.stringify({
      intent: "execute",
      service: "admin",
      action: "refresh-transaction-status",
      payload: { transactionId: input.transactionId },
    }),
  });

  const body = (await response.json()) as {
    data?: { refreshed: boolean; status: string };
    message?: string;
    status: boolean;
  };

  if (!body.status || !body.data) {
    throw new Error(body.message ?? "Admin refresh failed");
  }

  return body.data;
}

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

    expect(["pending", "processing"]).toContain(tx.value.status);
    expect(tx.value.failureReason).toBeNull();
    expect(tx.value.type).toBe("collection");
  });

  it("I21: getStatus matches getTransaction while collection is in flight", async () => {
    const sdk = createTestSdk();
    const reference = crypto.randomUUID();

    await sdk.collectPayment({
      amount: RUN_AMOUNT + 1,
      currency: "UGX",
      customer: { name: "Orphan Refresh Test", phoneNumber: TEST_PHONE },
      description: "Status parity check",
      reference,
    });

    const [tx, status] = await Promise.all([
      sdk.getTransaction({ reference }),
      sdk.getStatus({ reference }),
    ]);

    if (tx.isErr) {
      throw new Error(tx.error);
    }
    if (status.isErr) {
      throw new Error(status.error);
    }

    expect(status.value.status).toBe(tx.value.status);
    expect(tx.value.failureReason).toBeNull();
  });
});

describe.skipIf(!hasAdminCredentials)(
  "orphan refresh lifecycle (live SDK + admin refresh)",
  () => {
    it("I22: admin refresh on a young pending collection leaves SDK status pending", async () => {
      const sdk = createTestSdk();
      const reference = crypto.randomUUID();

      const payment = await sdk.collectPayment({
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
      expect(["pending", "processing"]).toContain(before.value.status);

      const adminSessionToken = await loginRootAdmin();
      const refresh = await adminRefreshTransaction({
        adminSessionToken,
        transactionId: before.value.id,
      });

      expect(refresh.refreshed).toBe(false);
      expect(["pending", "processing"]).toContain(refresh.status);

      const after = await sdk.getTransaction({ id: before.value.id });
      if (after.isErr) {
        throw new Error(after.error);
      }
      expect(after.value.status).toBe(refresh.status);
      expect(after.value.failureReason).toBeNull();
      expect(payment.reference).toBe(reference);
    });
  }
);
