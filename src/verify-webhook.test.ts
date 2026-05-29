import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./verify-webhook";

const secret = "test-webhook-secret";
const payload = JSON.stringify({ event: "collection.completed", data: {} });
const validSignature = createHmac("sha256", secret)
  .update(payload)
  .digest("hex");

describe("verifyWebhookSignature", () => {
  it("returns true for valid signature", () => {
    const result = verifyWebhookSignature({
      payload,
      signature: validSignature,
      secret,
    });
    expect(result).toBe(true);
  });

  it("returns false for invalid signature", () => {
    const result = verifyWebhookSignature({
      payload,
      signature: "invalid-signature",
      secret,
    });
    expect(result).toBe(false);
  });

  it("returns false for tampered payload", () => {
    const tamperedPayload = JSON.stringify({
      event: "collection.failed",
      data: {},
    });
    const result = verifyWebhookSignature({
      payload: tamperedPayload,
      signature: validSignature,
      secret,
    });
    expect(result).toBe(false);
  });

  it("works with string payload", () => {
    const stringPayload = '{"event":"test"}';
    const signature = createHmac("sha256", secret)
      .update(stringPayload)
      .digest("hex");
    const result = verifyWebhookSignature({
      payload: stringPayload,
      signature,
      secret,
    });
    expect(result).toBe(true);
  });

  it("works with Uint8Array payload", () => {
    const bytes = new TextEncoder().encode(payload);
    const signature = createHmac("sha256", secret).update(bytes).digest("hex");
    const result = verifyWebhookSignature({
      payload: bytes,
      signature,
      secret,
    });
    expect(result).toBe(true);
  });

  it("works with empty payload", () => {
    const emptyPayload = "";
    const signature = createHmac("sha256", secret)
      .update(emptyPayload)
      .digest("hex");
    const result = verifyWebhookSignature({
      payload: emptyPayload,
      signature,
      secret,
    });
    expect(result).toBe(true);
  });

  it("returns false when signature is missing", () => {
    const result = verifyWebhookSignature({
      payload,
      signature: "",
      secret,
    });
    expect(result).toBe(false);
  });
});
