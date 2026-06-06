import { describe, expect, it } from "vitest";
import { parseSseBuffer } from "./sse-parse";

describe("parseSseBuffer", () => {
  it("parses a complete status frame", () => {
    const { messages, rest } = parseSseBuffer(
      'event: status\ndata: {"status":"processing"}\n\n',
    );
    expect(messages).toEqual([
      { event: "status", data: '{"status":"processing"}' },
    ]);
    expect(rest).toBe("");
  });

  it("retains a trailing partial frame as rest", () => {
    const { messages, rest } = parseSseBuffer(
      "event: status\ndata: {}\n\nevent: status\ndata: {par",
    );
    expect(messages).toHaveLength(1);
    expect(rest).toBe("event: status\ndata: {par");
  });

  it("ignores comment/heartbeat blocks", () => {
    const { messages } = parseSseBuffer(": heartbeat\n\n: connected\n\n");
    expect(messages).toEqual([]);
  });

  it("parses multiple frames in one buffer", () => {
    const { messages } = parseSseBuffer(
      "event: status\ndata: a\n\nevent: error\ndata: b\n\n",
    );
    expect(messages).toEqual([
      { event: "status", data: "a" },
      { event: "error", data: "b" },
    ]);
  });

  it("strips a trailing CR from each line", () => {
    const { messages, rest } = parseSseBuffer("event: status\r\ndata: x\r\n\n");
    expect(messages).toEqual([{ event: "status", data: "x" }]);
    expect(rest).toBe("");
  });
});
