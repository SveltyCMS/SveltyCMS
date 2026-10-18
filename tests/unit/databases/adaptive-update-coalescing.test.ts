/**
 * @file tests/unit/databases/adaptive-update-coalescing.test.ts
 * @description Whitebox tests for the adaptive UPDATE lane on NetworkDbQueueGate.
 *
 * Contract:
 * - `SVELTY_WRITE_COALESCE_UPDATE=1` makes an UPDATE on an idle gate execute
 *   without the coalescer's scheduler hop (sub-millisecond zero-load path).
 * - Once another mutation is in flight, later updates are coalesced.
 * - Inserts/deletes keep their pre-existing scheduling: direct when only the
 *   UPDATE flag is set, coalesced under `SVELTY_WRITE_COALESCING=1`.
 * - With the flag off, scheduling is unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function freshGate() {
  // The env is read in the constructor; import per test so module state is clean.
  const { NetworkDbQueueGate } = await import("@src/databases/core/network-db-queue-gate");
  return new NetworkDbQueueGate({
    maxConcurrency: 4,
    maxQueue: 16,
    name: "AdaptiveTest",
    enableWriteCoalescing: true,
  });
}

describe("NetworkDbQueueGate — adaptive UPDATE coalescing", () => {
  beforeEach(() => {
    delete process.env.SVELTY_WRITE_COALESCING;
    delete process.env.SVELTY_WRITE_COALESCE_UPDATE;
  });

  afterEach(() => {
    for (const key of ["SVELTY_WRITE_COALESCING", "SVELTY_WRITE_COALESCE_UPDATE"]) {
      const original = ORIGINAL_ENV[key];
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
    vi.restoreAllMocks();
  });

  it("runs an idle update without the scheduler hop when SVELTY_WRITE_COALESCE_UPDATE=1", async () => {
    process.env.SVELTY_WRITE_COALESCE_UPDATE = "1";
    const gate = await freshGate();

    let ran = false;
    const pending = gate.coalesceWrite(async () => {
      ran = true;
      return 42;
    }, "update");

    // `acquire` starts the operation synchronously; a coalesced submission would
    // still be waiting for setImmediate here.
    expect(ran).toBe(true);
    await expect(pending).resolves.toBe(42);
    expect(gate.getMetrics().adaptiveUpdates).toMatchObject({
      enabled: true,
      immediate: 1,
      coalesced: 0,
    });
  });

  it("coalesces a second same-tick update once the first is in flight", async () => {
    process.env.SVELTY_WRITE_COALESCE_UPDATE = "1";
    const gate = await freshGate();

    const order: number[] = [];
    const first = gate.coalesceWrite(async () => {
      order.push(1);
      return 1;
    }, "update");
    const second = gate.coalesceWrite(async () => {
      order.push(2);
      return 2;
    }, "update");

    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(order).toEqual([1, 2]);
    expect(gate.getMetrics().adaptiveUpdates).toMatchObject({
      enabled: true,
      immediate: 1,
      coalesced: 1,
    });
  });

  it("leaves insert scheduling untouched when only the UPDATE flag is set", async () => {
    process.env.SVELTY_WRITE_COALESCE_UPDATE = "1";
    const gate = await freshGate();

    let ran = false;
    const pending = gate.coalesceWrite(async () => {
      ran = true;
      return "inserted";
    }, "insert");

    expect(ran).toBe(true);
    await expect(pending).resolves.toBe("inserted");
    expect(gate.getMetrics().adaptiveUpdates).toMatchObject({
      enabled: true,
      immediate: 0,
      coalesced: 0,
    });
  });

  it("coalesces inserts when SVELTY_WRITE_COALESCING=1", async () => {
    process.env.SVELTY_WRITE_COALESCING = "1";
    const gate = await freshGate();

    let ran = false;
    const pending = gate.coalesceWrite(async () => {
      ran = true;
      return "inserted";
    }, "insert");

    expect(ran).toBe(false);
    await expect(pending).resolves.toBe("inserted");
  });

  it("keeps the deferred path when the flag is off", async () => {
    process.env.SVELTY_WRITE_COALESCING = "1";
    const gate = await freshGate();

    let ran = false;
    const pending = gate.coalesceWrite(async () => {
      ran = true;
      return "updated";
    }, "update");

    expect(ran).toBe(false);
    await expect(pending).resolves.toBe("updated");
    expect(gate.getMetrics().adaptiveUpdates).toMatchObject({
      enabled: false,
      immediate: 0,
      coalesced: 1,
    });
  });

  it("does not create a coalescer without an opt-in env flag", async () => {
    const gate = await freshGate();
    expect(gate.getCoalescerMetrics()).toBeNull();
    expect(gate.getMetrics().adaptiveUpdates?.enabled).toBe(false);
  });
});
