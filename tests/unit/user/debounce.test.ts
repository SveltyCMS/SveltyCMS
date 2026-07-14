/**
 * @file tests/unit/user/debounce.test.ts
 * @description White-box unit tests for the debounce utility.
 *
 * Source: src/utils/debounce.ts
 *
 * Features tested:
 * - Basic delay behavior (fn delayed by `delay` ms)
 * - clearTimeout on subsequent calls within delay period
 * - Immediate mode (first call fires synchronously)
 * - Only the LAST call executes (standard debounce)
 * - debounce.create() factory
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
  // BASIC DEBOUNCE — DELAYED EXECUTION
  // ---------------------------------------------------------------------------

  it("should delay execution by the specified delay", () => {
    const fn = vi.fn();
    const debounced = debounce(500);

    debounced(fn);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should use default delay of 300ms", () => {
    const fn = vi.fn();
    const debounced = debounce(); // no args → default 300

    debounced(fn);
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
    const debounced = debounce(300);

    debounced(fn);
    vi.advanceTimersByTime(200);
    debounced(fn); // reset timer
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled(); // still not 300 since reset

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should only execute the last scheduled fn", () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const debounced = debounce(300);

    debounced(fn1);
    debounced(fn2); // replaces fn1
    vi.advanceTimersByTime(300);

    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it("should handle multiple rapid calls, executing only once", () => {
    const fn = vi.fn();
    const debounced = debounce(100);

    for (let i = 0; i < 10; i++) {
      debounced(fn);
      vi.advanceTimersByTime(50); // each call resets the timer
    }

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // IMMEDIATE MODE
  // ---------------------------------------------------------------------------

  it("should execute first call immediately in immediate mode", () => {
    const fn = vi.fn();
    const debounced = debounce(300, true);

    debounced(fn);
    expect(fn).toHaveBeenCalledTimes(1); // fired synchronously
  });

  it("should not fire subsequent calls in immediate mode during cooldown", () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const debounced = debounce(300, true);

    debounced(fn1); // fires immediately
    expect(fn1).toHaveBeenCalledTimes(1);

    debounced(fn2); // during cooldown, should NOT fire immediately
    expect(fn2).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it("should fire immediately only for the first call ever (hasExecuted tracks lifetime)", () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const debounced = debounce(300, true);

    debounced(fn1); // immediate
    expect(fn1).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(300); // let cooldown finish

    debounced(fn2); // NOT immediate — hasExecuted is true forever
    expect(fn2).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // CLEAR TIMEOUT BEHAVIOR
  // ---------------------------------------------------------------------------

  it("should clear previous timeout when new call comes in", () => {
    const fn = vi.fn();
    const debounced = debounce(200);

    debounced(fn);
    vi.advanceTimersByTime(100);
    debounced(fn); // clears previous timer, starts new one

    // Only one timer is running now; advancing 200 should fire once
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // debounce.create() FACTORY
  // ---------------------------------------------------------------------------

  describe("debounce.create", () => {
    it("should return a debounced version of the function", () => {
      const fn = vi.fn();
      const debouncedFn = debounce.create(fn, 200);

      debouncedFn("arg1", "arg2");
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);
      expect(fn).toHaveBeenCalledWith("arg1", "arg2");
    });

    it("should pass all arguments through", () => {
      const fn = vi.fn();
      const debouncedFn = debounce.create(fn, 100);

      debouncedFn(1, "two", { three: true });
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledWith(1, "two", { three: true });
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

    it("should use default wait of 300ms", () => {
      const fn = vi.fn();
      const debouncedFn = debounce.create(fn); // no wait arg

      debouncedFn();
      vi.advanceTimersByTime(299);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
