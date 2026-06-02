import { createNylonPay } from "../../dist/index.js";

export function createTestSdk() {
  const apiKey = process.env.NYLONPAY_API_KEY ?? "";
  const apiSecret = process.env.NYLONPAY_API_SECRET ?? "";
  if (!apiKey || !apiSecret) {
    throw new Error(
      "Set NYLONPAY_API_KEY and NYLONPAY_API_SECRET in .env.integration",
    );
  }
  return createNylonPay({ apiKey, apiSecret });
}

export const TEST_PHONE = process.env.NYLONPAY_TEST_PHONE ?? "0768499027";
