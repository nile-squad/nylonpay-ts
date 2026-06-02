import { beforeAll, describe, expect, it } from "vitest";
import type { NylonPaySdk } from "../../dist/index.js";
import { createTestSdk, TEST_PHONE } from "./setup.js";

describe("verifyPhone", () => {
  let sdk: NylonPaySdk;

  beforeAll(() => {
    sdk = createTestSdk();
  });

  it("I7: returns a verified result for a valid phone number", async () => {
    const result = await sdk.verifyPhone({ phoneNumber: TEST_PHONE });
    if (result.isErr) throw new Error(result.error);
    expect(result.value.verified).toBe(true);
    expect(typeof result.value.customerName).toBe("string");
  });
});
