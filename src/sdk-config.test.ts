import { describe, expect, it } from "vitest";
import { DEFAULT_BASE_URL, LEGACY_BASE_URL } from "./index";

describe("API addresses", () => {
  it("defaults to the nylonpay.com domain and keeps the original one available", () => {
    expect(DEFAULT_BASE_URL).toBe("https://api.nylonpay.com/api/services");
    expect(LEGACY_BASE_URL).toBe(
      "https://api.nylonpay.nilesquad.com/api/services",
    );
  });
});
