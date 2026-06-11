/**
 * Normalize a phone number to international format without leading +.
 *
 * - Strips all whitespace
 * - Strips leading +
 * - If starts with "0" and length is 10 → prepend "256"
 *
 * WHY: Phone numbers like "0768499027" reach the backend unnormalized.
 * SDK normalizing first means the wire payload is already correct,
 * providing defense-in-depth even though the backend also normalizes.
 */
export function normalizePhone(phone: string): string {
  let normalized = phone.replace(/\s+/g, "").replace(/^\+/, "");

  if (normalized.startsWith("0") && normalized.length === 10) {
    normalized = `256${normalized.slice(1)}`;
  }

  return normalized;
}
