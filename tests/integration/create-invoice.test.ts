import { beforeAll, describe, expect, it } from "vitest";
import type { NylonPaySdk } from "../../dist/index.js";
import { createTestSdk, isLiveMode } from "./setup.js";

// Invoices are live-mode only: the backend rejects them with "Payment links are
// not available in sandbox mode", so with a sandbox key these can only ever
// fail. Skipping is honest; leaving them red would train everyone to ignore a
// permanently-failing suite.
describe.skipIf(!isLiveMode)("createInvoice", () => {
  let sdk: NylonPaySdk;

  beforeAll(() => {
    sdk = createTestSdk();
  });

  it("returns invoiceNumber and paymentLink", async () => {
    const result = await sdk.createInvoice({
      amount: 5000,
      currency: "UGX",
      customerEmail: "test@example.com",
      description: "Integration test invoice",
    });

    if (result.isErr) throw new Error(result.error);
    expect(result.value.invoiceNumber).toMatch(/^INV-/);
    expect(result.value.paymentLink).toMatch(/^https?:\/\//);
    expect(result.value.status).toBe("issued");
    expect(result.value.currency).toBe("UGX");
  });

  it("returns a paymentLink when items are included", async () => {
    const result = await sdk.createInvoice({
      amount: 10000,
      currency: "UGX",
      customerEmail: "test@example.com",
      customerName: "Test Customer",
      description: "Invoice with line items",
      items: [
        { name: "Item A", quantity: 2, unitPrice: 3000 },
        { name: "Item B", quantity: 1, unitPrice: 4000 },
      ],
    });

    if (result.isErr) throw new Error(result.error);
    expect(result.value.paymentLink).toMatch(/^https?:\/\//);
    expect(result.value.invoiceNumber).toMatch(/^INV-/);
  });

  it("includes optional fields without error", async () => {
    const result = await sdk.createInvoice({
      amount: 7500,
      currency: "UGX",
      customerEmail: "test@example.com",
      customerName: "John Doe",
      customerPhone: "0768499027",
      description: "Invoice with all optional fields",
      dueDate: "2026-12-31",
      merchantReference: "MY-REF-001",
      metadata: { orderId: "order-123" },
    });

    if (result.isErr) throw new Error(result.error);
    expect(result.value.id).toBeTruthy();
    expect(result.value.invoiceNumber).toMatch(/^INV-/);
  });
});
