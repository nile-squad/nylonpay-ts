/**
 * Cryptographically secure nonce generation for SDK requests.
 *
 * @see Spec 2 section 1 - "Internally the sdk generates a nounce"
 */

import { randomBytes } from "node:crypto";

/**
 * Generate a cryptographically secure random nonce.
 * Uses Node.js crypto.randomBytes for security.
 *
 * @param length - Byte length of the nonce (default: 16 = 32 hex chars)
 * @returns Hex-encoded random string
 *
 * @example
 * ```ts
 * const nonce = generateNonce();
 * // => "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
 * ```
 */
export function generateNonce(length = 16): string {
  return randomBytes(length).toString("hex");
}
