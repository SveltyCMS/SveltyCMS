/**
 * @file tests/unit/user/debounce.test.ts
 * @description White-box unit tests for the hardened debounce utility.
 *
 * Source: src/utils/debounce.ts
 *
 * Features tested:
 * - Basic delay behavior (fn delayed by `delay` ms)
 * - clearTimeout on subsequent calls within delay period
 * - Only the LAST call executes (standard debounce)
 * - `.cancel()` prevents execution after unmount
 * - `this` context preservation
 * - Arguments pass-through
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { debounce } from "@src/utils/debounce";

describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // debounce.create() — BASIC DELAY
  // ---------------------------------------------------------------------------

  it("should delay execution by the specified delay", () => {
    const fn = vi.fn();
    const debouncedFn = debounce.create(fn, 500);

    debouncedFn();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should use default delay of 300ms", () => {
    const fn = vi.fn();
    const debouncedFn = debounce.create(fn);

    debouncedFn();
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // SUBSEQUENT CALLS RESET THE TIMER
  // ---------------------------------------------------------------------------

  it("should reset the timer on subsequent calls", () => {
    const fn = vi.fn();
    const debouncedFn = debounce.create(fn, 300);

    debouncedFn();
    vi.advanceTimersByTime(200);
    debouncedFn(); // reset timer
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should only call once for rapid invocations", () => {
    const fn = vi.fn();
    const debouncedFn = debounce.create(fn, 150);

    debouncedFn("a");
    debouncedFn("b");
    debouncedFn("c");
    vi.advanceTimersByTime(150);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("c"); // last call wins
  });

  it("should handle many rapid calls, executing only once", () => {
    const fn = vi.fn();
    const debouncedFn = debounce.create(fn, 100);

    for (let i = 0; i < 10; i++) {
      debouncedFn(i);
      vi.advanceTimersByTime(50);
    }

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(9);
  });

  // ---------------------------------------------------------------------------
  // CLEAR TIMEOUT BEHAVIOR
  // ---------------------------------------------------------------------------

  it("should clear previous timeout when new call comes in", () => {
    const fn = vi.fn();
    const debouncedFn = debounce.create(fn, 200);

    debouncedFn();
    vi.advanceTimersByTime(100);
    debouncedFn(); // clears previous timer, starts new one

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // ARGUMENT PASS-THROUGH
  // ---------------------------------------------------------------------------

  it("should pass all arguments through", () => {
    const fn = vi.fn();
    const debouncedFn = debounce.create(fn, 100);

    debouncedFn(1, "two", { three: true });
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith(1, "two", { three: true });
  });

  // ---------------------------------------------------------------------------
  // CANCEL MECHANISM (Memory Leak Prevention)
  // ---------------------------------------------------------------------------

  it("should not execute after cancel() is called", () => {
    const fn = vi.fn();
    const debouncedFn = debounce.create(fn, 200);

    debouncedFn();
    vi.advanceTimersByTime(50);
    debouncedFn.cancel();
    vi.advanceTimersByTime(200);

    expect(fn).not.toHaveBeenCalled();
  });

  it("should allow re-invocation after cancel", () => {
    const fn = vi.fn();
    const debouncedFn = debounce.create(fn, 100);

    debouncedFn();
    debouncedFn.cancel();

    debouncedFn("re-invoked");
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("re-invoked");
  });

  // ---------------------------------------------------------------------------
  // THIS CONTEXT PRESERVATION
  // ---------------------------------------------------------------------------

  it("should preserve `this` context when called as a method", () => {
    const service = {
      value: 42,
      save: vi.fn(function (this: any, ...args: any[]) {
        return this.value + (args[0] ?? 0);
      }),
    };

    const debouncedFn = debounce.create(service.save, 100);

    // Call as method of service — `this` should be service
    debouncedFn.call(service, 10);
    vi.advanceTimersByTime(100);

    expect(service.save).toHaveBeenCalledTimes(1);
    // `this.value` (42) + 10 = 52
    const result = service.save.mock.results[0]?.value;
    expect(result).toBe(52);
  });
});
