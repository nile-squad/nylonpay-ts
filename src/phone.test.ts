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

  it("gives a Kenya local number the 254 dial code when currency is KES", () => {
    expect(normalizePhone("0710000000", "KES")).toBe("254710000000");
  });

  it("leaves an international Kenya number unchanged", () => {
    expect(normalizePhone("+254710000000", "KES")).toBe("254710000000");
  });

  it("keeps an international Kenya number when currency is omitted", () => {
    expect(normalizePhone("+254710000000")).toBe("254710000000");
  });

  it("gives local numbers the dial code for Tanzania, Rwanda, DRC, Zambia and Cameroon", () => {
    expect(normalizePhone("0712345678", "TZS")).toBe("255712345678");
    expect(normalizePhone("0781234567", "RWF")).toBe("250781234567");
    expect(normalizePhone("0812345678", "CDF")).toBe("243812345678");
    expect(normalizePhone("0763456789", "ZMW")).toBe("260763456789");
    expect(normalizePhone("0671234567", "XAF")).toBe("237671234567");
  });
});
