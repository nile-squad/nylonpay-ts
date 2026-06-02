/**
 * Factory function to create a Nylon Pay SDK instance.
 * This is the main entry point for merchants.
 *
 * Calling createNylonPay with the same apiKey and baseUrl returns the same
 * instance (singleton per key+url pair). Pass { force: true } to create a
 * fresh instance and replace the cached one.
 *
 * @example
 * ```ts
 * import { createNylonPay } from "@nile-squad/nylonpay-ts";
 *
 * export const nylonpay = createNylonPay({
 *   apiKey: "npk_...",
 *   apiSecret: "nps_...",
 * });
 * ```
 */

import { createSdkInstance, type NylonPaySdk } from "./sdk";
import {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_POLL_ATTEMPTS,
  DEFAULT_MAX_POLL_DURATION_MS,
  DEFAULT_MAX_POLL_INTERVAL_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
} from "./sdk.config";
import type { NylonPayConfig } from "./types";

const instances = new Map<string, NylonPaySdk>();

/**
 * Create a Nylon Pay SDK instance.
 *
 * Returns the same instance for the same apiKey + baseUrl combination unless
 * { force: true } is passed. Use your test keys for sandbox, production keys
 * for live.
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

  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const instanceKey = `${config.apiKey}:${baseUrl}`;

  if (!config.force) {
    const existing = instances.get(instanceKey);
    if (existing) return existing;
  }

  const resolvedConfig = {
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    baseUrl,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    maxPollIntervalMs: config.maxPollIntervalMs ?? DEFAULT_MAX_POLL_INTERVAL_MS,
    maxPollDurationMs: config.maxPollDurationMs ?? DEFAULT_MAX_POLL_DURATION_MS,
    maxPollAttempts: config.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS,
    fetch: config.fetch ?? globalThis.fetch.bind(globalThis),
    hooks: config.hooks,
  };

  const instance = createSdkInstance(resolvedConfig);
  instances.set(instanceKey, instance);
  return instance;
}
