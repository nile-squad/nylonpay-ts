import { describe, expect, it } from "vitest";
import {
  classifyHttpStatus,
  classifyUnreachable,
  createReachabilityTracker,
} from "./reachability";
import {
  UNREACHABLE_CODE,
  UNREACHABLE_HOST_OFFLINE,
  UNREACHABLE_NYLON_DOWN,
} from "./sdk.config";
import { parseError } from "./transport";

describe("classifyUnreachable", () => {
  it("treats DNS failures as host offline", () => {
    const error = Object.assign(new Error("fetch failed"), {
      cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), {
        code: "ENOTFOUND",
      }),
    });
    expect(classifyUnreachable(error)).toBe(UNREACHABLE_HOST_OFFLINE);
  });

  it("treats ENETUNREACH as host offline", () => {
    const error = Object.assign(new Error("connect"), { code: "ENETUNREACH" });
    expect(classifyUnreachable(error)).toBe(UNREACHABLE_HOST_OFFLINE);
  });

  it("treats connection refused as Nylon down", () => {
    const error = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    expect(classifyUnreachable(error)).toBe(UNREACHABLE_NYLON_DOWN);
  });

  it("treats AbortError as Nylon down", () => {
    expect(classifyUnreachable(new DOMException("aborted", "AbortError"))).toBe(
      UNREACHABLE_NYLON_DOWN,
    );
  });
});

describe("classifyHttpStatus", () => {
  it("maps gateway statuses to Nylon down", () => {
    expect(classifyHttpStatus(502)).toBe(UNREACHABLE_NYLON_DOWN);
    expect(classifyHttpStatus(503)).toBe(UNREACHABLE_NYLON_DOWN);
    expect(classifyHttpStatus(504)).toBe(UNREACHABLE_NYLON_DOWN);
  });

  it("does not treat 4xx or 500 as unreachable", () => {
    expect(classifyHttpStatus(400)).toBeNull();
    expect(classifyHttpStatus(401)).toBeNull();
    expect(classifyHttpStatus(500)).toBeNull();
  });
});

describe("createReachabilityTracker", () => {
  it("does not check while a recent success is still fresh", async () => {
    let now = 1_000;
    let probes = 0;
    const tracker = createReachabilityTracker({
      now: () => now,
      successFreshMs: 5 * 60 * 1000,
      downRecheckMs: 15_000,
      probe: async () => {
        probes += 1;
        return null;
      },
    });

    expect(await tracker.beforeSend()).toBeNull();
    expect(probes).toBe(0);

    tracker.noteUp();
    now = 1_000 + 60_000;
    expect(await tracker.beforeSend()).toBeNull();
    expect(probes).toBe(0);
  });

  it("checks once after a success goes stale, then remembers the probe", async () => {
    let now = 1_000;
    let probes = 0;
    const tracker = createReachabilityTracker({
      now: () => now,
      successFreshMs: 5 * 60 * 1000,
      downRecheckMs: 15_000,
      probe: async () => {
        probes += 1;
        return null;
      },
    });

    tracker.noteUp();
    now = 1_000 + 5 * 60 * 1000 + 1;
    expect(await tracker.beforeSend()).toBeNull();
    expect(probes).toBe(1);
    expect(await tracker.beforeSend()).toBeNull();
    expect(probes).toBe(1);
  });

  it("skips later calls after a failure until the re-check pause ends", async () => {
    let now = 1_000;
    const emitted: string[] = [];
    const tracker = createReachabilityTracker({
      now: () => now,
      successFreshMs: 5 * 60 * 1000,
      downRecheckMs: 15_000,
      onUnreachable: (data) => emitted.push(data.reason),
    });

    tracker.noteDown(UNREACHABLE_HOST_OFFLINE);
    expect(emitted).toEqual([UNREACHABLE_HOST_OFFLINE]);

    const blocked = await tracker.beforeSend();
    expect(blocked).not.toBeNull();
    expect(blocked?.isErr).toBe(true);
    if (!blocked || blocked.isOk) throw new Error("expected skip");
    const parsed = parseError(blocked.error);
    expect(parsed.category).toBe("network");
    expect(parsed.code).toBe(UNREACHABLE_CODE);
    expect(parsed.message).toBe(UNREACHABLE_HOST_OFFLINE);
    expect(emitted).toHaveLength(1);

    now = 1_000 + 15_001;
    expect(await tracker.beforeSend()).toBeNull();
  });

  it("checks before the next call when the last one failed", async () => {
    let now = 1_000;
    let probes = 0;
    const tracker = createReachabilityTracker({
      now: () => now,
      successFreshMs: 5 * 60 * 1000,
      downRecheckMs: 15_000,
      probe: async () => {
        probes += 1;
        return UNREACHABLE_NYLON_DOWN;
      },
    });

    tracker.noteDown(UNREACHABLE_NYLON_DOWN);
    now = 1_000 + 15_001;
    const blocked = await tracker.beforeSend();
    expect(probes).toBe(1);
    expect(blocked?.isErr).toBe(true);
  });

  it("checks again when the last down check is older than 5 minutes", async () => {
    let now = 1_000;
    let probes = 0;
    const tracker = createReachabilityTracker({
      now: () => now,
      successFreshMs: 5 * 60 * 1000,
      downRecheckMs: 15_000,
      probe: async () => {
        probes += 1;
        return null;
      },
    });

    tracker.noteDown(UNREACHABLE_NYLON_DOWN);
    now = 1_000 + 6 * 60 * 60 * 1000;
    const result = await tracker.beforeSend();
    expect(probes).toBe(1);
    expect(result).toBeNull();
  });

  it("clears the failure on noteUp", async () => {
    const tracker = createReachabilityTracker({
      successFreshMs: 5 * 60 * 1000,
      downRecheckMs: 15_000,
    });
    tracker.noteDown(UNREACHABLE_NYLON_DOWN);
    tracker.noteUp();
    expect(await tracker.beforeSend()).toBeNull();
  });
});
