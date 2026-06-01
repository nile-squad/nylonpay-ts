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
import type { SdkError, TransportRequest } from "./types";
import { verifyResponseSignature } from "./verify-response";

/** Cached fingerprint for this server instance. */
const CACHED_FINGERPRINT = generateFingerprint();

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

          const sdkError: SdkError = {
            code: `HTTP_${statusCode}`,
            message: errorMessage,
            statusCode,
            retryable,
          };

          cleanup();
          return Err(JSON.stringify(sdkError));
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
              code: "INVALID_RESPONSE",
              message: "Response missing status field",
              retryable: false,
            }),
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

          if (responseSignature) {
            const isValid = verifyResponseSignature(
              strippedData,
              responseSignature,
              apiSecret,
            );
            if (!isValid) {
              cleanup();
              return Err(
                JSON.stringify({
                  code: "RESPONSE_TAMPERED",
                  message: "Response signature verification failed",
                  retryable: false,
                }),
              );
            }
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
          code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
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
 * Parse an error string into an SdkError object.
 * Tries JSON.parse first; falls back to a generic UNKNOWN error.
 *
 * @example
 * ```ts
 * const result = await sdk.getStatus({ reference: "ORDER-123" });
 * if (!result.isOk) {
 *   const error = parseError(result.error);
 *   console.log(error.code, error.message);
 * }
 * ```
 */
export function parseError(error: string): SdkError {
  try {
    const parsed = JSON.parse(error) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "code" in parsed &&
      "message" in parsed &&
      typeof (parsed as Record<string, unknown>).code === "string" &&
      typeof (parsed as Record<string, unknown>).message === "string"
    ) {
      return parsed as SdkError;
    }
  } catch {
    // Not JSON, fall through
  }

  return { code: "UNKNOWN", message: error };
}
