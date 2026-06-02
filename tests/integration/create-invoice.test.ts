import { beforeAll, describe, expect, it } from "vitest";
import type { NylonPaySdk } from "../../dist/index.js";
import { createTestSdk } from "./setup.js";

describe("createInvoice", () => {
  let sdk: NylonPaySdk;

  beforeAll(() => {
    sdk = createTestSdk();
  });

  it("returns a payment URL and token", async () => {
    const result = await sdk.createInvoice({
      amount: 5000,
      currency: "UGX",
      description: "Integration test invoice",
    });

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.url).toMatch(/^https?:\/\//);
      expect(result.value.token).toBeTruthy();
    }
  });

  it("returns a payment URL when items are included", async () => {
    const result = await sdk.createInvoice({
      amount: 10000,
      currency: "UGX",
      description: "Invoice with items",
      items: [
        { name: "Item A", quantity: 2, unitPrice: 3000 },
        { name: "Item B", quantity: 1, unitPrice: 4000 },
      ],
    });

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.url).toMatch(/^https?:\/\//);
    }
  });

  it("reuses the same reference when provided (idempotency)", async () => {
    const ref = `inv-idem-${Date.now()}`;

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

    expect(first.isOk).toBe(true);
    expect(second.isOk).toBe(true);
    if (first.isOk && second.isOk) {
      expect(first.value.url).toBe(second.value.url);
    }
  });
});
