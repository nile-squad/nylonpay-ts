/**
 * Map wire categories and reachability outcomes onto the merchant-facing
 * ALL-CAPS `reason`. `category` and `code` stay as deprecated aliases.
 *
 * @internal
 */

import {
  UNREACHABLE_CODE,
  UNREACHABLE_HOST_OFFLINE,
  UNREACHABLE_NYLON_DOWN,
} from "./sdk.config";
import type { SdkError, SdkErrorCategory, SdkErrorReason } from "./types";

export const SDK_ERROR_REASONS = [
  "AUTH",
  "VALIDATION",
  "LIMIT",
  "RATE_LIMIT",
  "ACCOUNT",
  "PROVIDER",
  "DUPLICATE",
  "NOT_FOUND",
  "INTERNAL",
  "NETWORK",
  "SERVICES_DOWN",
  "TIMEOUT",
] as const;

const REASON_SET = new Set<string>(SDK_ERROR_REASONS);

const CATEGORY_TO_REASON: Record<SdkErrorCategory, SdkErrorReason> = {
  auth: "AUTH",
  validation: "VALIDATION",
  limit: "LIMIT",
  rate_limit: "RATE_LIMIT",
  account: "ACCOUNT",
  provider: "PROVIDER",
  duplicate: "DUPLICATE",
  not_found: "NOT_FOUND",
  internal: "INTERNAL",
  network: "NETWORK",
  timeout: "TIMEOUT",
};

const REASON_TO_CATEGORY: Record<SdkErrorReason, SdkErrorCategory> = {
  AUTH: "auth",
  VALIDATION: "validation",
  LIMIT: "limit",
  RATE_LIMIT: "rate_limit",
  ACCOUNT: "account",
  PROVIDER: "provider",
  DUPLICATE: "duplicate",
  NOT_FOUND: "not_found",
  INTERNAL: "internal",
  NETWORK: "network",
  SERVICES_DOWN: "network",
  TIMEOUT: "timeout",
};

/**
 * Future `-- error-code:` values may name a merchant outcome (`on_hold` →
 * `ON_HOLD`). Unrecognized codes never become the reason.
 */
const OUTCOME_CODE_TO_REASON: Record<string, SdkErrorReason> = {};

export function isSdkErrorReason(value: string): value is SdkErrorReason {
  return REASON_SET.has(value);
}

export function isSdkErrorCategory(value: string): value is SdkErrorCategory {
  return value in CATEGORY_TO_REASON;
}

function isHostOfflineMessage(message: string): boolean {
  return message === UNREACHABLE_HOST_OFFLINE;
}

function isNylonDownMessage(message: string): boolean {
  return message === UNREACHABLE_NYLON_DOWN;
}

/**
 * Build a complete SdkError: `reason` is the field merchants branch on;
 * `category` and `code` are filled for this release line only.
 */
export function buildSdkError(params: {
  reason?: string;
  category?: string;
  message: string;
  retryable?: boolean;
  code?: string;
}): SdkError {
  const reason = resolveReason(params);
  const category = REASON_TO_CATEGORY[reason];
  const code =
    params.code ??
    (reason === "NETWORK" || reason === "SERVICES_DOWN"
      ? UNREACHABLE_CODE
      : undefined);

  return {
    reason,
    message: params.message,
    ...(params.retryable !== undefined ? { retryable: params.retryable } : {}),
    category,
    ...(code ? { code } : {}),
  };
}

export function resolveReason(params: {
  reason?: string;
  category?: string;
  message: string;
  code?: string;
}): SdkErrorReason {
  if (params.reason && isSdkErrorReason(params.reason)) {
    return params.reason;
  }

  if (params.code && OUTCOME_CODE_TO_REASON[params.code]) {
    return OUTCOME_CODE_TO_REASON[params.code];
  }

  if (
    params.code === UNREACHABLE_CODE ||
    isHostOfflineMessage(params.message)
  ) {
    if (isHostOfflineMessage(params.message)) return "NETWORK";
    if (isNylonDownMessage(params.message)) return "SERVICES_DOWN";
  }

  if (isNylonDownMessage(params.message)) return "SERVICES_DOWN";

  if (params.category && isSdkErrorCategory(params.category)) {
    return CATEGORY_TO_REASON[params.category];
  }

  return "INTERNAL";
}
