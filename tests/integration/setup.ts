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
  // sharing state like poll timers across test suites).
  // Cap client polling so unbounded wait/AndResolve cannot outlive the suite
  // timeout (aborted mid-request surfaces as a misleading network error).
  return createNylonPay({
    apiKey,
    apiSecret,
    baseUrl: TEST_BASE_URL,
    force: true,
    maxPollDurationMs: 60_000,
  });
}

export const TEST_PHONE = process.env.NYLONPAY_TEST_PHONE ?? "0768499027";

/** true when NYLONPAY_TEST_MODE=live — enables live-only test suites */
export const isLiveMode = process.env.NYLONPAY_TEST_MODE === "live";

/** Parses `Set-Cookie` header(s) into a single `Cookie` request header value. */
function collectSetCookieHeaders(response: Response): string {
  const headers = response.headers;
  const raw =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : headers.get("set-cookie")
        ? [headers.get("set-cookie") as string]
        : [];

  return raw
    .flatMap((entry) => entry.split(/,(?=\s*[^;]+=[^;]+)/))
    .map((part) => part.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

/** Signs in a seeded platform sub-admin for integration admin actions. */
export async function loginIntegrationAdmin(): Promise<string> {
  const email =
    process.env.NYLONPAY_INTEGRATION_ADMIN_EMAIL?.trim() ??
    "integration-admin@nylon.test";
  const password =
    process.env.NYLONPAY_INTEGRATION_ADMIN_PASSWORD ??
    process.env.NYLONPAY_ROOT_ADMIN_PASSWORD;
  if (!(password && TEST_BASE_URL)) {
    throw new Error(
      "Set NYLONPAY_INTEGRATION_ADMIN_PASSWORD (or NYLONPAY_ROOT_ADMIN_PASSWORD) and NYLONPAY_BASE_URL",
    );
  }

  const origin = new URL(TEST_BASE_URL).origin;

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const adminResponse = await fetch(`${origin}/api/admin-auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!adminResponse.ok) {
        throw new Error(`Admin login failed: HTTP ${adminResponse.status}`);
      }

      const adminCookies = collectSetCookieHeaders(adminResponse);
      const match = /np_admin_session=([^;]+)/.exec(adminCookies);
      if (!match?.[1]) {
        throw new Error(
          "Admin login succeeded but no session cookie was returned",
        );
      }
      return match[1];
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Calls admin refresh-transaction-status against a live backend. */
export async function adminRefreshTransaction(input: {
  adminSessionToken: string;
  transactionId: string;
}): Promise<{ refreshed: boolean; status: string }> {
  if (!TEST_BASE_URL) {
    throw new Error("NYLONPAY_BASE_URL is required for admin refresh");
  }

  const response = await fetch(TEST_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `np_admin_session=${input.adminSessionToken}`,
    },
    body: JSON.stringify({
      intent: "execute",
      service: "admin",
      action: "refresh-transaction-status",
      payload: { transactionId: input.transactionId },
    }),
  });

  const body = (await response.json()) as {
    data?: { refreshed: boolean; status: string };
    message?: string;
    status: boolean;
  };

  if (!body.status || !body.data) {
    throw new Error(body.message ?? "Admin refresh failed");
  }

  return body.data;
}

export const hasAdminCredentials = Boolean(
  (process.env.NYLONPAY_INTEGRATION_ADMIN_PASSWORD ??
    process.env.NYLONPAY_ROOT_ADMIN_PASSWORD) &&
    TEST_BASE_URL,
);
