/**
 * Factory function to create a Nylon Pay SDK instance.
 * This is the main entry point for merchants.
 *
 * Calling createNylonPay with the same apiKey, apiSecret and baseUrl returns the
 * same instance (singleton per key+secret+url). Rotating the secret yields a
 * fresh instance. Pass { force: true } to force a new instance regardless.
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

import { createHash } from "node:crypto";
import { createSdkInstance, type NylonPaySdk } from "./sdk";
import {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_POLL_ATTEMPTS,
  DEFAULT_MAX_POLL_DURATION_MS,
  DEFAULT_MAX_POLL_INTERVAL_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_STREAMING,
  DEFAULT_TIMEOUT_MS,
} from "./sdk.config";
import type { NylonPayConfig } from "./types";

const instances = new Map<string, NylonPaySdk>();

/**
 * Create a Nylon Pay SDK instance.
 *
 * Returns the same instance for the same apiKey + apiSecret + baseUrl
 * combination unless { force: true } is passed. Use your test keys for sandbox,
 * production keys for live.
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
  // Include a hash of the secret in the cache key so rotating apiSecret in a
  // long-running process returns a fresh instance instead of a stale one signing
  // with the old secret. Hashed (not raw) so the secret never sits in a Map key.
  const secretHash = createHash("sha256")
    .update(config.apiSecret)
    .digest("hex")
    .slice(0, 16);
  const instanceKey = `${config.apiKey}:${baseUrl}:${secretHash}`;

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
    streaming: config.streaming ?? DEFAULT_STREAMING,
    fetch: config.fetch ?? globalThis.fetch.bind(globalThis),
    hooks: config.hooks,
  };

  const instance = createSdkInstance(resolvedConfig);
  instances.set(instanceKey, instance);
  return instance;
}
