import { describe, expect, it } from "vitest";
import { createNylonPay, parseError } from "../../dist/index.js";
import { createTestSdk, isLiveMode, TEST_PHONE } from "./setup.js";

describe("error handling", () => {
  it("I8: throws synchronously for a missing apiKey", () => {
    expect(() => createNylonPay({ apiKey: "", apiSecret: "nps_test" })).toThrow(
      "apiKey is required",
    );
  });

  it("I9: throws synchronously for a bad apiKey prefix", () => {
    expect(() =>
      createNylonPay({ apiKey: "bad_key", apiSecret: "nps_test" }),
    ).toThrow('apiKey must start with "npk_"');
  });

  it("I10: throws synchronously for a missing apiSecret", () => {
    expect(() => createNylonPay({ apiKey: "npk_test", apiSecret: "" })).toThrow(
      "apiSecret is required",
    );
  });

  it("I11: throws synchronously for a bad apiSecret prefix", () => {
    expect(() =>
      createNylonPay({ apiKey: "npk_test", apiSecret: "bad_secret" }),
    ).toThrow('apiSecret must start with "nps_"');
  });

  it("I12: returns same instance for the same key+url (singleton)", () => {
    const sdk = createTestSdk();
    const sdk2 = createTestSdk();
    // Both use force:true so they're separate instances — verify force works
    expect(sdk).not.toBe(sdk2);

    // Without force, same key+url returns the same instance
    const a = createNylonPay({
      apiKey: "npk_singleton",
      apiSecret: "nps_singleton",
      force: true,
    });
    const b = createNylonPay({
      apiKey: "npk_singleton",
      apiSecret: "nps_singleton",
    });
    const c = createNylonPay({
      apiKey: "npk_singleton",
      apiSecret: "nps_singleton",
    });
    expect(b).toBe(c);
    expect(a).toBe(b);
  });

  it("I13: returns Err for an unknown transaction reference", async () => {
    const sdk = createTestSdk();
    const result = await sdk.getTransaction({
      reference: "ref-does-not-exist-xyz",
    });
    expect(result.isOk).toBe(false);
    if (result.isErr) {
      const error = parseError(result.error);
      expect(error.message).toMatch(/not found/i);
    }
  });

  it("I14: returns Err when collectPayment amount is below the minimum", async () => {
    const sdk = createTestSdk();
    const payment = await sdk.collectPayment({
      amount: 100,
      currency: "UGX",
      customer: { name: "Test", phoneNumber: TEST_PHONE },
      description: "below minimum",
    });

    const backendError = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 300);
      payment.once("error", (data) => {
        clearTimeout(timer);
        resolve(data.error ?? null);
      });
    });

    // Backend rejects sub-minimum amounts — the SDK surfaces the error event
    expect(backendError).not.toBeNull();
  });

  // Live-only: invalid credentials produce an auth error (not testable in sandbox
  // because we can't create bad-but-valid-looking keys without the secret)
  it.skipIf(!isLiveMode)(
    "I15: returns an auth error for a revoked API key (live only)",
    async () => {
      const sdk = createNylonPay({
        apiKey: "npk_revoked000000000000000000000",
        apiSecret: "nps_revoked00000000000000000000000000000000000000000",
        force: true,
      });
      const result = await sdk.getStatus({ reference: "any-ref" });
      expect(result.isOk).toBe(false);
      if (result.isErr) {
        const error = parseError(result.error);
        expect(error.message).toMatch(/key|auth|invalid/i);
      }
    },
  );
});
