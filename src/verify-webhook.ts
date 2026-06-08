/**
 * Standalone webhook signature verification utility.
 * Merchants use this to confirm that incoming webhook payloads
 * were genuinely sent by Nylon Pay before acting on them.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { VerifyWebhookInput } from "./types";

/** Default replay-protection window: the signed timestamp must be this fresh. */
const DEFAULT_TOLERANCE_SECONDS = 300;

/** Decode the (already signature-verified) payload to a UTF-8 string. */
function decodePayload(payload: string | Uint8Array): string {
  return typeof payload === "string"
    ? payload
    : Buffer.from(payload).toString("utf8");
}

/**
 * Pull the signed `timestamp` out of a verified webhook body and return it as
 * epoch milliseconds. The timestamp lives inside the HMAC-signed body (the
 * backend stamps every delivery and every retry fresh), so it cannot be forged
 * or refreshed by a replay attacker without the secret. Returns `null` when the
 * body is not JSON or carries no parseable timestamp.
 */
function extractSignedTimestampMs(payloadString: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadString);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const raw = (parsed as Record<string, unknown>).timestamp;

  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Accept epoch seconds or milliseconds — values below ~1e12 are seconds.
    return raw < 1e12 ? raw * 1000 : raw;
  }

  if (typeof raw === "string") {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? null : ms;
  }

  return null;
}

/**
 * Verify that a webhook payload was genuinely sent by Nylon Pay.
 *
 * Two checks, both must pass:
 * 1. **Authenticity** — HMAC-SHA256 over the raw payload bytes (NOT parsed
 *    JSON, spec invariant #8) matches the provided signature.
 * 2. **Freshness** — the `timestamp` carried inside the signed body is within
 *    `toleranceSeconds` of now (default 300s). This is what stops a replay: a
 *    captured `(body, signature)` pair stays cryptographically valid forever,
 *    but its embedded timestamp goes stale. Every genuine delivery, including
 *    retries hours later, is re-stamped and re-signed, so this never rejects
 *    legitimate traffic. Pass `toleranceSeconds: 0` to skip this check.
 *
 * @returns True when the signature is valid and (when enforced) the webhook is fresh
 */
export function verifyWebhookSignature(input: VerifyWebhookInput): boolean {
  const payloadString = decodePayload(input.payload);
  const payloadBytes = Buffer.from(payloadString, "utf8");

  const expectedSignature = createHmac("sha256", input.secret)
    .update(payloadBytes)
    .digest("hex");

  const providedBuffer = Buffer.from(input.signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return false;
  }

  // Signature is authentic — now enforce freshness using the signed timestamp.
  const toleranceSeconds = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (toleranceSeconds <= 0) {
    return true;
  }

  const timestampMs = extractSignedTimestampMs(payloadString);
  if (timestampMs === null) {
    // Fail closed: a valid signature with no verifiable timestamp cannot be
    // proven fresh, so it cannot be distinguished from a replay.
    return false;
  }

  const ageMs = Math.abs(Date.now() - timestampMs);
  return ageMs <= toleranceSeconds * 1000;
}
