import { beforeAll, describe, expect, it } from "vitest";
import type { NylonPaySdk } from "../../dist/index.js";
import { createTestSdk, TEST_PHONE } from "./setup.js";

describe("verifyPhone", () => {
  let sdk: NylonPaySdk;

  beforeAll(() => {
    sdk = createTestSdk();
  });

  it("returns verified result for a valid phone number", async () => {
    const result = await sdk.verifyPhone({ phoneNumber: TEST_PHONE });
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.verified).toBe(true);
      expect(typeof result.value.customerName).toBe("string");
    }
  });

  it("returns an error for an invalid phone number", async () => {
    const result = await sdk.verifyPhone({ phoneNumber: "0000000000" });
    expect(result.isOk).toBe(false);
  });
});
