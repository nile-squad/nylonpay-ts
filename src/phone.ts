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

/**
 * Cheap client-side check that a normalized phone number is plausibly valid.
 *
 * WHY: `normalizePhone` is intentionally pure — it transforms but never rejects,
 * so garbage like "not-a-phone" or "123" passes through unchanged. This is the
 * synchronous mirror of the backend's `validatePhone`, letting bad input fail
 * before a network round-trip. It is deliberately loose (9–15 digits) — the
 * server remains the source of truth for strict per-country validation.
 *
 * Expects an already-normalized value (digits only, no `+` or spaces).
 */
export function isValidPhoneFormat(normalizedPhone: string): boolean {
  return /^\d{9,15}$/.test(normalizedPhone);
}
