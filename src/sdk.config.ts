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

/** After a successful round-trip, skip reachability checks for this long. */
export const REACHABILITY_SUCCESS_FRESH_MS = 5 * 60 * 1000;

/**
 * After an unreachable failure, skip re-checking on every poll. The next
 * check runs when a new operation is attempted after this pause.
 */
export const REACHABILITY_DOWN_RECHECK_MS = 15_000;

/** Short timeout for a reachability check so it cannot stall a payment. */
export const REACHABILITY_PROBE_TIMEOUT_MS = 3_000;

/** `SdkError.code` when the SDK skipped a call because Nylon was unreachable. */
export const UNREACHABLE_CODE = "unreachable";

/** Host has no usable network. Stable string for `unreachable` handlers. */
export const UNREACHABLE_HOST_OFFLINE = "host has no internet connection";

/** Nylon Pay's edge or API did not complete a request. Stable string. */
export const UNREACHABLE_NYLON_DOWN = "Nylon Pay services seem to be down";

/** Nile.js service name for all SDK operations */
export const SDK_SERVICE = "sdk";

/** Maps SDK operation names to backend action names */
export const SDK_ACTIONS = {
  collectPayment: "sdk-collect-payment",
  collectPaymentAndResolve: "sdk-collect-payment-and-resolve",
  makePayout: "sdk-make-payout",
  makePayoutAndResolve: "sdk-make-payout-and-resolve",
  payBill: "sdk-pay-bill",
  buyAirtime: "sdk-buy-airtime",
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
