/**
 * @file tests/unit/services/memory-governor.test.ts
 * @description Unit tests for the memory governor's trigger, pass and backoff logic.
 *
 * The governor runs against an injected process sample, so every case is
 * deterministic — no real GC, no timing dependence. The behaviours under test are
 * the ones that left a 671 MB bench container at its high-water mark after a burst:
 * a heap-only trigger, a single collection pass, and a one-minute cadence.
 */

import { describe, it, expect, vi } from "vitest";
import { MemoryGovernor, type MemorySnapshot } from "@src/services/system/memory-governor";

const MB = 1024 * 1024;

interface Harness {
  governor: MemoryGovernor;
  setSnapshot: (snap: Partial<MemorySnapshot>) => void;
  memory: MemorySnapshot;
  gc: ReturnType<typeof vi.fn>;
  trim: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  advance: (ms: number, cpuDeltaMs?: number) => void;
}

/**
 * The sample is mutable state: the `gc` stub frees `releasePerPass` bytes, which
 * is what a real `process.memoryUsage()` would report on the next pass.
 * `advance` defaults to a *busy* tick (CPU time == wall time, i.e. requests in
 * flight); pass an explicit CPU delta to model an idle loop.
 */
function createHarness(
  options: {
    releasePerPass?: number;
    gcUnavailable?: boolean;
    config?: Record<string, number>;
  } = {},
): Harness {
  const releasePerPass = options.releasePerPass ?? 100 * MB;
  const state = {
    snap: {
      rss: 100 * MB,
      heapUsed: 20 * MB,
      heapLimit: 576 * MB,
      external: 2 * MB,
      arrayBuffers: 1 * MB,
      cpuMs: 0,
      constrained: 0,
    } as MemorySnapshot,
  };
  let clock = 1_000_000;

  const gc = vi.fn(async () => {
    if (options.gcUnavailable) throw new Error("no gc");
    const freed = Math.min(releasePerPass, Math.max(0, state.snap.rss - 60 * MB));
    if (freed <= 0) return;
    state.snap = {
      ...state.snap,
      rss: state.snap.rss - freed,
      external: Math.max(2 * MB, state.snap.external - freed),
    };
  });

  const trim = vi.fn(() => {
    state.snap = { ...state.snap, heapUsed: 20 * MB };
  });

  const log = vi.fn();
  const governor = new MemoryGovernor(
    {
      read: () => state.snap,
      gc,
      yieldToLoop: async () => {},
      trimCaches: trim,
      now: () => clock,
      log,
    },
    { cooldownMs: 5_000, ...options.config },
  );

  return {
    governor,
    gc,
    trim,
    log,
    get memory() {
      return state.snap;
    },
    setSnapshot: (snap) => {
      state.snap = { ...state.snap, ...snap };
    },
    advance: (ms, cpuDeltaMs) => {
      clock += ms;
      state.snap = { ...state.snap, cpuMs: state.snap.cpuMs + (cpuDeltaMs ?? ms) };
    },
  };
}

describe("MemoryGovernor — triggers", () => {
  it("fires on an external-heavy burst where heapUsed stays low (the 671 MB case)", async () => {
    // 60/576 MB heap = 10% — a heap-only trigger never fires here.
    const h = createHarness({ releasePerPass: 500 * MB });
    h.setSnapshot({ rss: 700 * MB, heapUsed: 60 * MB, external: 480 * MB, arrayBuffers: 60 * MB });
    h.advance(2_000);

    await h.governor.tick();

    expect(h.gc).toHaveBeenCalled();
    expect(h.memory.rss).toBeLessThan(700 * MB);
    expect(h.log.mock.calls[0][0]).toContain("live-set");
  });

  it("fires on RSS against a container limit, independent of heap", async () => {
    const h = createHarness({ releasePerPass: 200 * MB });
    // Constrained to 512 MB → pressure above 384 MB; heap is nowhere near its limit.
    h.setSnapshot({ rss: 420 * MB, heapUsed: 30 * MB, constrained: 512 * MB, external: 40 * MB });
    h.advance(2_000);

    await h.governor.tick();

    expect(h.gc).toHaveBeenCalled();
    expect(h.log.mock.calls[0][0]).toContain("rss");
  });

  it("fires on real heap pressure", async () => {
    const h = createHarness({ releasePerPass: 60 * MB });
    h.setSnapshot({ rss: 500 * MB, heapUsed: 480 * MB });
    h.advance(2_000);

    await h.governor.tick();

    expect(h.gc).toHaveBeenCalled();
    expect(h.log.mock.calls[0][0]).toContain("heap");
  });

  it("stays idle when the process is small and quiet", async () => {
    const h = createHarness();
    h.setSnapshot({ rss: 90 * MB, heapUsed: 25 * MB });
    h.advance(2_000);

    await h.governor.tick();

    expect(h.gc).not.toHaveBeenCalled();
  });

  it("reclaims on idle once the loop is quiet, even below every limit", async () => {
    const h = createHarness({ releasePerPass: 150 * MB });
    // Busy tick at a low RSS: establishes the low-water floor.
    h.setSnapshot({ rss: 200 * MB, heapUsed: 40 * MB });
    h.advance(1_000);
    await h.governor.tick();
    expect(h.gc).not.toHaveBeenCalled();

    // Burst left committed pages behind, and the loop is idle now (no CPU).
    h.setSnapshot({ rss: 420 * MB, external: 30 * MB });
    h.advance(2_000, 0);
    await h.governor.tick();

    expect(h.gc).toHaveBeenCalled();
    expect(h.log.mock.calls.at(-1)?.[0]).toContain("idle");
  });

  it("does not reclaim while the loop is saturated (burst in flight)", async () => {
    const h = createHarness({ releasePerPass: 10 * MB });
    h.setSnapshot({ rss: 220 * MB, heapUsed: 30 * MB });
    h.advance(2_000);
    await h.governor.tick();

    // Middle of a burst: RSS grew, CPU busy, heap medium → no signal above threshold.
    h.setSnapshot({ rss: 240 * MB, heapUsed: 35 * MB });
    h.advance(2_000);
    await h.governor.tick();

    expect(h.gc).not.toHaveBeenCalled();
  });
});

describe("MemoryGovernor — passes and cooldown", () => {
  it("runs a second pass when the first hands nothing back", async () => {
    let calls = 0;
    const h = createHarness();
    h.gc.mockImplementation(async () => {
      calls++;
      if (calls === 1) return;
      h.setSnapshot({ rss: h.memory.rss - 400 * MB });
    });
    h.setSnapshot({ rss: 700 * MB, heapUsed: 60 * MB, external: 480 * MB });
    h.advance(2_000);

    await h.governor.tick();

    expect(h.gc).toHaveBeenCalledTimes(2);
    expect(h.log.mock.calls[0][0]).toContain("pass 1/2");
    expect(h.log.mock.calls[1][0]).toContain("pass 2/2");
  });

  it("stops after one productive pass", async () => {
    const h = createHarness({ releasePerPass: 500 * MB });
    h.setSnapshot({ rss: 700 * MB, heapUsed: 60 * MB, external: 480 * MB });
    h.advance(2_000);

    await h.governor.tick();

    expect(h.gc).toHaveBeenCalledTimes(1);
  });

  it("respects the cooldown after a productive sweep", async () => {
    const h = createHarness({ releasePerPass: 500 * MB });
    h.setSnapshot({ rss: 700 * MB, heapUsed: 60 * MB, external: 480 * MB });
    h.advance(2_000);
    await h.governor.tick();
    const afterFirst = h.gc.mock.calls.length;

    // Still over the trigger, but only 1 s later — must not sweep again yet.
    h.setSnapshot({ rss: 700 * MB, external: 480 * MB });
    h.advance(1_000);
    await h.governor.tick();
    expect(h.gc.mock.calls.length).toBe(afterFirst);

    // Past the cooldown → allowed again.
    h.advance(6_000);
    await h.governor.tick();
    expect(h.gc.mock.calls.length).toBeGreaterThan(afterFirst);
  });

  it("backs off exponentially while sweeps keep reclaiming nothing", async () => {
    const h = createHarness();
    h.gc.mockImplementation(async () => {}); // nothing to free
    h.setSnapshot({ rss: 700 * MB, heapUsed: 60 * MB, external: 480 * MB });

    h.advance(2_000);
    await h.governor.tick();
    const first = h.governor.state.cooldownMs;

    // Past the (now longer) cooldown → another unproductive sweep doubles it again.
    h.advance(first + 1_000);
    await h.governor.tick();
    const second = h.governor.state.cooldownMs;

    expect(first).toBeGreaterThan(5_000);
    expect(second).toBeGreaterThan(first);
  });

  it("resets the backoff after a productive sweep", async () => {
    const h = createHarness();
    h.gc.mockImplementation(async () => {});
    h.setSnapshot({ rss: 700 * MB, heapUsed: 60 * MB, external: 480 * MB });
    h.advance(2_000);
    await h.governor.tick();
    expect(h.governor.state.unproductive).toBeGreaterThan(0);

    // Burst garbage is finally collectable.
    h.gc.mockImplementation(async () => h.setSnapshot({ rss: 120 * MB, external: 2 * MB }));
    h.advance(200_000);
    await h.governor.tick();

    expect(h.governor.state.unproductive).toBe(0);
  });

  it("trims the bounded cache only when real heap pressure remains", async () => {
    const h = createHarness();
    // External-heavy: collecting frees RSS while the heap itself stays under the ratio.
    h.setSnapshot({ rss: 700 * MB, heapUsed: 120 * MB, external: 480 * MB });
    h.advance(2_000);
    await h.governor.tick();
    expect(h.trim).not.toHaveBeenCalled();

    // Now the live heap is over 70% of the limit even after collecting.
    h.gc.mockImplementation(async () => {});
    h.setSnapshot({ rss: 700 * MB, heapUsed: 500 * MB, external: 100 * MB });
    h.advance(200_000);
    await h.governor.tick();

    expect(h.trim).toHaveBeenCalled();
  });

  it("awaits an async cache handle before trimming (no-op window on the first sweep)", async () => {
    const h = createHarness();
    let handleReady = false;
    // The first pressured sweep can arrive before the cache module resolved.
    h.trim.mockImplementation(async () => {
      await Promise.resolve();
      handleReady = true;
      h.setSnapshot({ heapUsed: 20 * MB });
    });
    h.gc.mockImplementation(async () => {});
    h.setSnapshot({ rss: 700 * MB, heapUsed: 500 * MB, external: 100 * MB });
    h.advance(2_000);

    await h.governor.tick();

    expect(handleReady).toBe(true);
    expect(h.trim).toHaveBeenCalledTimes(1);
    // The post-trim reading must be taken after the awaited handle resolved.
    expect(h.memory.heapUsed).toBe(20 * MB);
  });

  it("never throws when no GC is available and backs off instead of spinning", async () => {
    const h = createHarness({ gcUnavailable: true });
    h.setSnapshot({ rss: 700 * MB, heapUsed: 60 * MB, external: 480 * MB });
    h.advance(2_000);

    await expect(h.governor.tick()).resolves.toBeUndefined();
    expect(h.governor.state.unproductive).toBeGreaterThan(0);
  });
});
