/**
 * Normalize a phone number to international digits without a leading +.
 *
 * - Strips all whitespace
 * - Strips leading +
 * - If starts with "0" and length is 10 → prepend that currency's dial code
 *
 * Local `0…` numbers take the dial code for `currency` (UGX 256, KES 254,
 * TZS 255, RWF 250, CDF 243, ZMW 260, XAF 237). Unknown currency uses 256.
 * International numbers already carrying a calling code pass through.
 */
const DIAL_BY_CURRENCY: Readonly<Record<string, string>> = {
  CDF: "243",
  KES: "254",
  RWF: "250",
  TZS: "255",
  UGX: "256",
  XAF: "237",
  ZMW: "260",
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
 * synchronous mirror of the backend's cheap check, letting bad input fail
 * before a network round-trip. It is deliberately loose (9–15 digits) — the
 * server remains the source of truth for strict per-country validation.
 *
 * Expects an already-normalized value (digits only, no `+` or spaces).
 */
export function isValidPhoneFormat(normalizedPhone: string): boolean {
  return /^\d{9,15}$/.test(normalizedPhone);
}
