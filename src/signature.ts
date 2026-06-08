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
 * Recursively sort object keys by Unicode code point for deterministic JSON.
 *
 * The comparison MUST be by UTF-16 code unit (the JavaScript `<` operator), the
 * canonicalization rule from RFC 8785 (JSON Canonicalization Scheme). A
 * locale-sensitive comparison (e.g. `localeCompare`) is forbidden: its order
 * depends on the runtime's locale/ICU data, so two parties could canonicalize
 * the same payload to different bytes and fail signature verification on valid
 * traffic. Must match backend's createCanonicalPayload function byte-for-byte.
 *
 * @see backend/src/services/sdk/create-canonical-payload.ts
 */
/** Compare two keys by UTF-16 code unit (RFC 8785), never by locale. */
function compareByCodePoint(first: string, second: string): number {
  if (first < second) {
    return -1;
  }
  if (first > second) {
    return 1;
  }
  return 0;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }

  if (value && typeof value === "object") {
    const sortedEntries = Object.entries(value as Record<string, unknown>).sort(
      ([firstKey], [secondKey]) => compareByCodePoint(firstKey, secondKey),
    );

    return Object.fromEntries(
      sortedEntries.map(([entryKey, entryValue]) => [
        entryKey,
        sortValue(entryValue),
      ]),
    );
  }

  return value;
}

/**
 * Create a canonical JSON string from a payload, per RFC 8785 (JCS): object keys
 * sorted by Unicode code point, no insignificant whitespace. Numbers and strings
 * serialize via `JSON.stringify`, whose V8 output already matches the JCS rules
 * (ECMAScript number-to-string and minimal JSON string escaping).
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
