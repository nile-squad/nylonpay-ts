import { describe, expect, it } from "vitest";
import { resolvePollIntervalMs } from "./poll-interval";

describe("resolvePollIntervalMs", () => {
  it("keeps base interval for the first two minutes", () => {
    expect(
      resolvePollIntervalMs({
        baseIntervalMs: 2000,
        pollStartTimeMs: 0,
        nowMs: 60_000,
      }),
    ).toBe(2000);
  });

  it("doubles interval after two minutes up to 15s cap", () => {
    expect(
      resolvePollIntervalMs({
        baseIntervalMs: 2000,
        pollStartTimeMs: 0,
        nowMs: 10 * 60 * 1000,
      }),
    ).toBe(15_000);
  });
});
