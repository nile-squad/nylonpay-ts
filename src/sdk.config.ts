/** Default production backend URL */
export const DEFAULT_BASE_URL =
  "https://api.nylonpay.nilesquad.com/api/services";

/** Default request timeout (30 seconds) */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Default max retry attempts for transport failures */
export const DEFAULT_MAX_RETRIES = 3;

/** Default polling interval between status checks (2 seconds) */
export const DEFAULT_MAX_POLL_INTERVAL_MS = 2_000;

/** Default max total polling duration before timing out (5 minutes) */
export const DEFAULT_MAX_POLL_DURATION_MS = 300_000;

/** Default max polling attempts before giving up */
export const DEFAULT_MAX_POLL_ATTEMPTS = 150;

/** Stream status updates over SSE by default (with polling fallback). */
export const DEFAULT_STREAMING = true;

/** Path of the SDK status stream route (lives at the host root, not under the action path). */
export const STREAM_PATH = "/sse/transaction";

/** Max stream reconnect attempts before falling back to polling. */
export const MAX_STREAM_RECONNECTS = 2;

/**
 * Max size (in string length) the SSE read buffer may reach before a frame
 * separator (`\n\n`) arrives. A server that streams without separators would
 * otherwise grow the buffer unbounded — exceeding this closes the stream with an
 * error (which falls back to polling). 1 MiB is far above any real status frame.
 */
export const MAX_SSE_BUFFER_LENGTH = 1024 * 1024;

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
  verifyPhone: "sdk-verify-phone",
  createInvoice: "sdk-create-invoice",
} as const;

/** HTTP status codes that trigger retries */
export const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
