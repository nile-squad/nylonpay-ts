import { createHmac, timingSafeEqual } from "node:crypto";
import { createCanonicalPayload } from "./signature";

/**
 * Verify an authenticated backend response body before exposing it to SDK
 * consumers so tampered payloads are rejected consistently.
 *
 * @param data - Response payload without the `_responseSignature` field
 * @param signature - Hex-encoded HMAC-SHA256 signature from the backend
 * @param secret - API secret used for request authentication
 * @returns True when the signature matches the payload
 */
export function verifyResponseSignature(
  data: unknown,
  signature: string,
  secret: string,
): boolean {
  const expectedSignature = createHmac("sha256", secret)
    .update(createCanonicalPayload(data))
    .digest("hex");

  const providedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
