import { beforeAll, describe, expect, it } from "vitest";
import type { NylonPaySdk } from "../../dist/index.js";
import { createTestSdk } from "./setup.js";

describe("createInvoice", () => {
  let sdk: NylonPaySdk;

  beforeAll(() => {
    sdk = createTestSdk();
  });

  // Payment links are disabled in sandbox mode — these tests only run against live keys.
  it.skip("returns a payment URL and token", async () => {
    const result = await sdk.createInvoice({
      amount: 5000,
      currency: "UGX",
      description: "Integration test invoice",
    });

    if (result.isErr) throw new Error(result.error);
    expect(result.value.url).toMatch(/^https?:\/\//);
    expect(result.value.token).toBeTruthy();
  });

  it.skip("returns a payment URL when items are included", async () => {
    const result = await sdk.createInvoice({
      amount: 10000,
      currency: "UGX",
      description: "Invoice with items",
      items: [
        { name: "Item A", quantity: 2, unitPrice: 3000 },
        { name: "Item B", quantity: 1, unitPrice: 4000 },
      ],
    });

    if (result.isErr) throw new Error(result.error);
    expect(result.value.url).toMatch(/^https?:\/\//);
  });

  it.skip("reuses the same reference when provided (idempotency)", async () => {
    const ref = `iv${String(Date.now()).slice(-11)}`;

    const first = await sdk.createInvoice({
      amount: 2000,
      currency: "UGX",
      description: "Idempotency test",
      reference: ref,
    });

    const second = await sdk.createInvoice({
      amount: 2000,
      currency: "UGX",
      description: "Idempotency test",
      reference: ref,
    });

    if (first.isErr) throw new Error(first.error);
    if (second.isErr) throw new Error(second.error);
    expect(first.value.url).toBe(second.value.url);
  });
});
