import { describe, it, expect, vi } from "vitest";
import { createEmitter } from "./pubsub";

describe("createEmitter", () => {
  it("should emit events to subscribed handlers", () => {
    const emitter = createEmitter<string>();
    const handler = vi.fn();

    emitter.on("test", handler);
    emitter.emit("test", { data: "hello" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ data: "hello" });
  });

  it("should allow multiple handlers for same event", () => {
    const emitter = createEmitter<string>();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    emitter.on("test", handler1);
    emitter.on("test", handler2);
    emitter.emit("test", "data");

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("should unsubscribe handlers", () => {
    const emitter = createEmitter<string>();
    const handler = vi.fn();

    const unsub = emitter.on("test", handler);
    unsub();

    emitter.emit("test", "data");
    expect(handler).not.toHaveBeenCalled();
  });

  it("should return unsubscribe function from on()", () => {
    const emitter = createEmitter<string>();
    const handler = vi.fn();

    const unsub = emitter.on("test", handler);
    unsub();
    unsub(); // Should not throw

    emitter.emit("test", "data");
    expect(handler).not.toHaveBeenCalled();
  });

  it("should report listener count", () => {
    const emitter = createEmitter<string>();

    expect(emitter.listenerCount("test")).toBe(0);

    const unsub1 = emitter.on("test", () => {});
    expect(emitter.listenerCount("test")).toBe(1);

    const unsub2 = emitter.on("test", () => {});
    expect(emitter.listenerCount("test")).toBe(2);

    unsub1();
    expect(emitter.listenerCount("test")).toBe(1);
  });

  it("should clear all listeners", () => {
    const emitter = createEmitter<string>();
    const h1 = vi.fn();
    const h2 = vi.fn();

    emitter.on("a", h1);
    emitter.on("b", h2);

    emitter.clear();

    emitter.emit("a", {});
    emitter.emit("b", {});

    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it("should clear specific event listeners", () => {
    const emitter = createEmitter<string>();
    const h1 = vi.fn();
    const h2 = vi.fn();

    emitter.on("a", h1);
    emitter.on("b", h2);

    emitter.clear("a");

    emitter.emit("a", {});
    emitter.emit("b", {});

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it("should not throw if no handlers exist", () => {
    const emitter = createEmitter<string>();
    expect(() => emitter.emit("nonexistent", {})).not.toThrow();
  });

  it("should handle handler errors gracefully", () => {
    const emitter = createEmitter<string>();
    const handler1 = vi.fn(() => {
      throw new Error("Handler error");
    });
    const handler2 = vi.fn();

    emitter.on("test", handler1);
    emitter.on("test", handler2);

    emitter.emit("test", {});

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled(); // Should still be called
  });

  it("once handler fires exactly once", () => {
    const emitter = createEmitter<string>();
    const handler = vi.fn();

    emitter.once("payment.done", handler);
    emitter.emit("payment.done", { status: "successful" });
    emitter.emit("payment.done", { status: "successful" });
    emitter.emit("payment.done", { status: "successful" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ status: "successful" });
    expect(emitter.listenerCount("payment.done")).toBe(0);
  });

  it("once handler can coexist with regular on handlers", () => {
    const emitter = createEmitter<string>();
    const onceHandler = vi.fn();
    const regularHandler = vi.fn();

    emitter.on("test", regularHandler);
    emitter.once("test", onceHandler);

    emitter.emit("test", "first");
    emitter.emit("test", "second");

    expect(onceHandler).toHaveBeenCalledTimes(1);
    expect(onceHandler).toHaveBeenCalledWith("first");
    expect(regularHandler).toHaveBeenCalledTimes(2);
    expect(emitter.listenerCount("test")).toBe(1);
  });

  it("once returns emitter for chaining", () => {
    const emitter = createEmitter<string>();
    const h1 = vi.fn();
    const h2 = vi.fn();

    const result = emitter.once("a", h1).once("b", h2);

    expect(result).toBe(emitter);
    emitter.emit("a", "x");
    emitter.emit("b", "y");

    expect(h1).toHaveBeenCalledWith("x");
    expect(h2).toHaveBeenCalledWith("y");
  });
});
