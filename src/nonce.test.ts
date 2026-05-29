import { describe, it, expect } from "vitest";
import { generateNonce } from "./nonce";

describe("generateNonce", () => {
  it("should generate a hex string", () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[a-f0-9]+$/);
  });

  it("should generate unique nonces", () => {
    const nonces = new Set<string>();
    for (let i = 0; i < 100; i++) {
      nonces.add(generateNonce());
    }
    expect(nonces.size).toBe(100);
  });

  it("should respect length parameter", () => {
    const nonce = generateNonce(8);
    // 8 bytes = 16 hex chars
    expect(nonce.length).toBe(16);
  });

  it("should have default length of 32 hex chars", () => {
    const nonce = generateNonce();
    // 16 bytes = 32 hex chars
    expect(nonce.length).toBe(32);
  });
});
