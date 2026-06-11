import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("converts local 10-digit format to international", () => {
    expect(normalizePhone("0768499027")).toBe("256768499027");
  });

  it("strips leading + and keeps international format", () => {
    expect(normalizePhone("+256768499027")).toBe("256768499027");
  });

  it("leaves international format without + unchanged", () => {
    expect(normalizePhone("256768499027")).toBe("256768499027");
  });

  it("strips whitespace and leading +", () => {
    expect(normalizePhone("+256 768 499 027")).toBe("256768499027");
  });

  it("strips whitespace without leading +", () => {
    expect(normalizePhone("256 768 499 027")).toBe("256768499027");
  });

  it("converts another local 10-digit number", () => {
    expect(normalizePhone("0700000000")).toBe("256700000000");
  });
});
