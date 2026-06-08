import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./verify-webhook";

const secret = "test-webhook-secret";

function sign(body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** A realistic webhook body — the backend always stamps a fresh `timestamp`. */
function body(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event: "collection.completed",
    data: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  });
}

describe("verifyWebhookSignature", () => {
  it("returns true for a valid signature on a fresh webhook", () => {
    const raw = body();
    expect(
      verifyWebhookSignature({ payload: raw, signature: sign(raw), secret }),
    ).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    expect(
      verifyWebhookSignature({
        payload: body(),
        signature: "invalid-signature",
        secret,
      }),
    ).toBe(false);
  });

  it("returns false for a tampered payload", () => {
    const signed = body({ event: "collection.completed" });
    const tampered = body({ event: "collection.failed" });
    expect(
      verifyWebhookSignature({
        payload: tampered,
        signature: sign(signed),
        secret,
      }),
    ).toBe(false);
  });

  it("works with a string payload", () => {
    const raw = body();
    expect(
      verifyWebhookSignature({ payload: raw, signature: sign(raw), secret }),
    ).toBe(true);
  });

  it("works with a Uint8Array payload", () => {
    const raw = body();
    const bytes = new TextEncoder().encode(raw);
    expect(
      verifyWebhookSignature({ payload: bytes, signature: sign(raw), secret }),
    ).toBe(true);
  });

  it("returns false when the signature is missing", () => {
    const raw = body();
    expect(
      verifyWebhookSignature({ payload: raw, signature: "", secret }),
    ).toBe(false);
  });

  it("verifies the raw HMAC layer over arbitrary bytes when freshness is disabled", () => {
    const raw = "";
    expect(
      verifyWebhookSignature({
        payload: raw,
        signature: sign(raw),
        secret,
        toleranceSeconds: 0,
      }),
    ).toBe(true);
  });

  describe("replay protection (freshness window)", () => {
    it("rejects a correctly-signed but stale webhook (replay)", () => {
      const stale = body({
        timestamp: new Date(Date.now() - 10 * 60_000).toISOString(),
      });
      expect(
        verifyWebhookSignature({
          payload: stale,
          signature: sign(stale),
          secret,
        }),
      ).toBe(false);
    });

    it("accepts a webhook within the tolerance window", () => {
      const recent = body({
        timestamp: new Date(Date.now() - 60_000).toISOString(),
      });
      expect(
        verifyWebhookSignature({
          payload: recent,
          signature: sign(recent),
          secret,
        }),
      ).toBe(true);
    });

    it("rejects a future-dated webhook beyond the tolerance window", () => {
      const future = body({
        timestamp: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      expect(
        verifyWebhookSignature({
          payload: future,
          signature: sign(future),
          secret,
        }),
      ).toBe(false);
    });

    it("fails closed when a valid signature carries no timestamp", () => {
      const noTs = JSON.stringify({ event: "collection.completed", data: {} });
      expect(
        verifyWebhookSignature({
          payload: noTs,
          signature: sign(noTs),
          secret,
        }),
      ).toBe(false);
    });

    it("can be widened via toleranceSeconds for a slow consumer", () => {
      const old = body({
        timestamp: new Date(Date.now() - 10 * 60_000).toISOString(),
      });
      expect(
        verifyWebhookSignature({
          payload: old,
          signature: sign(old),
          secret,
          toleranceSeconds: 900,
        }),
      ).toBe(true);
    });

    it("toleranceSeconds: 0 disables the freshness check (opt-out)", () => {
      const stale = body({
        timestamp: new Date(Date.now() - 24 * 3_600_000).toISOString(),
      });
      expect(
        verifyWebhookSignature({
          payload: stale,
          signature: sign(stale),
          secret,
          toleranceSeconds: 0,
        }),
      ).toBe(true);
    });

    it("accepts a numeric epoch-millis timestamp", () => {
      const raw = JSON.stringify({ event: "x", timestamp: Date.now() });
      expect(
        verifyWebhookSignature({ payload: raw, signature: sign(raw), secret }),
      ).toBe(true);
    });

    it("cannot be refreshed by editing the timestamp (breaks the signature)", () => {
      const original = body({
        timestamp: new Date(Date.now() - 10 * 60_000).toISOString(),
      });
      const signature = sign(original);
      // Attacker swaps in a fresh timestamp but keeps the original signature.
      const refreshed = body({ timestamp: new Date().toISOString() });
      expect(
        verifyWebhookSignature({ payload: refreshed, signature, secret }),
      ).toBe(false);
    });
  });
});
