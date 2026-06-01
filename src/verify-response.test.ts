import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCanonicalPayload } from "./signature";
import { verifyResponseSignature } from "./verify-response";

function signResponse(payload: unknown, secret: string): string {
  return createHmac("sha256", secret)
    .update(createCanonicalPayload(payload))
    .digest("hex");
}

describe("verifyResponseSignature", () => {
  it("passes for a valid signature", () => {
    const data = {
      reference: "d3b07384-d9a0-4b4a-8f7f-3f5b4f13a4f2",
      status: "processing",
      transactionId: "txn_123",
    };
    const signature = signResponse(data, "secret-key");

    expect(verifyResponseSignature(data, signature, "secret-key")).toBe(true);
  });

  it("fails for tampered data", () => {
    const data = {
      reference: "d3b07384-d9a0-4b4a-8f7f-3f5b4f13a4f2",
      status: "processing",
      transactionId: "txn_123",
    };
    const signature = signResponse(data, "secret-key");

    expect(
      verifyResponseSignature(
        { ...data, status: "successful" },
        signature,
        "secret-key",
      ),
    ).toBe(false);
  });

  it("fails for wrong secret", () => {
    const data = {
      reference: "d3b07384-d9a0-4b4a-8f7f-3f5b4f13a4f2",
      status: "processing",
      transactionId: "txn_123",
    };
    const signature = signResponse(data, "correct-secret");

    expect(verifyResponseSignature(data, signature, "wrong-secret")).toBe(
      false,
    );
  });
});
