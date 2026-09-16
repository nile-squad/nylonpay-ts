/**
 * Normalize a phone number to international format without leading +.
 *
 * - Strips all whitespace
 * - Strips leading +
 * - If starts with "0" and length is 10 → prepend that currency's dial code
 *
 * Uganda local numbers still become 256… when currency is omitted or UGX.
 * Kenya, Tanzania, Rwanda and DRC local numbers take 254, 255, 250 and 243.
 */
const DIAL_BY_CURRENCY: Readonly<Record<string, string>> = {
  CDF: "243",
  KES: "254",
  RWF: "250",
  TZS: "255",
  UGX: "256",
};

export function normalizePhone(phone: string, currency = "UGX"): string {
  let normalized = phone.replace(/\s+/g, "").replace(/^\+/, "");
  const dial = DIAL_BY_CURRENCY[currency.toUpperCase()] ?? "256";

  if (normalized.startsWith("0") && normalized.length === 10) {
    normalized = `${dial}${normalized.slice(1)}`;
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
