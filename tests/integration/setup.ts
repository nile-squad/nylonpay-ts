import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createNylonPay } from "../../dist/index.js";

// Load .env.integration if present — env vars already set take precedence
const envFile = resolve(process.cwd(), ".env.integration");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      process.env[key] ??= val;
    }
  }
}

export function createTestSdk() {
  const apiKey = process.env.NYLONPAY_API_KEY ?? "";
  const apiSecret = process.env.NYLONPAY_API_SECRET ?? "";
  if (!apiKey || !apiSecret) {
    throw new Error(
      "Set NYLONPAY_API_KEY and NYLONPAY_API_SECRET in .env.integration before running integration tests",
    );
  }
  return createNylonPay({ apiKey, apiSecret });
}

export const TEST_PHONE = process.env.NYLONPAY_TEST_PHONE ?? "0768499027";
