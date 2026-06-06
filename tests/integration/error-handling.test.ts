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

  it("I13: returns a not_found error for an unknown transaction reference", async () => {
    const sdk = createTestSdk();
    const result = await sdk.getTransaction({
      reference: "ref-does-not-exist-xyz",
    });
    expect(result.isOk).toBe(false);
    if (result.isErr) {
      const error = parseError(result.error);
      expect(error.category).toBe("not_found");
    }
  });

  it("I14: throws a validation error when collectPayment amount is below the minimum", async () => {
    const sdk = createTestSdk();
    // The backend rejects sub-minimum amounts at initiation, so collectPayment
    // throws rather than returning a PaymentInstance.
    await expect(
      sdk.collectPayment({
        amount: 100,
        currency: "UGX",
        customer: { name: "Test", phoneNumber: TEST_PHONE },
        description: "below minimum",
      }),
    ).rejects.toMatchObject({ category: "validation" });
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
        expect(error.category).toBe("auth");
      }
    },
  );

  it("I16: a well-formed but unknown key yields an auth category", async () => {
    // npk_/nps_ prefixes are valid so construction succeeds; the server rejects
    // the key at request time with an `auth` category. This proves the SDK can
    // tell a merchant their key is invalid (the original failure mode).
    const sdk = createNylonPay({
      apiKey: "npk_unknownkey0000000000000000000",
      apiSecret: "nps_unknownsecret000000000000000000000000000000000000",
      force: true,
    });

    const status = await sdk.getStatus({ reference: "any-ref" });
    expect(status.isOk).toBe(false);
    if (status.isErr) {
      expect(parseError(status.error).category).toBe("auth");
    }

    await expect(
      sdk.collectPayment({
        amount: 1000,
        currency: "UGX",
        customer: { name: "Test", phoneNumber: TEST_PHONE },
        description: "unknown key",
      }),
    ).rejects.toMatchObject({ category: "auth" });
  });

  it("throws a validation category for bad input (no network)", async () => {
    const sdk = createTestSdk();
    await expect(
      sdk.collectPayment({
        amount: 0,
        currency: "UGX",
        customer: { name: "Test", phoneNumber: TEST_PHONE },
        description: "zero amount",
      }),
    ).rejects.toMatchObject({ category: "validation" });

    await expect(sdk.getTransaction({})).rejects.toMatchObject({
      category: "validation",
    });
  });
});
