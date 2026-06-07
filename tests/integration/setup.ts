import { createNylonPay } from "../../dist/index.js";

/**
 * Backend URL the suite runs against. Unset → SDK falls back to its prod
 * default. Set NYLONPAY_BASE_URL to a local backend (full path incl.
 * /api/services, e.g. http://localhost:8000/api/services) to test locally.
 */
export const TEST_BASE_URL = process.env.NYLONPAY_BASE_URL || undefined;

export function createTestSdk() {
  const apiKey = process.env.NYLONPAY_API_KEY ?? "";
  const apiSecret = process.env.NYLONPAY_API_SECRET ?? "";
  if (!apiKey || !apiSecret) {
    throw new Error(
      "Set NYLONPAY_API_KEY and NYLONPAY_API_SECRET in .env before running integration tests",
    );
  }
  // force: true so each test file gets a fresh instance (avoids singleton
  // sharing state like poll timers across test suites)
  return createNylonPay({
    apiKey,
    apiSecret,
    baseUrl: TEST_BASE_URL,
    force: true,
  });
}

export const TEST_PHONE = process.env.NYLONPAY_TEST_PHONE ?? "0768499027";

/** true when NYLONPAY_TEST_MODE=live — enables live-only test suites */
export const isLiveMode = process.env.NYLONPAY_TEST_MODE === "live";
