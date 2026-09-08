import { createHash } from "node:crypto";
import { arch, hostname, platform, release, type } from "node:os";
import { describe, expect, it } from "vitest";
import { generateFingerprint } from "./fingerprint";

const HEX_64 = /^[0-9a-f]{64}$/;

describe("generateFingerprint", () => {
  it("returns 64 lowercase hex characters", () => {
    expect(generateFingerprint()).toMatch(HEX_64);
  });

  it("is stable within a process", () => {
    expect(generateFingerprint()).toBe(generateFingerprint());
  });

  /**
   * Pin the exact composition. The Node and V8 versions were removed on
   * 2026-09-08: a runtime version is not obtainable the same way in every SDK
   * and churned the value on every upgrade for no benefit. Recomputing the
   * digest here fails the moment anything is added back, which a length or
   * format check would not catch.
   */
  it("hashes only OS metadata, with no runtime version", () => {
    const expected = createHash("sha256")
      .update(
        [
          `type:${type()}`,
          `platform:${platform()}`,
          `arch:${arch()}`,
          `release:${release()}`,
          `hostname:${hostname()}`,
        ].join("|"),
      )
      .digest("hex");

    expect(generateFingerprint()).toBe(expected);
  });
});
