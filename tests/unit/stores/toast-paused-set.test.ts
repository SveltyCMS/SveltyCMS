/**
 * @file tests/unit/stores/toast-paused-set.test.ts
 * @description Regression tests for the ToastStore paused-set lifecycle.
 *
 * Features:
 * - close() removes a toast's id from the paused set
 * - repeated open/pause/close cycles do not grow the paused set unboundedly
 * - pause() on a non-existent toast does not leak an id into the paused set
 */
import { toast } from "@stores/toast.svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("ToastStore paused-set lifecycle", () => {
  beforeEach(() => {
    toast.clear();
  });

  afterEach(() => {
    toast.clear();
  });

  it("removes an id from the paused set when its toast is closed", () => {
    const id = toast.info("Pause then close");
    toast.pause(id);
    expect(toast.isPaused(id)).toBe(true);

    toast.close(id);
    expect(toast.isPaused(id)).toBe(false);
    expect(toast.pausedIds.has(id)).toBe(false);
    expect(toast.pausedIds.size).toBe(0);
  });

  it("does not grow the paused set unboundedly across open/close cycles", () => {
    for (let i = 0; i < 100; i++) {
      const id = toast.info(`Cycle ${i}`);
      toast.pause(id);
      toast.close(id);
      expect(toast.isPaused(id)).toBe(false);
    }

    expect(toast.pausedIds.size).toBe(0);
  });

  it("does not leak an id into the paused set when the toast does not exist", () => {
    toast.pause("does-not-exist");
    expect(toast.isPaused("does-not-exist")).toBe(false);
    expect(toast.pausedIds.size).toBe(0);
  });
});
