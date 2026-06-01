/**
 * Factory function to create a Nylon Pay SDK instance.
 * This is the main entry point for merchants.
 *
 * @example
 * ```ts
 * import { createNylonPay } from "@nylonpay/sdk";
 *
 * export const nylonpay = createNylonPay({
 *   apiKey: process.env.NYLONPAY_API_KEY!,
 *   apiSecret: process.env.NYLONPAY_API_SECRET!,
 * });
 * ```
 */

import { createSdkInstance, type NylonPaySdk } from "./sdk";
import type { NylonPayConfig } from "./types";
import {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_POLL_ATTEMPTS,
  DEFAULT_MAX_POLL_DURATION_MS,
  DEFAULT_MAX_POLL_INTERVAL_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
} from "./sdk.config";

/**
 * Create a Nylon Pay SDK instance.
 *
 * @param config - SDK configuration with apiKey and apiSecret
 * @returns SDK instance with all payment operations
 *
 * @throws Error if required config is missing or invalid
 */
export function createNylonPay(config: NylonPayConfig): NylonPaySdk {
  if (!config.apiKey) {
    throw new Error("apiKey is required");
  }
  if (!config.apiKey.startsWith("npk_")) {
    throw new Error('apiKey must start with "npk_"');
  }
  if (!config.apiSecret) {
    throw new Error("apiSecret is required");
  }
  if (!config.apiSecret.startsWith("nps_")) {
    throw new Error('apiSecret must start with "nps_"');
  }

  const resolvedConfig = {
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    maxPollIntervalMs: config.maxPollIntervalMs ?? DEFAULT_MAX_POLL_INTERVAL_MS,
    maxPollDurationMs:
      config.maxPollDurationMs ?? DEFAULT_MAX_POLL_DURATION_MS,
    maxPollAttempts: config.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS,
    fetch: config.fetch ?? globalThis.fetch.bind(globalThis),
  };

  return createSdkInstance(resolvedConfig);
}
