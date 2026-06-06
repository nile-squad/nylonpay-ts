import { Err, Ok } from "slang-ts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNylonPay } from "./create-nylon-pay";
import {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
} from "./sdk.config";
import { createTransport } from "./transport";
import type { Transaction } from "./types";

vi.mock("./transport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./transport")>();
  return {
    // Keep the real parseError + createSdkError so categorized errors round-trip;
    // only the network-bound transport factory is stubbed.
    ...actual,
    createTransport: vi.fn(() => ({
      send: vi.fn(),
      parseError: actual.parseError,
    })),
  };
});

const mockTransaction: Transaction = {
  id: "txn-123",
  reference: "test-ref",
  amount: 1000,
  currency: "UGX",
  status: "successful",
  type: "collection",
  method: "mobileMoney",
  description: "Test",
  phone: "+256700000000",
  email: null,
  failureReason: null,
  metadata: {},
  mode: "test",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:01Z",
};

describe("createNylonPay", () => {
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSend = vi.fn();
    vi.mocked(createTransport).mockReturnValue({
      send: mockSend,
      parseError: vi.fn((error: string) => ({
        code: "UNKNOWN",
        message: error,
      })),
    });
  });

  describe("config validation", () => {
    it("creates SDK instance with valid config", () => {
      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });
      expect(sdk).toBeDefined();
      expect(typeof sdk.collectPayment).toBe("function");
    });

    it("throws when apiKey is missing", () => {
      expect(() =>
        createNylonPay({ apiKey: "", apiSecret: "nps_test" }),
      ).toThrow("apiKey is required");
    });

    it("throws when apiKey lacks npk_ prefix", () => {
      expect(() =>
        createNylonPay({ apiKey: "invalid_key", apiSecret: "nps_test" }),
      ).toThrow('apiKey must start with "npk_"');
    });

    it("throws when apiSecret is missing", () => {
      expect(() =>
        createNylonPay({ apiKey: "npk_test", apiSecret: "" }),
      ).toThrow("apiSecret is required");
    });

    it("throws when apiSecret lacks nps_ prefix", () => {
      expect(() =>
        createNylonPay({ apiKey: "npk_test", apiSecret: "invalid_secret" }),
      ).toThrow('apiSecret must start with "nps_"');
    });

    it("applies default values correctly", () => {
      createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: DEFAULT_BASE_URL,
          timeoutMs: DEFAULT_TIMEOUT_MS,
          maxRetries: DEFAULT_MAX_RETRIES,
        }),
      );
    });
  });

  describe("operation happy paths", () => {
    it("collectPayment returns PaymentInstance with correct reference", async () => {
      mockSend.mockResolvedValue(
        Ok({ reference: "test-ref", status: "pending" }),
      );

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      const instance = await sdk.collectPayment({
        amount: 1000,
        currency: "UGX",
        customer: { name: "Test", phoneNumber: "+256700000000" },
        description: "Test payment",
      });

      expect(instance.reference).toBe("test-ref");
    });

    it("collectPayment auto-generates reference when omitted", async () => {
      mockSend.mockResolvedValue(
        Ok({ reference: "auto-ref", status: "pending" }),
      );

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      await sdk.collectPayment({
        amount: 1000,
        currency: "UGX",
        customer: { name: "Test", phoneNumber: "+256700000000" },
        description: "Test payment",
      });

      const request = mockSend.mock.calls[0][0];
      expect(request.payload.reference).toBeDefined();
      expect(typeof request.payload.reference).toBe("string");
      expect(request.payload.reference.length).toBeGreaterThan(0);
    });

    it("collectPaymentAndResolve returns Transaction on success", async () => {
      mockSend.mockResolvedValue(Ok(mockTransaction));

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      const result = await sdk.collectPaymentAndResolve({
        amount: 1000,
        currency: "UGX",
        customer: { name: "Test", phoneNumber: "+256700000000" },
        description: "Test payment",
      });

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.reference).toBe("test-ref");
      }
    });

    it("makePayout returns PaymentInstance", async () => {
      mockSend.mockResolvedValue(
        Ok({ reference: "payout-ref", status: "pending" }),
      );

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      const instance = await sdk.makePayout({
        amount: 1000,
        currency: "UGX",
        customer: { name: "Test", phoneNumber: "+256700000000" },
        destination: { accountHolderName: "Test", accountNumber: "1234567890" },
        description: "Test payout",
      });

      expect(instance.reference).toBe("payout-ref");
    });

    it("makePayoutAndResolve returns Transaction on success", async () => {
      const payoutTx = { ...mockTransaction, type: "payout" as const };
      mockSend.mockResolvedValue(Ok(payoutTx));

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      const result = await sdk.makePayoutAndResolve({
        amount: 1000,
        currency: "UGX",
        customer: { name: "Test", phoneNumber: "+256700000000" },
        destination: { accountHolderName: "Test", accountNumber: "1234567890" },
        description: "Test payout",
      });

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.type).toBe("payout");
      }
    });

    it("getStatus returns StatusResponse", async () => {
      mockSend.mockResolvedValue(
        Ok({
          reference: "test-ref",
          status: "pending",
          amount: 1000,
          currency: "UGX",
          updatedAt: "2024-01-01T00:00:00Z",
        }),
      );

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      const result = await sdk.getStatus({ reference: "test-ref" });

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.reference).toBe("test-ref");
      }
    });

    it("getTransaction returns Transaction", async () => {
      mockSend.mockResolvedValue(Ok(mockTransaction));

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      const result = await sdk.getTransaction({ id: "txn-123" });

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.id).toBe("txn-123");
      }
    });

    it("verifyPhone returns PhoneVerification", async () => {
      mockSend.mockResolvedValue(
        Ok({
          phoneNumber: "+256700000000",
          customerName: "Test User",
          verified: true,
        }),
      );

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      const result = await sdk.verifyPhone({ phoneNumber: "+256700000000" });

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.verified).toBe(true);
      }
    });

    it("createInvoice returns InvoiceResponse", async () => {
      mockSend.mockResolvedValue(
        Ok({
          id: "inv-123",
          url: "https://pay.nylonpay.io/inv-123",
          token: "token-123",
          expiresAt: "2024-01-02T00:00:00Z",
          status: "pending",
        }),
      );

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      const result = await sdk.createInvoice({
        amount: 1000,
        currency: "UGX",
        description: "Test invoice",
      });

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.url).toBe("https://pay.nylonpay.io/inv-123");
      }
    });

    it("verifyWebhookSignature delegates to standalone function", () => {
      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      const payload = JSON.stringify({ event: "test" });
      const secret = "whsec_test";
      const signature = "invalid";

      const result = sdk.verifyWebhookSignature({ payload, signature, secret });
      expect(typeof result).toBe("boolean");
    });
  });

  describe("input validation", () => {
    it("throws on zero amount for collectPayment", async () => {
      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      await expect(
        sdk.collectPayment({
          amount: 0,
          currency: "UGX",
          customer: { name: "Test", phoneNumber: "+256700000000" },
          description: "Test",
        }),
      ).rejects.toThrow("amount must be a positive integer");
    });

    it("throws on negative amount for collectPayment", async () => {
      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      await expect(
        sdk.collectPayment({
          amount: -100,
          currency: "UGX",
          customer: { name: "Test", phoneNumber: "+256700000000" },
          description: "Test",
        }),
      ).rejects.toThrow("amount must be a positive integer");
    });

    it("throws when customer.phoneNumber is empty", async () => {
      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      await expect(
        sdk.collectPayment({
          amount: 1000,
          currency: "UGX",
          customer: { name: "Test", phoneNumber: "" },
          description: "Test",
        }),
      ).rejects.toThrow("customer.phoneNumber is required");
    });

    it("throws when description is empty", async () => {
      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      await expect(
        sdk.collectPayment({
          amount: 1000,
          currency: "UGX",
          customer: { name: "Test", phoneNumber: "+256700000000" },
          description: "",
        }),
      ).rejects.toThrow("description is required");
    });

    it("throws when method is bank without bank details", async () => {
      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      await expect(
        sdk.collectPayment({
          amount: 1000,
          currency: "UGX",
          customer: { name: "Test", phoneNumber: "+256700000000" },
          description: "Test",
          method: "bank",
        }),
      ).rejects.toThrow('bank details are required when method is "bank"');
    });

    it("throws when getTransaction has neither id nor reference", async () => {
      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      await expect(sdk.getTransaction({})).rejects.toThrow(
        "id or reference is required",
      );
    });

    it("throws when createInvoice has more than 50 items", async () => {
      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      const items = Array.from({ length: 51 }, (_, i) => ({
        name: `Item ${i}`,
        quantity: 1,
        unitPrice: 100,
      }));

      await expect(
        sdk.createInvoice({
          amount: 1000,
          currency: "UGX",
          description: "Test",
          items,
        }),
      ).rejects.toThrow("items must not exceed 50");
    });

    it("throws when createInvoice has negative item quantity", async () => {
      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      await expect(
        sdk.createInvoice({
          amount: 1000,
          currency: "UGX",
          description: "Test",
          items: [{ name: "Item", quantity: -1, unitPrice: 100 }],
        }),
      ).rejects.toThrow("item quantity must be a positive integer");
    });
  });

  describe("hooks", () => {
    const baseCollectInput = {
      amount: 1000,
      currency: "UGX" as const,
      customer: { name: "Test", phoneNumber: "+256700000000" },
      description: "Test payment",
    };
    const basePayoutInput = {
      amount: 1000,
      currency: "UGX" as const,
      customer: { name: "Test", phoneNumber: "+256700000000" },
      destination: { accountHolderName: "Test", accountNumber: "1234567890" },
      description: "Test payout",
    };

    it("beforeCollect is called with the payload before sending", async () => {
      const beforeCollect = vi.fn((input) => input);
      mockSend.mockResolvedValue(
        Ok({ reference: "test-ref", status: "pending" }),
      );

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
        hooks: { beforeCollect },
      });

      await sdk.collectPayment(baseCollectInput);

      expect(beforeCollect).toHaveBeenCalledOnce();
      expect(beforeCollect.mock.calls[0][0]).toMatchObject({
        amount: 1000,
        description: "Test payment",
      });
    });

    it("beforeCollect mutated return value is sent to transport", async () => {
      mockSend.mockResolvedValue(
        Ok({ reference: "test-ref", status: "pending" }),
      );

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
        hooks: {
          beforeCollect: (input) => ({
            ...input,
            metadata: { enriched: "true" },
          }),
        },
      });

      await sdk.collectPayment(baseCollectInput);

      const sentPayload = mockSend.mock.calls[0][0].payload;
      expect(sentPayload.metadata).toEqual({ enriched: "true" });
    });

    it("afterCollect is called with Ok result on success", async () => {
      const afterCollect = vi.fn();
      mockSend.mockResolvedValue(
        Ok({ reference: "test-ref", status: "pending" }),
      );

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
        hooks: { afterCollect },
      });

      await sdk.collectPayment(baseCollectInput);

      expect(afterCollect).toHaveBeenCalledOnce();
      const [result] = afterCollect.mock.calls[0];
      expect(result.isOk).toBe(true);
      expect(result.value.reference).toBe("test-ref");
    });

    it("afterCollect fires with Err, then collectPayment throws a categorized error on init failure", async () => {
      const afterCollect = vi.fn();
      mockSend.mockResolvedValue(
        Err('{"category":"auth","message":"API key was not found"}'),
      );

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
        hooks: { afterCollect },
      });

      await expect(sdk.collectPayment(baseCollectInput)).rejects.toMatchObject({
        category: "auth",
        message: "API key was not found",
      });

      expect(afterCollect).toHaveBeenCalledOnce();
      const [result] = afterCollect.mock.calls[0];
      expect(result.isErr).toBe(true);
    });

    it("makePayout throws a categorized error on init failure", async () => {
      mockSend.mockResolvedValue(
        Err(
          '{"category":"limit","message":"Transaction exceeds account limits"}',
        ),
      );

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      await expect(
        sdk.makePayout({
          amount: 1000,
          currency: "UGX",
          customer: { name: "Jane", phoneNumber: "+256700000000" },
          destination: {
            accountHolderName: "Jane Doe",
            accountNumber: "123456",
          },
          description: "Refund",
        }),
      ).rejects.toMatchObject({ category: "limit" });
    });

    it("afterCollect fires for collectPaymentAndResolve too", async () => {
      const afterCollect = vi.fn();
      mockSend.mockResolvedValue(Ok(mockTransaction));

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
        hooks: { afterCollect },
      });

      await sdk.collectPaymentAndResolve(baseCollectInput);

      expect(afterCollect).toHaveBeenCalledOnce();
    });

    it("beforePayout mutated return value is sent to transport", async () => {
      mockSend.mockResolvedValue(
        Ok({ reference: "payout-ref", status: "pending" }),
      );

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
        hooks: {
          beforePayout: (input) => ({
            ...input,
            metadata: { source: "api" },
          }),
        },
      });

      await sdk.makePayout(basePayoutInput);

      const sentPayload = mockSend.mock.calls[0][0].payload;
      expect(sentPayload.metadata).toEqual({ source: "api" });
    });

    it("afterPayout is called with Ok result on success", async () => {
      const afterPayout = vi.fn();
      mockSend.mockResolvedValue(
        Ok({ reference: "payout-ref", status: "pending" }),
      );

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
        hooks: { afterPayout },
      });

      await sdk.makePayout(basePayoutInput);

      expect(afterPayout).toHaveBeenCalledOnce();
      const [result] = afterPayout.mock.calls[0];
      expect(result.isOk).toBe(true);
      expect(result.value.reference).toBe("payout-ref");
    });

    it("afterPayout fires for makePayoutAndResolve too", async () => {
      const afterPayout = vi.fn();
      const payoutTx = { ...mockTransaction, type: "payout" as const };
      mockSend.mockResolvedValue(Ok(payoutTx));

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
        hooks: { afterPayout },
      });

      await sdk.makePayoutAndResolve(basePayoutInput);

      expect(afterPayout).toHaveBeenCalledOnce();
    });

    it("async beforeCollect is awaited before transport send", async () => {
      const order: string[] = [];
      mockSend.mockImplementation(async () => {
        order.push("transport");
        return Ok({ reference: "test-ref", status: "pending" });
      });

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
        hooks: {
          beforeCollect: async (input) => {
            order.push("beforeCollect");
            return input;
          },
        },
      });

      await sdk.collectPayment(baseCollectInput);

      expect(order).toEqual(["beforeCollect", "transport"]);
    });
  });

  describe("error handling", () => {
    it("returns Err result on transport error instead of throwing", async () => {
      mockSend.mockResolvedValue(Err("Server unavailable"));

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      const result = await sdk.getStatus({ reference: "test-ref" });

      expect(result.isErr).toBe(true);
      if (result.isErr) {
        expect(result.error).toContain("Server unavailable");
      }
    });

    it("returns parsed error for server error response", async () => {
      mockSend.mockResolvedValue(
        Err(
          JSON.stringify({
            code: "RATE_LIMITED",
            message: "Too many requests",
          }),
        ),
      );

      const sdk = createNylonPay({
        apiKey: "npk_test",
        apiSecret: "nps_test",
        force: true,
      });

      const result = await sdk.getStatus({ reference: "test-ref" });

      expect(result.isErr).toBe(true);
      if (result.isErr) {
        expect(result.error).toContain("RATE_LIMITED");
      }
    });
  });
});
