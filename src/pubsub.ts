/**
 * Simple internal pubsub/event emitter for SDK payment lifecycle events.
 * Functional implementation without classes.
 *
 * @see Spec 2 section 2 - "emits events such as nylonpay.on('success', (data) => {})"
 *
 * @example
 * ```ts
 * const emitter = createEmitter<PaymentEvent>();
 * emitter.on("success", (data) => console.log(data));
 * emitter.emit("success", { event: "success", timestamp: "..." });
 * emitter.off("success", handler);
 * ```
 */

/**
 * Handler function type for event listeners.
 */
export type EventHandler<T = unknown> = (data: T) => void;

/**
 * Internal state for the emitter.
 * @internal
 */
interface EmitterState<T> {
  listeners: Map<T, Set<EventHandler<T>>>;
}

/**
 * Create a new event emitter instance.
 *
 * @returns Emitter with on/off/emit methods
 *
 * @example
 * ```ts
 * const emitter = createEmitter<string>();
 * const unsub = emitter.on("hello", (msg) => console.log(msg));
 * emitter.emit("hello", "world");
 * unsub(); // remove listener
 * ```
 */
export function createEmitter<T extends string>() {
  const state: EmitterState<T> = {
    listeners: new Map(),
  };

  /**
   * Subscribe to an event.
   * Returns an unsubscribe function for convenience.
   */
  function on(event: T, handler: EventHandler): () => void {
    if (!state.listeners.has(event)) {
      state.listeners.set(event, new Set());
    }
    state.listeners.get(event)!.add(handler as EventHandler<unknown>);
    return () => off(event, handler);
  }

  /**
   * Subscribe to an event for a single invocation, then auto-unsubscribe.
   * Useful for one-shot handlers on terminal payment events (e.g. "successful", "failed").
   * Returns the emitter for chaining.
   */
  function once(event: T, handler: EventHandler): typeof emitter {
    const wrapper: EventHandler = (data) => {
      off(event, wrapper);
      handler(data);
    };
    on(event, wrapper);
    return emitter;
  }

  /**
   * Unsubscribe from an event.
   */
  function off(event: T, handler: EventHandler): void {
    const handlers = state.listeners.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler<unknown>);
    }
  }

  /**
   * Emit an event with data to all listeners.
   * Handlers are called synchronously in subscription order.
   */
  function emit(event: T, data: unknown): void {
    const handlers = state.listeners.get(event);
    if (!handlers || handlers.size === 0) return;
    for (const handler of handlers) {
      try {
        (handler as EventHandler<unknown>)(data);
      } catch {
        // Swallow handler errors to prevent one bad handler
        // from breaking the entire event chain
      }
    }
  }

  /**
   * Remove all listeners for a specific event, or all events if no event specified.
   */
  function clear(event?: T): void {
    if (event) {
      state.listeners.delete(event);
    } else {
      state.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event.
   */
  function listenerCount(event: T): number {
    return state.listeners.get(event)?.size ?? 0;
  }

  const emitter = { on, once, off, emit, clear, listenerCount };
  return emitter;
}

/**
 * Type for the emitter interface returned by createEmitter.
 */
export type Emitter<T extends string> = ReturnType<typeof createEmitter<T>>;
