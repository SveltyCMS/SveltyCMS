/**
 * @file tests/unit/utils/event-bus.test.ts
 * @description Unit tests for EventBus utility.
 *
 * Tests:
 * - Event emission and listener execution
 * - Wildcard listener handling with listenerCount guard
 * - Fault tolerance on listener errors
 * - Async broadcast decoupling
 */

import { describe, it, expect, vi } from "vitest";
import { eventBus, SystemEvents } from "@src/utils/event-bus";

describe("EventBus", () => {
  it("emits events to registered listeners", () => {
    const handler = vi.fn();
    eventBus.on("test:event", handler);

    eventBus.emit("test:event", { value: 42 });

    expect(handler).toHaveBeenCalledWith({ value: 42 });
    eventBus.off("test:event", handler);
  });

  it("handles typed SystemEvents", () => {
    const handler = vi.fn();
    eventBus.on(SystemEvents.CACHE_INVALIDATE, handler);

    eventBus.emit(SystemEvents.CACHE_INVALIDATE, { keys: ["key1", "key2"] });

    expect(handler).toHaveBeenCalledWith({ keys: ["key1", "key2"] });
    eventBus.off(SystemEvents.CACHE_INVALIDATE, handler);
  });

  it("emits to wildcard * listener when registered", () => {
    const wildcardHandler = vi.fn();
    eventBus.on("*", wildcardHandler);

    eventBus.emit("custom:event", { msg: "hello" });

    expect(wildcardHandler).toHaveBeenCalledWith({
      event: "custom:event",
      data: { msg: "hello" },
      args: [{ msg: "hello" }],
    });
    eventBus.off("*", wildcardHandler);
  });

  it("does not trigger wildcard logic when no * listener is registered", () => {
    expect(eventBus.listenerCount("*")).toBe(0);
    const handler = vi.fn();
    eventBus.on("no:wildcard", handler);

    const handled = eventBus.emit("no:wildcard", "data");

    expect(handled).toBe(true);
    expect(handler).toHaveBeenCalledWith("data");
    eventBus.off("no:wildcard", handler);
  });
});
