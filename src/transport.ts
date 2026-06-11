/**
 * HTTP transport layer for SDK communication with the Nylon Pay backend.
 * Handles the Nile.js envelope format, HMAC request signing, response
 * signature verification, retries, and timeouts.
 *
 * @internal
 */

import { Err, Ok, type Result } from "slang-ts";
import { generateFingerprint } from "./fingerprint";
import { generateNonce } from "./nonce";
import {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  RETRYABLE_STATUS_CODES,
  SDK_SERVICE,
} from "./sdk.config";
import { createSignature, createTimestamp } from "./signature";
import type { SdkError, SdkErrorCategory, TransportRequest } from "./types";
import { verifyResponseSignature } from "./verify-response";

/** Cached fingerprint for this server instance. */
const CACHED_FINGERPRINT = generateFingerprint();

/** Known failure categories the server tags onto error messages. */
const KNOWN_CATEGORIES = new Set<SdkErrorCategory>([
  "auth",
  "validation",
  "limit",
  "rate_limit",
  "account",
  "provider",
  "duplicate",
  "not_found",
  "internal",
  "network",
  "timeout",
]);

/** HTTP status → category for errors that aren't server-tagged. */
const STATUS_CATEGORY: Record<number, SdkErrorCategory> = {
  408: "timeout",
  429: "rate_limit",
};

/** Matches the server's ` -- error-type: <category>` message suffix. */
const ERROR_TYPE_SUFFIX = /^(.*?)\s*--\s*error-type:\s*([a-z_]+)\s*$/is;

/**
 * Split the server's tagged category off an error message. The backend appends
 * ` -- error-type: <category>` to every SDK error (the only channel available —
 * Nile returns 200/400 only and drops the response `data` on failures). The
 * leading `[logId]` and human text are preserved as the message.
 */
function parseCategoryFromMessage(message: string): {
  category: SdkErrorCategory | null;
  message: string;
} {
  const match = ERROR_TYPE_SUFFIX.exec(message);
  if (match?.[2] && KNOWN_CATEGORIES.has(match[2] as SdkErrorCategory)) {
    return {
      category: match[2] as SdkErrorCategory,
      message: match[1] ?? message,
    };
  }
  return { category: null, message };
}

/** Build a structured SdkError from an HTTP error body's message + status. */
function buildHttpError(params: {
  message: string;
  statusCode: number;
}): SdkError {
  const parsed = parseCategoryFromMessage(params.message);
  const category: SdkErrorCategory =
    parsed.category ??
    STATUS_CATEGORY[params.statusCode] ??
    (params.statusCode >= 500 ? "internal" : "validation");
  return {
    category,
    message: parsed.message,
    retryable: RETRYABLE_STATUS_CODES.has(params.statusCode),
  };
}

/**
 * Convert a structured SdkError into a throwable Error that still carries the
 * category and retryable flag. Used by async operations that throw on
 * initiation failure (invalid key, etc.) so merchants can `catch (e)` and read
 * `e.category`.
 */
export function createSdkError(error: SdkError): Error & SdkError {
  return Object.assign(new Error(error.message), {
    category: error.category,
    retryable: error.retryable,
  });
}

/** Calculate exponential backoff delay with jitter. */
function calculateBackoff(attempt: number): number {
  const base = 2 ** attempt * 1000;
  const jitter = Math.random() * 500;
  return base + jitter;
}

/** Promise-based delay. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strip _responseSignature from a payload and return it separately. */
function stripResponseSignature<T>(payload: T): {
  data: T;
  responseSignature: string | null;
} {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("_responseSignature" in payload)
  ) {
    return { data: payload, responseSignature: null };
  }

  const { _responseSignature, ...rest } = payload as Record<string, unknown>;

  return {
    data: rest as T,
    responseSignature:
      typeof _responseSignature === "string" ? _responseSignature : null,
  };
}

/** Build the Nile.js request envelope. */
function buildEnvelope({
  action,
  payload,
}: TransportRequest): Record<string, unknown> {
  return {
    intent: "execute",
    service: SDK_SERVICE,
    action,
    payload: {
      ...(payload as Record<string, unknown>),
      _fingerprint: CACHED_FINGERPRINT,
    },
  };
}

/**
 * Build auth headers for a request.
 *
 * The signature is computed over the inner `payload` (the operation input plus
 * `_fingerprint`), NOT the full Nile envelope. This matches the server, which
 * verifies the signature against the raw request payload — see the Transport
 * Contract in the Nylon Pay SDK Spec (https://github.com/nile-squad/specs).
 */
function buildAuthHeaders({
  apiKey,
  apiSecret,
  payload,
}: {
  apiKey: string;
  apiSecret: string;
  payload: unknown;
}): Record<string, string> {
  const nonce = generateNonce();
  const timestamp = createTimestamp();
  const signature = createSignature({
    fingerprint: CACHED_FINGERPRINT,
    nonce,
    timestamp,
    payload,
    secret: apiSecret,
  });

  return {
    "content-type": "application/json",
    "x-nylon-key": apiKey,
    "x-nylon-nonce": nonce,
    "x-nylon-signature": signature,
    "x-nylon-timestamp": timestamp,
  };
}

/** Create an AbortController with a timeout. Returns cleanup to clear the timer. */
function withTimeout(timeoutMs: number): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, cleanup: () => clearTimeout(timeoutId) };
}

/**
 * Create the transport layer for SDK requests.
 *
 * @param config - Resolved SDK configuration
 * @returns Transport functions
 *
 * @internal
 */
export function createTransport({
  apiKey,
  apiSecret,
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  fetch: fetchImpl,
}: {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetch: typeof globalThis.fetch;
}) {
  /**
   * Send a request to the backend.
   * Builds the envelope and headers once, then retries only the fetch call.
   */
  async function send<T>(
    request: TransportRequest,
  ): Promise<Result<T, string>> {
    const envelope = buildEnvelope(request);
    const signedPayload = (envelope as { payload: unknown }).payload;
    const headers = buildAuthHeaders({
      apiKey,
      apiSecret,
      payload: signedPayload,
    });
    const bodyString = JSON.stringify(envelope);

    async function attempt(currentAttempt: number): Promise<Result<T, string>> {
      const { controller, cleanup } = withTimeout(timeoutMs);

      try {
        const response = await fetchImpl(baseUrl, {
          method: "POST",
          headers,
          body: bodyString,
          signal: controller.signal,
        });

        if (!response.ok) {
          const statusCode = response.status;
          const retryable = RETRYABLE_STATUS_CODES.has(statusCode);

          let errorMessage = `HTTP ${statusCode}`;
          try {
            const errorBody = await response.json();
            if (
              errorBody &&
              typeof errorBody === "object" &&
              "message" in errorBody
            ) {
              errorMessage = String(errorBody.message);
            }
          } catch {
            errorMessage = response.statusText || errorMessage;
          }

          if (retryable && currentAttempt < maxRetries) {
            cleanup();
            await delay(calculateBackoff(currentAttempt));
            return attempt(currentAttempt + 1);
          }

          cleanup();
          return Err(
            JSON.stringify(
              buildHttpError({ message: errorMessage, statusCode }),
            ),
          );
        }

        const responseBody = await response.json();

        if (
          !responseBody ||
          typeof responseBody !== "object" ||
          !("status" in responseBody)
        ) {
          cleanup();
          return Err(
            JSON.stringify({
              category: "internal",
              message: "Response missing status field",
              retryable: false,
            } satisfies SdkError),
          );
        }

        const { status, message, data } = responseBody as {
          status: boolean;
          message: string;
          data: unknown;
        };

        if (status === true) {
          const { data: strippedData, responseSignature } =
            stripResponseSignature(data);

          // Fail closed. Every authenticated success response from the backend
          // is signed (see backend signSdkResponse). A missing signature means
          // the response was tampered with — e.g. a MITM stripped the field — or
          // did not originate from the backend. Reject rather than trust
          // unverified data; a prior version skipped verification when the field
          // was absent, which let a stripped-signature response through.
          if (!responseSignature) {
            cleanup();
            return Err(
              JSON.stringify({
                category: "internal",
                message: "Response signature missing",
                retryable: false,
              } satisfies SdkError),
            );
          }

          const isValid = verifyResponseSignature(
            strippedData,
            responseSignature,
            apiSecret,
          );
          if (!isValid) {
            cleanup();
            return Err(
              JSON.stringify({
                category: "internal",
                message: "Response signature verification failed",
                retryable: false,
              } satisfies SdkError),
            );
          }

          cleanup();
          return Ok(strippedData as T);
        }

        // status === false
        const parsedError = parseError(message);
        cleanup();
        return Err(JSON.stringify(parsedError));
      } catch (error) {
        cleanup();

        const isAbort =
          error instanceof DOMException && error.name === "AbortError";
        const sdkError: SdkError = {
          category: isAbort ? "timeout" : "network",
          message: isAbort
            ? `Request timed out after ${timeoutMs}ms`
            : String(error),
          retryable: true,
        };

        if (currentAttempt < maxRetries) {
          await delay(calculateBackoff(currentAttempt));
          return attempt(currentAttempt + 1);
        }

        return Err(JSON.stringify(sdkError));
      }
    }

    return attempt(0);
  }

  return { send, parseError };
}

/**
 * Parse an error string into a structured SdkError with a `category`.
 * Tries the JSON envelope first; otherwise pulls the server's
 * ` -- error-type: <category>` suffix off a raw message, falling back to
 * category `internal` when untagged.
 *
 * @example
 * ```ts
 * const result = await sdk.getStatus({ reference: "ORDER-2026-001" });
 * if (!result.isOk) {
 *   const error = parseError(result.error);
 *   console.log(error.category, error.message);
 * }
 * ```
 */
export function parseError(error: string): SdkError {
  // Sync helper: `safeTry` is async-only. The try/catch is the sync
  // boundary for JSON.parse and stays as-is (mirrors the pre-existing
  // contract that the SDK always exposes `parseError` synchronously).
  try {
    const parsed = JSON.parse(error) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "category" in parsed &&
      "message" in parsed &&
      typeof (parsed as Record<string, unknown>).category === "string" &&
      typeof (parsed as Record<string, unknown>).message === "string"
    ) {
      return parsed as SdkError;
    }
  } catch {
    // Not our JSON envelope — fall through to suffix parsing.
  }

  // Raw server message: pull the ` -- error-type: <category>` suffix if present.
  const fromSuffix = parseCategoryFromMessage(error);
  return {
    category: fromSuffix.category ?? "internal",
    message: fromSuffix.message,
  };
}
