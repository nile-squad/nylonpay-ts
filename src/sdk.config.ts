/** Default production backend URL */
export const DEFAULT_BASE_URL =
  "https://api.nylonpay.nilesquad.com/api/services";

/** Default request timeout (90 seconds — covers server inline resolve windows). */
export const DEFAULT_TIMEOUT_MS = 90_000;

/** Default max retry attempts for transport failures */
export const DEFAULT_MAX_RETRIES = 3;

/** Default polling interval between status checks (2 seconds) */
export const DEFAULT_MAX_POLL_INTERVAL_MS = 2_000;

/**
 * Optional merchant cap on total polling duration. Undefined = wait until terminal.
 * Previously defaulted to 5 minutes; merchants set this explicitly to bound waits.
 */
export const DEFAULT_MAX_POLL_DURATION_MS = undefined;

/** Optional merchant cap on poll attempts. Undefined = wait until terminal. */
export const DEFAULT_MAX_POLL_ATTEMPTS = undefined;

/**
 * Random jitter (ms) added to each poll interval so many concurrent payments
 * don't synchronise into a thundering herd on the status endpoint.
 */
export const POLL_JITTER_MS = 250;

/** Nile.js service name for all SDK operations */
export const SDK_SERVICE = "sdk";

/** Maps SDK operation names to backend action names */
export const SDK_ACTIONS = {
  collectPayment: "sdk-collect-payment",
  collectPaymentAndResolve: "sdk-collect-payment-and-resolve",
  makePayout: "sdk-make-payout",
  makePayoutAndResolve: "sdk-make-payout-and-resolve",
  getStatus: "sdk-get-status",
  getTransaction: "sdk-get-transaction",
  listTransactions: "sdk-list-transactions",
  verifyPhone: "sdk-verify-phone",
  createInvoice: "sdk-create-invoice",
} as const;

/** HTTP status codes that trigger retries */
export const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

/** Maximum response body size (10 MB) — responses exceeding this are rejected before parsing. */
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
