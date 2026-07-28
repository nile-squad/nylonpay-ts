/**
 * Standalone webhook signature verification utility.
 * Merchants use this to confirm that incoming webhook payloads
 * were genuinely sent by Nylon Pay before acting on them.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { VerifyWebhookInput } from "./types";

/** Default replay-protection window: the signed timestamp must be this fresh. */
const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Explicit opt-out of the freshness check.
 *
 * Must be passed deliberately. `toleranceSeconds: 0` does NOT disable the
 * check — it means a tolerance of zero seconds, i.e. as strict as it gets,
 * which in practice rejects almost everything. That is the safe reading: a
 * developer reaching for `0` is asking for maximum strictness, and previously
 * got the exact opposite (no freshness check at all, silently).
 */
export const DISABLE_FRESHNESS_CHECK = -1;

/**
 * Raw bytes to sign. A Uint8Array is used as-is rather than round-tripped
 * through a string: decoding and re-encoding would silently rewrite any byte
 * sequence that is not valid UTF-8, producing a signature mismatch on a
 * payload that was in fact authentic.
 */
function toPayloadBytes(payload: string | Uint8Array): Buffer {
  return typeof payload === "string"
    ? Buffer.from(payload, "utf8")
    : Buffer.from(payload);
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
    // Numeric string first (e.g. "1718976000") — accepted so this SDK and the
    // Python one agree on every timestamp shape. Date.parse would read such a
    // string as a year, so it has to be handled before the ISO branch.
    const numeric = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(numeric)) {
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }

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
 *    legitimate traffic. `toleranceSeconds: 0` means zero tolerance (maximum
 *    strictness), NOT off — pass `DISABLE_FRESHNESS_CHECK` to opt out.
 *
 * @returns True when the signature is valid and (when enforced) the webhook is fresh. Never throws — returns false on any error.
 */
export function verifyWebhookSignature(input: VerifyWebhookInput): boolean {
  try {
    const payloadBytes = toPayloadBytes(input.payload);

    const expectedSignature = createHmac("sha256", input.secret)
      .update(payloadBytes)
      .digest("hex");

    // One canonical signature: lowercase hex, byte-for-byte what Nylon Pay
    // sends in `x-nylon-signature`. Comparing decoded bytes alone would also
    // accept uppercase hex — the same value spelled a second way — so the
    // canonical form is enforced explicitly, matching the Python SDK.
    if (input.signature !== input.signature.toLowerCase()) {
      return false;
    }

    const providedBuffer = Buffer.from(input.signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
      return false;
    }

    // Signature is authentic — now enforce freshness using the signed timestamp.
    const toleranceSeconds =
      input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
    if (toleranceSeconds === DISABLE_FRESHNESS_CHECK) {
      return true;
    }
    if (toleranceSeconds < 0) {
      return false;
    }

    // Decoding for the timestamp read is safe here: the bytes are already
    // proven authentic, and a body that is not UTF-8 JSON simply yields null.
    const timestampMs = extractSignedTimestampMs(
      payloadBytes.toString("utf8")
    );
    if (timestampMs === null) {
      // Fail closed: a valid signature with no verifiable timestamp cannot be
      // proven fresh, so it cannot be distinguished from a replay.
      return false;
    }

    const ageMs = Math.abs(Date.now() - timestampMs);
    return ageMs <= toleranceSeconds * 1000;
  } catch {
    return false;
  }
}
