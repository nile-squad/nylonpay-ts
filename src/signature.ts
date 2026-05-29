/**
 * HMAC-SHA256 signature creation for SDK requests.
 * Must match the backend's verification logic in verify-signature.ts.
 *
 * Signature payload format: fingerprint.nonce.timestamp.canonicalPayload
 *
 * @see backend/src/services/sdk/verify-signature.ts
 * @see Spec 2 section 1 - "creates a signature using these values and the api secret (HMAC 256)"
 */

import { createHmac } from "node:crypto";

/**
 * Recursively sort object keys alphabetically for deterministic JSON.
 * Must match backend's createCanonicalPayload function.
 *
 * @see backend/src/services/sdk/create-canonical-payload.ts
 */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }

  if (value && typeof value === "object") {
    const sortedEntries = Object.entries(value as Record<string, unknown>).sort(
      ([firstKey], [secondKey]) => firstKey.localeCompare(secondKey)
    );

    return Object.fromEntries(
      sortedEntries.map(([entryKey, entryValue]) => [
        entryKey,
        sortValue(entryValue),
      ])
    );
  }

  return value;
}

/**
 * Create a canonical JSON string from a payload.
 * Keys are sorted alphabetically for deterministic serialization.
 */
export function createCanonicalPayload(payload: unknown): string {
  return JSON.stringify(sortValue(payload));
}

/**
 * Build the signature payload string.
 * Format: fingerprint.nonce.timestamp.canonicalPayload
 *
 * The fingerprint is included in the signature to prevent tampering
 * with server identity information.
 *
 * @see backend/src/services/sdk/verify-signature.ts:createSignaturePayload
 */
export function createSignaturePayload(input: {
  fingerprint: string;
  nonce: string;
  payload: unknown;
  timestamp: string;
}): string {
  return `${input.fingerprint}.${input.nonce}.${input.timestamp}.${createCanonicalPayload(input.payload)}`;
}

/**
 * Create an HMAC-SHA256 signature for SDK request authentication.
 *
 * The signature includes the server fingerprint to ensure the request
 * origin cannot be spoofed. The fingerprint contains runtime/OS info
 * that is bound to this specific server instance.
 *
 * @param input.fingerprint - Server fingerprint (included in signature)
 * @param input.nonce - Random nonce for replay protection
 * @param input.timestamp - Unix timestamp in milliseconds
 * @param input.payload - Request body (will be canonicalized)
 * @param input.secret - API secret for signing
 * @returns Hex-encoded HMAC-SHA256 signature
 */
export function createSignature(input: {
  fingerprint: string;
  nonce: string;
  payload: unknown;
  secret: string;
  timestamp: string;
}): string {
  const payload = createSignaturePayload(input);

  return createHmac("sha256", input.secret).update(payload).digest("hex");
}

/**
 * Create a timestamp string in milliseconds.
 * Used as part of the signature payload.
 */
export function createTimestamp(): string {
  return Date.now().toString();
}
