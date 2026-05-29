/**
 * Standalone webhook signature verification utility.
 * Merchants use this to confirm that incoming webhook payloads
 * were genuinely sent by Nylon Pay before acting on them.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { VerifyWebhookInput } from "./types";

/**
 * Verify that a webhook payload was signed by Nylon Pay.
 * Operates on raw payload bytes, NOT parsed JSON (spec invariant #8).
 *
 * @param input.payload - Raw request body as string or Uint8Array
 * @param input.signature - Signature from the webhook header
 * @param input.secret - Merchant's webhook secret
 * @returns True when the signature is valid
 */
export function verifyWebhookSignature(input: VerifyWebhookInput): boolean {
  const payloadBytes =
    typeof input.payload === "string"
      ? Buffer.from(input.payload, "utf8")
      : Buffer.from(input.payload);

  const expectedSignature = createHmac("sha256", input.secret)
    .update(payloadBytes)
    .digest("hex");

  const providedBuffer = Buffer.from(input.signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
