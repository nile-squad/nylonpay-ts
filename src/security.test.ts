/**
 * Canonical SDK security test suite (spec §Security Tests, S1–S13).
 *
 * Every Nylon Pay SDK implementation MUST cover these behaviors. They are the
 * cross-language contract for the SDK's cryptographic surface: request signing,
 * response/webhook verification, nonce entropy, and fail-closed verification.
 * IDs (S1…) are traceable to `packages/specs/nylon-pay/sdk-spec.md`.
 */

import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createNylonPay } from "./create-nylon-pay";
import { generateFingerprint } from "./fingerprint";
import { generateNonce } from "./nonce";
import { createCanonicalPayload, createSignature } from "./signature";
import { createTransport } from "./transport";
import { verifyResponseSignature } from "./verify-response";
import { verifyWebhookSignature } from "./verify-webhook";

const SECRET = "nps_test_secret";

function sign(payload: unknown, secret: string): string {
  return createHmac("sha256", secret)
    .update(createCanonicalPayload(payload))
    .digest("hex");
}

const baseSig = {
  fingerprint: "fp",
  nonce: "n0",
  timestamp: "1700000000000",
  payload: { amount: 1000, reference: "ref-1" },
  secret: SECRET,
};

describe("SDK security suite", () => {
  describe("S1: request signature integrity", () => {
    it("is deterministic for identical inputs", () => {
      expect(createSignature(baseSig)).toBe(createSignature(baseSig));
    });

    it("changes if the payload is tampered", () => {
      const tampered = {
        ...baseSig,
        payload: { ...baseSig.payload, amount: 9999 },
      };
      expect(createSignature(tampered)).not.toBe(createSignature(baseSig));
    });

    it("changes if the secret differs (forged signature impossible without secret)", () => {
      const wrongSecret = { ...baseSig, secret: "nps_other_secret" };
      expect(createSignature(wrongSecret)).not.toBe(createSignature(baseSig));
    });

    it("changes if nonce or timestamp changes (binds replay context)", () => {
      expect(createSignature({ ...baseSig, nonce: "n1" })).not.toBe(
        createSignature(baseSig),
      );
      expect(
        createSignature({ ...baseSig, timestamp: "1700000000001" }),
      ).not.toBe(createSignature(baseSig));
    });

    it("is a 64-char hex digest", () => {
      expect(createSignature(baseSig)).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("S2: canonical payload is key-order independent", () => {
    it("signs equal regardless of key insertion order", () => {
      const a = createSignature({
        ...baseSig,
        payload: { amount: 1, b: 2, ref: "x" },
      });
      const b = createSignature({
        ...baseSig,
        payload: { ref: "x", b: 2, amount: 1 },
      });
      expect(a).toBe(b);
    });

    it("nested object key order does not change the signature", () => {
      const a = createSignature({
        ...baseSig,
        payload: { customer: { name: "A", phone: "1" } },
      });
      const b = createSignature({
        ...baseSig,
        payload: { customer: { phone: "1", name: "A" } },
      });
      expect(a).toBe(b);
    });

    it("array order IS significant (not sorted)", () => {
      const a = createSignature({ ...baseSig, payload: { items: [1, 2] } });
      const b = createSignature({ ...baseSig, payload: { items: [2, 1] } });
      expect(a).not.toBe(b);
    });
  });

  describe("S3: nonce entropy and uniqueness", () => {
    it("produces 32 hex chars (16 bytes) by default", () => {
      expect(generateNonce()).toMatch(/^[a-f0-9]{32}$/);
    });

    it("never repeats across many generations", () => {
      const seen = new Set<string>();
      for (let i = 0; i < 10000; i++) seen.add(generateNonce());
      expect(seen.size).toBe(10000);
    });
  });

  describe("S4: fingerprint", () => {
    it("is a stable 64-char hex hash within a process", () => {
      const fp = generateFingerprint();
      expect(fp).toMatch(/^[a-f0-9]{64}$/);
      expect(generateFingerprint()).toBe(fp);
    });
  });

  describe("S5–S7: response signature verification", () => {
    const data = { reference: "ref-1", status: "successful" };

    it("S5: accepts a valid signature", () => {
      expect(verifyResponseSignature(data, sign(data, SECRET), SECRET)).toBe(
        true,
      );
    });

    it("S6: rejects a tampered payload", () => {
      const sig = sign(data, SECRET);
      const forged = { ...data, status: "failed" };
      expect(verifyResponseSignature(forged, sig, SECRET)).toBe(false);
    });

    it("S6: rejects a signature made with the wrong secret", () => {
      expect(
        verifyResponseSignature(data, sign(data, "nps_attacker"), SECRET),
      ).toBe(false);
    });

    it("S7: rejects malformed/short signatures without throwing (length-guarded timingSafeEqual)", () => {
      expect(() =>
        verifyResponseSignature(data, "deadbeef", SECRET),
      ).not.toThrow();
      expect(verifyResponseSignature(data, "deadbeef", SECRET)).toBe(false);
      expect(verifyResponseSignature(data, "", SECRET)).toBe(false);
      expect(verifyResponseSignature(data, "zz", SECRET)).toBe(false);
    });

    it("S7: a one-byte difference is rejected (timing-safe equality is correct)", () => {
      const sig = sign(data, SECRET);
      const flipped = `${sig.slice(0, -1)}${sig.endsWith("0") ? "1" : "0"}`;
      expect(verifyResponseSignature(data, flipped, SECRET)).toBe(false);
    });
  });

  describe("S8: webhook signature verification", () => {
    const body = JSON.stringify({ event: "payment.success", amount: 10000 });

    it("accepts a valid signature over the raw body", () => {
      const sig = createHmac("sha256", SECRET).update(body).digest("hex");
      expect(
        verifyWebhookSignature({
          payload: body,
          signature: sig,
          secret: SECRET,
        }),
      ).toBe(true);
    });

    it("rejects a tampered body", () => {
      const sig = createHmac("sha256", SECRET).update(body).digest("hex");
      const tampered = JSON.stringify({
        event: "payment.success",
        amount: 999999,
      });
      expect(
        verifyWebhookSignature({
          payload: tampered,
          signature: sig,
          secret: SECRET,
        }),
      ).toBe(false);
    });

    it("rejects the wrong secret", () => {
      const sig = createHmac("sha256", "nps_attacker")
        .update(body)
        .digest("hex");
      expect(
        verifyWebhookSignature({
          payload: body,
          signature: sig,
          secret: SECRET,
        }),
      ).toBe(false);
    });

    it("rejects malformed signatures without throwing", () => {
      expect(() =>
        verifyWebhookSignature({
          payload: body,
          signature: "nothex",
          secret: SECRET,
        }),
      ).not.toThrow();
    });
  });

  describe("S10–S11: transport verifies responses fail-closed", () => {
    const ok = (data: Record<string, unknown>) => ({
      ok: true,
      json: () => Promise.resolve({ status: true, message: "OK", data }),
    });

    const makeTransport = (fetchImpl: typeof globalThis.fetch) =>
      createTransport({
        apiKey: "npk_test",
        apiSecret: SECRET,
        baseUrl: "https://test.api",
        timeoutMs: 5000,
        maxRetries: 0,
        fetch: fetchImpl,
      });

    it("S10: rejects a success response with a MISSING signature (no fail-open)", async () => {
      const data = { reference: "r", status: "successful" };
      const transport = makeTransport(vi.fn().mockResolvedValue(ok(data)));
      const result = await transport.send({
        action: "sdk-get-status",
        payload: {},
      });
      expect(result.isErr).toBe(true);
      if (result.isErr) expect(result.error).toContain("signature");
    });

    it("S11: rejects a success response with an INVALID signature", async () => {
      const data = { reference: "r", status: "successful" };
      const transport = makeTransport(
        vi
          .fn()
          .mockResolvedValue(ok({ ...data, _responseSignature: "deadbeef" })),
      );
      const result = await transport.send({
        action: "sdk-get-status",
        payload: {},
      });
      expect(result.isErr).toBe(true);
    });

    it("accepts a success response with a VALID signature", async () => {
      const data = { reference: "r", status: "successful" };
      const transport = makeTransport(
        vi
          .fn()
          .mockResolvedValue(
            ok({ ...data, _responseSignature: sign(data, SECRET) }),
          ),
      );
      const result = await transport.send({
        action: "sdk-get-status",
        payload: {},
      });
      expect(result.isOk).toBe(true);
    });
  });

  describe("S12: config rejects malformed credentials", () => {
    it("rejects an apiKey without the npk_ prefix", () => {
      expect(() =>
        createNylonPay({ apiKey: "bad", apiSecret: "nps_x", force: true }),
      ).toThrow();
    });

    it("rejects an apiSecret without the nps_ prefix", () => {
      expect(() =>
        createNylonPay({ apiKey: "npk_x", apiSecret: "bad", force: true }),
      ).toThrow();
    });
  });

  describe("S13: secret is never exposed on the SDK surface", () => {
    it("the secret does not appear in the serialized SDK instance", () => {
      const secret = "nps_super_secret_do_not_leak";
      const sdk = createNylonPay({
        apiKey: "npk_x",
        apiSecret: secret,
        force: true,
      });
      expect(JSON.stringify(sdk)).not.toContain(secret);
      expect(
        Object.values(sdk).some(
          (v) => typeof v === "string" && v.includes(secret),
        ),
      ).toBe(false);
    });

    it("rotating the secret yields a different instance (cache key is secret-aware)", () => {
      const a = createNylonPay({ apiKey: "npk_rot", apiSecret: "nps_v1" });
      const b = createNylonPay({ apiKey: "npk_rot", apiSecret: "nps_v2" });
      expect(a).not.toBe(b);
    });
  });

  describe("S14: SSE read buffer is bounded", () => {
    it("closes the stream and errors when no frame separator arrives before the cap", async () => {
      // 600k chars per chunk, no "\n\n" separator → after 2 chunks the buffer
      // crosses the 1 MiB cap and the stream must abort rather than grow forever.
      const chunk = new Uint8Array(600_000).fill(0x61); // 'a'
      let reads = 0;
      const reader = {
        read: vi.fn(async () => {
          reads += 1;
          if (reads <= 3) return { done: false, value: chunk };
          return { done: true, value: undefined };
        }),
      };
      const fetchImpl = vi
        .fn()
        .mockResolvedValue({ ok: true, body: { getReader: () => reader } });

      const transport = createTransport({
        apiKey: "npk_test",
        apiSecret: SECRET,
        baseUrl: "https://test.api",
        timeoutMs: 5000,
        maxRetries: 0,
        fetch: fetchImpl as unknown as typeof globalThis.fetch,
      });

      const onStatus = vi.fn();
      const onError = vi.fn();
      const onClose = vi.fn();
      transport.openStream({
        reference: "ref",
        onStatus,
        onError,
        onClose,
      });

      // Flush the async read loop.
      await new Promise((r) => setTimeout(r, 10));

      expect(onError).toHaveBeenCalledWith("SSE buffer exceeded maximum size");
      expect(onStatus).not.toHaveBeenCalled();
      expect(reads).toBeLessThanOrEqual(2);
    });
  });
});
